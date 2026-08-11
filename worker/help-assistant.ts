const AI_MODEL = "@cf/openai/gpt-oss-20b" as const;
const MAX_AI_REQUEST_MICRO_USD = 5_000;
const DEFAULT_MONTHLY_BUDGET_MICRO_USD = 25_000_000;
const FAQ_CONTEXT_LIMIT = 6;
const AI_RATE_LIMIT_PER_HOUR = 60;

export type HelpRole = "super_admin" | "admin" | "sales_manager" | "sales" | "distributor";

export type HelpUser = {
  id: string;
  name: string;
  role: HelpRole;
  island: string | null;
};

type HelpEnv = Env & {
  AI?: Ai;
  AI_MODEL?: string;
  AI_MONTHLY_BUDGET_MICRO_USD?: string;
};

type AuditWriter = (
  request: Request,
  user: HelpUser,
  action: string,
  entityType: string,
  entityId: string,
  payload: unknown,
) => Promise<void>;

type FaqRow = {
  id: string;
  translation_group_id: string;
  language: "it" | "es";
  module_key: string;
  title: string;
  question: string;
  answer: string;
  allowed_roles_json: string;
  status: "draft" | "published" | "retired";
  version: number;
  created_by: string | null;
  updated_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

type UsageRow = {
  month_key: string;
  spent_micro_usd: number;
  reserved_micro_usd: number;
  request_count: number;
  budget_micro_usd: number;
  updated_at: string;
};

const MODULE_KEYS = new Set([
  "crm", "operations", "pricing", "quotes", "contracts", "distribution",
  "admin", "audit", "sales_view", "distributor_view", "podcast", "help",
]);
const ROLE_KEYS = new Set<HelpRole>(["super_admin", "admin", "sales_manager", "sales", "distributor"]);
const STOP_WORDS = new Set([
  "alla", "alle", "anche", "come", "con", "cosa", "dalla", "delle", "degli", "dove", "fare", "nella", "nelle", "per", "posso", "quale", "sono", "sulla", "tutto",
  "como", "con", "cual", "desde", "donde", "hacer", "las", "los", "para", "puedo", "que", "son", "todo", "una", "del",
]);

class HelpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export async function loadHelpBootstrap(env: HelpEnv, user: HelpUser) {
  const publishedRows = (await env.DB.prepare(
    "SELECT * FROM faq_entries WHERE status = 'published' ORDER BY module_key, language, title LIMIT 500",
  ).all<FaqRow>()).results;
  const entries = publishedRows.filter((row) => visibleToRole(row, user.role)).map(publicFaq);

  let drafts: ReturnType<typeof publicFaq>[] = [];
  let history: ReturnType<typeof publicFaq>[] = [];
  let tickets: Record<string, unknown>[] = [];
  let usage: UsageRow | null = null;
  if (isAdmin(user)) {
    drafts = (await env.DB.prepare(
      "SELECT * FROM faq_entries WHERE status = 'draft' ORDER BY updated_at DESC LIMIT 250",
    ).all<FaqRow>()).results.map(publicFaq);
    history = (await env.DB.prepare(
      "SELECT * FROM faq_entries WHERE status IN ('published', 'retired') ORDER BY translation_group_id, language, version DESC LIMIT 500",
    ).all<FaqRow>()).results.filter((row) => visibleToRole(row, user.role)).map(publicFaq);
    tickets = (await env.DB.prepare(
      "SELECT t.*, u.name AS user_name, resolver.name AS resolved_by_name FROM faq_tickets t LEFT JOIN users u ON u.id = t.user_id LEFT JOIN users resolver ON resolver.id = t.resolved_by ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END, t.created_at DESC LIMIT 250",
    ).all()).results;
    usage = await env.DB.prepare(
      "SELECT month_key, spent_micro_usd, reserved_micro_usd, request_count, budget_micro_usd, updated_at FROM ai_monthly_usage WHERE month_key = ? LIMIT 1",
    ).bind(canaryMonthKey()).first<UsageRow>();
  }

  return {
    entries,
    drafts,
    history,
    tickets,
    usage: usage ?? {
      month_key: canaryMonthKey(),
      spent_micro_usd: 0,
      reserved_micro_usd: 0,
      request_count: 0,
      budget_micro_usd: monthlyBudget(env),
      updated_at: new Date().toISOString(),
    },
    aiEnabled: Boolean(env.AI),
  };
}

export async function handleHelpApi(
  request: Request,
  env: HelpEnv,
  user: HelpUser,
  writeAudit: AuditWriter,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/help/")) return null;

  try {
    if (url.pathname === "/api/help/ask" && request.method === "POST") {
      return await askAssistant(request, env, user, writeAudit);
    }
    if (url.pathname === "/api/help/faqs" && request.method === "POST") {
      return await createFaqDraft(request, env, user, writeAudit);
    }
    const faqMatch = url.pathname.match(/^\/api\/help\/faqs\/([^/]+)$/);
    if (faqMatch && request.method === "PATCH") {
      return await updateFaq(request, faqMatch[1], env, user, writeAudit);
    }
    const ticketMatch = url.pathname.match(/^\/api\/help\/tickets\/([^/]+)$/);
    if (ticketMatch && request.method === "PATCH") {
      return await resolveTicket(request, ticketMatch[1], env, user, writeAudit);
    }
    return helpError(new HelpError(404, "not_found", "Risorsa di assistenza non trovata."));
  } catch (error) {
    if (error instanceof HelpError) return helpError(error);
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    console.error(JSON.stringify({ level: "error", event: "help_api_failure", requestId, error: error instanceof Error ? error.message : "unknown" }));
    return helpError(new HelpError(500, "internal_error", `Errore interno assistente. Riferimento: ${requestId}`));
  }
}

async function askAssistant(request: Request, env: HelpEnv, user: HelpUser, writeAudit: AuditWriter): Promise<Response> {
  const body = await readJson(request);
  const question = cleanText(body.question, 1_200);
  const language = body.language === "es" ? "es" : "it";
  const moduleKey = validModule(body.moduleKey);
  if (question.length < 3) throw new HelpError(400, "question_required", language === "es" ? "Escribe una pregunta más completa." : "Scrivi una domanda più completa.");

  const hourAgo = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM ai_interactions WHERE user_id = ? AND created_at >= ?",
  ).bind(user.id, hourAgo).first<{ total: number }>();
  if (Number(recent?.total ?? 0) >= AI_RATE_LIMIT_PER_HOUR) {
    throw new HelpError(429, "rate_limited", language === "es" ? "Has alcanzado el límite horario. Inténtalo de nuevo más tarde." : "Hai raggiunto il limite orario. Riprova più tardi.");
  }

  const rows = (await env.DB.prepare(
    "SELECT * FROM faq_entries WHERE status = 'published' AND language = ? ORDER BY published_at DESC LIMIT 300",
  ).bind(language).all<FaqRow>()).results.filter((row) => visibleToRole(row, user.role));
  const context = rankFaqs(rows, question, moduleKey).slice(0, FAQ_CONTEXT_LIMIT);
  if (!context.length) {
    return escalateQuestion(request, env, user, writeAudit, { question, language, moduleKey, reason: "no_approved_context" });
  }
  if (!env.AI) {
    return escalateQuestion(request, env, user, writeAudit, { question, language, moduleKey, reason: "ai_binding_unavailable" });
  }

  const reservation = await reserveBudget(env);
  if (!reservation) {
    return escalateQuestion(request, env, user, writeAudit, { question, language, moduleKey, reason: "monthly_budget_reached", status: "budget_blocked" });
  }

  const interactionId = crypto.randomUUID();
  const model = cleanText(env.AI_MODEL, 100) || AI_MODEL;
  let budgetSettled = false;
  const contextText = context.map((row, index) => [
    `[FONTE ${index + 1} | id=${row.id} | modulo=${row.module_key}]`,
    `Titolo: ${row.title}`,
    `Domanda approvata: ${row.question}`,
    `Procedura approvata: ${row.answer.slice(0, 2_000)}`,
  ].join("\n")).join("\n\n");
  const system = language === "es"
    ? "Eres el asistente interno de CRMVLC. Responde solo con las fuentes aprobadas proporcionadas. No inventes pasos, permisos, datos ni funciones. No ejecutes acciones. Si las fuentes no bastan, usa confidence=low. Respeta el rol del usuario y no describas procedimientos que no puede ejecutar. Devuelve solo JSON válido con answer, confidence (high o low) y sourceIds."
    : "Sei l’assistente interno di CRMVLC. Rispondi soltanto con le fonti approvate fornite. Non inventare passaggi, permessi, dati o funzioni. Non eseguire azioni. Se le fonti non bastano, usa confidence=low. Rispetta il ruolo dell’utente e non descrivere procedure che non può eseguire. Restituisci solo JSON valido con answer, confidence (high o low) e sourceIds.";

  try {
    const result = await env.AI.run(model, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Ruolo/rol: ${user.role}\nModulo/módulo: ${moduleKey}\n\nFONTI/FUENTES:\n${contextText}\n\nDOMANDA/PREGUNTA:\n${question}` },
      ],
      max_tokens: 350,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });
    const generated = parseModelResult(result, context);
    const actualCost = estimatedCostMicroUsd(generated.promptTokens, generated.completionTokens, reservation.amount);
    await settleBudget(env, reservation, actualCost);
    budgetSettled = true;

    if (generated.confidence !== "high" || !generated.answer || !generated.sourceIds.length) {
      return escalateQuestion(request, env, user, writeAudit, {
        question, language, moduleKey, reason: "model_low_confidence", interactionId,
        model, promptTokens: generated.promptTokens, completionTokens: generated.completionTokens, costMicroUsd: actualCost,
      });
    }

    const sourceRows = context.filter((row) => generated.sourceIds.includes(row.id));
    const sources = sourceRows.map((row) => ({ id: row.id, title: row.title, moduleKey: row.module_key, version: row.version }));
    const route = validModule(sourceRows[0]?.module_key ?? moduleKey);
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO ai_interactions (id, user_id, role, island, language, module_key, question, answer, status, sources_json, model, prompt_tokens, completion_tokens, estimated_cost_micro_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'answered', ?, ?, ?, ?, ?, ?)",
    ).bind(interactionId, user.id, user.role, user.island, language, moduleKey, question, generated.answer, JSON.stringify(sources), model, generated.promptTokens, generated.completionTokens, actualCost, now).run();
    await writeAudit(request, user, "help.answer.generated", "ai_interaction", interactionId, {
      language, moduleKey, sourceIds: sources.map((source) => source.id), model, promptTokens: generated.promptTokens, completionTokens: generated.completionTokens, estimatedCostMicroUsd: actualCost,
    });
    return json({ interactionId, answer: generated.answer, confidence: "high", sources, route, escalated: false });
  } catch (error) {
    if (!budgetSettled) await settleBudget(env, reservation, reservation.amount);
    console.error(JSON.stringify({ level: "error", event: "workers_ai_failure", interactionId, error: error instanceof Error ? error.message : "unknown" }));
    return escalateQuestion(request, env, user, writeAudit, { question, language, moduleKey, reason: "model_error", interactionId, model, costMicroUsd: reservation.amount });
  }
}

async function escalateQuestion(
  request: Request,
  env: HelpEnv,
  user: HelpUser,
  writeAudit: AuditWriter,
  input: {
    question: string;
    language: "it" | "es";
    moduleKey: string;
    reason: string;
    status?: "escalated" | "budget_blocked";
    interactionId?: string;
    model?: string | null;
    promptTokens?: number;
    completionTokens?: number;
    costMicroUsd?: number;
  },
): Promise<Response> {
  const interactionId = input.interactionId ?? crypto.randomUUID();
  const ticketId = crypto.randomUUID();
  const now = new Date().toISOString();
  const answer = input.language === "es"
    ? "No tengo una respuesta aprobada suficientemente segura. He enviado la pregunta a la cola de Administradores."
    : "Non ho una risposta approvata abbastanza sicura. Ho inviato la domanda alla coda degli Admin.";
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO ai_interactions (id, user_id, role, island, language, module_key, question, answer, status, sources_json, model, prompt_tokens, completion_tokens, estimated_cost_micro_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)",
    ).bind(interactionId, user.id, user.role, user.island, input.language, input.moduleKey, input.question, answer, input.status ?? "escalated", input.model ?? null, input.promptTokens ?? 0, input.completionTokens ?? 0, input.costMicroUsd ?? 0, now),
    env.DB.prepare(
      "INSERT INTO faq_tickets (id, interaction_id, user_id, role, island, language, module_key, question, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)",
    ).bind(ticketId, interactionId, user.id, user.role, user.island, input.language, input.moduleKey, input.question, input.reason, now),
  ]);
  await writeAudit(request, user, "help.question.escalated", "faq_ticket", ticketId, { interactionId, language: input.language, moduleKey: input.moduleKey, reason: input.reason });
  return json({ interactionId, ticketId, answer, confidence: "low", sources: [], route: "help", escalated: true });
}

async function createFaqDraft(request: Request, env: HelpEnv, user: HelpUser, writeAudit: AuditWriter): Promise<Response> {
  requireAdmin(user);
  const body = await readJson(request);
  const language = body.language === "es" ? "es" : "it";
  const moduleKey = validModule(body.moduleKey);
  const title = requiredText(body.title, 140, "Inserisci il titolo della FAQ.");
  const question = requiredText(body.question, 500, "Inserisci la domanda della FAQ.");
  const answer = requiredText(body.answer, 4_000, "Inserisci la procedura approvabile.");
  const roles = validRoles(body.allowedRoles);
  const translationGroupId = cleanIdentifier(body.translationGroupId) || crypto.randomUUID();
  const latest = await env.DB.prepare(
    "SELECT MAX(version) AS version FROM faq_entries WHERE translation_group_id = ? AND language = ?",
  ).bind(translationGroupId, language).first<{ version: number | null }>();
  const id = crypto.randomUUID();
  const version = Number(latest?.version ?? 0) + 1;
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO faq_entries (id, translation_group_id, language, module_key, title, question, answer, allowed_roles_json, status, version, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)",
  ).bind(id, translationGroupId, language, moduleKey, title, question, answer, JSON.stringify(roles), version, user.id, user.id, now, now).run();
  await writeAudit(request, user, "faq.draft.created", "faq_entry", id, { translationGroupId, language, moduleKey, version, allowedRoles: roles });
  return json({ id, version }, 201);
}

async function updateFaq(request: Request, faqId: string, env: HelpEnv, user: HelpUser, writeAudit: AuditWriter): Promise<Response> {
  requireAdmin(user);
  const faq = await env.DB.prepare("SELECT * FROM faq_entries WHERE id = ? LIMIT 1").bind(faqId).first<FaqRow>();
  if (!faq) throw new HelpError(404, "faq_not_found", "FAQ non trovata.");
  const body = await readJson(request);
  const action = cleanText(body.action, 20);

  if (action === "publish") {
    if (user.role !== "super_admin") throw new HelpError(403, "super_admin_required", "Solo il Super Admin può pubblicare una FAQ.");
    if (faq.status !== "draft") throw new HelpError(409, "faq_immutable", "Solo una bozza può essere pubblicata.");
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE faq_entries SET status = 'retired', updated_at = ?, updated_by = ? WHERE translation_group_id = ? AND language = ? AND status = 'published'")
        .bind(now, user.id, faq.translation_group_id, faq.language),
      env.DB.prepare("UPDATE faq_entries SET status = 'published', approved_by = ?, updated_by = ?, published_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'")
        .bind(user.id, user.id, now, now, faq.id),
    ]);
    await writeAudit(request, user, "faq.published", "faq_entry", faq.id, { translationGroupId: faq.translation_group_id, language: faq.language, version: faq.version });
    return json({ ok: true, status: "published" });
  }

  if (action === "retire") {
    if (user.role !== "super_admin") throw new HelpError(403, "super_admin_required", "Solo il Super Admin può ritirare una FAQ.");
    if (faq.status !== "published") throw new HelpError(409, "invalid_status", "Solo una FAQ pubblicata può essere ritirata.");
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE faq_entries SET status = 'retired', updated_by = ?, updated_at = ? WHERE id = ? AND status = 'published'")
      .bind(user.id, now, faq.id).run();
    await writeAudit(request, user, "faq.retired", "faq_entry", faq.id, { language: faq.language, version: faq.version });
    return json({ ok: true, status: "retired" });
  }

  if (faq.status !== "draft") throw new HelpError(409, "faq_immutable", "Una FAQ pubblicata è immutabile: crea una nuova versione.");
  const language = body.language === "es" ? "es" : body.language === "it" ? "it" : faq.language;
  const moduleKey = body.moduleKey === undefined ? faq.module_key : validModule(body.moduleKey);
  const title = body.title === undefined ? faq.title : requiredText(body.title, 140, "Inserisci il titolo della FAQ.");
  const question = body.question === undefined ? faq.question : requiredText(body.question, 500, "Inserisci la domanda della FAQ.");
  const answer = body.answer === undefined ? faq.answer : requiredText(body.answer, 4_000, "Inserisci la procedura approvabile.");
  const roles = body.allowedRoles === undefined ? parseRoles(faq.allowed_roles_json) : validRoles(body.allowedRoles);
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE faq_entries SET language = ?, module_key = ?, title = ?, question = ?, answer = ?, allowed_roles_json = ?, updated_by = ?, updated_at = ? WHERE id = ? AND status = 'draft'",
  ).bind(language, moduleKey, title, question, answer, JSON.stringify(roles), user.id, now, faq.id).run();
  await writeAudit(request, user, "faq.draft.updated", "faq_entry", faq.id, { language, moduleKey, version: faq.version, allowedRoles: roles });
  return json({ ok: true, status: "draft" });
}

async function resolveTicket(request: Request, ticketId: string, env: HelpEnv, user: HelpUser, writeAudit: AuditWriter): Promise<Response> {
  requireAdmin(user);
  const body = await readJson(request);
  const resolutionNote = requiredText(body.resolutionNote, 1_500, "Inserisci la risposta o la decisione dell’Admin.");
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE faq_tickets SET status = 'resolved', resolution_note = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND status = 'open'",
  ).bind(resolutionNote, user.id, now, ticketId).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new HelpError(409, "ticket_unavailable", "La richiesta è già stata gestita o non esiste.");
  await writeAudit(request, user, "faq.ticket.resolved", "faq_ticket", ticketId, { resolutionNote });
  return json({ ok: true });
}

function rankFaqs(rows: FaqRow[], question: string, moduleKey: string): Array<FaqRow & { score: number }> {
  const tokens = searchTokens(question);
  return rows.map((row) => {
    const haystack = normalizeSearch(`${row.title} ${row.question} ${row.answer}`);
    const title = normalizeSearch(`${row.title} ${row.question}`);
    let score = row.module_key === moduleKey ? 8 : row.module_key === "help" ? 2 : 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += 2;
      if (title.includes(token)) score += 3;
    }
    return { ...row, score };
  }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score || b.version - a.version);
}

function parseModelResult(result: unknown, context: FaqRow[]) {
  const record = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
  let raw = typeof record.response === "string" ? record.response : "";
  if (!raw && Array.isArray(record.choices)) {
    const choice = record.choices[0] as { message?: { content?: string | null } } | undefined;
    raw = choice?.message?.content ?? "";
  }
  raw = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { parsed = {}; }
  const allowedIds = new Set(context.map((row) => row.id));
  const sourceIds = Array.isArray(parsed.sourceIds)
    ? parsed.sourceIds.map(String).filter((id) => allowedIds.has(id)).slice(0, FAQ_CONTEXT_LIMIT)
    : [];
  const usage = (record.usage && typeof record.usage === "object" ? record.usage : {}) as Record<string, unknown>;
  return {
    answer: cleanText(parsed.answer, 4_000),
    confidence: parsed.confidence === "high" ? "high" : "low",
    sourceIds,
    promptTokens: safeTokenCount(usage.prompt_tokens),
    completionTokens: safeTokenCount(usage.completion_tokens),
  };
}

async function reserveBudget(env: HelpEnv): Promise<{ monthKey: string; amount: number } | null> {
  const monthKey = canaryMonthKey();
  const now = new Date().toISOString();
  const budget = monthlyBudget(env);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO ai_monthly_usage (month_key, spent_micro_usd, reserved_micro_usd, request_count, budget_micro_usd, updated_at) VALUES (?, 0, 0, 0, ?, ?)",
  ).bind(monthKey, budget, now).run();
  await env.DB.prepare("UPDATE ai_monthly_usage SET budget_micro_usd = ?, updated_at = ? WHERE month_key = ?")
    .bind(budget, now, monthKey).run();
  const result = await env.DB.prepare(
    "UPDATE ai_monthly_usage SET reserved_micro_usd = reserved_micro_usd + ?, request_count = request_count + 1, updated_at = ? WHERE month_key = ? AND spent_micro_usd + reserved_micro_usd + ? <= budget_micro_usd",
  ).bind(MAX_AI_REQUEST_MICRO_USD, now, monthKey, MAX_AI_REQUEST_MICRO_USD).run();
  return Number(result.meta.changes ?? 0) === 1 ? { monthKey, amount: MAX_AI_REQUEST_MICRO_USD } : null;
}

async function settleBudget(env: HelpEnv, reservation: { monthKey: string; amount: number }, costMicroUsd: number): Promise<void> {
  const charged = Math.max(0, Math.min(reservation.amount, Math.ceil(costMicroUsd)));
  await env.DB.prepare(
    "UPDATE ai_monthly_usage SET reserved_micro_usd = MAX(0, reserved_micro_usd - ?), spent_micro_usd = spent_micro_usd + ?, updated_at = ? WHERE month_key = ?",
  ).bind(reservation.amount, charged, new Date().toISOString(), reservation.monthKey).run();
}

function estimatedCostMicroUsd(promptTokens: number, completionTokens: number, fallback: number): number {
  if (!promptTokens && !completionTokens) return fallback;
  return Math.max(1, Math.ceil((promptTokens * 2 + completionTokens * 3) / 10));
}

function publicFaq(row: FaqRow) {
  return {
    id: row.id,
    translation_group_id: row.translation_group_id,
    language: row.language,
    module_key: row.module_key,
    title: row.title,
    question: row.question,
    answer: row.answer,
    allowed_roles: parseRoles(row.allowed_roles_json),
    status: row.status,
    version: row.version,
    created_by: row.created_by,
    updated_by: row.updated_by,
    approved_by: row.approved_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    published_at: row.published_at,
  };
}

function visibleToRole(row: FaqRow, role: HelpRole): boolean {
  const roles = parseRoles(row.allowed_roles_json);
  return roles.includes("all") || roles.includes(role);
}

function parseRoles(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).filter((role) => role === "all" || ROLE_KEYS.has(role as HelpRole));
  } catch { return []; }
}

function validRoles(value: unknown): string[] {
  if (!Array.isArray(value)) throw new HelpError(400, "invalid_roles", "Seleziona almeno un ruolo.");
  const roles = [...new Set(value.map(String).filter((role) => role === "all" || ROLE_KEYS.has(role as HelpRole)))];
  if (!roles.length) throw new HelpError(400, "invalid_roles", "Seleziona almeno un ruolo.");
  return roles.includes("all") ? ["all"] : roles;
}

function validModule(value: unknown): string {
  const key = cleanText(value, 30).toLowerCase();
  return MODULE_KEYS.has(key) ? key : "help";
}

function searchTokens(value: string): string[] {
  return [...new Set(normalizeSearch(value).split(" ").filter((word) => word.length >= 3 && !STOP_WORDS.has(word)))].slice(0, 18);
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function monthlyBudget(env: HelpEnv): number {
  const configured = Number(env.AI_MONTHLY_BUDGET_MICRO_USD);
  if (!Number.isFinite(configured)) return DEFAULT_MONTHLY_BUDGET_MICRO_USD;
  return Math.round(Math.min(100_000_000, Math.max(1_000_000, configured)));
}

function canaryMonthKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Canary", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? new Date().getUTCFullYear();
  const month = parts.find((part) => part.type === "month")?.value ?? String(new Date().getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function requiredText(value: unknown, maxLength: number, message: string): string {
  const result = cleanText(value, maxLength);
  if (!result) throw new HelpError(400, "required_field", message);
  return result;
}

function cleanIdentifier(value: unknown): string {
  const result = cleanText(value, 80);
  return /^[a-zA-Z0-9_-]+$/.test(result) ? result : "";
}

function safeTokenCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function isAdmin(user: HelpUser): boolean {
  return user.role === "admin" || user.role === "super_admin";
}

function requireAdmin(user: HelpUser): void {
  if (!isAdmin(user)) throw new HelpError(403, "admin_required", "Solo Admin e Super Admin possono gestire le FAQ.");
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw new HelpError(415, "json_required", "Invia dati JSON validi.");
  try { return await request.json() as Record<string, unknown>; }
  catch { throw new HelpError(400, "invalid_json", "Il contenuto JSON non è valido."); }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function helpError(error: HelpError): Response {
  return json({ error: { code: error.code, message: error.message } }, error.status);
}
