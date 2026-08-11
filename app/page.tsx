"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { OperationsHub } from "./operations-hub";
import { clearOfflineSnapshots, loadOfflineSnapshot, pendingOutboxCount, saveOfflineSnapshot, syncPhotoAuditOutbox } from "./offline";

type Role = "super_admin" | "sales_manager" | "sales" | "distributor";
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const BACKGROUND_LOCK_MS = 60 * 60 * 1000;
const BACKGROUND_AT_KEY = "crmvlc:backgrounded-at";
type User = { id: string; email: string; name: string; role: Role; island: string | null; active?: number };
type Client = {
  id: string; company_name: string; contact_name: string; email: string; phone: string | null;
  island: string; stage: string; value_cents: number; owner_user_id: string; owner_name?: string;
  notes: string | null; version: number; created_at: string; updated_at: string;
};
type Contract = {
  id: string; client_id: string; client_company?: string; quote_id: string | null; quote_number?: string | null; template_id: string | null; title: string;
  status: "draft" | "awaiting_signature" | "signed" | "cancelled"; owner_user_id: string;
  island: string; signer_name: string | null; signer_email: string | null; document_sha256: string;
  signature_sha256: string | null; version: number; parent_contract_id: string | null;
  cancelled_reason: string | null; signed_at: string | null; updated_at: string;
};
type Delivery = {
  id: string; client_id: string; client_company?: string; distributor_user_id: string; distributor_name?: string;
  island: string; status: "assigned" | "in_progress" | "delivered" | "issue"; quantity: number; unit: string;
  scheduled_for: string | null; delivery_contact_name: string; delivery_contact_email: string;
  delivery_contact_phone: string | null; delivery_address: string | null; notes: string | null;
  version: number; completed_at: string | null; created_at: string; updated_at: string;
};
type Template = { id: string; name: string; version: string; mime_type: string; original_filename: string; active: number; created_at: string };
type AuditEvent = { id: string; action: string; entity_type: string; entity_id: string; payload_json: string; created_at: string; actor_name?: string };
type EmailOutboxItem = { id: string; recipient: string; subject: string; status: "pending" | "dead"; attempts: number; next_attempt_at: string; last_error: string | null; created_at: string; sent_at: string | null };
type PriceList = {
  id: string; name: string; version: string; currency: string; tax_name: string; tax_rate_bps: number;
  prices_include_tax: number; valid_from: string | null; active: number; notes: string | null; updated_at: string;
};
type PriceItem = {
  id: string; price_list_id: string; code: string; category: "cover" | "internal_high" | "internal_low" | "back_cover";
  name: string; dimensions: string; monthly_price_cents: number; included_services: string | null;
  active: number; sort_order: number; version: number; updated_at: string;
};
type Quote = {
  id: string; quote_number: string; client_id: string; client_company?: string; status: "issued" | "converted";
  owner_user_id: string; island: string; customer_company: string; customer_contact: string; customer_email: string;
  months: number; subtotal_cents: number; discount_bps: number; discount_reason: string | null; discount_cents: number;
  net_cents: number; tax_name: string; tax_rate_bps: number; tax_cents: number; total_cents: number;
  customer_note: string | null; valid_until: string; pdf_sha256: string; converted_contract_id: string | null;
  converted_at: string | null; created_at: string;
};
type Bootstrap = {
  user: User; clients: Client[]; contracts: Contract[]; quotes: Quote[]; deliveries: Delivery[]; templates: Template[]; users: User[];
  audit: AuditEvent[]; emailOutbox: EmailOutboxItem[]; priceList: PriceList | null; priceItems: PriceItem[]; demoMode?: boolean;
};

const ISLANDS = ["Tenerife", "Gran Canaria", "Lanzarote", "Fuerteventura", "La Palma"];
const STAGES = ["lead", "qualified", "proposal", "standby", "won", "lost"];
const stageLabels: Record<string, string> = { lead: "Primo contatto", qualified: "In trattativa", proposal: "Proposta", standby: "Stand-by", won: "Chiuso", lost: "Perso" };
const statusLabels: Record<string, string> = { draft: "Bozza", awaiting_signature: "Firma in attesa", signed: "Firmato", cancelled: "Annullato" };
const quoteStatusLabels: Record<Quote["status"], string> = { issued: "Emesso", converted: "Convertito" };
const deliveryStatusLabels: Record<Delivery["status"], string> = { assigned: "Assegnata", in_progress: "In corso", delivered: "Consegnata", issue: "Problema" };
const roleLabels: Record<Role, string> = { super_admin: "Super Admin", sales_manager: "Sales Manager", sales: "Sales", distributor: "Distributore" };
const priceCategoryLabels: Record<PriceItem["category"], string> = { cover: "Copertina", internal_high: "Pagine interne · fascia alta", internal_low: "Pagine interne · fascia bassa", back_cover: "Ultima pagina" };

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const payload = isJson ? await response.json() as { error?: { message?: string } } & T : null;
  if (!response.ok) throw new RequestError(payload?.error?.message ?? "Operazione non riuscita.", response.status);
  return payload as T;
}

function money(cents: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(cents / 100);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function dateOnly(value: string) {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default function Home() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineSavedAt, setOfflineSavedAt] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [active, setActive] = useState<"crm" | "operations" | "pricing" | "quotes" | "contracts" | "distribution" | "admin" | "audit">("crm");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [clientModal, setClientModal] = useState(false);
  const [contractModal, setContractModal] = useState(false);
  const [signing, setSigning] = useState<Contract | null>(null);
  const [superseding, setSuperseding] = useState<Contract | null>(null);
  const [deliveryModal, setDeliveryModal] = useState<Delivery | "new" | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await api<Bootstrap>("/api/bootstrap");
      setData(result);
      await saveOfflineSnapshot("bootstrap", result.user.id, result);
      if (result.user.role === "distributor") setActive("distribution");
      setAuthRequired(false);
      setOfflineMode(false);
      setOfflineSavedAt(null);
    } catch (error) {
      if (error instanceof RequestError && error.status === 401) {
        setData(null);
        setAuthRequired(true);
        setOfflineMode(false);
      } else if (!(error instanceof RequestError)) {
        const cached = await loadOfflineSnapshot<Bootstrap>("bootstrap").catch(() => null);
        if (cached) {
          setData(cached.value);
          if (cached.value.user.role === "distributor") setActive("distribution");
          setAuthRequired(false);
          setOfflineMode(true);
          setOfflineSavedAt(cached.savedAt);
        } else {
          setNotice({ tone: "error", text: "Nessun dato offline disponibile. Collegati alla rete per accedere." });
        }
      } else {
        setNotice({ tone: "error", text: error.message });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    const lockIfExpired = async () => {
      const backgroundedAt = Number(window.localStorage.getItem(BACKGROUND_AT_KEY) ?? 0);
      if (!backgroundedAt) return;
      window.localStorage.removeItem(BACKGROUND_AT_KEY);
      if (Date.now() - backgroundedAt < BACKGROUND_LOCK_MS) return;

      await clearOfflineSnapshots().catch(() => undefined);
      if (navigator.onLine) {
        await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
      }
      setData(null);
      setAuthRequired(true);
      setOfflineMode(false);
      setOfflineSavedAt(null);
      setNotice({ tone: "error", text: "Accesso bloccato dopo 1 ora in background. Rientra con email e password." });
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "hidden") {
        window.localStorage.setItem(BACKGROUND_AT_KEY, String(Date.now()));
      } else {
        void lockIfExpired();
      }
    };

    void lockIfExpired();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => document.removeEventListener("visibilitychange", visibilityChanged);
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    const media = window.matchMedia("(display-mode: standalone)");
    const updateStandalone = () => setStandalone(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installed = () => {
      setInstallPrompt(null);
      setStandalone(true);
    };
    updateStandalone();
    media.addEventListener?.("change", updateStandalone);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    return () => {
      media.removeEventListener?.("change", updateStandalone);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  useEffect(() => {
    const userId = data?.user.id;
    const refreshPending = () => {
      if (!userId) {
        setPendingCount(0);
        return;
      }
      void pendingOutboxCount(userId).then(setPendingCount).catch(() => setPendingCount(0));
    };
    const syncPending = () => {
      if (!userId) return;
      void (async () => {
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.ready;
          const sync = (registration as ServiceWorkerRegistration & {
            sync?: { register(tag: string): Promise<void> };
          }).sync;
          if (sync) {
            await sync.register("crmvlc-photo-outbox");
            return;
          }
        }
        const result = await syncPhotoAuditOutbox(userId);
        setPendingCount(result.pending);
        if (result.sent > 0) setNotice({ tone: "ok", text: `${result.sent} acquisizion${result.sent === 1 ? "e sincronizzata" : "i sincronizzate"}.` });
      })().catch(() => refreshPending());
    };
    const workerMessage = (event: MessageEvent<{ type?: string; sent?: number }>) => {
      if (event.data?.type !== "crmvlc:outbox-synced") return;
      refreshPending();
      if (event.data.sent) setNotice({ tone: "ok", text: `${event.data.sent} acquisizion${event.data.sent === 1 ? "e sincronizzata" : "i sincronizzate"}.` });
    };
    refreshPending();
    if (navigator.onLine) syncPending();
    window.addEventListener("online", syncPending);
    window.addEventListener("crmvlc:outbox-changed", refreshPending);
    navigator.serviceWorker?.addEventListener("message", workerMessage);
    return () => {
      window.removeEventListener("online", syncPending);
      window.removeEventListener("crmvlc:outbox-changed", refreshPending);
      navigator.serviceWorker?.removeEventListener("message", workerMessage);
    };
  }, [data?.user.id]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const notify = (text: string, tone: "ok" | "error" = "ok") => setNotice({ text, tone });

  if (loading) return <div className="loading-screen"><div className="loading-mark">C</div><p>Caricamento area operativa…</p></div>;
  if (authRequired || !data) return <Login onAuthenticated={refresh} />;

  const filteredClients = data.clients.filter((client) => `${client.company_name} ${client.contact_name} ${client.email} ${client.island}`.toLowerCase().includes(search.toLowerCase()));
  const filteredContracts = data.contracts.filter((contract) => `${contract.title} ${contract.client_company ?? ""} ${contract.island}`.toLowerCase().includes(search.toLowerCase()));
  const filteredQuotes = data.quotes.filter((quote) => `${quote.quote_number} ${quote.customer_company} ${quote.customer_contact} ${quote.customer_email} ${quote.island}`.toLowerCase().includes(search.toLowerCase()));
  const filteredDeliveries = data.deliveries.filter((delivery) => `${delivery.client_company ?? ""} ${delivery.distributor_name ?? ""} ${delivery.island} ${delivery.delivery_contact_name}`.toLowerCase().includes(search.toLowerCase()));
  const openPipeline = data.clients.filter((client) => !["won", "lost"].includes(client.stage)).reduce((sum, client) => sum + client.value_cents, 0);

  async function logout() {
    if (!offlineMode) await api("/api/auth/logout", { method: "POST" });
    window.localStorage.removeItem(BACKGROUND_AT_KEY);
    await clearOfflineSnapshots();
    setData(null);
    setAuthRequired(true);
    setOfflineMode(false);
  }

  async function installApp() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstallPrompt(null);
        notify("CRMVLC installato sul dispositivo.");
      }
      return;
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    notify(ios
      ? "Su iPhone: Condividi → Aggiungi alla schermata Home."
      : "Apri il menu del browser e scegli “Installa app” o “Aggiungi alla schermata Home”.");
  }

  async function changeStage(client: Client, stage: string) {
    try {
      await api(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, version: client.version }),
      });
      notify("Fase CRM aggiornata.");
      await refresh();
    } catch (error) { notify(error instanceof Error ? error.message : "Aggiornamento non riuscito.", "error"); }
  }

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <button className="ops-brand" onClick={() => setActive(data.user.role === "distributor" ? "distribution" : "crm")}><span>C</span><div><strong>CRMVLC</strong><small>CRM & Contratti</small></div></button>
        <nav>
          {data.user.role !== "distributor" && <button className={active === "crm" ? "active" : ""} onClick={() => setActive("crm")}><i>01</i> CRM</button>}
          <button className={active === "operations" ? "active" : ""} onClick={() => setActive("operations")}><i>02</i> Moduli OS</button>
          {data.user.role !== "distributor" && <button className={active === "pricing" ? "active" : ""} onClick={() => setActive("pricing")}><i>03</i> Listino</button>}
          {data.user.role !== "distributor" && <button className={active === "quotes" ? "active" : ""} onClick={() => setActive("quotes")}><i>04</i> Preventivi</button>}
          {data.user.role !== "distributor" && <button className={active === "contracts" ? "active" : ""} onClick={() => setActive("contracts")}><i>05</i> Contratti</button>}
          {["super_admin", "sales_manager", "distributor"].includes(data.user.role) && <button className={active === "distribution" ? "active" : ""} onClick={() => setActive("distribution")}><i>06</i> Consegne</button>}
          {data.user.role === "super_admin" && <button className={active === "admin" ? "active" : ""} onClick={() => setActive("admin")}><i>07</i> Utenti e modelli</button>}
          {data.user.role === "super_admin" && <button className={active === "audit" ? "active" : ""} onClick={() => setActive("audit")}><i>08</i> Audit</button>}
        </nav>
        <div className="ops-scope"><span className="live-dot" /><div><strong>{data.demoMode ? "Dati dimostrativi" : "Dati reali"}</strong><small>{data.user.island ?? "Tutte le isole"}</small></div></div>
      </aside>

      <main className="ops-main">
        <header className="ops-topbar">
          <div className="ops-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca clienti, preventivi, contratti o consegne…" aria-label="Cerca" /></div>
          <div className="ops-user">{!standalone && <button className="install-button" onClick={() => void installApp()}>Installa</button>}<span>{initials(data.user.name)}</span><div><strong>{data.user.name}</strong><small>{roleLabels[data.user.role]}{data.user.island ? ` · ${data.user.island}` : ""}</small></div><button onClick={logout}>Esci</button></div>
        </header>
        {(offlineMode || pendingCount > 0) && <div className={`connectivity-strip ${offlineMode ? "offline" : "pending"}`}><strong>{offlineMode ? "Modalità offline" : "Sincronizzazione"}</strong><span>{offlineMode ? `Dati salvati ${offlineSavedAt ? dateTime(new Date(offlineSavedAt).toISOString()) : "sul dispositivo"} · contratti e amministrazione richiedono la rete.` : `${pendingCount} acquisizion${pendingCount === 1 ? "e in attesa" : "i in attesa"} di invio.`}</span></div>}
        {data.demoMode && <div className="demo-strip"><strong>Modalità demo</strong><span>Usa esclusivamente dati fittizi. Le email OTP non sono attive.</span></div>}

        {active === "crm" && <section className="ops-page">
          <PageHeading eyebrow="Operatività commerciale" title="CRM" subtitle="Ogni utente vede soltanto il perimetro autorizzato." action={<button className="primary" onClick={() => setClientModal(true)}>＋ Nuovo cliente</button>} />
          <div className="metric-grid">
            <Metric label="Clienti visibili" value={String(data.clients.length)} note={data.user.role === "sales" ? "assegnati a te" : "nel tuo perimetro"} />
            <Metric label="Pipeline aperta" value={money(openPipeline)} note="valore non chiuso" />
            <Metric label="Proposte" value={String(data.clients.filter((client) => client.stage === "proposal").length)} note="in fase proposta" />
            <Metric label="Contratti firmati" value={String(data.contracts.filter((contract) => contract.status === "signed").length)} note="con evidenza OTP" />
          </div>
          <CrmKanban clients={filteredClients} onStageChange={changeStage} />
        </section>}

        {active === "operations" && <OperationsHub user={data.user} clients={data.clients} users={data.users} deliveries={data.deliveries} notify={notify} />}

        {active === "contracts" && <section className="ops-page">
          <PageHeading eyebrow="Ciclo documentale" title="Contratti" subtitle="Documento, OTP, firma e conferma agente conservati con audit." action={<button className="primary" disabled={!data.clients.length} onClick={() => setContractModal(true)}>＋ Nuovo contratto</button>} />
          <div className="data-card contract-card">
            <div className="card-head"><div><h2>Archivio contratti</h2><p>Un contratto firmato non può essere modificato.</p></div><div className="legend"><span className="status signed">Firmato</span><span className="status awaiting_signature">In firma</span></div></div>
            <div className="contract-list">
              {filteredContracts.map((contract) => <article key={contract.id} className="contract-row">
                <div className="doc-icon">PDF</div>
                <div className="contract-copy"><div><strong>{contract.title}</strong><span className={`status ${contract.status}`}>{statusLabels[contract.status]}</span></div><p>{contract.client_company} · {contract.island} · versione {contract.version}{contract.quote_number ? ` · ${contract.quote_number}` : ""}</p><small>Aggiornato {dateTime(contract.updated_at)}{contract.signer_email ? ` · ${contract.signer_email}` : ""}</small></div>
                <div className="row-actions"><button onClick={() => window.open(`/api/contracts/${contract.id}/download`, "_blank")}>Documento</button>{contract.status === "signed" && <button onClick={() => window.open(`/api/contracts/${contract.id}/evidence`, "_blank")}>Evidenza</button>}{["draft", "awaiting_signature"].includes(contract.status) && <button className="accent" onClick={() => setSigning(contract)}>Firma</button>}{contract.status === "signed" && data.user.role === "super_admin" && <button className="danger" onClick={() => setSuperseding(contract)}>Annulla + nuova</button>}</div>
              </article>)}
              {!filteredContracts.length && <Empty title="Nessun contratto" text={data.clients.length ? "Carica il primo contratto PDF da inviare alla firma." : "Crea prima un cliente nel CRM."} />}
            </div>
          </div>
        </section>}

        {active === "pricing" && data.user.role !== "distributor" && <PriceListPanel data={data} search={search} refresh={refresh} notify={notify} onQuoteCreated={() => setActive("quotes")} />}

        {active === "quotes" && data.user.role !== "distributor" && <QuotesPanel quotes={filteredQuotes} onConverted={async () => { notify("Bozza contratto creata dal preventivo."); setActive("contracts"); await refresh(); }} notify={notify} />}

        {active === "distribution" && <DistributionPanel data={data} deliveries={filteredDeliveries} onCreate={() => setDeliveryModal("new")} onEdit={setDeliveryModal} />}

        {active === "admin" && data.user.role === "super_admin" && <AdminPanel data={data} refresh={refresh} notify={notify} />}
        {active === "audit" && data.user.role === "super_admin" && <AuditPanel events={data.audit} emails={data.emailOutbox} refresh={refresh} notify={notify} />}
      </main>

      {clientModal && <ClientModal data={data} onClose={() => setClientModal(false)} onSaved={async () => { setClientModal(false); notify("Cliente creato."); await refresh(); }} />}
      {contractModal && <ContractModal data={data} onClose={() => setContractModal(false)} onSaved={async () => { setContractModal(false); notify("Contratto archiviato come bozza."); await refresh(); }} />}
      {signing && <SignatureModal contract={signing} onClose={() => setSigning(null)} onSaved={async () => { setSigning(null); notify("Firma registrata con evidenza OTP."); await refresh(); }} />}
      {superseding && <SupersedeModal contract={superseding} onClose={() => setSuperseding(null)} onSaved={async () => { setSuperseding(null); notify("Contratto annullato e nuova versione creata."); await refresh(); }} />}
      {deliveryModal && <DeliveryModal data={data} delivery={deliveryModal === "new" ? null : deliveryModal} onClose={() => setDeliveryModal(null)} onSaved={async () => { setDeliveryModal(null); notify(deliveryModal === "new" ? "Consegna assegnata." : "Consegna aggiornata."); await refresh(); }} />}
      {notice && <div className={`ops-toast ${notice.tone}`}>{notice.tone === "ok" ? "✓" : "!"} {notice.text}</div>}
    </div>
  );
}

function Login({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  type NextStep = { authenticated?: boolean; next?: "change_password" | "totp_setup" | "totp"; token?: string };
  const [mode, setMode] = useState<"login" | "change" | "totp_setup" | "totp" | "forgot" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const reset = new URLSearchParams(window.location.search).get("reset");
    if (!reset) return;
    const timer = window.setTimeout(() => {
      setToken(reset);
      setMode("reset");
      window.history.replaceState({}, "", window.location.pathname);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function advance(result: NextStep) {
    if (result.authenticated) {
      await onAuthenticated();
      return;
    }
    if (!result.next || !result.token) throw new Error("Risposta di autenticazione non valida.");
    setToken(result.token);
    if (result.next === "change_password") {
      setMode("change");
      return;
    }
    if (result.next === "totp") {
      setMode("totp");
      return;
    }
    const setup = await api<{ secret: string; uri: string }>("/api/auth/totp/setup", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: result.token }),
    });
    setTotpSecret(setup.secret);
    setQrCode(await QRCode.toDataURL(setup.uri, { width: 240, margin: 1, errorCorrectionLevel: "M" }));
    setMode("totp_setup");
  }

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<NextStep>("/api/auth/password/login", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
      });
      await advance(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Accesso non riuscito."); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setError("");
    if (newPassword !== confirmPassword) { setError("Le password non coincidono."); return; }
    setBusy(true);
    try {
      const result = await api<NextStep>("/api/auth/password/change-required", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: newPassword }),
      });
      setPassword(""); setNewPassword(""); setConfirmPassword("");
      await advance(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Cambio password non riuscito."); }
    finally { setBusy(false); }
  }

  async function forgotPassword(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<{ message: string }>("/api/auth/password/forgot", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }),
      });
      setMessage(result.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Richiesta non riuscita."); }
    finally { setBusy(false); }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault(); setError("");
    if (newPassword !== confirmPassword) { setError("Le password non coincidono."); return; }
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/api/auth/password/reset", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: newPassword }),
      });
      setMessage(result.message); setNewPassword(""); setConfirmPassword(""); setMode("login");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impostazione non riuscita."); }
    finally { setBusy(false); }
  }

  async function confirmTotp(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const path = mode === "totp_setup" ? "/api/auth/totp/confirm" : "/api/auth/totp/verify";
      await api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, code }) });
      await onAuthenticated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Codice non valido."); }
    finally { setBusy(false); }
  }

  const passwordFields = <><label>Nuova password<input type="password" required minLength={12} maxLength={256} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label>Conferma password<input type="password" required minLength={12} maxLength={256} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label></>;

  return <main className="auth-screen"><section className="auth-visual"><div className="auth-brand"><span>C</span><strong>CRMVLC</strong></div><div><small>CRM OPERATIVO · CINQUE ISOLE</small><h1>Relazioni commerciali e contratti, senza zone grigie.</h1><p>Accesso nominativo con password; OTP riservato alla firma verificata dei contratti.</p></div><div className="auth-islands">{ISLANDS.map((island) => <span key={island}>{island}</span>)}</div></section><section className="auth-panel"><div className="auth-box"><span className="secure-label">● Accesso protetto</span><h2>{mode === "login" ? "Entra nel CRM" : mode === "forgot" ? "Recupera password" : mode === "reset" ? "Imposta password" : mode === "change" ? "Cambia la password temporanea" : mode === "totp_setup" ? "Configura l’autenticatore" : "Codice autenticatore"}</h2><p>{mode === "totp_setup" ? "Scansiona il QR con Google Authenticator, Microsoft Authenticator o un’app compatibile." : mode === "totp" ? "Inserisci il codice a 6 cifre generato dall’app autenticatore." : "Le credenziali sono personali e non devono essere condivise."}</p>
    {mode === "login" && <form onSubmit={login}><label>Email aziendale<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" required maxLength={256} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="primary wide" disabled={busy}>{busy ? "Accesso…" : "Accedi"}</button><button type="button" className="link-button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Imposta o recupera password</button></form>}
    {mode === "forgot" && <form onSubmit={forgotPassword}><label>Email aziendale<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="primary wide" disabled={busy}>{busy ? "Invio…" : "Invia collegamento"}</button><button type="button" className="link-button" onClick={() => setMode("login")}>Torna all’accesso</button></form>}
    {mode === "reset" && <form onSubmit={resetPassword}>{passwordFields}<button className="primary wide" disabled={busy}>{busy ? "Salvataggio…" : "Imposta password"}</button></form>}
    {mode === "change" && <form onSubmit={changePassword}>{passwordFields}<button className="primary wide" disabled={busy}>{busy ? "Salvataggio…" : "Cambia e continua"}</button></form>}
    {(mode === "totp" || mode === "totp_setup") && <form onSubmit={confirmTotp}>{mode === "totp_setup" && <div style={{ textAlign: "center" }}>{qrCode && <img src={qrCode} width={240} height={240} alt="QR autenticatore CRMVLC" />}<small style={{ display: "block", overflowWrap: "anywhere" }}>Chiave manuale: {totpSecret}</small></div>}<label>Codice a 6 cifre<input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label><button className="primary wide" disabled={busy || code.length !== 6}>{busy ? "Verifica…" : mode === "totp_setup" ? "Conferma e accedi" : "Accedi"}</button></form>}
    {message && <div className="form-success">{message}</div>}{error && <div className="form-error">{error}</div>}<small className="privacy-note">Password cifrate con derivazione PBKDF2. Il Super Admin usa anche l’autenticatore TOTP.</small></div></section></main>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action: React.ReactNode }) {
  return <div className="page-heading"><div><span>{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="metric"><small>{label}</small><strong>{value}</strong><p>{note}</p></article>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><span>＋</span><strong>{title}</strong><p>{text}</p></div>;
}

function CrmKanban({ clients, onStageChange }: { clients: Client[]; onStageChange: (client: Client, stage: string) => Promise<void> }) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  return <div className="kanban-shell">
    <div className="kanban-head"><div><h2>Pipeline commerciale</h2><p>Trascina le schede oppure usa il selettore su mobile.</p></div><span>{clients.length} opportunità</span></div>
    <div className="kanban-board">
      {STAGES.map((stage) => {
        const stageClients = clients.filter((client) => client.stage === stage);
        return <section className={`kanban-column kanban-${stage}`} key={stage} onDragOver={(event) => event.preventDefault()} onDrop={() => { const client = clients.find((item) => item.id === draggedId); setDraggedId(null); if (client && client.stage !== stage) void onStageChange(client, stage); }}>
          <header><span>{stageLabels[stage]}</span><b>{stageClients.length}</b></header>
          <div className="kanban-cards">
            {stageClients.map((client) => <article key={client.id} draggable onDragStart={() => setDraggedId(client.id)} onDragEnd={() => setDraggedId(null)} className={draggedId === client.id ? "dragging" : ""}>
              <div className="kanban-grip">⠿</div><strong>{client.company_name}</strong><p>{client.contact_name} · {client.island}</p><small>{client.owner_name ?? "—"}</small><div><b>{money(client.value_cents)}</b><select aria-label={`Fase ${client.company_name}`} value={client.stage} onChange={(event) => void onStageChange(client, event.target.value)}>{STAGES.map((option) => <option key={option} value={option}>{stageLabels[option]}</option>)}</select></div>
            </article>)}
            {!stageClients.length && <div className="kanban-empty">Trascina qui</div>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}

function PriceListPanel({ data, search, refresh, notify, onQuoteCreated }: { data: Bootstrap; search: string; refresh: () => Promise<void>; notify: (text: string, tone?: "ok" | "error") => void; onQuoteCreated: () => void }) {
  const [months, setMonths] = useState(1);
  const [clientId, setClientId] = useState(data.clients[0]?.id ?? "");
  const [validDays, setValidDays] = useState(30);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<PriceItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const priceList = data.priceList;

  if (!priceList) return <section className="ops-page"><PageHeading eyebrow="Vendita pubblicitaria" title="Listino" subtitle="Nessun listino attivo disponibile." action={<span className="admin-badge">Da configurare</span>} /><div className="data-card"><Empty title="Listino non disponibile" text="Il Super Admin deve attivare una versione del listino." /></div></section>;

  const query = search.trim().toLowerCase();
  const visibleItems = data.priceItems.filter((item) => `${item.name} ${item.dimensions} ${priceCategoryLabels[item.category]} ${item.included_services ?? ""}`.toLowerCase().includes(query));
  const selectedItems = data.priceItems.filter((item) => (quantities[item.id] ?? 0) > 0);
  const selectedCents = selectedItems.reduce((sum, item) => sum + item.monthly_price_cents * (quantities[item.id] ?? 0) * months, 0);
  const discountBps = Math.round(discountPercent * 100);
  const discountCents = Math.round(selectedCents * discountBps / 10_000);
  const taxRate = priceList.tax_rate_bps / 10_000;
  const netCents = selectedCents - discountCents;
  const taxCents = Math.round(netCents * taxRate);
  const totalCents = netCents + taxCents;
  const selectedClient = data.clients.find((client) => client.id === clientId) ?? data.clients[0];

  function setQuantity(itemId: string, value: number) {
    const quantity = Math.min(99, Math.max(0, Math.floor(value || 0)));
    setQuantities((current) => ({ ...current, [itemId]: quantity }));
  }

  async function createQuote() {
    if (!selectedClient || !selectedItems.length) return;
    setCreating(true);
    setQuoteError("");
    try {
      const result = await api<{ id: string; quoteNumber: string }>("/api/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClient.id,
          months,
          validDays,
          discountPercent: data.user.role === "super_admin" ? discountPercent : 0,
          discountReason: data.user.role === "super_admin" ? discountReason : "",
          customerNote,
          items: selectedItems.map((item) => ({ priceItemId: item.id, quantity: quantities[item.id] })),
        }),
      });
      notify(`Preventivo ${result.quoteNumber} generato e archiviato.`);
      setQuantities({});
      setDiscountPercent(0);
      setDiscountReason("");
      setCustomerNote("");
      await refresh();
      onQuoteCreated();
    } catch (cause) {
      setQuoteError(cause instanceof Error ? cause.message : "Creazione del preventivo non riuscita.");
    } finally {
      setCreating(false);
    }
  }

  const categories = (["cover", "internal_high", "internal_low", "back_cover"] as PriceItem["category"][])
    .map((category) => ({ category, items: visibleItems.filter((item) => item.category === category) }))
    .filter((group) => group.items.length);

  return <section className="ops-page pricing-page">
    <PageHeading eyebrow="Vendita pubblicitaria" title="Listino" subtitle="Dodici formati mensili, prezzi netti e IGIC calcolato separatamente per tutte le isole." action={<span className="admin-badge">v{priceList.version} · {priceList.tax_name} {(priceList.tax_rate_bps / 100).toLocaleString("it-IT")}%</span>} />
    <div className="pricing-layout">
      <div className="pricing-catalog">
        <div className="pricing-notice"><strong>Prezzi base mensili</strong><span>{priceList.prices_include_tax ? `${priceList.tax_name} incluso` : `${priceList.tax_name} escluso`} · validi per Tenerife, Gran Canaria, Lanzarote, Fuerteventura e La Palma.</span></div>
        {categories.map((group) => <section className="price-group" key={group.category}><header><div><span>{String(group.items.length).padStart(2, "0")}</span><h2>{priceCategoryLabels[group.category]}</h2></div><small>Prezzo netto / mese</small></header><div className="price-grid">{group.items.map((item) => {
          const quantity = quantities[item.id] ?? 0;
          return <article className={`price-card ${quantity ? "selected" : ""}`} key={item.id}><div className="price-card-top"><span className="price-code">{item.code}</span>{data.user.role === "super_admin" && <button className="price-edit" onClick={() => setEditing(item)}>Modifica</button>}</div><h3>{item.name}</h3><p className="price-size">{item.dimensions}</p><strong className="price-value">{money(item.monthly_price_cents)}<small>/mese</small></strong>{item.included_services && <ul>{item.included_services.split("\n").filter(Boolean).map((service) => <li key={service}>{service}</li>)}</ul>}<div className="quantity-control"><button aria-label={`Riduci ${item.name}`} onClick={() => setQuantity(item.id, quantity - 1)}>−</button><input aria-label={`Quantità ${item.name}`} type="number" min="0" max="99" value={quantity} onChange={(event) => setQuantity(item.id, Number(event.target.value))} /><button aria-label={`Aumenta ${item.name}`} onClick={() => setQuantity(item.id, quantity + 1)}>＋</button></div></article>;
        })}</div></section>)}
        {!categories.length && <div className="data-card"><Empty title="Nessun formato trovato" text="Modifica la ricerca per visualizzare il listino." /></div>}
      </div>
      <aside className="quote-panel"><span className="quote-eyebrow">Preventivo numerato</span><h2>Riepilogo</h2><label>Cliente<select value={selectedClient?.id ?? ""} onChange={(event) => setClientId(event.target.value)} disabled={!data.clients.length}>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.company_name} · {client.island}</option>)}</select></label><div className="quote-fields"><label>Durata mesi<input type="number" min="1" max="36" value={months} onChange={(event) => setMonths(Math.min(36, Math.max(1, Number(event.target.value) || 1)))} /></label><label>Validità giorni<input type="number" min="1" max="90" value={validDays} onChange={(event) => setValidDays(Math.min(90, Math.max(1, Number(event.target.value) || 1)))} /></label></div>{data.user.role === "super_admin" ? <><label>Sconto %<input type="number" min="0" max="100" step="0.01" value={discountPercent} onChange={(event) => setDiscountPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /></label>{discountPercent > 0 && <label>Motivo sconto<input maxLength={300} value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} required placeholder="Motivazione commerciale" /></label>}</> : <div className="discount-lock"><strong>Sconti bloccati</strong><span>Solo il Super Admin può applicarli.</span></div>}<label>Nota al cliente<textarea rows={2} maxLength={700} value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} placeholder="Facoltativa" /></label><div className="quote-lines">{selectedItems.map((item) => <div key={item.id}><span>{quantities[item.id]} × {item.name}<small>{months} {months === 1 ? "mese" : "mesi"}</small></span><strong>{money(item.monthly_price_cents * (quantities[item.id] ?? 0) * months)}</strong></div>)}{!selectedItems.length && <p>Seleziona almeno un formato dal listino.</p>}</div><dl><div><dt>Subtotale netto</dt><dd>{money(selectedCents)}</dd></div>{discountCents > 0 && <div className="discount-total"><dt>Sconto {(discountBps / 100).toLocaleString("it-IT")}%</dt><dd>−{money(discountCents)}</dd></div>}<div><dt>Imponibile</dt><dd>{money(netCents)}</dd></div><div><dt>{priceList.tax_name} {(priceList.tax_rate_bps / 100).toLocaleString("it-IT")}%</dt><dd>{money(taxCents)}</dd></div><div className="quote-total"><dt>Totale</dt><dd>{money(totalCents)}</dd></div></dl><small className="quote-scope">{selectedClient?.island ?? "Seleziona un cliente"} · prezzi netti · {priceList.tax_name} escluso</small>{quoteError && <div className="quote-error">{quoteError}</div>}<button className="primary quote-submit" disabled={creating || !selectedClient || !selectedItems.length || (discountPercent > 0 && !discountReason.trim())} onClick={() => void createQuote()}>{creating ? "Generazione PDF…" : "Genera preventivo PDF"}</button>{selectedItems.length > 0 && <button className="clear-quote" onClick={() => setQuantities({})}>Azzera calcolo</button>}</aside>
    </div>
    {editing && <PriceEditModal item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); notify("Prezzo aggiornato e registrato nell’audit."); await refresh(); }} />}
  </section>;
}

function QuotesPanel({ quotes, onConverted, notify }: { quotes: Quote[]; onConverted: () => Promise<void>; notify: (text: string, tone?: "ok" | "error") => void }) {
  const [converting, setConverting] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  async function convert(quote: Quote) {
    if (!window.confirm(`Creare una bozza contratto dal preventivo ${quote.quote_number}? Il preventivo resterà immutabile.`)) return;
    setConverting(quote.id);
    try {
      await api(`/api/quotes/${quote.id}/convert`, { method: "POST" });
      await onConverted();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Conversione non riuscita.", "error");
    } finally {
      setConverting("");
    }
  }

  return <section className="ops-page"><PageHeading eyebrow="Ciclo commerciale" title="Preventivi" subtitle="PDF numerati, collegati al cliente e congelati con prezzi, sconto e IGIC del momento." action={<span className="admin-badge">{quotes.length} preventivi visibili</span>} /><div className="data-card"><div className="card-head"><div><h2>Archivio preventivi</h2><p>La conversione crea una bozza contrattuale da verificare prima della firma.</p></div><div className="legend"><span className="status quote-issued">Emesso</span><span className="status quote-converted">Convertito</span></div></div><div className="table-wrap"><table><thead><tr><th>Numero</th><th>Cliente</th><th>Isola</th><th>Periodo</th><th>Imponibile</th><th>IGIC</th><th>Totale</th><th>Stato</th><th /></tr></thead><tbody>{quotes.map((quote) => {
    const expired = quote.status === "issued" && quote.valid_until < today;
    return <tr key={quote.id}><td data-label="Numero"><strong>{quote.quote_number}</strong><small>{dateTime(quote.created_at)}</small></td><td data-label="Cliente"><strong>{quote.customer_company}</strong><small>{quote.customer_contact} · {quote.customer_email}</small></td><td data-label="Isola"><span className="island-pill">{quote.island}</span></td><td data-label="Periodo">{quote.months} {quote.months === 1 ? "mese" : "mesi"}<small>valido fino al {dateOnly(quote.valid_until)}</small></td><td data-label="Imponibile">{money(quote.net_cents)}{quote.discount_cents > 0 && <small>Sconto {(quote.discount_bps / 100).toLocaleString("it-IT")}%: −{money(quote.discount_cents)}</small>}</td><td data-label="IGIC">{money(quote.tax_cents)}<small>{quote.tax_name} {(quote.tax_rate_bps / 100).toLocaleString("it-IT")}%</small></td><td data-label="Totale"><strong>{money(quote.total_cents)}</strong></td><td data-label="Stato"><span className={`status ${expired ? "quote-expired" : `quote-${quote.status}`}`}>{expired ? "Scaduto" : quoteStatusLabels[quote.status]}</span></td><td data-label="Azioni"><div className="row-actions quote-actions"><button onClick={() => window.open(`/api/quotes/${quote.id}/download`, "_blank")}>PDF</button>{quote.status === "issued" && !expired && <button className="accent" disabled={converting === quote.id} onClick={() => void convert(quote)}>{converting === quote.id ? "Conversione…" : "Crea contratto"}</button>}{quote.converted_contract_id && <button onClick={() => window.open(`/api/contracts/${quote.converted_contract_id}/download`, "_blank")}>Contratto</button>}</div></td></tr>;
  })}{!quotes.length && <tr><td colSpan={9}><Empty title="Nessun preventivo" text="Seleziona i formati nel Listino e genera il primo PDF numerato." /></td></tr>}</tbody></table></div></div></section>;
}

function PriceEditModal({ item, onClose, onSaved }: { item: PriceItem; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/price-items/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ monthlyPriceEuros: form.get("monthlyPriceEuros"), version: item.version }) });
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Aggiornamento non riuscito."); setBusy(false); }
  }
  return <Modal title="Modifica prezzo" subtitle={`${item.name} · ${item.dimensions}`} onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="span-2">Prezzo netto mensile €<input name="monthlyPriceEuros" type="number" min="0" max="1000000" step="0.01" required defaultValue={(item.monthly_price_cents / 100).toFixed(2)} /></label><p className="form-hint span-2">La modifica vale per tutte le cinque isole ed è registrata nell’audit. I contratti già firmati restano invariati.</p>{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy}>{busy ? "Aggiornamento…" : "Aggiorna prezzo"}</button></div></form></Modal>;
}

function ClientModal({ data, onClose, onSaved }: { data: Bootstrap; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const assignable = data.users.filter((user) => ["sales_manager", "sales"].includes(user.role) && user.active !== 0 && (data.user.role === "super_admin" || user.island === data.user.island));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Creazione non riuscita."); setBusy(false); }
  }
  const canAssign = data.user.role === "super_admin" || data.user.role === "sales_manager";
  return <Modal title="Nuovo cliente" subtitle="Il proprietario del record determina la visibilità del Sales." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="span-2">Azienda<input name="companyName" required maxLength={120} /></label><label>Referente<input name="contactName" required maxLength={120} /></label><label>Email<input name="email" type="email" required /></label><label>Telefono<input name="phone" /></label><label>Isola<select name="island" required defaultValue={data.user.island ?? ""} disabled={data.user.role !== "super_admin"}>{ISLANDS.map((island) => <option key={island}>{island}</option>)}</select>{data.user.role !== "super_admin" && <input type="hidden" name="island" value={data.user.island ?? ""} />}</label><label>Valore stimato €<input name="valueEuros" type="number" min="0" step="0.01" defaultValue="0" /></label>{canAssign && <label>Assegnato a<select name="ownerUserId" defaultValue={data.user.id}><option value={data.user.id}>{data.user.name}</option>{assignable.filter((user) => user.id !== data.user.id).map((user) => <option key={user.id} value={user.id}>{user.name} · {user.island}</option>)}</select></label>}<label className="span-2">Note<textarea name="notes" rows={3} maxLength={2000} /></label>{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy}>{busy ? "Salvataggio…" : "Crea cliente"}</button></div></form></Modal>;
}

function ContractModal({ data, onClose, onSaved }: { data: Bootstrap; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/api/contracts", { method: "POST", body: new FormData(event.currentTarget) }); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Caricamento non riuscito."); setBusy(false); }
  }
  return <Modal title="Nuovo contratto" subtitle="Carica il PDF definitivo da sottoporre alla firma." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="span-2">Cliente<select name="clientId" required>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.company_name} · {client.island}</option>)}</select></label><label className="span-2">Titolo contratto<input name="title" required maxLength={160} placeholder="Contratto sponsor annuale" /></label><label>Modello usato<select name="templateId"><option value="">Nessun modello associato</option>{data.templates.map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>)}</select></label><label>PDF compilato<input name="file" type="file" accept="application/pdf" required /></label><p className="form-hint span-2">Massimo 2,8 MB per garantire l’invio della copia firmata via email. Dopo la firma il documento non potrà essere sostituito.</p>{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy}>{busy ? "Archiviazione…" : "Crea bozza"}</button></div></form></Modal>;
}

function SignatureModal({ contract, onClose, onSaved }: { contract: Contract; onClose: () => void; onSaved: () => Promise<void> }) {
  const [challengeId, setChallengeId] = useState(""); const [signerName, setSignerName] = useState(contract.signer_name ?? ""); const [signerEmail, setSignerEmail] = useState(contract.signer_email ?? ""); const [code, setCode] = useState(""); const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const hasInk = useRef(false);
  useEffect(() => { if (!challengeId || !canvasRef.current) return; const canvas = canvasRef.current; const ratio = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect(); canvas.width = rect.width * ratio; canvas.height = rect.height * ratio; const context = canvas.getContext("2d"); if (context) { context.scale(ratio, ratio); context.lineWidth = 2.5; context.lineCap = "round"; context.strokeStyle = "#102a43"; } }, [challengeId]);
  function point(event: ReactPointerEvent<HTMLCanvasElement>) { const rect = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  function start(event: ReactPointerEvent<HTMLCanvasElement>) { drawing.current = true; hasInk.current = true; event.currentTarget.setPointerCapture(event.pointerId); const context = event.currentTarget.getContext("2d"); const p = point(event); context?.beginPath(); context?.moveTo(p.x, p.y); }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) { if (!drawing.current) return; const context = event.currentTarget.getContext("2d"); const p = point(event); context?.lineTo(p.x, p.y); context?.stroke(); }
  function stop() { drawing.current = false; }
  function clear() { const canvas = canvasRef.current; if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); hasInk.current = false; }
  async function requestOtp(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const result = await api<{ challengeId: string }>(`/api/contracts/${contract.id}/request-signature`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signerName, signerEmail }) }); setChallengeId(result.challengeId); } catch (cause) { setError(cause instanceof Error ? cause.message : "Invio non riuscito."); } finally { setBusy(false); } }
  async function complete(event: FormEvent) { event.preventDefault(); if (!hasInk.current) { setError("Il firmatario deve apporre la firma nel riquadro."); return; } setBusy(true); setError(""); try { const signatureDataUrl = canvasRef.current?.toDataURL("image/png"); await api(`/api/contracts/${contract.id}/complete-signature`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengeId, code, signatureDataUrl, agentConfirmed: confirmed }) }); await onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Firma non registrata."); setBusy(false); } }
  return <Modal title="Firma verificata" subtitle={`${contract.title} · ${contract.client_company}`} onClose={onClose}>{!challengeId ? <form className="form-grid" onSubmit={requestOtp}><label className="span-2">Nome del firmatario<input value={signerName} onChange={(event) => setSignerName(event.target.value)} required /></label><label className="span-2">Email per codice OTP<input type="email" value={signerEmail} onChange={(event) => setSignerEmail(event.target.value)} required /></label><div className="signature-steps span-2"><span className="current">1</span><i /><span>2</span><i /><span>3</span><p>Invio OTP</p><p>Firma</p><p>Conferma agente</p></div>{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy}>{busy ? "Invio…" : "Invia codice"}</button></div></form> : <form className="signature-form" onSubmit={complete}><div className="otp-row"><label>Codice OTP<input inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" required /></label><p>Il codice è stato inviato a <strong>{signerEmail}</strong>.</p></div><label className="canvas-label">Firma del cliente<div className="canvas-wrap"><canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} /><button type="button" onClick={clear}>Cancella firma</button></div></label><label className="confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>Conferma dell’agente</strong>Dichiaro che il firmatario è presente e ha apposto personalmente la firma.</span></label>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy || code.length !== 6 || !confirmed}>{busy ? "Registrazione…" : "Completa firma"}</button></div></form>}</Modal>;
}

function SupersedeModal({ contract, onClose, onSaved }: { contract: Contract; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); try { await api(`/api/contracts/${contract.id}/supersede`, { method: "POST", body: new FormData(event.currentTarget) }); await onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Operazione non riuscita."); setBusy(false); } }
  return <Modal title="Annulla e crea nuova versione" subtitle="Il contratto firmato resterà conservato e marcato come annullato." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="span-2">Motivazione obbligatoria<textarea name="reason" required rows={3} maxLength={500} /></label><label className="span-2">Titolo nuova versione<input name="title" defaultValue={contract.title} required /></label><label className="span-2">Nuovo PDF<input type="file" name="file" accept="application/pdf" required /></label>{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="danger-solid" disabled={busy}>{busy ? "Creazione…" : "Annulla e crea versione"}</button></div></form></Modal>;
}

function DistributionPanel({ data, deliveries, onCreate, onEdit }: { data: Bootstrap; deliveries: Delivery[]; onCreate: () => void; onEdit: (delivery: Delivery) => void }) {
  const canAssign = data.user.role === "super_admin" || data.user.role === "sales_manager";
  const assignedQuantity = data.deliveries.filter((delivery) => delivery.status !== "delivered").reduce((sum, delivery) => sum + delivery.quantity, 0);
  const deliveredQuantity = data.deliveries.filter((delivery) => delivery.status === "delivered").reduce((sum, delivery) => sum + delivery.quantity, 0);
  return <section className="ops-page"><PageHeading eyebrow="Rete distributiva" title="Distribuzione" subtitle="Consegne, quantità e aziende visibili soltanto nel perimetro assegnato." action={canAssign ? <button className="primary" disabled={!data.clients.length || !data.users.some((user) => user.role === "distributor")} onClick={onCreate}>＋ Nuova consegna</button> : <span className="admin-badge">Solo consegne assegnate</span>} /><div className="metric-grid"><Metric label="Consegne visibili" value={String(data.deliveries.length)} note="nel tuo perimetro" /><Metric label="Quantità da consegnare" value={String(assignedQuantity)} note="esclude le consegnate" /><Metric label="Quantità consegnata" value={String(deliveredQuantity)} note="confermata dal distributore" /><Metric label="Problemi aperti" value={String(data.deliveries.filter((delivery) => delivery.status === "issue").length)} note="da risolvere" /></div><div className="data-card"><div className="card-head"><div><h2>Piano consegne</h2><p>{deliveries.length} incarichi</p></div></div><div className="table-wrap"><table><thead><tr><th>Azienda</th><th>Distributore</th><th>Isola</th><th>Quantità</th><th>Data</th><th>Stato</th><th /></tr></thead><tbody>{deliveries.map((delivery) => <tr key={delivery.id}><td data-label="Azienda"><strong>{delivery.client_company}</strong><small>{delivery.delivery_contact_name} · {delivery.delivery_contact_email}</small></td><td data-label="Distributore">{delivery.distributor_name ?? "—"}</td><td data-label="Isola"><span className="island-pill">{delivery.island}</span></td><td data-label="Quantità"><strong>{delivery.quantity}</strong> {delivery.unit}</td><td data-label="Data">{delivery.scheduled_for ?? "Da pianificare"}</td><td data-label="Stato"><span className={`delivery-status ${delivery.status}`}>{deliveryStatusLabels[delivery.status]}</span></td><td data-label="Azioni"><button className="table-action" onClick={() => onEdit(delivery)}>Gestisci</button></td></tr>)}{!deliveries.length && <tr><td colSpan={7}><Empty title="Nessuna consegna" text={canAssign ? "Assegna la prima consegna a un Distributore." : "Non hai ancora consegne assegnate."} /></td></tr>}</tbody></table></div></div></section>;
}

function DeliveryModal({ data, delivery, onClose, onSaved }: { data: Bootstrap; delivery: Delivery | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [clientId, setClientId] = useState(delivery?.client_id ?? data.clients[0]?.id ?? "");
  const client = data.clients.find((item) => item.id === clientId);
  const distributors = data.users.filter((user) => user.role === "distributor" && user.active !== 0 && (!client || user.island === client.island));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (delivery) {
        await api(`/api/deliveries/${delivery.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, version: delivery.version }) });
      } else {
        await api("/api/deliveries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
      }
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Operazione non riuscita."); setBusy(false); }
  }
  return <Modal title={delivery ? "Gestisci consegna" : "Nuova consegna"} subtitle={delivery ? `${delivery.client_company} · ${delivery.island}` : "Assegna quantità e azienda a un Distributore."} onClose={onClose}><form className="form-grid" onSubmit={submit}>{!delivery && <><label className="span-2">Azienda<select name="clientId" required value={clientId} onChange={(event) => setClientId(event.target.value)}>{data.clients.map((item) => <option key={item.id} value={item.id}>{item.company_name} · {item.island}</option>)}</select></label><label className="span-2">Distributore<select name="distributorUserId" required>{distributors.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.island}</option>)}</select></label></>}{delivery && <label>Stato<select name="status" defaultValue={delivery.status}><option value="assigned">Assegnata</option><option value="in_progress">In corso</option><option value="delivered">Consegnata</option><option value="issue">Problema</option></select></label>}<label>Quantità<input name="quantity" type="number" min="1" max="1000000" step="1" required defaultValue={delivery?.quantity ?? 1} /></label><label>Unità<input name="unit" required maxLength={30} defaultValue={delivery?.unit ?? "copie"} /></label><label>Data programmata<input name="scheduledFor" type="date" defaultValue={delivery?.scheduled_for ?? ""} /></label><label>Referente consegna<input name="deliveryContactName" required maxLength={120} defaultValue={delivery?.delivery_contact_name ?? client?.contact_name ?? ""} /></label><label>Email referente<input name="deliveryContactEmail" type="email" required defaultValue={delivery?.delivery_contact_email ?? client?.email ?? ""} /></label><label>Telefono referente<input name="deliveryContactPhone" maxLength={40} defaultValue={delivery?.delivery_contact_phone ?? client?.phone ?? ""} /></label><label className="span-2">Indirizzo consegna<input name="deliveryAddress" maxLength={300} defaultValue={delivery?.delivery_address ?? ""} /></label><label className="span-2">Note operative<textarea name="notes" rows={3} maxLength={2000} defaultValue={delivery?.notes ?? ""} /></label>{!delivery && !distributors.length && <div className="form-error span-2">Non esiste un Distributore attivo assegnato all’isola selezionata.</div>}{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy || (!delivery && !distributors.length)}>{busy ? "Salvataggio…" : delivery ? "Aggiorna consegna" : "Assegna consegna"}</button></div></form></Modal>;
}

function AdminPanel({ data, refresh, notify }: { data: Bootstrap; refresh: () => Promise<void>; notify: (text: string, tone?: "ok" | "error") => void }) {
  const [userBusy, setUserBusy] = useState(false); const [templateBusy, setTemplateBusy] = useState(false);
  async function createUser(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setUserBusy(true); const form = new FormData(event.currentTarget); try { await api("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) }); event.currentTarget.reset(); notify("Utente creato. Al primo accesso dovrà cambiare la password temporanea."); await refresh(); } catch (cause) { notify(cause instanceof Error ? cause.message : "Creazione non riuscita.", "error"); } finally { setUserBusy(false); } }
  async function toggleUser(target: User) { setUserBusy(true); try { await api(`/api/users/${target.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: target.active === 0 }) }); notify(target.active === 0 ? "Utente riattivato." : "Utente disattivato e sessioni revocate."); await refresh(); } catch (cause) { notify(cause instanceof Error ? cause.message : "Aggiornamento non riuscito.", "error"); } finally { setUserBusy(false); } }
  async function uploadTemplate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setTemplateBusy(true); try { await api("/api/templates", { method: "POST", body: new FormData(event.currentTarget) }); event.currentTarget.reset(); notify("Modello contrattuale archiviato."); await refresh(); } catch (cause) { notify(cause instanceof Error ? cause.message : "Caricamento non riuscito.", "error"); } finally { setTemplateBusy(false); } }
  return <section className="ops-page"><PageHeading eyebrow="Amministrazione" title="Utenti e modelli" subtitle="Ruoli fissi, isola assegnata e documenti contrattuali versionati." action={<span className="admin-badge">Solo Super Admin</span>} /><div className="admin-grid"><article className="data-card"><div className="card-head"><div><h2>Nuovo utente</h2><p>Sales Manager, Sales o Distributore.</p></div></div><form className="stack-form" onSubmit={createUser}><label>Nome e cognome<input name="name" required /></label><label>Email aziendale<input name="email" type="email" required /></label><label>Password temporanea<input name="temporaryPassword" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /><small>Almeno 12 caratteri. L’utente dovrà cambiarla al primo accesso.</small></label><div className="two-cols"><label>Ruolo<select name="role"><option value="sales">Sales</option><option value="sales_manager">Sales Manager</option><option value="distributor">Distributore</option></select></label><label>Isola<select name="island">{ISLANDS.map((island) => <option key={island}>{island}</option>)}</select></label></div><button className="primary" disabled={userBusy}>{userBusy ? "Creazione…" : "Crea utente"}</button></form></article><article className="data-card"><div className="card-head"><div><h2>Carica modello</h2><p>PDF o DOCX, massimo 8 MB.</p></div></div><form className="stack-form" onSubmit={uploadTemplate}><label>Nome modello<input name="name" required placeholder="Contratto sponsor" /></label><label>Versione<input name="version" required defaultValue="1.0" /></label><label>Documento<input name="file" type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /></label><button className="primary" disabled={templateBusy}>{templateBusy ? "Caricamento…" : "Archivia modello"}</button></form></article></div><div className="admin-grid lower"><article className="data-card"><div className="card-head"><div><h2>Utenti autorizzati</h2><p>{data.users.length} account</p></div></div><div className="simple-list">{data.users.map((user) => <div key={user.id}><span className="avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div><p>{roleLabels[user.role]}<small>{user.island ?? "Tutte le isole"}</small>{user.role !== "super_admin" && <button className="mini-link" disabled={userBusy} onClick={() => void toggleUser(user)}>{user.active === 0 ? "Riattiva" : "Disattiva"}</button>}</p></div>)}</div></article><article className="data-card"><div className="card-head"><div><h2>Modelli contrattuali</h2><p>{data.templates.length} versioni attive</p></div></div><div className="simple-list">{data.templates.map((template) => <div key={template.id}><span className="file-badge">{template.mime_type.includes("pdf") ? "PDF" : "DOC"}</span><div><strong>{template.name}</strong><small>{template.original_filename}</small></div><p>v{template.version}<button className="mini-link" onClick={() => window.open(`/api/templates/${template.id}/download`, "_blank")}>Scarica</button></p></div>)}{!data.templates.length && <Empty title="Nessun modello" text="Carica i documenti già pronti." />}</div></article></div></section>;
}

function AuditPanel({ events, emails, refresh, notify }: { events: AuditEvent[]; emails: EmailOutboxItem[]; refresh: () => Promise<void>; notify: (text: string, tone?: "ok" | "error") => void }) {
  const [retrying, setRetrying] = useState("");
  async function retryEmail(message: EmailOutboxItem) { setRetrying(message.id); try { await api(`/api/email-outbox/${message.id}/retry`, { method: "POST" }); notify("Nuovo tentativo email avviato."); await refresh(); } catch (cause) { notify(cause instanceof Error ? cause.message : "Nuovo tentativo non riuscito.", "error"); } finally { setRetrying(""); } }
  return <section className="ops-page"><PageHeading eyebrow="Tracciabilità" title="Audit" subtitle="Registro append-only e controllo degli invii email." action={<span className="admin-badge">Ultimi {events.length} eventi</span>} />{emails.length > 0 && <div className="data-card email-alerts"><div className="card-head"><div><h2>Email da controllare</h2><p>Invii in attesa o terminati con errore.</p></div></div><div className="table-wrap"><table><thead><tr><th>Destinatario</th><th>Oggetto</th><th>Stato</th><th>Tentativi</th><th>Prossimo tentativo</th><th /></tr></thead><tbody>{emails.map((message) => <tr key={message.id}><td data-label="Destinatario">{message.recipient}</td><td data-label="Oggetto">{message.subject}<small>{message.last_error ?? "In attesa di consegna"}</small></td><td data-label="Stato"><span className={`delivery-status ${message.status === "dead" ? "issue" : "in_progress"}`}>{message.status === "dead" ? "Errore" : "In attesa"}</span></td><td data-label="Tentativi">{message.attempts}/5</td><td data-label="Prossimo tentativo">{dateTime(message.next_attempt_at)}</td><td data-label="Azioni"><button className="table-action" disabled={retrying === message.id} onClick={() => void retryEmail(message)}>{retrying === message.id ? "Invio…" : "Riprova"}</button></td></tr>)}</tbody></table></div></div>}<div className="data-card"><div className="table-wrap"><table><thead><tr><th>Data</th><th>Utente</th><th>Azione</th><th>Entità</th><th>Riferimento</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td data-label="Data">{dateTime(event.created_at)}</td><td data-label="Utente">{event.actor_name ?? "Sistema"}</td><td data-label="Azione"><code>{event.action}</code></td><td data-label="Entità">{event.entity_type}</td><td data-label="Riferimento"><span className="hash">{event.entity_id}</span></td></tr>)}{!events.length && <tr><td colSpan={5}><Empty title="Registro vuoto" text="Gli eventi compariranno dopo le prime operazioni." /></td></tr>}</tbody></table></div></div></section>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="ops-modal" role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button onClick={onClose} aria-label="Chiudi">×</button></header>{children}</section></div>;
}

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
