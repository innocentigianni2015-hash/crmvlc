import {
  canApplyQuoteDiscount,
  canCancelSignedContract,
  canCreateQuote,
  canManageDeliveries,
  canManagePriceList,
  canCreateUserWithRole,
  canReadPriceList,
  canReadRecord,
  canWriteDelivery,
  canWriteRecord,
  canUpdateUserRole,
  deliveryScope,
  isIsland,
  normalizeEmail,
  recordScope,
} from "./authorization.js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { timingSafeEqual } from "node:crypto";
import { calculateQuoteTotals, formatQuoteNumber } from "./quote-calculations.js";
import { buildQuotePdf } from "./quote-pdf.js";
import { handleOperationsApi } from "./operations-api.js";
import { handleVipPublicApi } from "./vip-public-api.js";
import { createPasswordHash, handlePasswordAuth } from "./password-auth.js";

type RuntimeEnv = Env & {
  AUTH_SECRET?: string;
  DEMO_MODE?: string;
  DEMO_EMAIL?: string;
  DEMO_PASSWORD?: string;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: "super_admin" | "admin" | "sales_manager" | "sales" | "distributor";
  island: string | null;
  active: number;
  created_at?: string;
};

type ClientRow = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  island: string;
  stage: string;
  value_cents: number;
  owner_user_id: string;
  owner_name?: string;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type ContractRow = {
  id: string;
  client_id: string;
  client_company?: string;
  quote_id: string | null;
  quote_number?: string | null;
  template_id: string | null;
  title: string;
  status: "draft" | "awaiting_signature" | "signed" | "cancelled";
  owner_user_id: string;
  island: string;
  signer_name: string | null;
  signer_email: string | null;
  draft_r2_key: string;
  signed_r2_key: string | null;
  evidence_r2_key: string | null;
  document_sha256: string;
  signed_document_sha256: string | null;
  signature_sha256: string | null;
  version: number;
  parent_contract_id: string | null;
  cancelled_reason: string | null;
  cancelled_at: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
};

type DeliveryRow = {
  id: string;
  client_id: string;
  client_company?: string;
  distributor_user_id: string;
  distributor_name?: string;
  island: string;
  status: "assigned" | "in_progress" | "delivered" | "issue";
  quantity: number;
  unit: string;
  scheduled_for: string | null;
  delivery_contact_name: string;
  delivery_contact_email: string;
  delivery_contact_phone: string | null;
  delivery_address: string | null;
  notes: string | null;
  version: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ChallengeRow = {
  id: string;
  email: string;
  purpose: "login" | "contract_sign";
  subject_id: string | null;
  code_hash: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
};

type EmailOutboxRow = {
  id: string;
  recipient: string;
  subject: string;
  body_text: string;
  attachment_r2_key: string | null;
  attachment_filename: string | null;
  attempts: number;
};

type EmailChangeFlowRow = {
  id: string;
  user_id: string;
  data_json: string | null;
  expires_at: string;
  consumed_at: string | null;
  old_email: string;
};

type PriceListRow = {
  id: string;
  name: string;
  version: string;
  currency: string;
  tax_name: string;
  tax_rate_bps: number;
  prices_include_tax: number;
  valid_from: string | null;
  active: number;
  notes: string | null;
  updated_at: string;
};

type PriceItemRow = {
  id: string;
  price_list_id: string;
  code: string;
  category: "cover" | "internal_high" | "internal_low" | "back_cover";
  name: string;
  dimensions: string;
  monthly_price_cents: number;
  included_services: string | null;
  active: number;
  sort_order: number;
  version: number;
  updated_at: string;
};

type QuoteRow = {
  id: string;
  quote_number: string;
  sequence: number;
  year: number;
  client_id: string;
  client_company?: string;
  price_list_id: string;
  status: "issued" | "converted";
  owner_user_id: string;
  island: string;
  customer_company: string;
  customer_contact: string;
  customer_email: string;
  currency: string;
  tax_name: string;
  tax_rate_bps: number;
  months: number;
  subtotal_cents: number;
  discount_bps: number;
  discount_reason: string | null;
  discount_cents: number;
  net_cents: number;
  tax_cents: number;
  total_cents: number;
  customer_note: string | null;
  valid_until: string;
  pdf_r2_key: string;
  pdf_sha256: string;
  converted_contract_id: string | null;
  converted_at: string | null;
  created_by: string;
  created_at: string;
};

const SESSION_COOKIE = "vlc_session";
const MAX_JSON_BYTES = 512_000;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_CONTRACT_BYTES = 2_750_000;
const MAX_SIGNATURE_BYTES = 450_000;
const OTP_TTL_MINUTES = 10;
const textEncoder = new TextEncoder();

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function handleCrmApi(
  request: Request,
  env: RuntimeEnv,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    verifySameOrigin(request, url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        configured: {
          database: Boolean(env.DB),
          documents: Boolean(env.BUCKET),
          email: Boolean(env.EMAIL && env.EMAIL_FROM),
          admin: Boolean(env.ADMIN_EMAIL),
          authSecret: Boolean(env.AUTH_SECRET),
          demo: isDemoEnabled(env),
        },
      });
    }

    if (url.pathname === "/api/auth/config" && request.method === "GET") {
      const demoEnabled = isDemoEnabled(env);
      return json({
        demoEnabled,
        demoEmail: demoEnabled ? normalizeEmail(env.DEMO_EMAIL) : null,
        passwordEnabled: Boolean(env.DB && env.AUTH_SECRET),
        contractOtpEnabled: Boolean(env.DB && env.EMAIL && env.AUTH_SECRET && env.EMAIL_FROM),
      });
    }

    if (url.pathname.startsWith("/api/auth/password/") || url.pathname.startsWith("/api/auth/totp/")) {
      await ensureBootstrapAdmin(env);
      const passwordResponse = await handlePasswordAuth(request, env);
      if (passwordResponse) return passwordResponse;
    }

    if (url.pathname === "/api/auth/demo" && request.method === "POST") {
      return loginDemo(request, env);
    }

    if (url.pathname === "/api/auth/request" && request.method === "POST") {
      throw new ApiError(410, "password_login_required", "L’accesso al CRM ora usa email e password.");
    }
    if (url.pathname === "/api/auth/verify" && request.method === "POST") {
      throw new ApiError(410, "password_login_required", "L’accesso al CRM ora usa email e password.");
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return logout(request, env);
    }

    if (url.pathname === "/api/profile/email/confirm" && request.method === "POST") {
      const confirmationResponse = await confirmProfileEmail(request, env);
      return confirmationResponse;
    }

    const vipResponse = await handleVipPublicApi(request, env, ctx);
    if (vipResponse) return vipResponse;

    const user = await requireUser(request, env, ctx);

    if (url.pathname === "/api/bootstrap" && request.method === "GET") {
      return bootstrap(user, env);
    }
    if (url.pathname === "/api/profile" && request.method === "PATCH") {
      const profileResponse = await updateProfile(request, user, env);
      return profileResponse;
    }
    if (url.pathname === "/api/clients" && request.method === "POST") {
      return createClient(request, user, env);
    }
    const clientMatch = url.pathname.match(/^\/api\/clients\/([^/]+)$/);
    if (clientMatch && request.method === "PATCH") {
      return updateClient(request, clientMatch[1], user, env);
    }

    if (url.pathname === "/api/deliveries" && request.method === "POST") {
      return createDelivery(request, user, env);
    }
    const deliveryMatch = url.pathname.match(/^\/api\/deliveries\/([^/]+)$/);
    if (deliveryMatch && request.method === "PATCH") {
      return updateDelivery(request, deliveryMatch[1], user, env);
    }

    const priceItemMatch = url.pathname.match(/^\/api\/price-items\/([^/]+)$/);
    if (priceItemMatch && request.method === "PATCH") {
      return updatePriceItem(request, priceItemMatch[1], user, env);
    }

    if (url.pathname === "/api/quotes" && request.method === "POST") {
      return createQuote(request, user, env, ctx);
    }
    const quoteDownload = url.pathname.match(/^\/api\/quotes\/([^/]+)\/download$/);
    if (quoteDownload && request.method === "GET") {
      return downloadQuote(quoteDownload[1], user, env);
    }
    const quoteConversion = url.pathname.match(/^\/api\/quotes\/([^/]+)\/convert$/);
    if (quoteConversion && request.method === "POST") {
      return convertQuoteToContract(request, quoteConversion[1], user, env, ctx);
    }

    if (url.pathname === "/api/users" && request.method === "POST") {
      return createUser(request, user, env);
    }
    const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && request.method === "PATCH") {
      return updateUser(request, userMatch[1], user, env);
    }
    const retryEmailMatch = url.pathname.match(/^\/api\/email-outbox\/([^/]+)\/retry$/);
    if (retryEmailMatch && request.method === "POST") {
      return retryOutboxMessage(request, retryEmailMatch[1], user, env, ctx);
    }
    if (url.pathname === "/api/templates" && request.method === "POST") {
      return uploadTemplate(request, user, env, ctx);
    }
    const templateDownload = url.pathname.match(/^\/api\/templates\/([^/]+)\/download$/);
    if (templateDownload && request.method === "GET") {
      return downloadTemplate(templateDownload[1], user, env);
    }

    if (url.pathname === "/api/contracts" && request.method === "POST") {
      return createContract(request, user, env, ctx);
    }
    const contractDownload = url.pathname.match(/^\/api\/contracts\/([^/]+)\/download$/);
    if (contractDownload && request.method === "GET") {
      return downloadContract(contractDownload[1], user, env);
    }
    const evidenceDownload = url.pathname.match(/^\/api\/contracts\/([^/]+)\/evidence$/);
    if (evidenceDownload && request.method === "GET") {
      return downloadEvidence(evidenceDownload[1], user, env);
    }
    const requestSignature = url.pathname.match(/^\/api\/contracts\/([^/]+)\/request-signature$/);
    if (requestSignature && request.method === "POST") {
      return requestContractSignature(request, requestSignature[1], user, env);
    }
    const completeSignature = url.pathname.match(/^\/api\/contracts\/([^/]+)\/complete-signature$/);
    if (completeSignature && request.method === "POST") {
      return completeContractSignature(request, completeSignature[1], user, env, ctx);
    }
    const supersedeContract = url.pathname.match(/^\/api\/contracts\/([^/]+)\/supersede$/);
    if (supersedeContract && request.method === "POST") {
      return supersedeSignedContract(request, supersedeContract[1], user, env, ctx);
    }

    const operationsResponse = await handleOperationsApi(request, env, user);
    if (operationsResponse) return operationsResponse;

    throw new ApiError(404, "not_found", "Risorsa non trovata.");
  } catch (error) {
    if (error instanceof ApiError) return apiError(error);
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    console.error(JSON.stringify({ level: "error", event: "api_failure", requestId, error: error instanceof Error ? error.message : "unknown" }));
    return apiError(new ApiError(500, "internal_error", `Errore interno. Riferimento: ${requestId}`));
  }
}

async function loginDemo(request: Request, env: RuntimeEnv): Promise<Response> {
  if (!isDemoEnabled(env)) throw new ApiError(404, "not_found", "Risorsa non trovata.");
  const body = await readJson<{ email?: string; password?: string }>(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const configuredEmail = normalizeEmail(env.DEMO_EMAIL);
  const configuredPassword = String(env.DEMO_PASSWORD ?? "");
  if (password.length > 256) throw new ApiError(401, "invalid_credentials", "Credenziali di prova non valide.");

  const [emailMatches, passwordMatches] = await Promise.all([
    timingSafeEqualText(email, configuredEmail),
    timingSafeEqualText(password, configuredPassword),
  ]);
  if (!emailMatches || !passwordMatches) {
    throw new ApiError(401, "invalid_credentials", "Credenziali di prova non valide.");
  }

  const user = await ensureDemoAccount(env);
  const token = randomToken(32);
  const sessionId = await sha256(token);
  const now = new Date();
  const hours = clampNumber(Number(env.SESSION_HOURS || "4"), 1, 12);
  const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
    .bind(sessionId, user.id, expiresAt, now.toISOString(), now.toISOString()).run();
  await appendAudit(env, request, user.id, "auth.demo_login", "user", user.id, { email: user.email, demo: true });

  const response = json({ user: publicUser(user), demoMode: true });
  response.headers.append("Set-Cookie", sessionCookie(token, request, hours * 60 * 60));
  return response;
}

async function logout(request: Request, env: RuntimeEnv): Promise<Response> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) {
    const sessionId = await sha256(token);
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }
  const response = json({ ok: true });
  response.headers.append("Set-Cookie", clearSessionCookie(request));
  return response;
}

async function updateProfile(request: Request, user: UserRow, env: RuntimeEnv): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(request);
  const name = body.name === undefined ? user.name : cleanText(body.name, 120);
  const phone = body.phone === undefined ? user.phone : normalizePhone(body.phone);
  const requestedEmail = body.email === undefined ? user.email : normalizeEmail(body.email);
  if (!name || !isEmail(requestedEmail)) throw new ApiError(400, "invalid_profile", "Nome ed email devono essere validi.");

  const emailChanged = requestedEmail !== user.email;
  let verificationSent = false;
  if (emailChanged) {
    if (!env.AUTH_SECRET || !env.EMAIL || !env.EMAIL_FROM) {
      throw new ApiError(503, "email_not_configured", "La verifica del nuovo indirizzo email non è configurata.");
    }
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1")
      .bind(requestedEmail, user.id).first();
    if (existing) throw new ApiError(409, "email_exists", "Esiste già un utente con questa email.");

    const token = randomToken(32);
    const tokenHash = await sha256(token);
    const flowId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE auth_flow_tokens SET consumed_at = ? WHERE user_id = ? AND purpose = 'email_change' AND consumed_at IS NULL")
        .bind(now.toISOString(), user.id),
      env.DB.prepare("INSERT INTO auth_flow_tokens (id, token_hash, user_id, purpose, data_json, expires_at, consumed_at, created_at) VALUES (?, ?, ?, 'email_change', ?, ?, NULL, ?)")
        .bind(flowId, tokenHash, user.id, JSON.stringify({ newEmail: requestedEmail }), expiresAt, now.toISOString()),
    ]);
    const verificationUrl = new URL("/", request.url);
    verificationUrl.searchParams.set("email-change", token);
    try {
      await env.EMAIL.send({
        from: { name: "CRMVLC", email: env.EMAIL_FROM },
        to: requestedEmail,
        subject: "Conferma il nuovo indirizzo email CRMVLC",
        text: `Conferma il nuovo indirizzo email aprendo questo collegamento entro 30 minuti: ${verificationUrl.toString()} Se non hai richiesto la modifica, ignora il messaggio.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>CRMVLC</h2><p>Conferma il nuovo indirizzo email del tuo profilo.</p><p><a href="${escapeHtml(verificationUrl.toString())}" style="display:inline-block;padding:12px 18px;border-radius:8px;color:#fff;background:#ef6a54;text-decoration:none;font-weight:700">Conferma email</a></p><p>Il collegamento scade tra 30 minuti.</p><p style="color:#667085">Se non hai richiesto la modifica, ignora il messaggio.</p></div>`,
      });
      verificationSent = true;
    } catch (error) {
      await env.DB.prepare("DELETE FROM auth_flow_tokens WHERE id = ?").bind(flowId).run();
      console.error(JSON.stringify({ level: "error", event: "profile_email_verification_failed", userId: user.id, error: error instanceof Error ? error.message : "unknown" }));
      throw new ApiError(503, "email_delivery_failed", "Non è stato possibile inviare la verifica al nuovo indirizzo.");
    }
  }

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?")
    .bind(name, phone, now, user.id).run();
  await appendAudit(env, request, user.id, "user.profile_updated", "user", user.id, {
    nameChanged: name !== user.name,
    phoneChanged: phone !== user.phone,
    emailChangeRequested: emailChanged,
  });
  if (emailChanged) {
    await appendAudit(env, request, user.id, "user.email_change_requested", "user", user.id, { newEmail: requestedEmail });
  }
  return json({
    user: publicUser({ ...user, name, phone }),
    verificationSent,
    message: verificationSent
      ? "Profilo aggiornato. Apri il collegamento inviato al nuovo indirizzo per confermare l’email."
      : "Profilo aggiornato.",
  });
}

async function confirmProfileEmail(request: Request, env: RuntimeEnv): Promise<Response> {
  const body = await readJson<{ token?: string }>(request);
  const token = String(body.token ?? "");
  if (token.length < 32 || token.length > 200) throw new ApiError(400, "invalid_email_change", "Collegamento di verifica non valido o scaduto.");
  const tokenHash = await sha256(token);
  const flow = await env.DB.prepare(
    "SELECT f.id, f.user_id, f.data_json, f.expires_at, f.consumed_at, u.email AS old_email FROM auth_flow_tokens f JOIN users u ON u.id = f.user_id WHERE f.token_hash = ? AND f.purpose = 'email_change' LIMIT 1",
  ).bind(tokenHash).first<EmailChangeFlowRow>();
  if (!flow || flow.consumed_at || Date.parse(flow.expires_at) <= Date.now()) {
    throw new ApiError(400, "invalid_email_change", "Collegamento di verifica non valido o scaduto.");
  }

  let newEmail = "";
  try {
    newEmail = normalizeEmail((JSON.parse(flow.data_json ?? "{}") as { newEmail?: string }).newEmail);
  } catch {
    throw new ApiError(400, "invalid_email_change", "Collegamento di verifica non valido o scaduto.");
  }
  if (!isEmail(newEmail)) throw new ApiError(400, "invalid_email_change", "Collegamento di verifica non valido o scaduto.");
  const duplicate = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1").bind(newEmail, flow.user_id).first();
  if (duplicate) throw new ApiError(409, "email_exists", "Questo indirizzo email è già utilizzato.");

  const now = new Date().toISOString();
  try {
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE users SET email = ?, updated_at = ? WHERE id = ? AND email = ?")
        .bind(newEmail, now, flow.user_id, flow.old_email),
      env.DB.prepare("UPDATE auth_flow_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
        .bind(now, flow.id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(flow.user_id),
    ]);
    if (Number(results[0].meta.changes ?? 0) !== 1 || Number(results[1].meta.changes ?? 0) !== 1) {
      throw new ApiError(409, "email_change_conflict", "Il profilo è cambiato. Richiedi nuovamente la modifica email.");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (String(error).includes("UNIQUE")) throw new ApiError(409, "email_exists", "Questo indirizzo email è già utilizzato.");
    throw error;
  }
  await appendAudit(env, request, flow.user_id, "user.email_changed", "user", flow.user_id, { oldEmail: flow.old_email, newEmail });

  if (env.EMAIL && env.EMAIL_FROM && flow.old_email !== newEmail) {
    try {
      await env.EMAIL.send({
        from: { name: "CRMVLC", email: env.EMAIL_FROM },
        to: flow.old_email,
        subject: "Indirizzo email CRMVLC modificato",
        text: `L’indirizzo email del tuo account CRMVLC è stato modificato in ${newEmail}. Se non riconosci questa operazione, contatta subito il Super Admin.`,
      });
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "profile_email_security_notice_failed", userId: flow.user_id, error: error instanceof Error ? error.message : "unknown" }));
    }
  }
  const response = json({ message: "Email confermata. Accedi nuovamente con il nuovo indirizzo." });
  response.headers.append("Set-Cookie", clearSessionCookie(request));
  return response;
}

async function bootstrap(user: UserRow, env: RuntimeEnv): Promise<Response> {
  const scope = recordScope(user);
  const clients = user.role === "distributor"
    ? (await env.DB.prepare(
      "SELECT DISTINCT c.*, u.name AS owner_name FROM clients c JOIN users u ON u.id = c.owner_user_id JOIN deliveries d ON d.client_id = c.id WHERE c.archived_at IS NULL AND d.distributor_user_id = ? ORDER BY c.updated_at DESC LIMIT 250",
    ).bind(user.id).all<ClientRow>()).results
    : (await env.DB.prepare(
      `SELECT c.*, u.name AS owner_name FROM clients c JOIN users u ON u.id = c.owner_user_id WHERE c.archived_at IS NULL${scope.sql.replaceAll("island", "c.island").replaceAll("owner_user_id", "c.owner_user_id")} ORDER BY c.updated_at DESC LIMIT 250`,
    ).bind(...scope.values).all<ClientRow>()).results;
  const contracts = user.role === "distributor"
    ? []
    : (await env.DB.prepare(
      `SELECT ct.*, c.company_name AS client_company, q.quote_number FROM contracts ct JOIN clients c ON c.id = ct.client_id LEFT JOIN quotes q ON q.id = ct.quote_id WHERE 1 = 1${scope.sql.replaceAll("island", "ct.island").replaceAll("owner_user_id", "ct.owner_user_id")} ORDER BY ct.updated_at DESC LIMIT 250`,
    ).bind(...scope.values).all<ContractRow>()).results;
  const quotes = user.role === "distributor"
    ? []
    : (await env.DB.prepare(
      `SELECT q.*, c.company_name AS client_company FROM quotes q JOIN clients c ON c.id = q.client_id WHERE 1 = 1${scope.sql.replaceAll("island", "q.island").replaceAll("owner_user_id", "q.owner_user_id")} ORDER BY q.created_at DESC LIMIT 250`,
    ).bind(...scope.values).all<QuoteRow>()).results;
  const templates = user.role === "distributor"
    ? []
    : (await env.DB.prepare(
      "SELECT id, name, version, mime_type, original_filename, active, created_at FROM contract_templates WHERE active = 1 ORDER BY created_at DESC",
    ).all()).results;
  const deliveryFilter = deliveryScope(user);
  const deliveries = (await env.DB.prepare(
    `SELECT d.*, c.company_name AS client_company, u.name AS distributor_name FROM deliveries d JOIN clients c ON c.id = d.client_id JOIN users u ON u.id = d.distributor_user_id WHERE 1 = 1${deliveryFilter.sql} ORDER BY CASE d.status WHEN 'issue' THEN 0 WHEN 'assigned' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END, d.updated_at DESC LIMIT 250`,
  ).bind(...deliveryFilter.values).all<DeliveryRow>()).results;

  let priceList: PriceListRow | null = null;
  let priceItems: PriceItemRow[] = [];
  if (canReadPriceList(user)) {
    priceList = await env.DB.prepare(
      "SELECT id, name, version, currency, tax_name, tax_rate_bps, prices_include_tax, valid_from, active, notes, updated_at FROM price_lists WHERE active = 1 ORDER BY updated_at DESC LIMIT 1",
    ).first<PriceListRow>();
    if (priceList) {
      priceItems = (await env.DB.prepare(
        "SELECT id, price_list_id, code, category, name, dimensions, monthly_price_cents, included_services, active, sort_order, version, updated_at FROM price_items WHERE price_list_id = ? AND active = 1 ORDER BY sort_order, name",
      ).bind(priceList.id).all<PriceItemRow>()).results;
    }
  }

  let users: Record<string, unknown>[] = [];
  let audit: Record<string, unknown>[] = [];
  let emailOutbox: Record<string, unknown>[] = [];
  if (user.role === "super_admin" || user.role === "admin") {
    users = (await env.DB.prepare("SELECT id, email, name, phone, role, island, active, created_at FROM users ORDER BY role, name").all()).results;
  }
  if (user.role === "super_admin") {
    audit = (await env.DB.prepare("SELECT a.id, a.action, a.entity_type, a.entity_id, a.payload_json, a.created_at, u.name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC LIMIT 80").all()).results;
    emailOutbox = (await env.DB.prepare("SELECT id, recipient, subject, status, attempts, next_attempt_at, last_error, created_at, sent_at FROM email_outbox WHERE status <> 'sent' ORDER BY created_at DESC LIMIT 50").all()).results;
  } else if (user.role === "sales_manager") {
    users = (await env.DB.prepare("SELECT id, email, name, phone, role, island, active, created_at FROM users WHERE island = ? AND active = 1 ORDER BY role, name")
      .bind(user.island).all()).results;
  }

  return json({
    user: publicUser(user),
    clients,
    contracts,
    quotes,
    templates,
    deliveries,
    users,
    audit,
    emailOutbox,
    priceList,
    priceItems,
    demoMode: isDemoEnabled(env) && user.email === normalizeEmail(env.DEMO_EMAIL),
  });
}

async function updatePriceItem(request: Request, itemId: string, user: UserRow, env: RuntimeEnv): Promise<Response> {
  if (!canManagePriceList(user)) throw new ApiError(403, "super_admin_required", "Solo il Super Admin può modificare il listino.");
  const current = await env.DB.prepare(
    "SELECT id, price_list_id, code, category, name, dimensions, monthly_price_cents, included_services, active, sort_order, version, updated_at FROM price_items WHERE id = ? LIMIT 1",
  ).bind(itemId).first<PriceItemRow>();
  if (!current) throw new ApiError(404, "price_item_not_found", "Voce di listino non trovata.");

  const body = await readJson<Record<string, unknown>>(request);
  const version = Number(body.version);
  if (version !== current.version) throw new ApiError(409, "version_conflict", "Il prezzo è stato modificato da un altro utente. Ricarica i dati.");
  const monthlyPriceEuros = Number(body.monthlyPriceEuros);
  if (!Number.isFinite(monthlyPriceEuros) || monthlyPriceEuros < 0 || monthlyPriceEuros > 1_000_000) {
    throw new ApiError(400, "invalid_price", "Inserisci un prezzo mensile valido.");
  }
  const monthlyPriceCents = Math.round(monthlyPriceEuros * 100);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE price_items SET monthly_price_cents = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
  ).bind(monthlyPriceCents, now, current.id, version).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new ApiError(409, "version_conflict", "Aggiornamento concorrente rilevato.");
  await env.DB.prepare("UPDATE price_lists SET updated_at = ? WHERE id = ?").bind(now, current.price_list_id).run();
  await appendAudit(env, request, user.id, "price_item.updated", "price_item", current.id, {
    code: current.code,
    previousPriceCents: current.monthly_price_cents,
    monthlyPriceCents,
    version: version + 1,
  });
  return json({ ok: true });
}

async function createQuote(request: Request, user: UserRow, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  if (!canCreateQuote(user)) throw new ApiError(403, "not_allowed", "Il Distributore non può creare preventivi.");
  const body = await readJson<Record<string, unknown>>(request);
  const clientId = cleanText(body.clientId, 80);
  const client = await getClient(env, clientId);
  if (!client || !canWriteRecord(user, client)) throw new ApiError(404, "client_not_found", "Cliente non trovato nel tuo perimetro.");

  const months = positiveInteger(body.months, 36);
  const validDays = positiveInteger(body.validDays ?? 30, 90);
  const discountPercent = Number(body.discountPercent ?? 0);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new ApiError(400, "invalid_discount", "Lo sconto deve essere compreso tra 0 e 100%.");
  }
  const discountBps = Math.round(discountPercent * 100);
  if (discountBps > 0 && !canApplyQuoteDiscount(user)) {
    throw new ApiError(403, "discount_not_allowed", "Solo il Super Admin può applicare sconti.");
  }
  const discountReason = cleanOptionalText(body.discountReason, 300);
  if (discountBps > 0 && !discountReason) throw new ApiError(400, "discount_reason_required", "Indica il motivo dello sconto.");
  const customerNote = cleanOptionalText(body.customerNote, 700);

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) {
    throw new ApiError(400, "invalid_quote_items", "Seleziona almeno una voce di listino.");
  }
  const requestedItems = body.items.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "invalid_quote_items", "Le voci del preventivo non sono valide.");
    const item = value as Record<string, unknown>;
    return { priceItemId: cleanText(item.priceItemId, 100), quantity: positiveInteger(item.quantity, 99) };
  });
  if (requestedItems.some((item) => !item.priceItemId) || new Set(requestedItems.map((item) => item.priceItemId)).size !== requestedItems.length) {
    throw new ApiError(400, "invalid_quote_items", "Ogni voce di listino può comparire una sola volta.");
  }

  const priceList = await env.DB.prepare(
    "SELECT id, name, version, currency, tax_name, tax_rate_bps, prices_include_tax, valid_from, active, notes, updated_at FROM price_lists WHERE active = 1 ORDER BY updated_at DESC LIMIT 1",
  ).first<PriceListRow>();
  if (!priceList) throw new ApiError(409, "price_list_missing", "Non esiste un listino attivo.");
  if (priceList.prices_include_tax !== 0) throw new ApiError(409, "invalid_price_list", "Il listino attivo deve contenere prezzi netti con IGIC escluso.");

  const placeholders = requestedItems.map(() => "?").join(", ");
  const priceRows = (await env.DB.prepare(
    `SELECT id, price_list_id, code, category, name, dimensions, monthly_price_cents, included_services, active, sort_order, version, updated_at FROM price_items WHERE price_list_id = ? AND active = 1 AND id IN (${placeholders})`,
  ).bind(priceList.id, ...requestedItems.map((item) => item.priceItemId)).all<PriceItemRow>()).results;
  if (priceRows.length !== requestedItems.length) throw new ApiError(400, "invalid_quote_items", "Una o più voci non appartengono al listino attivo.");
  const priceById = new Map(priceRows.map((item) => [item.id, item]));
  const totals = calculateQuoteTotals(requestedItems.map((requested) => {
    const item = priceById.get(requested.priceItemId);
    if (!item) throw new ApiError(400, "invalid_quote_items", "Voce di listino non trovata.");
    return {
      priceItemId: item.id,
      code: item.code,
      name: item.name,
      dimensions: item.dimensions,
      monthlyPriceCents: item.monthly_price_cents,
      quantity: requested.quantity,
    };
  }), months, priceList.tax_rate_bps, discountBps);

  const now = new Date();
  const createdAt = now.toISOString();
  const year = now.getUTCFullYear();
  const counter = await env.DB.prepare(
    "INSERT INTO quote_counters (year, next_number) VALUES (?, 2) ON CONFLICT(year) DO UPDATE SET next_number = quote_counters.next_number + 1 RETURNING next_number - 1 AS sequence",
  ).bind(year).first<{ sequence: number }>();
  const sequence = Number(counter?.sequence);
  if (!Number.isInteger(sequence) || sequence < 1) throw new ApiError(500, "quote_number_failed", "Non è stato possibile assegnare il numero del preventivo.");
  const quoteNumber = formatQuoteNumber(year, sequence);
  const validUntil = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + validDays)).toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  const pdfBytes = await buildQuotePdf({
    quoteNumber,
    customerCompany: client.company_name,
    customerContact: client.contact_name,
    customerEmail: client.email,
    island: client.island,
    createdAt,
    validUntil,
    months,
    taxName: priceList.tax_name,
    taxRateBps: priceList.tax_rate_bps,
    subtotalCents: totals.subtotalCents,
    discountBps,
    discountReason,
    discountCents: totals.discountCents,
    netCents: totals.netCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    customerNote,
    items: totals.lines,
  });
  const pdfSha256 = await sha256(pdfBytes);
  const pdfKey = `quotes/${year}/${id}/${quoteNumber}.pdf`;
  await env.BUCKET.put(pdfKey, pdfBytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { sha256: pdfSha256, quoteNumber, createdBy: user.id },
  });

  try {
    const statements = [
      env.DB.prepare(
        "INSERT INTO quotes (id, quote_number, sequence, year, client_id, price_list_id, status, owner_user_id, island, customer_company, customer_contact, customer_email, currency, tax_name, tax_rate_bps, months, subtotal_cents, discount_bps, discount_reason, discount_cents, net_cents, tax_cents, total_cents, customer_note, valid_until, pdf_r2_key, pdf_sha256, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(id, quoteNumber, sequence, year, client.id, priceList.id, client.owner_user_id, client.island, client.company_name, client.contact_name, client.email, priceList.currency, priceList.tax_name, priceList.tax_rate_bps, months, totals.subtotalCents, discountBps, discountReason, totals.discountCents, totals.netCents, totals.taxCents, totals.totalCents, customerNote, validUntil, pdfKey, pdfSha256, user.id, createdAt),
      ...totals.lines.map((item) => env.DB.prepare(
        "INSERT INTO quote_items (id, quote_id, price_item_id, code, name, dimensions, monthly_price_cents, quantity, months, line_subtotal_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), id, item.priceItemId, item.code, item.name, item.dimensions, item.monthlyPriceCents, item.quantity, item.months, item.lineSubtotalCents)),
    ];
    await env.DB.batch(statements);
  } catch (error) {
    ctx.waitUntil(env.BUCKET.delete(pdfKey));
    throw error;
  }
  await appendAudit(env, request, user.id, "quote.issued", "quote", id, {
    quoteNumber,
    clientId: client.id,
    island: client.island,
    subtotalCents: totals.subtotalCents,
    discountBps,
    netCents: totals.netCents,
    taxRateBps: priceList.tax_rate_bps,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    pdfSha256,
  });
  return json({ id, quoteNumber, totalCents: totals.totalCents }, 201);
}

async function downloadQuote(quoteId: string, user: UserRow, env: RuntimeEnv): Promise<Response> {
  const quote = await getQuote(env, quoteId);
  if (!quote || !canReadRecord(user, quote)) throw new ApiError(404, "quote_not_found", "Preventivo non trovato.");
  return r2Download(env, quote.pdf_r2_key, "application/pdf", `${quote.quote_number}-${safeFilename(quote.customer_company)}.pdf`);
}

async function convertQuoteToContract(request: Request, quoteId: string, user: UserRow, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  if (!canCreateQuote(user)) throw new ApiError(403, "not_allowed", "Il Distributore non può convertire preventivi.");
  const quote = await getQuote(env, quoteId);
  if (!quote || !canWriteRecord(user, quote)) throw new ApiError(404, "quote_not_found", "Preventivo non trovato.");
  if (quote.status !== "issued") throw new ApiError(409, "quote_already_converted", "Il preventivo è già stato convertito in contratto.");
  if (quote.valid_until < new Date().toISOString().slice(0, 10)) throw new ApiError(409, "quote_expired", "Il preventivo è scaduto e non può essere convertito.");

  const source = await env.BUCKET.get(quote.pdf_r2_key);
  if (!source) throw new ApiError(404, "file_not_found", "Il PDF del preventivo non è disponibile.");
  const pdfBytes = await source.arrayBuffer();
  const contractId = crypto.randomUUID();
  const now = new Date().toISOString();
  const contractKey = `contracts/${contractId}/v1/document.pdf`;
  await env.BUCKET.put(contractKey, pdfBytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { sha256: quote.pdf_sha256, convertedFromQuote: quote.id, quoteNumber: quote.quote_number },
  });
  try {
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE quotes SET status = 'converted', converted_contract_id = ?, converted_at = ? WHERE id = ? AND status = 'issued'")
        .bind(contractId, now, quote.id),
      env.DB.prepare("INSERT INTO contracts (id, client_id, quote_id, template_id, title, status, owner_user_id, island, draft_r2_key, document_sha256, version, created_by, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 'draft', ?, ?, ?, ?, 1, ?, ?, ?)")
        .bind(contractId, quote.client_id, quote.id, `Contratto da preventivo ${quote.quote_number}`, quote.owner_user_id, quote.island, contractKey, quote.pdf_sha256, user.id, now, now),
    ]);
    if (Number(results[0].meta.changes ?? 0) !== 1 || Number(results[1].meta.changes ?? 0) !== 1) {
      throw new ApiError(409, "quote_already_converted", "Il preventivo è già stato convertito in contratto.");
    }
  } catch (error) {
    ctx.waitUntil(env.BUCKET.delete(contractKey));
    if (error instanceof ApiError) throw error;
    const latest = await getQuote(env, quote.id);
    if (latest?.status === "converted") throw new ApiError(409, "quote_already_converted", "Il preventivo è già stato convertito in contratto.");
    throw error;
  }
  await appendAudit(env, request, user.id, "quote.converted_to_contract", "quote", quote.id, {
    quoteNumber: quote.quote_number,
    contractId,
    documentSha256: quote.pdf_sha256,
  });
  return json({ contractId, quoteNumber: quote.quote_number }, 201);
}

async function createClient(request: Request, user: UserRow, env: RuntimeEnv): Promise<Response> {
  if (user.role === "distributor") throw new ApiError(403, "not_allowed", "Il Distributore può operare soltanto sulle consegne assegnate.");
  const body = await readJson<Record<string, unknown>>(request);
  const companyName = cleanText(body.companyName, 120);
  const contactName = cleanText(body.contactName, 120);
  const email = normalizeEmail(body.email);
  const phone = cleanOptionalText(body.phone, 40);
  const notes = cleanOptionalText(body.notes, 2000);
  const stage = String(body.stage ?? "lead");
  const requestedIsland = String(body.island ?? "");
  const island = isGlobalOperator(user) ? requestedIsland : String(user.island ?? "");
  if (!companyName || !contactName || !isEmail(email) || !isIsland(island)) {
    throw new ApiError(400, "invalid_client", "Azienda, contatto, email e isola sono obbligatori.");
  }
  if (!["lead", "qualified", "proposal", "standby", "won", "lost"].includes(stage)) throw new ApiError(400, "invalid_stage", "Fase CRM non valida.");

  const ownerUserId = await resolveOwner(env, user, String(body.ownerUserId ?? user.id), island);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const valueCents = Math.round(clampNumber(Number(body.valueEuros ?? 0), 0, 100_000_000) * 100);
  await env.DB.prepare(
    "INSERT INTO clients (id, company_name, contact_name, email, phone, island, stage, value_cents, owner_user_id, notes, version, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
  ).bind(id, companyName, contactName, email, phone, island, stage, valueCents, ownerUserId, notes, user.id, now, now).run();
  await appendAudit(env, request, user.id, "client.created", "client", id, { companyName, island, ownerUserId });
  return json({ id }, 201);
}

async function updateClient(request: Request, clientId: string, user: UserRow, env: RuntimeEnv): Promise<Response> {
  const current = await getClient(env, clientId);
  if (!current || !canWriteRecord(user, current)) throw new ApiError(404, "client_not_found", "Cliente non trovato.");
  const body = await readJson<Record<string, unknown>>(request);
  const version = Number(body.version);
  if (version !== current.version) throw new ApiError(409, "version_conflict", "La scheda è stata aggiornata da un altro utente. Ricarica i dati.");

  const stage = String(body.stage ?? current.stage);
  if (!["lead", "qualified", "proposal", "standby", "won", "lost"].includes(stage)) throw new ApiError(400, "invalid_stage", "Fase CRM non valida.");
  const notes = body.notes === undefined ? current.notes : cleanOptionalText(body.notes, 2000);
  const valueCents = body.valueEuros === undefined ? current.value_cents : Math.round(clampNumber(Number(body.valueEuros), 0, 100_000_000) * 100);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE clients SET stage = ?, notes = ?, value_cents = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
  ).bind(stage, notes, valueCents, now, clientId, version).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new ApiError(409, "version_conflict", "Aggiornamento concorrente rilevato.");
  await appendAudit(env, request, user.id, "client.updated", "client", clientId, { stage, valueCents, version: version + 1 });
  return json({ ok: true });
}

async function createDelivery(request: Request, user: UserRow, env: RuntimeEnv): Promise<Response> {
  if (!canManageDeliveries(user)) throw new ApiError(403, "not_allowed", "Operazione riservata al Sales Manager o al Super Admin.");
  const body = await readJson<Record<string, unknown>>(request);
  const clientId = String(body.clientId ?? "");
  const distributorUserId = String(body.distributorUserId ?? "");
  const client = await getClient(env, clientId);
  if (!client || !canReadRecord(user, client)) throw new ApiError(404, "client_not_found", "Azienda non trovata nel tuo perimetro.");

  const distributor = await env.DB.prepare(
    "SELECT id, email, name, role, island, active FROM users WHERE id = ? AND role = 'distributor' AND active = 1 LIMIT 1",
  ).bind(distributorUserId).first<UserRow>();
  if (!distributor || distributor.island !== client.island) {
    throw new ApiError(400, "invalid_distributor", "Il Distributore deve essere attivo e assegnato alla stessa isola dell'azienda.");
  }

  const quantity = positiveInteger(body.quantity, 1_000_000);
  const unit = cleanText(body.unit, 30) || "copie";
  const scheduledFor = optionalDate(body.scheduledFor);
  const deliveryContactName = cleanText(body.deliveryContactName, 120) || client.contact_name;
  const deliveryContactEmail = normalizeEmail(body.deliveryContactEmail || client.email);
  const deliveryContactPhone = cleanOptionalText(body.deliveryContactPhone ?? client.phone, 40);
  const deliveryAddress = cleanOptionalText(body.deliveryAddress, 300);
  const notes = cleanOptionalText(body.notes, 2000);
  if (!isEmail(deliveryContactEmail)) throw new ApiError(400, "invalid_delivery_contact", "Inserisci un'email valida per il referente della consegna.");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO deliveries (id, client_id, distributor_user_id, island, status, quantity, unit, scheduled_for, delivery_contact_name, delivery_contact_email, delivery_contact_phone, delivery_address, notes, version, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'assigned', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
  ).bind(id, client.id, distributor.id, client.island, quantity, unit, scheduledFor, deliveryContactName, deliveryContactEmail, deliveryContactPhone, deliveryAddress, notes, user.id, now, now).run();
  await appendAudit(env, request, user.id, "delivery.created", "delivery", id, { clientId, distributorUserId, island: client.island, quantity, unit, scheduledFor });
  return json({ id }, 201);
}

async function updateDelivery(request: Request, deliveryId: string, user: UserRow, env: RuntimeEnv): Promise<Response> {
  const current = await getDelivery(env, deliveryId);
  if (!current || !canWriteDelivery(user, current)) throw new ApiError(404, "delivery_not_found", "Consegna non trovata.");
  const body = await readJson<Record<string, unknown>>(request);
  const version = Number(body.version);
  if (version !== current.version) throw new ApiError(409, "version_conflict", "La consegna è stata aggiornata da un altro utente. Ricarica i dati.");

  const status = String(body.status ?? current.status);
  if (!isDeliveryStatus(status)) throw new ApiError(400, "invalid_delivery_status", "Stato della consegna non valido.");
  const quantity = body.quantity === undefined ? current.quantity : positiveInteger(body.quantity, 1_000_000);
  const unit = body.unit === undefined ? current.unit : cleanText(body.unit, 30);
  const scheduledFor = body.scheduledFor === undefined ? current.scheduled_for : optionalDate(body.scheduledFor);
  const deliveryContactName = body.deliveryContactName === undefined ? current.delivery_contact_name : cleanText(body.deliveryContactName, 120);
  const deliveryContactEmail = body.deliveryContactEmail === undefined ? current.delivery_contact_email : normalizeEmail(body.deliveryContactEmail);
  const deliveryContactPhone = body.deliveryContactPhone === undefined ? current.delivery_contact_phone : cleanOptionalText(body.deliveryContactPhone, 40);
  const deliveryAddress = body.deliveryAddress === undefined ? current.delivery_address : cleanOptionalText(body.deliveryAddress, 300);
  const notes = body.notes === undefined ? current.notes : cleanOptionalText(body.notes, 2000);
  if (!unit || !deliveryContactName || !isEmail(deliveryContactEmail)) {
    throw new ApiError(400, "invalid_delivery", "Quantità, unità e referente della consegna devono essere validi.");
  }

  const now = new Date().toISOString();
  const completedAt = status === "delivered" ? current.completed_at ?? now : null;
  const result = await env.DB.prepare(
    "UPDATE deliveries SET status = ?, quantity = ?, unit = ?, scheduled_for = ?, delivery_contact_name = ?, delivery_contact_email = ?, delivery_contact_phone = ?, delivery_address = ?, notes = ?, completed_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
  ).bind(status, quantity, unit, scheduledFor, deliveryContactName, deliveryContactEmail, deliveryContactPhone, deliveryAddress, notes, completedAt, now, deliveryId, version).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new ApiError(409, "version_conflict", "Aggiornamento concorrente rilevato.");
  await appendAudit(env, request, user.id, "delivery.updated", "delivery", deliveryId, { status, quantity, unit, scheduledFor, version: version + 1 });
  return json({ ok: true });
}

async function createUser(request: Request, user: UserRow, env: RuntimeEnv): Promise<Response> {
  requireUserManager(user);
  const body = await readJson<Record<string, unknown>>(request);
  const email = normalizeEmail(body.email);
  const name = cleanText(body.name, 120);
  const role = String(body.role ?? "");
  const requestedIsland = String(body.island ?? "");
  const temporaryPassword = String(body.temporaryPassword ?? "");
  if (!isEmail(email) || !name || !canCreateUserWithRole(user, role)) {
    throw new ApiError(400, "invalid_user", "Nome, email e ruolo operativo sono obbligatori.");
  }
  const island = role === "admin" ? null : requestedIsland;
  if (role !== "admin" && !isIsland(requestedIsland)) throw new ApiError(400, "invalid_island", "Assegna una delle cinque isole.");
  if (temporaryPassword.length < 12 || temporaryPassword.length > 256) throw new ApiError(400, "weak_password", "La password temporanea deve contenere almeno 12 caratteri.");
  const credentials = await createPasswordHash(temporaryPassword, env.AUTH_SECRET ?? "");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare("INSERT INTO users (id, email, name, role, island, active, password_hash, password_salt, password_iterations, must_change_password, password_changed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 1, NULL, ?, ?)")
      .bind(id, email, name, role, island, credentials.hash, credentials.salt, credentials.iterations, now, now).run();
  } catch {
    throw new ApiError(409, "email_exists", "Esiste già un utente con questa email.");
  }
  await appendAudit(env, request, user.id, "user.created", "user", id, { email, role, island });
  return json({ id }, 201);
}

async function updateUser(request: Request, targetUserId: string, user: UserRow, env: RuntimeEnv): Promise<Response> {
  requireUserManager(user);
  const target = await env.DB.prepare("SELECT id, email, name, phone, role, island, active FROM users WHERE id = ? LIMIT 1")
    .bind(targetUserId).first<UserRow>();
  if (!target || target.role === "super_admin" || (target.role === "admin" && user.role !== "super_admin")) {
    throw new ApiError(404, "user_not_found", "Utente operativo non trovato.");
  }
  const body = await readJson<Record<string, unknown>>(request);
  const role = body.role === undefined ? target.role : String(body.role);
  const requestedIsland = body.island === undefined ? target.island : String(body.island);
  const island = role === "admin" ? null : requestedIsland;
  const active = body.active === undefined ? target.active : body.active === true ? 1 : body.active === false ? 0 : -1;
  if (!canUpdateUserRole(user, target.role, role) || (role !== "admin" && !isIsland(String(island ?? ""))) || ![0, 1].includes(active)) {
    throw new ApiError(400, "invalid_user", "Ruolo, isola o stato utente non validi.");
  }
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET role = ?, island = ?, active = ?, updated_at = ? WHERE id = ? AND role <> 'super_admin'")
      .bind(role, island, active, now, target.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id),
  ]);
  await appendAudit(env, request, user.id, "user.updated", "user", target.id, { role, island, active: active === 1 });
  return json({ ok: true });
}

async function retryOutboxMessage(request: Request, messageId: string, user: UserRow, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  requireSuperAdmin(user);
  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE email_outbox SET status = 'pending', attempts = 0, next_attempt_at = ?, last_error = NULL WHERE id = ? AND status <> 'sent'")
    .bind(now, messageId).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new ApiError(404, "email_not_found", "Invio email non trovato o già completato.");
  await appendAudit(env, request, user.id, "email.retry_requested", "email_outbox", messageId, {});
  ctx.waitUntil(deliverOutboxMessage(env, messageId));
  return json({ ok: true }, 202);
}

async function uploadTemplate(request: Request, user: UserRow, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  requireSuperAdmin(user);
  const form = await readFormData(request);
  const file = requiredFile(form, "file", ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
  const name = cleanText(form.get("name"), 120);
  const version = cleanText(form.get("version"), 30) || "1";
  if (!name) throw new ApiError(400, "invalid_template", "Il nome del modello è obbligatorio.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const key = `templates/${id}/${safeFilename(file.name)}`;
  await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { uploadedBy: user.id, createdAt: now } });
  try {
    await env.DB.prepare("INSERT INTO contract_templates (id, name, version, r2_key, mime_type, original_filename, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
      .bind(id, name, version, key, file.type, safeFilename(file.name), user.id, now).run();
  } catch (error) {
    ctx.waitUntil(env.BUCKET.delete(key));
    throw error;
  }
  await appendAudit(env, request, user.id, "template.created", "contract_template", id, { name, version, filename: safeFilename(file.name) });
  return json({ id }, 201);
}

async function downloadTemplate(templateId: string, user: UserRow, env: RuntimeEnv): Promise<Response> {
  if (user.role === "distributor") throw new ApiError(404, "template_not_found", "Modello non trovato.");
  const template = await env.DB.prepare("SELECT r2_key, mime_type, original_filename FROM contract_templates WHERE id = ? AND active = 1")
    .bind(templateId).first<{ r2_key: string; mime_type: string; original_filename: string }>();
  if (!template) throw new ApiError(404, "template_not_found", "Modello non trovato.");
  return r2Download(env, template.r2_key, template.mime_type, template.original_filename);
}

async function createContract(request: Request, user: UserRow, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  const form = await readFormData(request);
  const file = requiredFile(form, "file", ["application/pdf"], MAX_CONTRACT_BYTES);
  const clientId = String(form.get("clientId") ?? "");
  const templateId = cleanOptionalText(form.get("templateId"), 80);
  const title = cleanText(form.get("title"), 160);
  const client = await getClient(env, clientId);
  if (!client || !canWriteRecord(user, client)) throw new ApiError(404, "client_not_found", "Cliente non trovato.");
  if (!title) throw new ApiError(400, "invalid_contract", "Il titolo del contratto è obbligatorio.");
  if (templateId) {
    const template = await env.DB.prepare("SELECT id FROM contract_templates WHERE id = ? AND active = 1").bind(templateId).first();
    if (!template) throw new ApiError(400, "invalid_template", "Modello di contratto non valido.");
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const fileBytes = await file.arrayBuffer();
  await validatePdf(fileBytes);
  const documentSha256 = await sha256(fileBytes);
  const key = `contracts/${id}/v1/document.pdf`;
  await env.BUCKET.put(key, fileBytes, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { sha256: documentSha256, uploadedBy: user.id } });
  try {
    await env.DB.prepare("INSERT INTO contracts (id, client_id, template_id, title, status, owner_user_id, island, draft_r2_key, document_sha256, version, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, 1, ?, ?, ?)")
      .bind(id, clientId, templateId, title, client.owner_user_id, client.island, key, documentSha256, user.id, now, now).run();
  } catch (error) {
    ctx.waitUntil(env.BUCKET.delete(key));
    throw error;
  }
  await appendAudit(env, request, user.id, "contract.created", "contract", id, { clientId, title, documentSha256, version: 1 });
  return json({ id }, 201);
}

async function downloadContract(contractId: string, user: UserRow, env: RuntimeEnv): Promise<Response> {
  const contract = await getContract(env, contractId);
  if (!contract || !canReadRecord(user, contract)) throw new ApiError(404, "contract_not_found", "Contratto non trovato.");
  const key = contract.signed_r2_key ?? contract.draft_r2_key;
  const suffix = contract.signed_r2_key ? "-firmato" : "";
  return r2Download(env, key, "application/pdf", `${safeFilename(contract.title)}-v${contract.version}${suffix}.pdf`);
}

async function downloadEvidence(contractId: string, user: UserRow, env: RuntimeEnv): Promise<Response> {
  const contract = await getContract(env, contractId);
  if (!contract || !canReadRecord(user, contract) || !contract.evidence_r2_key) throw new ApiError(404, "evidence_not_found", "Evidenza di firma non trovata.");
  return r2Download(env, contract.evidence_r2_key, "application/json", `${safeFilename(contract.title)}-evidenza-firma.json`);
}

async function requestContractSignature(request: Request, contractId: string, user: UserRow, env: RuntimeEnv): Promise<Response> {
  requireAuthConfiguration(env);
  const contract = await getContract(env, contractId);
  if (!contract || !canWriteRecord(user, contract)) throw new ApiError(404, "contract_not_found", "Contratto non trovato.");
  if (contract.status !== "draft" && contract.status !== "awaiting_signature") throw new ApiError(409, "invalid_contract_state", "Questo contratto non può essere inviato alla firma.");
  const body = await readJson<{ signerName?: string; signerEmail?: string }>(request);
  const signerName = cleanText(body.signerName, 120);
  const signerEmail = normalizeEmail(body.signerEmail);
  if (!signerName || !isEmail(signerEmail)) throw new ApiError(400, "invalid_signer", "Nome ed email del firmatario sono obbligatori.");

  const challenge = await createChallenge(env, signerEmail, "contract_sign", contract.id, user.id);
  try {
    if (challenge.code) await sendOtp(env, signerEmail, challenge.code, "Firma del contratto CRMVLC", `Codice di conferma per il contratto “${contract.title}”`);
    await env.DB.prepare("UPDATE contracts SET status = 'awaiting_signature', signer_name = ?, signer_email = ?, updated_at = ? WHERE id = ?")
      .bind(signerName, signerEmail, new Date().toISOString(), contract.id).run();
  } catch (error) {
    await env.DB.prepare("DELETE FROM auth_challenges WHERE id = ?").bind(challenge.id).run();
    throw error;
  }
  await appendAudit(env, request, user.id, "contract.signature_requested", "contract", contract.id, { signerEmail, challengeId: challenge.id });
  return json({ challengeId: challenge.id, expiresInMinutes: OTP_TTL_MINUTES });
}

async function completeContractSignature(request: Request, contractId: string, user: UserRow, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  requireAuthConfiguration(env);
  const contract = await getContract(env, contractId);
  if (!contract || !canWriteRecord(user, contract)) throw new ApiError(404, "contract_not_found", "Contratto non trovato.");
  if (contract.status !== "awaiting_signature" || !contract.signer_email || !contract.signer_name) {
    throw new ApiError(409, "invalid_contract_state", "Richiedi prima il codice di firma.");
  }
  const body = await readJson<{ challengeId?: string; code?: string; signatureDataUrl?: string; agentConfirmed?: boolean }>(request);
  if (body.agentConfirmed !== true) throw new ApiError(400, "agent_confirmation_required", "L'agente deve confermare la presenza del firmatario.");
  const challengeId = String(body.challengeId ?? "");
  const code = String(body.code ?? "").replace(/\D/g, "");
  const challenge = await env.DB.prepare("SELECT id, email, purpose, subject_id, code_hash, expires_at, attempts, consumed_at FROM auth_challenges WHERE id = ? AND purpose = 'contract_sign' AND subject_id = ? AND email = ? LIMIT 1")
    .bind(challengeId, contract.id, contract.signer_email).first<ChallengeRow>();
  await assertChallenge(env, challenge, code);

  const signature = parseSignature(body.signatureDataUrl);
  const signatureSha256 = await sha256(signature);
  const signedAt = new Date().toISOString();
  const signatureKey = `contracts/${contract.id}/v${contract.version}/${challengeId}/signature.png`;
  const signedDocumentKey = `contracts/${contract.id}/v${contract.version}/${challengeId}/signed.pdf`;
  const evidenceKey = `contracts/${contract.id}/v${contract.version}/${challengeId}/evidence.json`;
  const evidenceBase = {
    schema: "vlc-os.contract-signature.v1",
    contractId: contract.id,
    contractVersion: contract.version,
    documentSha256: contract.document_sha256,
    signatureSha256,
    signer: { name: contract.signer_name, email: contract.signer_email, otpVerified: true },
    agent: { id: user.id, name: user.name, email: user.email, presenceConfirmed: true },
    signedAt,
    challengeId,
    userAgent: cleanOptionalText(request.headers.get("user-agent"), 300),
  };

  const original = await env.BUCKET.get(contract.draft_r2_key);
  if (!original) throw new ApiError(404, "file_not_found", "Il PDF originale non è disponibile.");
  const signedPdf = await buildSignedPdf(await original.arrayBuffer(), signature, evidenceBase);
  const signedDocumentSha256 = await sha256(signedPdf);
  const evidence = { ...evidenceBase, signedDocumentSha256 };
  const outboxId = crypto.randomUUID();
  const receiptSubject = "Copia del contratto firmato";
  const receiptBody = `La firma del contratto “${contract.title}” è stata registrata il ${signedAt}. In allegato trovi la copia firmata con il certificato di firma CRMVLC.`;

  await Promise.all([
    env.BUCKET.put(signatureKey, signature, { httpMetadata: { contentType: "image/png" }, customMetadata: { sha256: signatureSha256 } }),
    env.BUCKET.put(signedDocumentKey, signedPdf, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { sha256: signedDocumentSha256, originalSha256: contract.document_sha256 } }),
    env.BUCKET.put(evidenceKey, JSON.stringify(evidence, null, 2), { httpMetadata: { contentType: "application/json" } }),
  ]);
  try {
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(signedAt, challengeId),
      env.DB.prepare("UPDATE contracts SET status = 'signed', signed_r2_key = ?, signature_r2_key = ?, evidence_r2_key = ?, signed_document_sha256 = ?, signature_sha256 = ?, signed_at = ?, updated_at = ? WHERE id = ? AND status = 'awaiting_signature'")
        .bind(signedDocumentKey, signatureKey, evidenceKey, signedDocumentSha256, signatureSha256, signedAt, signedAt, contract.id),
      env.DB.prepare("INSERT INTO email_outbox (id, kind, recipient, subject, body_text, attachment_r2_key, attachment_filename, status, attempts, next_attempt_at, created_at) VALUES (?, 'contract_receipt', ?, ?, ?, ?, ?, 'pending', 0, ?, ?)")
        .bind(outboxId, contract.signer_email, receiptSubject, receiptBody, signedDocumentKey, `${safeFilename(contract.title)}-firmato.pdf`, signedAt, signedAt),
    ]);
    if (Number(results[0].meta.changes ?? 0) !== 1 || Number(results[1].meta.changes ?? 0) !== 1) {
      throw new ApiError(409, "signature_already_completed", "La firma è già stata registrata.");
    }
  } catch (error) {
    ctx.waitUntil(Promise.all([env.BUCKET.delete(signatureKey), env.BUCKET.delete(signedDocumentKey), env.BUCKET.delete(evidenceKey)]).then(() => undefined));
    throw error;
  }
  await appendAudit(env, request, user.id, "contract.signed", "contract", contract.id, evidence);
  ctx.waitUntil(deliverOutboxMessage(env, outboxId));
  return json({ ok: true, signedAt, documentSha256: contract.document_sha256, signedDocumentSha256, signatureSha256 });
}

async function supersedeSignedContract(request: Request, contractId: string, user: UserRow, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  const contract = await getContract(env, contractId);
  if (!contract || !canCancelSignedContract(user, contract)) throw new ApiError(403, "not_allowed", "Solo il Super Admin può annullare un contratto firmato.");
  const form = await readFormData(request);
  const file = requiredFile(form, "file", ["application/pdf"], MAX_CONTRACT_BYTES);
  const reason = cleanText(form.get("reason"), 500);
  const title = cleanText(form.get("title"), 160) || contract.title;
  if (!reason) throw new ApiError(400, "reason_required", "La motivazione dell'annullamento è obbligatoria.");

  const newId = crypto.randomUUID();
  const newVersion = contract.version + 1;
  const now = new Date().toISOString();
  const bytes = await file.arrayBuffer();
  await validatePdf(bytes);
  const documentSha256 = await sha256(bytes);
  const key = `contracts/${newId}/v${newVersion}/document.pdf`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { sha256: documentSha256, supersedes: contract.id } });
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE contracts SET status = 'cancelled', cancelled_reason = ?, cancelled_at = ?, cancelled_by = ?, updated_at = ? WHERE id = ? AND status = 'signed'")
        .bind(reason, now, user.id, now, contract.id),
      env.DB.prepare("INSERT INTO contracts (id, client_id, template_id, title, status, owner_user_id, island, draft_r2_key, document_sha256, version, parent_contract_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(newId, contract.client_id, contract.template_id, title, contract.owner_user_id, contract.island, key, documentSha256, newVersion, contract.id, user.id, now, now),
    ]);
  } catch (error) {
    ctx.waitUntil(env.BUCKET.delete(key));
    throw error;
  }
  await appendAudit(env, request, user.id, "contract.cancelled_and_superseded", "contract", contract.id, { reason, newContractId: newId, newVersion, documentSha256 });
  return json({ id: newId, version: newVersion }, 201);
}

async function ensureBootstrapAdmin(env: RuntimeEnv): Promise<void> {
  const email = normalizeEmail(env.ADMIN_EMAIL);
  if (!email) return;
  const existing = await env.DB.prepare("SELECT id FROM users LIMIT 1").first();
  if (existing) return;
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, email, name, role, island, active, created_at, updated_at) VALUES (?, ?, ?, 'super_admin', NULL, 1, ?, ?)")
    .bind(crypto.randomUUID(), email, cleanText(env.ADMIN_NAME, 120) || "CRMVLC Super Admin", now, now).run();
}

async function ensureDemoAccount(env: RuntimeEnv): Promise<UserRow> {
  const email = normalizeEmail(env.DEMO_EMAIL);
  let user = await env.DB.prepare("SELECT id, email, name, phone, role, island, active FROM users WHERE email = ? LIMIT 1")
    .bind(email).first<UserRow>();
  const now = new Date().toISOString();

  if (!user) {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, email, name, role, island, active, created_at, updated_at) VALUES (?, ?, 'Demo Super Admin', 'super_admin', NULL, 1, ?, ?)")
      .bind(id, email, now, now).run();
    user = { id, email, name: "Demo Super Admin", phone: null, role: "super_admin", island: null, active: 1 };
  } else if (user.role !== "super_admin" || user.active !== 1) {
    await env.DB.prepare("UPDATE users SET name = 'Demo Super Admin', role = 'super_admin', island = NULL, active = 1, updated_at = ? WHERE id = ?")
      .bind(now, user.id).run();
    user = { ...user, name: "Demo Super Admin", role: "super_admin", island: null, active: 1 };
  }

  return user;
}

async function requireUser(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<UserRow> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) throw new ApiError(401, "authentication_required", "Accedi per continuare.");
  const sessionId = await sha256(token);
  const now = new Date().toISOString();
  const user = await env.DB.prepare(
    "SELECT u.id, u.email, u.name, u.phone, u.role, u.island, u.active FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.active = 1 LIMIT 1",
  ).bind(sessionId, now).first<UserRow>();
  if (!user) throw new ApiError(401, "session_expired", "Sessione scaduta. Accedi nuovamente.");
  ctx.waitUntil(env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(now, sessionId).run().then(() => undefined));
  return user;
}

async function createChallenge(env: RuntimeEnv, email: string, purpose: "login" | "contract_sign", subjectId: string | null, requestedBy: string | null) {
  if (!env.AUTH_SECRET) throw new ApiError(503, "auth_not_configured", "La chiave di autenticazione non è configurata.");
  const recent = await env.DB.prepare(
    "SELECT id, created_at FROM auth_challenges WHERE email = ? AND purpose = ? AND ((subject_id = ?) OR (subject_id IS NULL AND ? IS NULL)) AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
  ).bind(email, purpose, subjectId, subjectId, new Date().toISOString()).first<{ id: string; created_at: string }>();
  if (recent && Date.now() - Date.parse(recent.created_at) < 60_000) return { id: recent.id, code: null };
  const id = crypto.randomUUID();
  const code = randomOtp();
  const codeHash = await otpHash(env.AUTH_SECRET, id, code);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE auth_challenges SET consumed_at = ? WHERE email = ? AND purpose = ? AND consumed_at IS NULL")
      .bind(now.toISOString(), email, purpose),
    env.DB.prepare("INSERT INTO auth_challenges (id, email, purpose, subject_id, code_hash, expires_at, attempts, requested_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)")
      .bind(id, email, purpose, subjectId, codeHash, expiresAt, requestedBy, now.toISOString()),
  ]);
  return { id, code };
}

async function assertChallenge(env: RuntimeEnv, challenge: ChallengeRow | null, code: string): Promise<void> {
  if (!challenge || challenge.consumed_at || challenge.attempts >= 5 || Date.parse(challenge.expires_at) <= Date.now()) {
    throw new ApiError(400, "invalid_otp", "Il codice è errato o scaduto.");
  }
  if (!env.AUTH_SECRET || code.length !== 6) throw new ApiError(400, "invalid_otp", "Il codice è errato o scaduto.");
  const candidate = await otpHash(env.AUTH_SECRET, challenge.id, code);
  if (!timingSafeEqualHex(candidate, challenge.code_hash)) {
    await env.DB.prepare("UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?").bind(challenge.id).run();
    throw new ApiError(400, "invalid_otp", "Il codice è errato o scaduto.");
  }
}

async function appendAudit(env: RuntimeEnv, request: Request, actorUserId: string | null, action: string, entityType: string, entityId: string, payload: unknown): Promise<void> {
  const payloadJson = stableJson(payload);
  const payloadSha256 = await sha256(payloadJson);
  const rawIp = request.headers.get("cf-connecting-ip");
  const ipHash = rawIp ? await sha256(`${env.AUTH_SECRET ?? "vlc"}:${rawIp}`) : null;
  await env.DB.prepare("INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, payload_json, payload_sha256, ip_hash, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actorUserId, action, entityType, entityId, payloadJson, payloadSha256, ipHash, cleanOptionalText(request.headers.get("user-agent"), 300), new Date().toISOString()).run();
}

async function sendOtp(env: RuntimeEnv, to: string, code: string, subject: string, intro: string): Promise<void> {
  if (!env.EMAIL_FROM) throw new ApiError(503, "email_not_configured", "Il mittente email non è configurato.");
  await env.EMAIL.send({
    from: { name: "CRMVLC", email: env.EMAIL_FROM },
    to,
    subject,
    text: `${intro}. Codice: ${code}. Scade tra ${OTP_TTL_MINUTES} minuti. Se non hai richiesto questa operazione, ignora il messaggio.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>CRMVLC</h2><p>${escapeHtml(intro)}.</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>Il codice scade tra ${OTP_TTL_MINUTES} minuti.</p><p style="color:#667085">Se non hai richiesto questa operazione, ignora il messaggio.</p></div>`,
  });
}

export async function processEmailOutbox(env: RuntimeEnv): Promise<void> {
  if (!env.DB || !env.BUCKET || !env.EMAIL || !env.EMAIL_FROM) return;
  const pending = await env.DB.prepare(
    "SELECT id, recipient, subject, body_text, attachment_r2_key, attachment_filename, attempts FROM email_outbox WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at LIMIT 10",
  ).bind(new Date().toISOString()).all<EmailOutboxRow>();
  await Promise.all(pending.results.map((message) => deliverOutboxMessage(env, message.id)));
}

async function deliverOutboxMessage(env: RuntimeEnv, messageId: string): Promise<void> {
  const message = await env.DB.prepare(
    "SELECT id, recipient, subject, body_text, attachment_r2_key, attachment_filename, attempts FROM email_outbox WHERE id = ? AND status = 'pending' LIMIT 1",
  ).bind(messageId).first<EmailOutboxRow>();
  if (!message) return;

  try {
    if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is not configured");
    const attachments: Array<{ filename: string; type: string; disposition: "attachment"; content: ArrayBuffer }> = [];
    if (message.attachment_r2_key && message.attachment_filename) {
      const object = await env.BUCKET.get(message.attachment_r2_key);
      if (!object) throw new Error("Contract attachment is missing");
      attachments.push({
        filename: safeFilename(message.attachment_filename),
        type: "application/pdf",
        disposition: "attachment",
        content: await object.arrayBuffer(),
      });
    }
    await env.EMAIL.send({
      from: { name: "CRMVLC", email: env.EMAIL_FROM },
      to: message.recipient,
      subject: message.subject,
      text: message.body_text,
      attachments,
    });
    await env.DB.prepare("UPDATE email_outbox SET status = 'sent', sent_at = ?, last_error = NULL WHERE id = ? AND status = 'pending'")
      .bind(new Date().toISOString(), message.id).run();
  } catch (error) {
    const attempts = message.attempts + 1;
    const status = attempts >= 5 ? "dead" : "pending";
    const delayMinutes = Math.min(60, 5 * (2 ** Math.max(0, attempts - 1)));
    const nextAttemptAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
    const reason = cleanText(error instanceof Error ? error.message : "unknown", 500);
    await env.DB.prepare("UPDATE email_outbox SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ? AND status = 'pending'")
      .bind(status, attempts, nextAttemptAt, reason, message.id).run();
    console.error(JSON.stringify({ level: "error", event: "email_outbox_delivery_failed", messageId: message.id, attempts, status, reason }));
  }
}

async function getClient(env: RuntimeEnv, id: string): Promise<ClientRow | null> {
  return env.DB.prepare("SELECT * FROM clients WHERE id = ? AND archived_at IS NULL LIMIT 1").bind(id).first<ClientRow>();
}

async function getContract(env: RuntimeEnv, id: string): Promise<ContractRow | null> {
  return env.DB.prepare("SELECT * FROM contracts WHERE id = ? LIMIT 1").bind(id).first<ContractRow>();
}

async function getDelivery(env: RuntimeEnv, id: string): Promise<DeliveryRow | null> {
  return env.DB.prepare("SELECT * FROM deliveries WHERE id = ? LIMIT 1").bind(id).first<DeliveryRow>();
}

async function getQuote(env: RuntimeEnv, id: string): Promise<QuoteRow | null> {
  return env.DB.prepare("SELECT * FROM quotes WHERE id = ? LIMIT 1").bind(id).first<QuoteRow>();
}

async function resolveOwner(env: RuntimeEnv, actor: UserRow, requestedOwner: string, island: string): Promise<string> {
  if (actor.role === "sales") return actor.id;
  if (isGlobalOperator(actor) && requestedOwner === actor.id) return actor.id;
  const owner = await env.DB.prepare("SELECT id, email, name, phone, role, island, active FROM users WHERE id = ? AND active = 1 LIMIT 1")
    .bind(requestedOwner).first<UserRow>();
  if (!owner || !["sales_manager", "sales"].includes(owner.role)) return actor.id;
  if (owner.island !== island) throw new ApiError(400, "owner_island_mismatch", "Il responsabile del cliente deve appartenere alla stessa isola.");
  if (actor.role === "sales_manager" && owner.island !== actor.island) throw new ApiError(403, "owner_not_allowed", "Non puoi assegnare clienti fuori dalla tua isola.");
  return owner.id;
}

async function r2Download(env: RuntimeEnv, key: string, contentType: string, filename: string): Promise<Response> {
  const object = await env.BUCKET.get(key);
  if (!object) throw new ApiError(404, "file_not_found", "File non trovato.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", contentType);
  headers.set("content-disposition", `attachment; filename="${safeFilename(filename)}"`);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-store");
  return new Response(object.body, { headers });
}

async function validatePdf(bytes: ArrayBuffer): Promise<void> {
  try {
    await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch {
    throw new ApiError(400, "invalid_pdf", "Il PDF non è valido o è protetto da password.");
  }
}

async function buildSignedPdf(original: ArrayBuffer, signature: Uint8Array, evidence: {
  contractId: string;
  contractVersion: number;
  documentSha256: string;
  signatureSha256: string;
  signer: { name: string; email: string; otpVerified: boolean };
  agent: { id: string; name: string; email: string; presenceConfirmed: boolean };
  signedAt: string;
}): Promise<Uint8Array> {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(original, { ignoreEncryption: false, updateMetadata: false });
  } catch {
    throw new ApiError(400, "invalid_pdf", "Il PDF non può essere completato con la firma.");
  }
  const [font, bold, signatureImage] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedPng(signature),
  ]);
  const page = pdf.addPage([595.28, 841.89]);
  const dark = rgb(0.06, 0.16, 0.26);
  const muted = rgb(0.36, 0.43, 0.49);
  page.drawText("CRMVLC", { x: 48, y: 785, size: 11, font: bold, color: rgb(0.9, 0.3, 0.23) });
  page.drawText("CERTIFICATO DI FIRMA", { x: 48, y: 748, size: 22, font: bold, color: dark });
  page.drawText("Allegato integrante del documento contrattuale", { x: 48, y: 726, size: 10, font, color: muted });
  page.drawLine({ start: { x: 48, y: 704 }, end: { x: 547, y: 704 }, thickness: 1, color: rgb(0.85, 0.88, 0.9) });
  const rows = [
    ["Contratto", `${evidence.contractId} · versione ${evidence.contractVersion}`],
    ["Firmatario", `${evidence.signer.name} · ${evidence.signer.email}`],
    ["Verifica identita", "Codice OTP email verificato"],
    ["Conferma agente", `${evidence.agent.name} · ${evidence.agent.email}`],
    ["Data UTC", evidence.signedAt],
  ];
  let y = 666;
  for (const [label, value] of rows) {
    page.drawText(label, { x: 48, y, size: 9, font: bold, color: muted });
    page.drawText(pdfSafeText(value), { x: 170, y, size: 10, font, color: dark, maxWidth: 365 });
    y -= 28;
  }
  page.drawText("Firma acquisita sul dispositivo", { x: 48, y: 500, size: 9, font: bold, color: muted });
  const scale = Math.min(300 / signatureImage.width, 105 / signatureImage.height);
  page.drawRectangle({ x: 48, y: 360, width: 499, height: 125, borderWidth: 1, borderColor: rgb(0.78, 0.82, 0.85) });
  page.drawImage(signatureImage, { x: 68, y: 370, width: signatureImage.width * scale, height: signatureImage.height * scale });
  page.drawText("Impronte crittografiche SHA-256", { x: 48, y: 326, size: 9, font: bold, color: muted });
  page.drawText(`Documento originale: ${evidence.documentSha256}`, { x: 48, y: 304, size: 7.5, font, color: dark, maxWidth: 499 });
  page.drawText(`Firma: ${evidence.signatureSha256}`, { x: 48, y: 286, size: 7.5, font, color: dark, maxWidth: 499 });
  page.drawText("Il documento originale, la firma e il registro di audit sono conservati separatamente e non modificabili tramite l'applicazione.", { x: 48, y: 240, size: 8.5, font, color: muted, maxWidth: 499, lineHeight: 13 });
  page.drawText(`Generato da CRMVLC · ${evidence.contractId}`, { x: 48, y: 48, size: 7.5, font, color: muted });
  pdf.setTitle(`CRMVLC - contratto ${evidence.contractId}`);
  pdf.setSubject("Contratto con certificato di firma OTP e conferma agente");
  pdf.setProducer("CRMVLC");
  return pdf.save({ useObjectStreams: true });
}

function pdfSafeText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function requireAuthConfiguration(env: RuntimeEnv): void {
  if (!env.DB || !env.EMAIL || !env.AUTH_SECRET || !env.EMAIL_FROM) {
    throw new ApiError(503, "service_not_configured", "Email e autenticazione non sono ancora configurate per l'uso reale.");
  }
}

function requireSuperAdmin(user: UserRow): void {
  if (user.role !== "super_admin") throw new ApiError(403, "super_admin_required", "Operazione riservata al Super Admin.");
}

function requireUserManager(user: UserRow): void {
  if (user.role !== "super_admin" && user.role !== "admin") {
    throw new ApiError(403, "user_manager_required", "Operazione riservata alla gestione utenti.");
  }
}

function isGlobalOperator(user: UserRow): boolean {
  return user.role === "super_admin" || user.role === "admin";
}

function verifySameOrigin(request: Request, url: URL): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) throw new ApiError(403, "invalid_origin", "Origine della richiesta non valida.");
}

async function readJson<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_JSON_BYTES) throw new ApiError(413, "payload_too_large", "Richiesta troppo grande.");
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new ApiError(415, "json_required", "Invia dati JSON.");
  try {
    return await request.json<T>();
  } catch {
    throw new ApiError(400, "invalid_json", "Dati JSON non validi.");
  }
}

async function readFormData(request: Request): Promise<FormData> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 512_000) throw new ApiError(413, "payload_too_large", "Il file supera il limite di 8 MB.");
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) throw new ApiError(415, "form_required", "Invia un modulo con file.");
  return request.formData();
}

function requiredFile(form: FormData, key: string, allowedTypes: string[], maxBytes = MAX_UPLOAD_BYTES): File {
  const value = form.get(key);
  if (!(value instanceof File) || value.size === 0) throw new ApiError(400, "file_required", "Seleziona un file.");
  if (value.size > maxBytes) throw new ApiError(413, "file_too_large", `Il file supera il limite di ${(maxBytes / 1_000_000).toFixed(1)} MB.`);
  if (!allowedTypes.includes(value.type)) throw new ApiError(415, "invalid_file_type", "Formato file non supportato.");
  return value;
}

function parseSignature(value: unknown): Uint8Array {
  const dataUrl = String(value ?? "");
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new ApiError(400, "invalid_signature", "Firma non valida.");
  try {
    const binary = atob(dataUrl.slice(prefix.length));
    if (!binary.length || binary.length > MAX_SIGNATURE_BYTES) throw new ApiError(413, "signature_too_large", "La firma supera il limite consentito.");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_signature", "Firma non valida.");
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function apiError(error: ApiError): Response {
  return json({ error: { code: error.code, message: error.message } }, error.status);
}

function publicUser(user: UserRow) {
  return { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role, island: user.island };
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const item of cookie.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

function sessionCookie(token: string, request: Request, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie(request: Request): string {
  return sessionCookie("", request, 0);
}

function randomToken(bytes: number): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomOtp(): string {
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % 1_000_000);
  const sample = new Uint32Array(1);
  do crypto.getRandomValues(sample); while (sample[0] >= limit);
  return String(sample[0] % 1_000_000).padStart(6, "0");
}

async function otpHash(secret: string, challengeId: string, code: string): Promise<string> {
  return sha256(`${secret}\n${challengeId}\n${code}`);
}

async function sha256(value: string | ArrayBuffer | Uint8Array): Promise<string> {
  const source = typeof value === "string" ? textEncoder.encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
  const data = new Uint8Array(source.byteLength);
  data.set(source);
  const digest = await crypto.subtle.digest("SHA-256", data.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

async function timingSafeEqualText(a: string, b: string): Promise<boolean> {
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(a)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(b)),
  ]);
  return timingSafeEqual(new Uint8Array(aHash), new Uint8Array(bHash));
}

function isDemoEnabled(env: RuntimeEnv): boolean {
  return env.DEMO_MODE === "true"
    && isEmail(normalizeEmail(env.DEMO_EMAIL))
    && String(env.DEMO_PASSWORD ?? "").length >= 12
    && Boolean(env.DB && env.AUTH_SECRET);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanOptionalText(value: unknown, maxLength: number): string | null {
  const cleaned = cleanText(value, maxLength);
  return cleaned || null;
}

function normalizePhone(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) throw new ApiError(400, "invalid_phone", "Inserisci un numero di telefono valido.");
  return `${raw.startsWith("+") ? "+" : ""}${digits}`;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function positiveInteger(value: unknown, max: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw new ApiError(400, "invalid_quantity", `La quantità deve essere un numero intero tra 1 e ${max}.`);
  }
  return number;
}

function optionalDate(value: unknown): string | null {
  const date = cleanText(value, 10);
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new ApiError(400, "invalid_date", "La data programmata non è valida.");
  }
  return date;
}

function isDeliveryStatus(value: string): value is DeliveryRow["status"] {
  return ["assigned", "in_progress", "delivered", "issue"].includes(value);
}

function safeFilename(value: string): string {
  const cleaned = String(value || "file").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 120) || "file";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
