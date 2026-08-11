"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Role = "super_admin" | "admin" | "sales_manager" | "sales" | "distributor";
type User = { id: string; name: string; role: Role; island: string | null };
type FaqEntry = {
  id: string;
  translation_group_id: string;
  language: "it" | "es";
  module_key: string;
  title: string;
  question: string;
  answer: string;
  allowed_roles: string[];
  status: "draft" | "published" | "retired";
  version: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};
type FaqTicket = {
  id: string;
  user_name?: string | null;
  role: Role;
  island: string | null;
  language: "it" | "es";
  module_key: string;
  question: string;
  reason: string;
  status: "open" | "resolved";
  resolution_note: string | null;
  resolved_by_name?: string | null;
  created_at: string;
  resolved_at: string | null;
};
type AiUsage = {
  month_key: string;
  spent_micro_usd: number;
  reserved_micro_usd: number;
  request_count: number;
  budget_micro_usd: number;
  updated_at: string;
};
export type HelpBootstrap = {
  entries: FaqEntry[];
  drafts: FaqEntry[];
  history?: FaqEntry[];
  tickets: FaqTicket[];
  usage: AiUsage;
  aiEnabled: boolean;
};

type AssistantReply = {
  interactionId: string;
  answer: string;
  confidence: "high" | "low";
  sources: Array<{ id: string; title: string; moduleKey: string; version: number }>;
  route: string;
  escalated: boolean;
};
type ChatMessage = { id: string; side: "user" | "assistant"; text: string; reply?: AssistantReply };
type EditorState = { mode: "new" | "edit" | "version"; entry?: FaqEntry };

const MODULE_LABELS: Record<string, string> = {
  crm: "01 · CRM", operations: "02 · Moduli OS", pricing: "03 · Listino", quotes: "04 · Preventivi",
  contracts: "05 · Contratti", distribution: "06 · Consegne", admin: "07 · Utenti", audit: "08 · Audit",
  sales_view: "09 · Vista Sales", distributor_view: "10 · Vista Distributore", podcast: "11 · Podcast", help: "12 · Guida & AI",
};
const ROLE_LABELS: Record<string, string> = {
  all: "Tutti", super_admin: "Super Admin", admin: "Admin", sales_manager: "Sales Manager", sales: "Sales", distributor: "Distributore",
};
const ALL_ROLES: Role[] = ["super_admin", "admin", "sales_manager", "sales", "distributor"];

class ApiFailure extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = (response.headers.get("content-type") ?? "").includes("application/json")
    ? await response.json() as T & { error?: { message?: string } }
    : null;
  if (!response.ok) throw new ApiFailure(payload?.error?.message ?? "Operazione non riuscita.", response.status);
  return payload as T;
}

export function HelpPage({
  user, help, offline, refresh, notify, onNavigate,
}: {
  user: User;
  help: HelpBootstrap;
  offline: boolean;
  refresh(): Promise<void>;
  notify(text: string, tone?: "ok" | "error"): void;
  onNavigate(moduleKey: string): void;
}) {
  const [language, setLanguage] = useState<"it" | "es">(() => typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("es") ? "es" : "it");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busyId, setBusyId] = useState("");
  const canManage = user.role === "admin" || user.role === "super_admin";
  const history = help.history ?? help.entries;

  const entries = useMemo(() => help.entries.filter((entry) => {
    const matchesLanguage = entry.language === language;
    const haystack = `${entry.title} ${entry.question} ${entry.answer} ${MODULE_LABELS[entry.module_key] ?? entry.module_key}`.toLowerCase();
    return matchesLanguage && haystack.includes(search.toLowerCase());
  }), [help.entries, language, search]);
  const openTickets = help.tickets.filter((ticket) => ticket.status === "open");

  async function faqAction(entry: FaqEntry, action: "publish" | "retire") {
    setBusyId(entry.id);
    try {
      await request(`/api/help/faqs/${entry.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
      });
      notify(action === "publish" ? "FAQ pubblicata e disponibile all’Assistente AI." : "FAQ ritirata.");
      await refresh();
    } catch (error) { notify(error instanceof Error ? error.message : "Operazione non riuscita.", "error"); }
    finally { setBusyId(""); }
  }

  return <section className="ops-page help-page">
    <div className="page-heading help-heading"><div><span className="eyebrow">Supporto operativo</span><h1>Guida & Assistente AI</h1><p>Procedure approvate, risposte per ruolo e assistenza vocale pensata per il cellulare.</p></div>{canManage ? <button className="primary" onClick={() => setEditor({ mode: "new" })}>＋ Nuova FAQ</button> : <span className="admin-badge">Solo procedure autorizzate</span>}</div>

    <div className="help-trust-grid">
      <article><b>01</b><div><strong>Spiega, non modifica</strong><span>L’AI non può eseguire azioni o cambiare dati.</span></div></article>
      <article><b>02</b><div><strong>Risposte approvate</strong><span>Usa solo FAQ pubblicate per il tuo ruolo.</span></div></article>
      <article><b>03</b><div><strong>Voce privata</strong><span>CRMVLC riceve solo la trascrizione e non conserva audio.</span></div></article>
    </div>

    <div className="help-layout">
      <article className="data-card help-library">
        <div className="card-head"><div><h2>Manuale operativo</h2><p>{entries.length} procedure disponibili</p></div><div className="help-language"><button className={language === "it" ? "active" : ""} onClick={() => setLanguage("it")}>IT</button><button className={language === "es" ? "active" : ""} onClick={() => setLanguage("es")}>ES</button></div></div>
        <div className="help-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={language === "es" ? "Buscar una operación…" : "Cerca una procedura…"} /></div>
        <div className="faq-list">{entries.map((entry) => <details key={entry.id}><summary><span>{MODULE_LABELS[entry.module_key] ?? entry.module_key}</span><strong>{entry.question}</strong><i>＋</i></summary><div className="faq-answer"><p>{entry.answer}</p><footer><span>v{entry.version} · {entry.title}</span><button onClick={() => onNavigate(entry.module_key)}>Apri modulo</button></footer></div></details>)}{!entries.length && <div className="help-empty"><strong>Nessuna procedura trovata</strong><span>Prova con parole diverse o cambia lingua.</span></div>}</div>
      </article>

      <article className="data-card help-chat-card"><AssistantPanel currentModule="help" offline={offline} language={language} onLanguage={setLanguage} onNavigate={onNavigate} /></article>
    </div>

    {canManage && <>
      <div className="help-admin-heading"><div><span className="eyebrow">Governance</span><h2>FAQ e richieste da gestire</h2></div><span className="admin-badge">{openTickets.length} aperte</span></div>
      <div className="help-admin-grid">
        <article className="data-card"><div className="card-head"><div><h2>Bozze FAQ</h2><p>L’Admin prepara; il Super Admin pubblica.</p></div><span className="admin-badge">{help.drafts.length}</span></div><div className="help-admin-list">{help.drafts.map((entry) => <div key={entry.id}><div><span>{entry.language.toUpperCase()} · {MODULE_LABELS[entry.module_key] ?? entry.module_key}</span><strong>{entry.title}</strong><small>v{entry.version} · {entry.allowed_roles.map((role) => ROLE_LABELS[role] ?? role).join(", ")}</small></div><div className="inline-actions"><button onClick={() => setEditor({ mode: "edit", entry })}>Modifica</button>{user.role === "super_admin" && <button className="primary" disabled={busyId === entry.id} onClick={() => void faqAction(entry, "publish")}>Pubblica</button>}</div></div>)}{!help.drafts.length && <div className="help-empty"><strong>Nessuna bozza</strong><span>Crea una FAQ oppure una nuova versione.</span></div>}</div></article>
        <article className="data-card"><div className="card-head"><div><h2>Budget AI interno</h2><p>Mese {help.usage.month_key} · stima prudenziale in USD</p></div><span className="admin-badge">{help.usage.request_count} richieste</span></div><BudgetMeter usage={help.usage} /><div className="budget-note">Il blocco applicativo è impostato a $25, quindi resta conservativo rispetto al limite concordato di €25. La fattura Cloudflare resta il dato contabile ufficiale.</div></article>
      </div>

      <article className="data-card help-published-admin"><div className="card-head"><div><h2>Storico FAQ</h2><p>Le versioni pubblicate sono immutabili; quelle sostituite restano archiviate.</p></div><span className="admin-badge">{history.length}</span></div><div className="help-admin-list compact">{history.map((entry) => <div key={entry.id}><div><span>{entry.language.toUpperCase()} · {MODULE_LABELS[entry.module_key] ?? entry.module_key}</span><strong>{entry.title}</strong><small>v{entry.version} · {entry.status === "published" ? "Pubblicata" : "Archiviata"}</small></div>{entry.status === "published" && <div className="inline-actions"><button onClick={() => setEditor({ mode: "version", entry })}>Nuova versione</button>{user.role === "super_admin" && <button disabled={busyId === entry.id} onClick={() => void faqAction(entry, "retire")}>Ritira</button>}</div>}</div>)}</div></article>

      <article className="data-card help-ticket-card"><div className="card-head"><div><h2>Coda Admin condivisa</h2><p>Domande senza risposta sicura o bloccate dal budget.</p></div><span className="admin-badge">{openTickets.length} aperte</span></div><div className="ticket-list">{help.tickets.map((ticket) => <TicketItem key={ticket.id} ticket={ticket} refresh={refresh} notify={notify} />)}{!help.tickets.length && <div className="help-empty"><strong>Nessuna richiesta</strong><span>L’Assistente ha trovato una risposta approvata per ogni domanda.</span></div>}</div></article>
    </>}

    {editor && <FaqEditor state={editor} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); notify(editor.mode === "edit" ? "Bozza aggiornata." : "Bozza FAQ creata."); await refresh(); }} />}
  </section>;
}

export function HelpAssistantDrawer({
  currentModule, offline, onNavigate,
}: { currentModule: string; offline: boolean; onNavigate(moduleKey: string): void }) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<"it" | "es">(() => typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("es") ? "es" : "it");
  return <>
    <button className={`help-fab ${open ? "open" : ""}`} onClick={() => setOpen((value) => !value)} aria-label="Apri Assistente AI"><span>AI</span><b>{open ? "×" : "Aiuto"}</b></button>
    {open && <aside className="help-drawer" aria-label="Assistente AI CRMVLC"><header><div><span>CRMVLC · {MODULE_LABELS[currentModule] ?? currentModule}</span><strong>Assistente AI</strong></div><button onClick={() => setOpen(false)} aria-label="Chiudi">×</button></header><AssistantPanel currentModule={currentModule} offline={offline} language={language} onLanguage={setLanguage} onNavigate={(route) => { onNavigate(route); setOpen(false); }} compact /></aside>}
  </>;
}

function AssistantPanel({
  currentModule, offline, language, onLanguage, onNavigate, compact = false,
}: {
  currentModule: string;
  offline: boolean;
  language: "it" | "es";
  onLanguage(language: "it" | "es"): void;
  onNavigate(moduleKey: string): void;
  compact?: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const speechWindow = window as Window & SpeechWindow;
    setSpeechAvailable(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    return () => recognitionRef.current?.stop();
  }, []);
  useEffect(() => { transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (!value || busy || offline) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), side: "user", text: value }]);
    setQuestion("");
    setBusy(true);
    try {
      const reply = await request<AssistantReply>("/api/help/ask", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: value, language, moduleKey: currentModule }),
      });
      setMessages((current) => [...current, { id: reply.interactionId, side: "assistant", text: reply.answer, reply }]);
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), side: "assistant", text: error instanceof Error ? error.message : "Assistente non disponibile." }]);
    } finally { setBusy(false); }
  }

  function toggleVoice() {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const speechWindow = window as Window & SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = language === "es" ? "es-ES" : "it-IT";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      if (transcript) setQuestion(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === "es" ? "es-ES" : "it-IT";
    window.speechSynthesis.speak(utterance);
  }

  return <div className={`assistant-panel ${compact ? "compact" : ""}`}>
    {!compact && <div className="assistant-title"><div><span>FASE 1 · SOLO GUIDA</span><h2>Chiedi al CRMVLC</h2><p>Ti spiego la procedura e apro il modulo corretto.</p></div><div className="help-language"><button className={language === "it" ? "active" : ""} onClick={() => onLanguage("it")}>IT</button><button className={language === "es" ? "active" : ""} onClick={() => onLanguage("es")}>ES</button></div></div>}
    <div className="assistant-transcript" ref={transcriptRef}>
      {!messages.length && <div className="assistant-welcome"><span>✦</span><strong>{language === "es" ? "¿Cómo puedo ayudarte?" : "Come posso aiutarti?"}</strong><p>{language === "es" ? "Pregunta cómo realizar una operación en el módulo actual." : "Chiedi come svolgere un’operazione nel modulo attuale."}</p><div><button onClick={() => setQuestion(language === "es" ? "¿Qué puedo hacer en este módulo?" : "Cosa posso fare in questo modulo?")}>{language === "es" ? "Funciones del módulo" : "Funzioni del modulo"}</button><button onClick={() => setQuestion(language === "es" ? "¿Qué permisos tengo?" : "Quali permessi ho?")}>{language === "es" ? "Mis permisos" : "I miei permessi"}</button></div></div>}
      {messages.map((message) => <div className={`assistant-message ${message.side}`} key={message.id}><div>{message.text}</div>{message.side === "assistant" && <footer><button onClick={() => speak(message.text)} aria-label="Leggi risposta">◖ Audio</button>{message.reply?.sources.map((source) => <button key={source.id} onClick={() => onNavigate(source.moduleKey)}>↗ {source.title} · v{source.version}</button>)}{message.reply?.escalated && <span>Inviata agli Admin</span>}</footer>}</div>)}
      {busy && <div className="assistant-message assistant typing"><i /><i /><i /></div>}
    </div>
    {offline && <div className="assistant-offline">L’Assistente AI richiede la rete. Le FAQ pubblicate restano consultabili nella Pagina 12.</div>}
    <form className="assistant-composer" onSubmit={ask}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1200} rows={2} disabled={offline} placeholder={language === "es" ? "Escribe tu pregunta…" : "Scrivi la tua domanda…"} /><div><span>{question.length}/1200</span>{speechAvailable && <button type="button" className={listening ? "listening" : ""} onClick={toggleVoice} disabled={offline} aria-label="Dettatura vocale">{listening ? "■ Stop" : "● Voce"}</button>}<button className="primary" disabled={!question.trim() || busy || offline}>{busy ? "…" : "Invia"}</button></div></form>
    <small className="assistant-privacy">CRMVLC registra domanda e risposta, ma non riceve né conserva l’audio. Il servizio vocale del browser può elaborarlo.</small>
  </div>;
}

function FaqEditor({ state, onClose, onSaved }: { state: EditorState; onClose(): void; onSaved(): Promise<void> }) {
  const source = state.entry;
  const [roles, setRoles] = useState<string[]>(source?.allowed_roles ?? ["all"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      language: state.mode === "new" ? form.get("language") : source?.language, moduleKey: form.get("moduleKey"), title: form.get("title"), question: form.get("question"), answer: form.get("answer"),
      allowedRoles: roles, translationGroupId: state.mode === "version" ? source?.translation_group_id : state.mode === "edit" ? undefined : form.get("translationGroupId"),
    };
    try {
      await request(state.mode === "edit" && source ? `/api/help/faqs/${source.id}` : "/api/help/faqs", {
        method: state.mode === "edit" ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Salvataggio non riuscito."); setBusy(false); }
  }
  function toggleRole(role: string) {
    if (role === "all") { setRoles(["all"]); return; }
    setRoles((current) => {
      const withoutAll = current.filter((value) => value !== "all");
      return withoutAll.includes(role) ? withoutAll.filter((value) => value !== role) : [...withoutAll, role];
    });
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><article className="ops-modal faq-editor"><header><div><h2>{state.mode === "edit" ? "Modifica bozza" : state.mode === "version" ? "Nuova versione FAQ" : "Nuova FAQ"}</h2><p>La pubblicazione resta riservata al Super Admin.</p></div><button onClick={onClose}>×</button></header><form className="form-grid" onSubmit={submit}>
    <label>Lingua<select name="language" defaultValue={source?.language ?? "it"} disabled={state.mode !== "new"}><option value="it">Italiano</option><option value="es">Español</option></select></label>
    <label>Modulo<select name="moduleKey" defaultValue={source?.module_key ?? "help"}>{Object.entries(MODULE_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
    <label className="span-2">Titolo<input name="title" maxLength={140} required defaultValue={source?.title ?? ""} /></label>
    <label className="span-2">Domanda<input name="question" maxLength={500} required defaultValue={source?.question ?? ""} /></label>
    <label className="span-2">Procedura approvabile<textarea name="answer" rows={7} maxLength={4000} required defaultValue={source?.answer ?? ""} /></label>
    <fieldset className="role-fieldset span-2"><legend>Visibile ai ruoli</legend><div>{["all", ...ALL_ROLES].map((role) => <label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} /><span>{ROLE_LABELS[role]}</span></label>)}</div></fieldset>
    {!roles.length && <div className="form-error span-2">Seleziona almeno un ruolo.</div>}{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy || !roles.length}>{busy ? "Salvataggio…" : "Salva bozza"}</button></div>
  </form></article></div>;
}

function TicketItem({ ticket, refresh, notify }: { ticket: FaqTicket; refresh(): Promise<void>; notify(text: string, tone?: "ok" | "error"): void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function resolve(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await request(`/api/help/tickets/${ticket.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ resolutionNote: note }) });
      notify("Richiesta chiusa e registrata nell’audit."); await refresh();
    } catch (error) { notify(error instanceof Error ? error.message : "Operazione non riuscita.", "error"); }
    finally { setBusy(false); }
  }
  return <div className={`ticket-item ${ticket.status}`}><div className="ticket-meta"><span>{ticket.language.toUpperCase()} · {MODULE_LABELS[ticket.module_key] ?? ticket.module_key}</span><b>{ticket.status === "open" ? "Aperta" : "Risolta"}</b></div><strong>{ticket.question}</strong><p>{ticket.user_name ?? "Utente"} · {ROLE_LABELS[ticket.role]}{ticket.island ? ` · ${ticket.island}` : ""} · {new Date(ticket.created_at).toLocaleString("it-IT")}</p>{ticket.status === "open" ? <form onSubmit={resolve}><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1500} required placeholder="Risposta o decisione dell’Admin…" /><button className="primary" disabled={busy}>{busy ? "…" : "Chiudi"}</button></form> : <div className="ticket-resolution"><b>{ticket.resolved_by_name ?? "Admin"}</b><span>{ticket.resolution_note}</span></div>}</div>;
}

function BudgetMeter({ usage }: { usage: AiUsage }) {
  const committed = usage.spent_micro_usd + usage.reserved_micro_usd;
  const percent = usage.budget_micro_usd > 0 ? Math.min(100, committed / usage.budget_micro_usd * 100) : 0;
  return <div className="budget-meter"><div><strong>${(usage.spent_micro_usd / 1_000_000).toFixed(3)}</strong><span>di ${(usage.budget_micro_usd / 1_000_000).toFixed(0)}</span></div><div className="budget-track"><i style={{ width: `${percent}%` }} /></div><small>{percent.toFixed(1)}% impegnato · aggiornato {new Date(usage.updated_at).toLocaleString("it-IT")}</small></div>;
}

type SpeechRecognitionResultLike = { 0?: { transcript?: string } };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type SpeechWindow = {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};
