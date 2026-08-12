"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { OperationsHub } from "./operations-hub";
import { clearOfflineSnapshots, loadOfflineSnapshot, pendingOutboxCount, saveOfflineSnapshot, syncPhotoAuditOutbox } from "./offline";
import { HelpAssistantDrawer, HelpBootstrap, HelpPage } from "./help-assistant";
import { LanguageSelector, localeTag, platformOwnership, UiLocale, usePlatformLanguage } from "./i18n";

type Role = "super_admin" | "admin" | "sales_manager" | "sales" | "distributor";
type ActiveModule = "crm" | "operations" | "pricing" | "quotes" | "contracts" | "distribution" | "admin" | "audit" | "podcast" | "help" | "applications";
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const BACKGROUND_LOCK_MS = 60 * 60 * 1000;
const BACKGROUND_AT_KEY = "crmvlc:backgrounded-at";
type User = { id: string; email: string; name: string; phone: string | null; role: Role; island: string | null; language: UiLocale; sales_manager_id?: string | null; sales_manager_name?: string | null; active?: number };
type Client = {
  id: string; company_name: string; contact_name: string; email: string; phone: string | null;
  tax_id: string | null; fiscal_address: string | null; billing_email: string | null;
  legal_signer_name: string | null; legal_signer_role: string | null;
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
  distribution_point_id: string | null; distribution_point_name?: string | null; distribution_point_address?: string | null;
  distribution_point_latitude_e6?: number | null; distribution_point_longitude_e6?: number | null;
  island: string; status: "assigned" | "in_progress" | "delivered" | "issue"; quantity: number; unit: string;
  scheduled_for: string | null; delivery_contact_name: string; delivery_contact_email: string;
  delivery_contact_phone: string | null; delivery_address: string | null; notes: string | null;
  version: number; completed_at: string | null; created_at: string; updated_at: string;
};
type DistributionPoint = { id: string; client_id: string | null; name: string; island: string; address: string; latitude_e6: number; longitude_e6: number; capacity: number; stock: number };
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
  months: number; subtotal_cents: number; discount_campaign_id: string | null; discount_bps: number; discount_reason: string | null; discount_cents: number;
  net_cents: number; tax_name: string; tax_rate_bps: number; tax_cents: number; total_cents: number;
  customer_note: string | null; valid_until: string; pdf_sha256: string; converted_contract_id: string | null;
  converted_at: string | null; created_at: string;
};
type DiscountCampaign = {
  id: string; title: string; message: string; discount_bps: number; starts_on: string; ends_on: string;
  active: number; created_by: string; created_at: string; deactivated_at: string | null; usage_count: number;
};
type PodcastAppointment = {
  id: string; guest_name: string; topic: string; interviewer_user_id: string; interviewer_name?: string;
  starts_at: string; ends_at: string; notes: string | null; status: "scheduled" | "cancelled";
  package_code: PodcastPackageCode; package_name: string; package_price_cents: number;
  marcolifestyle_add_on: number; marcolifestyle_price_cents: number; subtotal_cents: number;
  tax_name: string; tax_rate_bps: number; tax_cents: number; total_cents: number;
  version: number; created_by: string; created_at: string; updated_at: string;
};
type SalesApplication = {
  id: string; name: string; email: string; phone: string; city: string; island: string; languages: string;
  availability: "immediate" | "two_weeks" | "one_month"; presentation: string; collaboration_type: "commission";
  locale: UiLocale; status: "new" | "contacted" | "interview" | "approved" | "rejected"; admin_notes: string;
  consent_at: string; created_at: string; updated_at: string; reviewed_by: string | null; reviewed_at: string | null; reviewed_by_name?: string | null;
};
type Bootstrap = {
  user: User; clients: Client[]; contracts: Contract[]; quotes: Quote[]; deliveries: Delivery[]; distributionPoints: DistributionPoint[]; templates: Template[]; users: User[];
  audit: AuditEvent[]; emailOutbox: EmailOutboxItem[]; priceList: PriceList | null; priceItems: PriceItem[]; demoMode?: boolean;
  discountCampaigns: DiscountCampaign[]; podcastAppointments: PodcastAppointment[]; podcastInterviewers: User[];
  salesApplications: SalesApplication[];
  sessionActor?: User;
  impersonation?: { startedAt: string; expiresAt: string } | null;
  impersonationUsers?: User[];
  help?: HelpBootstrap;
};

const ISLANDS = ["Tenerife", "Gran Canaria", "Lanzarote", "Fuerteventura", "La Palma"];
const STAGES = ["lead", "qualified", "proposal", "standby", "won", "lost"];
const stageLabels: Record<string, string> = { lead: "Primo contatto", qualified: "In trattativa", proposal: "Proposta", standby: "Stand-by", won: "Chiuso", lost: "Perso" };
const statusLabels: Record<string, string> = { draft: "Bozza", awaiting_signature: "Firma in attesa", signed: "Firmato", cancelled: "Annullato" };
const quoteStatusLabels: Record<Quote["status"], string> = { issued: "Emesso", converted: "Convertito" };
const deliveryStatusLabels: Record<Delivery["status"], string> = { assigned: "Assegnata", in_progress: "In corso", delivered: "Consegnata", issue: "Problema" };
const roleLabels: Record<Role, string> = { super_admin: "Super Admin", admin: "Admin operativo", sales_manager: "Sales Manager", sales: "Sales", distributor: "Distributore" };
const priceCategoryLabels: Record<PriceItem["category"], string> = { cover: "Copertina", internal_high: "Pagine interne · fascia alta", internal_low: "Pagine interne · fascia bassa", back_cover: "Ultima pagina" };
const BRAND_LOGO = "/brand/viv-le-canarie-icon.svg";
const WHATSAPP_URL = "https://wa.me/34602576044?text=Buongiorno%2C%20contatto%20CRMVLC%20per%20un%27informazione.";
const PODCAST_PACKAGES = {
  one_minute_free: { name: "1 minuto · 1 telecamera", description: "Video finale di 1 minuto", priceCents: 0 },
  three_to_five_minutes: { name: "3–5 minuti · 3 telecamere", description: "Video finale e montaggio inclusi", priceCents: 49_900 },
} as const;
type PodcastPackageCode = keyof typeof PODCAST_PACKAGES;
const MARCOLIFESTYLE_PRICE_CENTS = 50_000;
const recruitmentLoginCopy = {
  it: { title: "Lavora con noi", text: "Cerchiamo commerciali nelle cinque isole per Vivi Le Canarie.", cta: "Candidati nella tua isola" },
  es: { title: "Trabaja con nosotros", text: "Buscamos comerciales en las cinco islas para Vivi Le Canarie.", cta: "Presenta tu candidatura" },
  en: { title: "Work with us", text: "We are looking for sales representatives across the five islands.", cta: "Apply for your island" },
} as const;

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
  return new Intl.NumberFormat(localeTag(), { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(cents / 100);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(localeTag(), { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function dateOnly(value: string) {
  return new Intl.DateTimeFormat(localeTag(), { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function canaryParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Atlantic/Canary", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function canaryToday() {
  return canaryParts(new Date().toISOString()).date;
}

function canaryDateTime(value: string) {
  return new Intl.DateTimeFormat(localeTag(), { dateStyle: "short", timeStyle: "short", timeZone: "Atlantic/Canary" }).format(new Date(value));
}

export default function Home() {
  const { locale, setLocale } = usePlatformLanguage();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [authNotice, setAuthNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineSavedAt, setOfflineSavedAt] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [active, setActive] = useState<ActiveModule>("crm");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [clientModal, setClientModal] = useState(false);
  const [contractModal, setContractModal] = useState(false);
  const [signing, setSigning] = useState<Contract | null>(null);
  const [superseding, setSuperseding] = useState<Contract | null>(null);
  const [deliveryModal, setDeliveryModal] = useState<Delivery | "new" | null>(null);
  const [profileModal, setProfileModal] = useState(false);
  const [impersonationModal, setImpersonationModal] = useState<"sales" | "distributor" | null>(null);
  const [promotionPopup, setPromotionPopup] = useState<DiscountCampaign | null>(null);
  const [preferredDiscountCampaignId, setPreferredDiscountCampaignId] = useState("");

  const refresh = useCallback(async () => {
    const emailChangeToken = new URLSearchParams(window.location.search).get("email-change");
    if (emailChangeToken) {
      try {
        const result = await api<{ message: string }>("/api/profile/email/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: emailChangeToken }),
        });
        setAuthNotice({ tone: "ok", text: result.message });
      } catch (error) {
        setAuthNotice({ tone: "error", text: error instanceof Error ? error.message : "Verifica email non riuscita." });
      }
      window.history.replaceState({}, "", window.location.pathname);
      setData(null);
      setAuthRequired(true);
      setOfflineMode(false);
      setLoading(false);
      return;
    }
    try {
      const result = await api<Bootstrap>("/api/bootstrap");
      setLocale(result.user.language ?? "es");
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
  }, [setLocale]);

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
  useEffect(() => {
    const expiresAt = data?.impersonation?.expiresAt;
    if (!expiresAt) return;
    const delay = Math.max(0, Date.parse(expiresAt) - Date.now());
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await api("/api/admin/impersonation/stop", { method: "POST" });
          await clearOfflineSnapshots();
          setActive("crm");
          await refresh();
          setNotice({ tone: "error", text: "La modalità operativa di un’ora è terminata. Sei tornato al Super Admin." });
        } catch (error) {
          setNotice({ tone: "error", text: error instanceof Error ? error.message : "Modalità operativa scaduta." });
        }
      })();
    }, Math.min(delay + 250, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [data?.impersonation?.expiresAt, refresh]);
  useEffect(() => {
    if (!data || !["sales", "sales_manager"].includes(data.user.role)) {
      setPromotionPopup(null);
      return;
    }
    const campaign = (data.discountCampaigns ?? []).find((item) => item.active === 1 && item.starts_on <= canaryToday() && item.ends_on >= canaryToday()
      && window.sessionStorage.getItem(`crmvlc:promotion-seen:${item.id}`) !== "1");
    setPromotionPopup(campaign ?? null);
  }, [data]);

  const notify = (text: string, tone: "ok" | "error" = "ok") => setNotice({ text, tone });

  if (loading) return <div className="loading-screen"><img className="loading-logo" src={BRAND_LOGO} alt="ViV! Le Canarie" /><p>Caricamento area operativa…</p></div>;
  if (authRequired || !data) return <Login onAuthenticated={refresh} initialNotice={authNotice} />;

  const sessionActor = data.sessionActor ?? data.user;
  const effectiveRole = data.user.role;
  const helpData: HelpBootstrap = data.help ?? {
    entries: [], drafts: [], history: [], tickets: [], aiEnabled: false,
    usage: { month_key: "—", spent_micro_usd: 0, reserved_micro_usd: 0, request_count: 0, budget_micro_usd: 25_000_000, updated_at: new Date().toISOString() },
  };
  const canImpersonate = sessionActor.role === "super_admin";
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

  async function saveLanguage(next: UiLocale) {
    if (offlineMode) return;
    try {
      await api("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language: next }),
      });
      setData((current) => current ? { ...current, user: { ...current.user, language: next } } : current);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Aggiornamento della lingua non riuscito.", "error");
    }
  }

  async function impersonationStarted(role: "sales" | "distributor") {
    await clearOfflineSnapshots();
    setImpersonationModal(null);
    setActive(role === "distributor" ? "distribution" : "crm");
    await refresh();
    notify(`Modalità ${roleLabels[role]} attivata. Stai lavorando su dati reali.`);
  }

  async function stopImpersonation() {
    try {
      await api("/api/admin/impersonation/stop", { method: "POST" });
      await clearOfflineSnapshots();
      setActive("crm");
      await refresh();
      notify("Sei tornato alla dashboard Super Admin.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Impossibile terminare la modalità operativa.", "error");
    }
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

  async function changeOwner(client: Client, ownerUserId: string) {
    if (!ownerUserId || ownerUserId === client.owner_user_id) return;
    try {
      await api(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerUserId, version: client.version }),
      });
      notify("Cliente, preventivi e contratti riassegnati al nuovo Sales.");
      await refresh();
    } catch (error) { notify(error instanceof Error ? error.message : "Riassegnazione non riuscita.", "error"); }
  }

  function navigateFromHelp(moduleKey: string) {
    if (moduleKey === "sales_view" && canImpersonate) { setImpersonationModal("sales"); return; }
    if (moduleKey === "distributor_view" && canImpersonate) { setImpersonationModal("distributor"); return; }
    const allowed = new Set<ActiveModule>(["operations", "help"]);
    if (effectiveRole !== "distributor") ["crm", "pricing", "quotes", "contracts", "podcast"].forEach((key) => allowed.add(key as ActiveModule));
    if (["super_admin", "admin", "sales_manager", "distributor"].includes(effectiveRole)) allowed.add("distribution");
    if (["super_admin", "admin"].includes(effectiveRole)) allowed.add("admin");
    if (["super_admin", "admin"].includes(effectiveRole)) allowed.add("applications");
    if (effectiveRole === "super_admin") allowed.add("audit");
    setActive(allowed.has(moduleKey as ActiveModule) ? moduleKey as ActiveModule : "help");
  }

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <button className="ops-brand" onClick={() => setActive(data.user.role === "distributor" ? "distribution" : "crm")}><img src={BRAND_LOGO} alt="" /><div><strong>CRMVLC</strong><small>CRM & Contratti</small></div></button>
        <nav>
          {data.user.role !== "distributor" && <button className={active === "crm" ? "active" : ""} onClick={() => setActive("crm")}><i>01</i> CRM</button>}
          <button className={active === "operations" ? "active" : ""} onClick={() => setActive("operations")}><i>02</i> Moduli OS</button>
          {data.user.role !== "distributor" && <button className={active === "pricing" ? "active" : ""} onClick={() => setActive("pricing")}><i>03</i> Listino</button>}
          {data.user.role !== "distributor" && <button className={active === "quotes" ? "active" : ""} onClick={() => setActive("quotes")}><i>04</i> Preventivi</button>}
          {data.user.role !== "distributor" && <button className={active === "contracts" ? "active" : ""} onClick={() => setActive("contracts")}><i>05</i> Contratti</button>}
          {["super_admin", "admin", "sales_manager", "distributor"].includes(data.user.role) && <button className={active === "distribution" ? "active" : ""} onClick={() => setActive("distribution")}><i>06</i> Consegne</button>}
          {["super_admin", "admin"].includes(data.user.role) && <button className={active === "admin" ? "active" : ""} onClick={() => setActive("admin")}><i>07</i> Utenti</button>}
          {data.user.role === "super_admin" && <button className={active === "audit" ? "active" : ""} onClick={() => setActive("audit")}><i>08</i> Audit</button>}
          {canImpersonate && <button className={data.impersonation && data.user.role === "sales" ? "active impersonation-nav" : "impersonation-nav"} onClick={() => setImpersonationModal("sales")}><i>09</i> Vista Sales</button>}
          {canImpersonate && <button className={data.impersonation && data.user.role === "distributor" ? "active impersonation-nav" : "impersonation-nav"} onClick={() => setImpersonationModal("distributor")}><i>10</i> Vista Distributore</button>}
          {data.user.role !== "distributor" && <button className={active === "podcast" ? "active" : ""} onClick={() => setActive("podcast")}><i>11</i> Podcast</button>}
          <button className={active === "help" ? "active" : ""} onClick={() => setActive("help")}><i>12</i> Guida & AI</button>
          {["super_admin", "admin"].includes(data.user.role) && <button className={active === "applications" ? "active" : ""} onClick={() => setActive("applications")}><i>13</i> Candidature</button>}
        </nav>
        <div className="ops-scope"><span className="live-dot" /><div><strong>{data.demoMode ? "Dati dimostrativi" : "Dati reali"}</strong><small>{data.impersonation ? `Come ${data.user.name}` : data.user.island ?? "Tutte le isole"}</small></div></div>
      </aside>

      <main className="ops-main">
        <header className="ops-topbar">
          <div className="ops-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca clienti, preventivi, contratti o consegne…" aria-label="Cerca" /></div>
          <div className="ops-user"><LanguageSelector compact onSelect={saveLanguage} /><a className="whatsapp-button" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="Apri WhatsApp con CRMVLC">WA<span>WhatsApp</span></a>{!standalone && <button className="install-button" onClick={() => void installApp()}>Installa</button>}<button className="profile-trigger" onClick={() => setProfileModal(true)} aria-label="Modifica il profilo"><span>{initials(data.user.name)}</span><div><strong>{data.user.name}</strong><small>{roleLabels[data.user.role]}{data.user.island ? ` · ${data.user.island}` : ""}</small></div></button><button onClick={logout}>Esci</button></div>
        </header>
        {data.impersonation && <div className="impersonation-strip"><div><strong>Modalità operativa · {roleLabels[data.user.role]}</strong><span>Stai lavorando come {data.user.name}. Le modifiche sono reali e l’audit registra anche {sessionActor.name}.</span></div><button onClick={() => void stopImpersonation()}>Torna Super Admin</button></div>}
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
          <CrmKanban actor={data.user} users={data.users} clients={filteredClients} onStageChange={changeStage} onOwnerChange={changeOwner} />
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

        {active === "pricing" && data.user.role !== "distributor" && <PriceListPanel data={data} search={search} refresh={refresh} notify={notify} preferredCampaignId={preferredDiscountCampaignId} onQuoteCreated={() => setActive("quotes")} />}

        {active === "quotes" && data.user.role !== "distributor" && <QuotesPanel quotes={filteredQuotes} clients={data.clients} onConverted={async () => { notify("Contratto spagnolo generato dal preventivo e pronto per la firma OTP."); setActive("contracts"); await refresh(); }} />}

        {active === "distribution" && <DistributionPanel data={data} deliveries={filteredDeliveries} onCreate={() => setDeliveryModal("new")} onEdit={setDeliveryModal} />}

        {active === "admin" && ["super_admin", "admin"].includes(data.user.role) && <AdminPanel data={data} refresh={refresh} notify={notify} />}
        {active === "applications" && ["super_admin", "admin"].includes(data.user.role) && <ApplicationsPanel applications={data.salesApplications ?? []} refresh={refresh} notify={notify} />}
        {active === "audit" && data.user.role === "super_admin" && <AuditPanel events={data.audit} emails={data.emailOutbox} refresh={refresh} notify={notify} />}
        {active === "podcast" && data.user.role !== "distributor" && <PodcastCalendar data={data} refresh={refresh} notify={notify} />}
        {active === "help" && <HelpPage user={data.user} help={helpData} offline={offlineMode} refresh={refresh} notify={notify} onNavigate={navigateFromHelp} />}
        <footer className="platform-owner">{platformOwnership(locale)}</footer>
      </main>

      {clientModal && <ClientModal data={data} onClose={() => setClientModal(false)} onSaved={async () => { setClientModal(false); notify("Cliente creato."); await refresh(); }} />}
      {contractModal && <ContractModal data={data} onClose={() => setContractModal(false)} onSaved={async () => { setContractModal(false); notify("Contratto archiviato come bozza."); await refresh(); }} />}
      {signing && <SignatureModal contract={signing} onClose={() => setSigning(null)} onSaved={async () => { setSigning(null); notify("Firma registrata con evidenza OTP."); await refresh(); }} />}
      {superseding && <SupersedeModal contract={superseding} onClose={() => setSuperseding(null)} onSaved={async () => { setSuperseding(null); notify("Contratto annullato e nuova versione creata."); await refresh(); }} />}
      {deliveryModal && <DeliveryModal data={data} delivery={deliveryModal === "new" ? null : deliveryModal} onClose={() => setDeliveryModal(null)} onSaved={async () => { setDeliveryModal(null); notify(deliveryModal === "new" ? "Consegna assegnata." : "Consegna aggiornata."); await refresh(); }} />}
      {profileModal && <ProfileModal user={data.user} onClose={() => setProfileModal(false)} onSaved={async (message) => { setProfileModal(false); notify(message); await refresh(); }} />}
      {impersonationModal && <ImpersonationModal role={impersonationModal} users={data.impersonationUsers ?? []} currentUserId={data.impersonation ? data.user.id : null} onClose={() => setImpersonationModal(null)} onStarted={impersonationStarted} />}
      {promotionPopup && <PromotionModal campaign={promotionPopup} onDismiss={(useCampaign) => {
        window.sessionStorage.setItem(`crmvlc:promotion-seen:${promotionPopup.id}`, "1");
        if (useCampaign) {
          setPreferredDiscountCampaignId(promotionPopup.id);
          setActive("pricing");
        }
        setPromotionPopup(null);
      }} />}
      <HelpAssistantDrawer currentModule={active} offline={offlineMode} onNavigate={navigateFromHelp} />
      {notice && <div className={`ops-toast ${notice.tone}`}>{notice.tone === "ok" ? "✓" : "!"} {notice.text}</div>}
    </div>
  );
}

function Login({ onAuthenticated, initialNotice }: { onAuthenticated: () => Promise<void>; initialNotice?: { tone: "ok" | "error"; text: string } | null }) {
  const { locale } = usePlatformLanguage();
  const recruitment = recruitmentLoginCopy[locale];
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

  return <main className="auth-screen"><section className="auth-visual"><div className="auth-brand"><img src={BRAND_LOGO} alt="ViV! Le Canarie" /><div><strong>CRMVLC</strong><span>CRM & contratti</span></div></div><div className="auth-promise"><small>CRM OPERATIVO · CINQUE ISOLE</small><h1>Il lavoro commerciale, in un unico posto.</h1><p>Clienti, pipeline, preventivi, contratti, consegne e podcast: dati reali, permessi per ruolo e operatività pensata per il cellulare.</p><div className="auth-trust"><span><b>01</b> Dati per ruolo</span><span><b>02</b> Contratti con audit</span><span><b>03</b> PWA installabile</span></div><a className="auth-careers-cta" href="/lavora-con-noi"><span><strong>{recruitment.title}</strong><small>{recruitment.text}</small></span><b>{recruitment.cta} →</b></a></div><div className="auth-islands">{ISLANDS.map((island) => <span key={island}>{island}</span>)}</div><small className="auth-owner">{platformOwnership(locale)}</small></section><section className="auth-panel"><div className="auth-box"><LanguageSelector /><div className="auth-mobile-brand"><img src={BRAND_LOGO} alt="ViV! Le Canarie" /><div><strong>CRMVLC</strong><small>Area operativa</small></div></div><span className="secure-label">● Accesso protetto</span><h2>{mode === "login" ? "Bentornato" : mode === "forgot" ? "Recupera password" : mode === "reset" ? "Imposta password" : mode === "change" ? "Cambia la password temporanea" : mode === "totp_setup" ? "Configura l’autenticatore" : "Codice autenticatore"}</h2><p>{mode === "totp_setup" ? "Scansiona il QR con Google Authenticator, Microsoft Authenticator o un’app compatibile." : mode === "totp" ? "Inserisci il codice a 6 cifre generato dall’app autenticatore." : "Accedi alla tua area di lavoro CRMVLC."}</p>
    {mode === "login" && <form onSubmit={login}><label>Email aziendale<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" required maxLength={256} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="primary wide" disabled={busy}>{busy ? "Accesso…" : "Accedi"}</button><button type="button" className="link-button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Imposta o recupera password</button></form>}
    {mode === "forgot" && <form onSubmit={forgotPassword}><label>Email aziendale<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="primary wide" disabled={busy}>{busy ? "Invio…" : "Invia collegamento"}</button><button type="button" className="link-button" onClick={() => setMode("login")}>Torna all’accesso</button></form>}
    {mode === "reset" && <form onSubmit={resetPassword}>{passwordFields}<button className="primary wide" disabled={busy}>{busy ? "Salvataggio…" : "Imposta password"}</button></form>}
    {mode === "change" && <form onSubmit={changePassword}>{passwordFields}<button className="primary wide" disabled={busy}>{busy ? "Salvataggio…" : "Cambia e continua"}</button></form>}
    {(mode === "totp" || mode === "totp_setup") && <form onSubmit={confirmTotp}>{mode === "totp_setup" && <div style={{ textAlign: "center" }}>{qrCode && <img src={qrCode} width={240} height={240} alt="QR autenticatore CRMVLC" />}<small style={{ display: "block", overflowWrap: "anywhere" }}>Chiave manuale: {totpSecret}</small></div>}<label>Codice a 6 cifre<input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label><button className="primary wide" disabled={busy || code.length !== 6}>{busy ? "Verifica…" : mode === "totp_setup" ? "Conferma e accedi" : "Accedi"}</button></form>}
    {initialNotice && <div className={initialNotice.tone === "ok" ? "form-success" : "form-error"}>{initialNotice.text}</div>}{message && <div className="form-success">{message}</div>}{error && <div className="form-error">{error}</div>}<small className="privacy-note">Password cifrate con derivazione PBKDF2. Il Super Admin usa anche l’autenticatore TOTP.</small><a className="auth-careers-mobile" href="/lavora-con-noi"><strong>{recruitment.title}</strong><span>{recruitment.text}</span><b>{recruitment.cta} →</b></a></div></section></main>;
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

function CrmKanban({ actor, users, clients, onStageChange, onOwnerChange }: { actor: User; users: User[]; clients: Client[]; onStageChange: (client: Client, stage: string) => Promise<void>; onOwnerChange: (client: Client, ownerUserId: string) => Promise<void> }) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const canReassign = ["super_admin", "admin", "sales_manager"].includes(actor.role);
  return <div className="kanban-shell">
    <div className="kanban-head"><div><h2>Pipeline commerciale</h2><p>Trascina le schede oppure usa il selettore su mobile.</p></div><span>{clients.length} opportunità</span></div>
    <div className="kanban-board">
      {STAGES.map((stage) => {
        const stageClients = clients.filter((client) => client.stage === stage);
        return <section className={`kanban-column kanban-${stage}`} key={stage} onDragOver={(event) => event.preventDefault()} onDrop={() => { const client = clients.find((item) => item.id === draggedId); setDraggedId(null); if (client && client.stage !== stage) void onStageChange(client, stage); }}>
          <header><span>{stageLabels[stage]}</span><b>{stageClients.length}</b></header>
          <div className="kanban-cards">
            {stageClients.map((client) => {
              const eligibleSales = users.filter((candidate) => candidate.role === "sales" && candidate.active !== 0 && candidate.island === client.island
                && (actor.role !== "sales_manager" || candidate.sales_manager_id === actor.id));
              const currentOwnerEligible = eligibleSales.some((candidate) => candidate.id === client.owner_user_id);
              return <article key={client.id} draggable onDragStart={() => setDraggedId(client.id)} onDragEnd={() => setDraggedId(null)} className={draggedId === client.id ? "dragging" : ""}>
                <div className="kanban-grip">⠿</div><strong>{client.company_name}</strong><p>{client.contact_name} · {client.island}</p><small>{client.owner_name ?? "—"}</small>
                {canReassign && <label className="kanban-owner">Sales responsabile<select aria-label={`Sales responsabile ${client.company_name}`} value={client.owner_user_id} onChange={(event) => void onOwnerChange(client, event.target.value)}>{!currentOwnerEligible && <option value={client.owner_user_id}>{client.owner_name ?? "Responsabile attuale"} · da riassegnare</option>}{eligibleSales.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>}
                <div><b>{money(client.value_cents)}</b><select aria-label={`Fase ${client.company_name}`} value={client.stage} onChange={(event) => void onStageChange(client, event.target.value)}>{STAGES.map((option) => <option key={option} value={option}>{stageLabels[option]}</option>)}</select></div>
              </article>;
            })}
            {!stageClients.length && <div className="kanban-empty">Trascina qui</div>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}

function PriceListPanel({ data, search, refresh, notify, preferredCampaignId, onQuoteCreated }: { data: Bootstrap; search: string; refresh: () => Promise<void>; notify: (text: string, tone?: "ok" | "error") => void; preferredCampaignId: string; onQuoteCreated: () => void }) {
  const [months, setMonths] = useState(1);
  const [clientId, setClientId] = useState(data.clients[0]?.id ?? "");
  const [validDays, setValidDays] = useState(30);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [discountCampaignId, setDiscountCampaignId] = useState(preferredCampaignId);
  const [customerNote, setCustomerNote] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<PriceItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const priceList = data.priceList;
  const validCampaigns = (data.discountCampaigns ?? []).filter((campaign) => campaign.active === 1 && campaign.starts_on <= canaryToday() && campaign.ends_on >= canaryToday());
  const selectedCampaign = validCampaigns.find((campaign) => campaign.id === discountCampaignId) ?? null;

  useEffect(() => {
    if (preferredCampaignId && validCampaigns.some((campaign) => campaign.id === preferredCampaignId)) setDiscountCampaignId(preferredCampaignId);
  }, [preferredCampaignId, data.discountCampaigns]);

  if (!priceList) return <section className="ops-page"><PageHeading eyebrow="Vendita pubblicitaria" title="Listino" subtitle="Nessun listino attivo disponibile." action={<span className="admin-badge">Da configurare</span>} /><div className="data-card"><Empty title="Listino non disponibile" text="Il Super Admin deve attivare una versione del listino." /></div></section>;

  const query = search.trim().toLowerCase();
  const visibleItems = data.priceItems.filter((item) => `${item.name} ${item.dimensions} ${priceCategoryLabels[item.category]} ${item.included_services ?? ""}`.toLowerCase().includes(query));
  const selectedItems = data.priceItems.filter((item) => (quantities[item.id] ?? 0) > 0);
  const selectedCents = selectedItems.reduce((sum, item) => sum + item.monthly_price_cents * (quantities[item.id] ?? 0) * months, 0);
  const discountBps = selectedCampaign?.discount_bps ?? Math.round(discountPercent * 100);
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
          discountCampaignId: selectedCampaign?.id ?? null,
          discountPercent: data.user.role === "super_admin" && !selectedCampaign ? discountPercent : 0,
          discountReason: data.user.role === "super_admin" && !selectedCampaign ? discountReason : "",
          customerNote,
          items: selectedItems.map((item) => ({ priceItemId: item.id, quantity: quantities[item.id] })),
        }),
      });
      notify(`Preventivo ${result.quoteNumber} generato e archiviato.`);
      setQuantities({});
      setDiscountPercent(0);
      setDiscountReason("");
      setDiscountCampaignId("");
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
    <PageHeading eyebrow="Vendita pubblicitaria" title="Listino" subtitle="Dodici formati mensili, prezzi netti e IGIC calcolato separatamente per tutte le isole." action={<span className="admin-badge">v{priceList.version} · {priceList.tax_name} {(priceList.tax_rate_bps / 100).toLocaleString(localeTag())}%</span>} />
    {data.user.role === "super_admin" && <DiscountCampaignAdmin campaigns={data.discountCampaigns ?? []} refresh={refresh} notify={notify} />}
    <div className="pricing-layout">
      <div className="pricing-catalog">
        <div className="pricing-notice"><strong>Prezzi base mensili</strong><span>{priceList.prices_include_tax ? `${priceList.tax_name} incluso` : `${priceList.tax_name} escluso`} · validi per Tenerife, Gran Canaria, Lanzarote, Fuerteventura e La Palma.</span></div>
        {categories.map((group) => <section className="price-group" key={group.category}><header><div><span>{String(group.items.length).padStart(2, "0")}</span><h2>{priceCategoryLabels[group.category]}</h2></div><small>Prezzo netto / mese</small></header><div className="price-grid">{group.items.map((item) => {
          const quantity = quantities[item.id] ?? 0;
          return <article className={`price-card ${quantity ? "selected" : ""}`} key={item.id}><div className="price-card-top"><span className="price-code">{item.code}</span>{data.user.role === "super_admin" && <button className="price-edit" onClick={() => setEditing(item)}>Modifica</button>}</div><h3>{item.name}</h3><p className="price-size">{item.dimensions}</p><strong className="price-value">{money(item.monthly_price_cents)}<small>/mese</small></strong>{item.included_services && <ul>{item.included_services.split("\n").filter(Boolean).map((service) => <li key={service}>{service}</li>)}</ul>}<div className="quantity-control"><button aria-label={`Riduci ${item.name}`} onClick={() => setQuantity(item.id, quantity - 1)}>−</button><input aria-label={`Quantità ${item.name}`} type="number" min="0" max="99" value={quantity} onChange={(event) => setQuantity(item.id, Number(event.target.value))} /><button aria-label={`Aumenta ${item.name}`} onClick={() => setQuantity(item.id, quantity + 1)}>＋</button></div></article>;
        })}</div></section>)}
        {!categories.length && <div className="data-card"><Empty title="Nessun formato trovato" text="Modifica la ricerca per visualizzare il listino." /></div>}
      </div>
      <aside className="quote-panel">
        <span className="quote-eyebrow">Preventivo numerato</span><h2>Riepilogo</h2>
        <label>Cliente<select value={selectedClient?.id ?? ""} onChange={(event) => setClientId(event.target.value)} disabled={!data.clients.length}>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.company_name} · {client.island}</option>)}</select></label>
        <div className="quote-fields"><label>Durata mesi<input type="number" min="1" max="36" value={months} onChange={(event) => setMonths(Math.min(36, Math.max(1, Number(event.target.value) || 1)))} /></label><label>Validità giorni<input type="number" min="1" max="90" value={validDays} onChange={(event) => setValidDays(Math.min(90, Math.max(1, Number(event.target.value) || 1)))} /></label></div>
        {validCampaigns.length > 0 && <label>Promozione disponibile<select value={discountCampaignId} onChange={(event) => { setDiscountCampaignId(event.target.value); if (event.target.value) { setDiscountPercent(0); setDiscountReason(""); } }}><option value="">Nessuna promozione</option>{validCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.title} · {(campaign.discount_bps / 100).toLocaleString("it-IT")}%</option>)}</select></label>}
        {selectedCampaign && <div className="campaign-selected"><strong>−{(selectedCampaign.discount_bps / 100).toLocaleString("it-IT")}% · {selectedCampaign.title}</strong><span>{selectedCampaign.message}</span><small>Valida fino al {dateOnly(selectedCampaign.ends_on)}. Lo sconto sarà congelato nel PDF.</small></div>}
        {data.user.role === "super_admin" && !selectedCampaign ? <><label>Sconto manuale %<input type="number" min="0" max="100" step="0.01" value={discountPercent} onChange={(event) => setDiscountPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /></label>{discountPercent > 0 && <label>Motivo sconto<input maxLength={300} value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} required placeholder="Motivazione commerciale" /></label>}</> : !selectedCampaign && <div className="discount-lock"><strong>Nessuna promozione applicata</strong><span>Seleziona una promozione autorizzata quando disponibile.</span></div>}
        <label>Nota al cliente<textarea rows={2} maxLength={700} value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} placeholder="Facoltativa" /></label>
        <div className="quote-lines">{selectedItems.map((item) => <div key={item.id}><span>{quantities[item.id]} × {item.name}<small>{months} {months === 1 ? "mese" : "mesi"}</small></span><strong>{money(item.monthly_price_cents * (quantities[item.id] ?? 0) * months)}</strong></div>)}{!selectedItems.length && <p>Seleziona almeno un formato dal listino.</p>}</div>
        <dl><div><dt>Subtotale netto</dt><dd>{money(selectedCents)}</dd></div>{discountCents > 0 && <div className="discount-total"><dt>Sconto {(discountBps / 100).toLocaleString("it-IT")}%</dt><dd>−{money(discountCents)}</dd></div>}<div><dt>Imponibile</dt><dd>{money(netCents)}</dd></div><div><dt>{priceList.tax_name} {(priceList.tax_rate_bps / 100).toLocaleString("it-IT")}%</dt><dd>{money(taxCents)}</dd></div><div className="quote-total"><dt>Totale</dt><dd>{money(totalCents)}</dd></div></dl>
        <small className="quote-scope">{selectedClient?.island ?? "Seleziona un cliente"} · prezzi netti · {priceList.tax_name} escluso</small>
        {quoteError && <div className="quote-error">{quoteError}</div>}
        <button className="primary quote-submit" disabled={creating || !selectedClient || !selectedItems.length || (!selectedCampaign && discountPercent > 0 && !discountReason.trim())} onClick={() => void createQuote()}>{creating ? "Generazione PDF…" : "Genera preventivo PDF"}</button>
        {selectedItems.length > 0 && <button className="clear-quote" onClick={() => setQuantities({})}>Azzera calcolo</button>}
      </aside>
    </div>
    {editing && <PriceEditModal item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); notify("Prezzo aggiornato e registrato nell’audit."); await refresh(); }} />}
  </section>;
}

function DiscountCampaignAdmin({ campaigns, refresh, notify }: { campaigns: DiscountCampaign[]; refresh: () => Promise<void>; notify: (text: string, tone?: "ok" | "error") => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = canaryToday();
  const defaultEnd = new Date(`${today}T12:00:00Z`);
  defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 30);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/discount-campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
      event.currentTarget.reset();
      notify("Promozione creata. Il popup è ora disponibile ai Sales autorizzati.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Creazione della promozione non riuscita.");
    } finally { setBusy(false); }
  }

  async function deactivate(campaign: DiscountCampaign) {
    if (!window.confirm(`Disattivare “${campaign.title}”? Le applicazioni già effettuate resteranno immutabili nello storico.`)) return;
    try {
      await api(`/api/discount-campaigns/${campaign.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: false }) });
      notify("Promozione disattivata. Lo storico dei preventivi non è cambiato.");
      await refresh();
    } catch (cause) { notify(cause instanceof Error ? cause.message : "Disattivazione non riuscita.", "error"); }
  }

  return <article className="data-card campaign-admin">
    <div className="card-head"><div><h2>Promozioni Sales</h2><p>Le condizioni non sono modificabili: per cambiarle, disattiva la promozione e creane una nuova.</p></div><span className="admin-badge">{campaigns.filter((item) => item.active === 1).length} attive</span></div>
    <div className="campaign-admin-grid">
      <form className="stack-form campaign-form" onSubmit={create}>
        <label>Titolo popup<input name="title" required maxLength={120} placeholder="Promo lancio settembre" /></label>
        <label>Messaggio al Sales<textarea name="message" required rows={3} maxLength={300} placeholder="Presenta questa opportunità durante il preventivo." /></label>
        <div className="three-cols"><label>Sconto %<input name="discountPercent" type="number" required min="0.01" max="100" step="0.01" /></label><label>Dal<input name="startsOn" type="date" required defaultValue={today} /></label><label>Al<input name="endsOn" type="date" required defaultValue={defaultEnd.toISOString().slice(0, 10)} /></label></div>
        {error && <div className="form-error">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? "Creazione…" : "Crea promozione"}</button>
      </form>
      <div className="campaign-history">
        {campaigns.map((campaign) => {
          const status = campaign.active === 0 ? "Disattivata" : campaign.ends_on < today ? "Scaduta" : campaign.starts_on > today ? "Programmata" : "Attiva";
          return <div className="campaign-history-row" key={campaign.id}><div><strong>{campaign.title}</strong><span>{campaign.message}</span><small>{dateOnly(campaign.starts_on)}–{dateOnly(campaign.ends_on)} · {campaign.usage_count ?? 0} utilizzi · {dateTime(campaign.created_at)}</small></div><div><b>−{(campaign.discount_bps / 100).toLocaleString("it-IT")}%</b><span className={`campaign-status ${status.toLowerCase()}`}>{status}</span>{campaign.active === 1 && <button onClick={() => void deactivate(campaign)}>Disattiva</button>}</div></div>;
        })}
        {!campaigns.length && <Empty title="Nessuna promozione" text="Crea la prima campagna percentuale per i Sales." />}
      </div>
    </div>
  </article>;
}

function PromotionModal({ campaign, onDismiss }: { campaign: DiscountCampaign; onDismiss: (useCampaign: boolean) => void }) {
  return <Modal title="Nuova promozione disponibile" subtitle={`Valida fino al ${dateOnly(campaign.ends_on)}`} onClose={() => onDismiss(false)}>
    <div className="promotion-popup"><span>OFFERTA SALES</span><strong>−{(campaign.discount_bps / 100).toLocaleString("it-IT")}%</strong><h3>{campaign.title}</h3><p>{campaign.message}</p><small>La percentuale è autorizzata dal Super Admin e viene congelata nel preventivo quando la applichi.</small></div>
    <div className="modal-actions"><button onClick={() => onDismiss(false)}>Più tardi</button><button className="primary" onClick={() => onDismiss(true)}>Usa nel preventivo</button></div>
  </Modal>;
}

function PodcastCalendar({ data, refresh, notify }: { data: Bootstrap; refresh: () => Promise<void>; notify: (text: string, tone?: "ok" | "error") => void }) {
  const [month, setMonth] = useState(canaryToday().slice(0, 7));
  const [editing, setEditing] = useState<PodcastAppointment | "new" | null>(null);
  const canManage = ["super_admin", "admin"].includes(data.user.role);
  const appointments = data.podcastAppointments ?? [];
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const leadingDays = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const monthLabel = new Intl.DateTimeFormat(localeTag(), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const monthAppointments = appointments.filter((item) => canaryParts(item.starts_at).date.startsWith(month));
  const upcoming = appointments.filter((item) => item.status === "scheduled" && Date.parse(item.ends_at) >= Date.now()).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  function moveMonth(delta: number) {
    const value = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    setMonth(`${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return <section className="ops-page podcast-page">
    <PageHeading eyebrow="Programmazione editoriale" title="Calendario podcast" subtitle="Appuntamenti di un’ora nel fuso delle Canarie, senza sovrapposizioni per intervistatore." action={canManage ? <button className="primary" onClick={() => setEditing("new")}>＋ Nuovo appuntamento</button> : <span className="admin-badge">Sola lettura</span>} />
    <div className="podcast-package-grid">
      <article><span>ESSENTIAL</span><h2>1 minuto</h2><strong>Gratuito</strong><p>1 telecamera · video finale di 1 minuto</p></article>
      <article className="featured"><span>PRO</span><h2>3–5 minuti</h2><strong>{money(49_900)}</strong><p>3 telecamere · montaggio incluso</p></article>
      <article><span>ADD-ON</span><h2>MarcoLifestyle</h2><strong>+ {money(MARCOLIFESTYLE_PRICE_CENTS)}</strong><p>Aggiungibile a entrambi i pacchetti</p></article>
      <small>Ogni registrazione occupa 1 ora. Prezzi netti; {data.priceList?.tax_name ?? "IGIC"} escluso.</small>
    </div>
    <div className="metric-grid podcast-metrics"><Metric label="Nel mese" value={String(monthAppointments.filter((item) => item.status === "scheduled").length)} note="appuntamenti programmati" /><Metric label="Prossimi" value={String(upcoming.length)} note="da oggi in avanti" /><Metric label="Intervistatori" value={String((data.podcastInterviewers ?? []).length)} note="utenti attivi disponibili" /></div>
    <article className="data-card podcast-calendar-card">
      <div className="calendar-toolbar"><button onClick={() => moveMonth(-1)} aria-label="Mese precedente">←</button><h2>{monthLabel}</h2><button onClick={() => moveMonth(1)} aria-label="Mese successivo">→</button></div>
      <div className="calendar-weekdays">{["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="podcast-calendar-grid">
        {Array.from({ length: leadingDays }, (_, index) => <div className="calendar-day empty-day" key={`empty-${index}`} />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const key = `${month}-${String(day).padStart(2, "0")}`;
          const dayAppointments = monthAppointments.filter((item) => canaryParts(item.starts_at).date === key).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          return <div className={`calendar-day ${key === canaryToday() ? "today" : ""}`} key={key}><strong>{day}</strong><div>{dayAppointments.map((item) => {
            const ended = Date.parse(item.ends_at) < Date.now();
            return <button key={item.id} className={`podcast-slot ${item.status} ${ended && item.status === "scheduled" ? "completed" : ""}`} disabled={!canManage || item.status === "cancelled"} onClick={() => setEditing(item)}><b>{canaryParts(item.starts_at).time}</b><span>{item.guest_name}</span><small>{item.interviewer_name} · {money(item.subtotal_cents ?? 0)} netti</small></button>;
          })}</div></div>;
        })}
      </div>
    </article>
    <article className="data-card podcast-agenda"><div className="card-head"><div><h2>Prossimi appuntamenti</h2><p>Agenda ottimizzata per la consultazione dal cellulare.</p></div></div><div className="podcast-agenda-list">{upcoming.slice(0, 20).map((item) => <button key={item.id} disabled={!canManage} onClick={() => setEditing(item)}><time>{canaryDateTime(item.starts_at)}</time><div><strong>{item.guest_name}</strong><span>{item.topic}</span><small>Intervistatore: {item.interviewer_name} · 1 ora</small><small>{item.package_name ?? PODCAST_PACKAGES.one_minute_free.name}{item.marcolifestyle_add_on ? " + MarcoLifestyle" : ""} · {money(item.subtotal_cents ?? 0)} netti</small></div></button>)}{!upcoming.length && <Empty title="Agenda libera" text="Non ci sono appuntamenti podcast futuri." />}</div></article>
    {editing && <PodcastAppointmentModal appointment={editing === "new" ? null : editing} interviewers={data.podcastInterviewers ?? []} taxName={data.priceList?.tax_name ?? "IGIC"} taxRateBps={data.priceList?.tax_rate_bps ?? 700} onClose={() => setEditing(null)} onSaved={async (message) => { setEditing(null); notify(message); await refresh(); }} />}
  </section>;
}

function PodcastAppointmentModal({ appointment, interviewers, taxName, taxRateBps, onClose, onSaved }: { appointment: PodcastAppointment | null; interviewers: User[]; taxName: string; taxRateBps: number; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [packageCode, setPackageCode] = useState<PodcastPackageCode>(appointment?.package_code ?? "one_minute_free");
  const [marcolifestyleAddOn, setMarcolifestyleAddOn] = useState(Boolean(appointment?.marcolifestyle_add_on));
  const initial = appointment ? canaryParts(appointment.starts_at) : { date: (() => { const value = new Date(`${canaryToday()}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); })(), time: "10:00" };
  const netCents = PODCAST_PACKAGES[packageCode].priceCents + (marcolifestyleAddOn ? MARCOLIFESTYLE_PRICE_CENTS : 0);
  const taxCents = Math.round(netCents * taxRateBps / 10_000);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(appointment ? `/api/podcast-appointments/${appointment.id}` : "/api/podcast-appointments", {
        method: appointment ? "PATCH" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(form.entries()), packageCode, marcolifestyleAddOn, version: appointment?.version }),
      });
      await onSaved(appointment ? "Appuntamento podcast aggiornato." : "Appuntamento podcast creato.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Salvataggio non riuscito."); setBusy(false); }
  }

  async function cancelAppointment() {
    if (!appointment || !window.confirm("Annullare l’appuntamento? Resterà visibile nello storico.")) return;
    setBusy(true); setError("");
    try {
      await api(`/api/podcast-appointments/${appointment.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "cancelled", version: appointment.version }) });
      await onSaved("Appuntamento annullato e conservato nello storico.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Annullamento non riuscito."); setBusy(false); }
  }

  return <Modal title={appointment ? "Modifica appuntamento" : "Nuovo appuntamento podcast"} subtitle="Durata fissa: 1 ora · fuso Atlantic/Canary" onClose={onClose}><form className="form-grid" onSubmit={submit}>
    <label>Ospite<input name="guestName" required maxLength={120} defaultValue={appointment?.guest_name ?? ""} /></label><label>Intervistatore<select name="interviewerUserId" required defaultValue={appointment?.interviewer_user_id ?? interviewers[0]?.id}>{interviewers.map((user) => <option key={user.id} value={user.id}>{user.name} · {roleLabels[user.role]}</option>)}</select></label>
    <label className="span-2">Argomento<input name="topic" required maxLength={180} defaultValue={appointment?.topic ?? ""} /></label><label>Giorno<input name="date" type="date" required defaultValue={initial.date} /></label><label>Orario<input name="time" type="time" required step="300" defaultValue={initial.time} /></label>
    <label className="span-2">Pacchetto<select name="packageCode" value={packageCode} onChange={(event) => setPackageCode(event.target.value as PodcastPackageCode)}>{Object.entries(PODCAST_PACKAGES).map(([code, item]) => <option value={code} key={code}>{item.name} · {item.priceCents ? money(item.priceCents) : "Gratuito"}</option>)}</select></label>
    <label className="confirmation span-2 podcast-addon"><input name="marcolifestyleAddOn" type="checkbox" checked={marcolifestyleAddOn} onChange={(event) => setMarcolifestyleAddOn(event.target.checked)} /><span><strong>Aggiungi MarcoLifestyle · + {money(MARCOLIFESTYLE_PRICE_CENTS)}</strong>Disponibile con entrambi i pacchetti.</span></label>
    <div className="podcast-price-summary span-2"><div><span>Pacchetto</span><strong>{PODCAST_PACKAGES[packageCode].name}</strong></div><div><span>Netto</span><strong>{money(netCents)}</strong></div><div><span>{taxName} escluso ({taxRateBps / 100}%)</span><strong>{money(taxCents)}</strong></div><div className="total"><span>Totale con {taxName}</span><strong>{money(netCents + taxCents)}</strong></div></div>
    <label className="span-2">Note<textarea name="notes" rows={3} maxLength={1000} defaultValue={appointment?.notes ?? ""} /></label><p className="form-hint span-2">Il sistema riserva automaticamente l’ora successiva, impedisce sovrapposizioni e salva il prezzo applicato nello storico.</p>
    {error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2">{appointment && <button className="danger" type="button" disabled={busy} onClick={() => void cancelAppointment()}>Annulla appuntamento</button>}<button type="button" onClick={onClose}>Chiudi</button><button className="primary" disabled={busy || !interviewers.length}>{busy ? "Salvataggio…" : "Salva"}</button></div>
  </form></Modal>;
}

function QuotesPanel({ quotes, clients, onConverted }: { quotes: Quote[]; clients: Client[]; onConverted: () => Promise<void> }) {
  const [converting, setConverting] = useState("");
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function convert(quote: Quote, values: Record<string, FormDataEntryValue>) {
    setConverting(quote.id);
    try {
      await api(`/api/quotes/${quote.id}/convert`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
      setSelectedQuote(null);
      await onConverted();
    } catch (cause) {
      throw cause instanceof Error ? cause : new Error("Conversione non riuscita.");
    } finally {
      setConverting("");
    }
  }

  return <section className="ops-page"><PageHeading eyebrow="Ciclo commerciale" title="Preventivi" subtitle="PDF numerati, collegati al cliente e congelati con prezzi, sconto e IGIC del momento." action={<span className="admin-badge">{quotes.length} preventivi visibili</span>} /><div className="data-card"><div className="card-head"><div><h2>Archivio preventivi</h2><p>La conversione crea una bozza contrattuale da verificare prima della firma.</p></div><div className="legend"><span className="status quote-issued">Emesso</span><span className="status quote-converted">Convertito</span></div></div><div className="table-wrap"><table><thead><tr><th>Numero</th><th>Cliente</th><th>Isola</th><th>Periodo</th><th>Imponibile</th><th>IGIC</th><th>Totale</th><th>Stato</th><th /></tr></thead><tbody>{quotes.map((quote) => {
    const expired = quote.status === "issued" && quote.valid_until < today;
    return <tr key={quote.id}><td data-label="Numero"><strong>{quote.quote_number}</strong><small>{dateTime(quote.created_at)}</small></td><td data-label="Cliente"><strong>{quote.customer_company}</strong><small>{quote.customer_contact} · {quote.customer_email}</small></td><td data-label="Isola"><span className="island-pill">{quote.island}</span></td><td data-label="Periodo">{quote.months} {quote.months === 1 ? "mese" : "mesi"}<small>valido fino al {dateOnly(quote.valid_until)}</small></td><td data-label="Imponibile">{money(quote.net_cents)}{quote.discount_cents > 0 && <small>Sconto {(quote.discount_bps / 100).toLocaleString("it-IT")}%: −{money(quote.discount_cents)}</small>}</td><td data-label="IGIC">{money(quote.tax_cents)}<small>{quote.tax_name} {(quote.tax_rate_bps / 100).toLocaleString("it-IT")}%</small></td><td data-label="Totale"><strong>{money(quote.total_cents)}</strong></td><td data-label="Stato"><span className={`status ${expired ? "quote-expired" : `quote-${quote.status}`}`}>{expired ? "Scaduto" : quoteStatusLabels[quote.status]}</span></td><td data-label="Azioni"><div className="row-actions quote-actions"><button onClick={() => window.open(`/api/quotes/${quote.id}/download`, "_blank")}>PDF</button>{quote.status === "issued" && !expired && <button className="accent" disabled={converting === quote.id} onClick={() => setSelectedQuote(quote)}>{converting === quote.id ? "Conversione…" : "Crea contratto"}</button>}{quote.converted_contract_id && <button onClick={() => window.open(`/api/contracts/${quote.converted_contract_id}/download`, "_blank")}>Contratto</button>}</div></td></tr>;
  })}{!quotes.length && <tr><td colSpan={9}><Empty title="Nessun preventivo" text="Seleziona i formati nel Listino e genera il primo PDF numerato." /></td></tr>}</tbody></table></div></div>{selectedQuote && <ContractGenerationModal quote={selectedQuote} client={clients.find((client) => client.id === selectedQuote.client_id) ?? null} busy={converting === selectedQuote.id} onClose={() => setSelectedQuote(null)} onGenerate={(values) => convert(selectedQuote, values)} />}</section>;
}

function ContractGenerationModal({ quote, client, busy, onClose, onGenerate }: { quote: Quote; client: Client | null; busy: boolean; onClose: () => void; onGenerate: (values: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [error, setError] = useState("");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await onGenerate(Object.fromEntries(new FormData(event.currentTarget).entries()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generazione non riuscita.");
    }
  }
  return <Modal title="Genera contratto spagnolo" subtitle={`${quote.quote_number} · ${quote.customer_company}`} onClose={onClose}><form className="form-grid contract-generator-form" onSubmit={submit}>
    <div className="contract-wizard-note span-2"><strong>Documento definitivo</strong><span>Questi dati saranno congelati nel PDF. Dopo la firma OTP il contratto sarà immutabile.</span></div>
    <label>NIF/CIF del cliente<input name="taxId" required maxLength={40} defaultValue={client?.tax_id ?? ""} /></label>
    <label>Email di fatturazione<input name="billingEmail" type="email" required defaultValue={client?.billing_email ?? client?.email ?? quote.customer_email} /></label>
    <label className="span-2">Domicilio fiscale e indirizzo di fatturazione<textarea name="fiscalAddress" rows={2} required maxLength={300} defaultValue={client?.fiscal_address ?? ""} /></label>
    <label>Firmatario del cliente<input name="legalSignerName" required maxLength={120} defaultValue={client?.legal_signer_name ?? client?.contact_name ?? quote.customer_contact} /></label>
    <label>Carica del firmatario<input name="legalSignerRole" required maxLength={120} defaultValue={client?.legal_signer_role ?? ""} placeholder="Administrador / Apoderado" /></label>
    <label>Telefono del cliente<input name="customerPhone" type="tel" required maxLength={40} defaultValue={client?.phone ?? ""} /></label>
    <label>Data inizio campagna<input name="campaignStartDate" type="date" required defaultValue={tomorrow.toISOString().slice(0, 10)} /></label>
    <label className="span-2">URL di destinazione<input name="destinationUrl" type="url" required maxLength={500} placeholder="https://azienda.es" /></label>
    <label>Edizione impresa<input name="printEdition" required maxLength={120} placeholder="N. 12 · settembre 2026" /></label>
    <label>Tiratura prevista<input name="printRun" type="number" min="1" max="10000000" required placeholder="10000" /></label>
    <label className="span-2">Zona e canali di distribuzione<textarea name="distribution" rows={2} required maxLength={500} placeholder="Tenerife · hotel, ristoranti e punti autorizzati" /></label>
    <div className="contract-summary span-2"><span>Durata <strong>{quote.months} mesi</strong></span><span>Imponibile <strong>{money(quote.net_cents)}</strong></span><span>{quote.tax_name} <strong>{money(quote.tax_cents)}</strong></span><span>Totale <strong>{money(quote.total_cents)}</strong></span></div>
    <label className="confirmation span-2 document-language-confirmation"><input type="checkbox" required /><span><strong>Confermo i dati contrattuali</strong>Il contratto sarà generato esclusivamente in spagnolo e collegato in modo immutabile al preventivo.</span></label>
    {error && <div className="form-error span-2">{error}</div>}
    <div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy}>{busy ? "Generazione PDF…" : "Genera contratto"}</button></div>
  </form></Modal>;
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
  const [island, setIsland] = useState(data.user.island ?? ISLANDS[0]);
  const assignable = data.users.filter((candidate) => candidate.role === "sales" && candidate.active !== 0 && candidate.island === island
    && (data.user.role !== "sales_manager" || candidate.sales_manager_id === data.user.id));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Creazione non riuscita."); setBusy(false); }
  }
  const canAssign = ["super_admin", "admin", "sales_manager"].includes(data.user.role);
  const globalOperator = ["super_admin", "admin"].includes(data.user.role);
  return <Modal title="Nuovo cliente" subtitle="Il Sales assegnato determina la visibilità della pipeline e di tutti i documenti collegati." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="span-2">Azienda<input name="companyName" required maxLength={120} /></label><label>Referente<input name="contactName" required maxLength={120} /></label><label>Email<input name="email" type="email" required /></label><label>Telefono<input name="phone" /></label><label>Isola<select name="island" required value={island} onChange={(event) => setIsland(event.target.value)} disabled={!globalOperator}>{ISLANDS.map((value) => <option key={value}>{value}</option>)}</select>{!globalOperator && <input type="hidden" name="island" value={island} />}</label><label>Valore stimato €<input name="valueEuros" type="number" min="0" step="0.01" defaultValue="0" /></label>{canAssign && <label>Sales responsabile<select name="ownerUserId" required defaultValue={assignable[0]?.id ?? ""}><option value="" disabled>Seleziona un Sales</option>{assignable.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.island}</option>)}</select></label>} {canAssign && !assignable.length && <div className="form-error span-2">Non esiste un Sales attivo autorizzato per questa isola. Assegna prima un Sales al team.</div>}<label className="span-2">Note<textarea name="notes" rows={3} maxLength={2000} /></label>{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy || (canAssign && !assignable.length)}>{busy ? "Salvataggio…" : "Crea cliente"}</button></div></form></Modal>;
}

function ContractModal({ data, onClose, onSaved }: { data: Bootstrap; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/api/contracts", { method: "POST", body: new FormData(event.currentTarget) }); await onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Caricamento non riuscito."); setBusy(false); }
  }
  return <Modal title="Nuovo contratto" subtitle="Carica il PDF definitivo da sottoporre alla firma." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="span-2">Cliente<select name="clientId" required>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.company_name} · {client.island}</option>)}</select></label><label className="span-2">Titolo contratto<input name="title" required maxLength={160} placeholder="Contrato anual de patrocinio" /></label><label>Modello usato<select name="templateId"><option value="">Nessun modello associato</option>{data.templates.map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>)}</select></label><label>PDF compilato<input name="file" type="file" accept="application/pdf" required /></label><label className="confirmation span-2 document-language-confirmation"><input type="checkbox" name="documentLanguage" value="es" required /><span><strong>Documento esclusivamente in spagnolo</strong>Confermo che tutto il contenuto del PDF è redatto in spagnolo.</span></label><p className="form-hint span-2">Massimo 2,8 MB per garantire l’invio della copia firmata via email. Dopo la firma il documento non potrà essere sostituito.</p>{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy}>{busy ? "Archiviazione…" : "Crea bozza"}</button></div></form></Modal>;
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
  return <Modal title="Annulla e crea nuova versione" subtitle="Il contratto firmato resterà conservato e marcato come annullato." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="span-2">Motivazione obbligatoria<textarea name="reason" required rows={3} maxLength={500} /></label><label className="span-2">Titolo nuova versione<input name="title" defaultValue={contract.title} required /></label><label className="span-2">Nuovo PDF<input type="file" name="file" accept="application/pdf" required /></label><label className="confirmation span-2 document-language-confirmation"><input type="checkbox" name="documentLanguage" value="es" required /><span><strong>Documento esclusivamente in spagnolo</strong>Confermo che tutto il contenuto del nuovo PDF è redatto in spagnolo.</span></label>{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="danger-solid" disabled={busy}>{busy ? "Creazione…" : "Annulla e crea versione"}</button></div></form></Modal>;
}

function DistributionPanel({ data, deliveries, onCreate, onEdit }: { data: Bootstrap; deliveries: Delivery[]; onCreate: () => void; onEdit: (delivery: Delivery) => void }) {
  const canAssign = ["super_admin", "admin", "sales_manager"].includes(data.user.role);
  const assignedQuantity = data.deliveries.filter((delivery) => delivery.status !== "delivered").reduce((sum, delivery) => sum + delivery.quantity, 0);
  const deliveredQuantity = data.deliveries.filter((delivery) => delivery.status === "delivered").reduce((sum, delivery) => sum + delivery.quantity, 0);
  return <section className="ops-page"><PageHeading eyebrow="Rete distributiva" title="Distribuzione" subtitle="Consegne, quantità e aziende visibili soltanto nel perimetro assegnato." action={canAssign ? <button className="primary" disabled={!data.clients.length || !data.users.some((user) => user.role === "distributor")} onClick={onCreate}>＋ Nuova consegna</button> : <span className="admin-badge">Solo consegne assegnate</span>} /><div className="metric-grid"><Metric label="Consegne visibili" value={String(data.deliveries.length)} note="nel tuo perimetro" /><Metric label="Quantità da consegnare" value={String(assignedQuantity)} note="esclude le consegnate" /><Metric label="Quantità consegnata" value={String(deliveredQuantity)} note="confermata dal distributore" /><Metric label="Problemi aperti" value={String(data.deliveries.filter((delivery) => delivery.status === "issue").length)} note="da risolvere" /></div><div className="data-card"><div className="card-head"><div><h2>Piano consegne</h2><p>{deliveries.length} incarichi</p></div></div><div className="table-wrap"><table><thead><tr><th>Azienda</th><th>Distributore</th><th>Isola</th><th>Quantità</th><th>Data</th><th>Stato</th><th /></tr></thead><tbody>{deliveries.map((delivery) => <tr key={delivery.id}><td data-label="Azienda"><strong>{delivery.client_company}</strong><small>{delivery.delivery_contact_name} · {delivery.delivery_contact_email}</small></td><td data-label="Distributore">{delivery.distributor_name ?? "—"}</td><td data-label="Isola"><span className="island-pill">{delivery.island}</span></td><td data-label="Quantità"><strong>{delivery.quantity}</strong> {delivery.unit}</td><td data-label="Data">{delivery.scheduled_for ?? "Da pianificare"}</td><td data-label="Stato"><span className={`delivery-status ${delivery.status}`}>{deliveryStatusLabels[delivery.status]}</span></td><td data-label="Azioni"><button className="table-action" onClick={() => onEdit(delivery)}>Gestisci</button></td></tr>)}{!deliveries.length && <tr><td colSpan={7}><Empty title="Nessuna consegna" text={canAssign ? "Assegna la prima consegna a un Distributore." : "Non hai ancora consegne assegnate."} /></td></tr>}</tbody></table></div></div></section>;
}

function DeliveryModal({ data, delivery, onClose, onSaved }: { data: Bootstrap; delivery: Delivery | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [clientId, setClientId] = useState(delivery?.client_id ?? data.clients[0]?.id ?? "");
  const client = data.clients.find((item) => item.id === clientId);
  const availablePoints = data.distributionPoints.filter((point) => point.island === client?.island && (!point.client_id || point.client_id === clientId));
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
  return <Modal title={delivery ? "Gestisci consegna" : "Nuova consegna"} subtitle={delivery ? `${delivery.client_company} · ${delivery.island}` : "Assegna quantità, punto autorizzato e Distributore."} onClose={onClose}><form className="form-grid" onSubmit={submit}>{!delivery && <><label className="span-2">Azienda<select name="clientId" required value={clientId} onChange={(event) => setClientId(event.target.value)}>{data.clients.map((item) => <option key={item.id} value={item.id}>{item.company_name} · {item.island}</option>)}</select></label><label className="span-2">Distributore<select name="distributorUserId" required>{distributors.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.island}</option>)}</select></label></>}{delivery && <label>Stato<select name="status" defaultValue={delivery.status}><option value="assigned">Assegnata</option><option value="in_progress">In corso</option><option value="delivered">Consegnata</option><option value="issue">Problema</option></select></label>}<label className="span-2">Punto di distribuzione autorizzato<select name="distributionPointId" required defaultValue={delivery?.distribution_point_id ?? ""}><option value="">Seleziona punto</option>{availablePoints.map((point) => <option key={point.id} value={point.id}>{point.name} · {point.address}</option>)}</select></label><label>Quantità<input name="quantity" type="number" min="1" max="1000000" step="1" required defaultValue={delivery?.quantity ?? 1} /></label><label>Unità<input name="unit" required maxLength={30} defaultValue={delivery?.unit ?? "copie"} /></label><label>Data programmata<input name="scheduledFor" type="date" defaultValue={delivery?.scheduled_for ?? ""} required /></label><label>Referente consegna<input name="deliveryContactName" required maxLength={120} defaultValue={delivery?.delivery_contact_name ?? client?.contact_name ?? ""} /></label><label>Email referente<input name="deliveryContactEmail" type="email" required defaultValue={delivery?.delivery_contact_email ?? client?.email ?? ""} /></label><label>Telefono referente<input name="deliveryContactPhone" maxLength={40} defaultValue={delivery?.delivery_contact_phone ?? client?.phone ?? ""} /></label><label className="span-2">Indirizzo consegna<input name="deliveryAddress" maxLength={300} defaultValue={delivery?.delivery_address ?? availablePoints[0]?.address ?? ""} /></label><label className="span-2">Note operative<textarea name="notes" rows={3} maxLength={2000} defaultValue={delivery?.notes ?? ""} /></label>{!availablePoints.length && <div className="form-error span-2">Prima crea un punto di distribuzione autorizzato per questa azienda o isola.</div>}{!delivery && !distributors.length && <div className="form-error span-2">Non esiste un Distributore attivo assegnato all’isola selezionata.</div>}{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy || !availablePoints.length || (!delivery && !distributors.length)}>{busy ? "Salvataggio…" : delivery ? "Aggiorna consegna" : "Assegna consegna"}</button></div></form></Modal>;
}

function ImpersonationModal({ role, users, currentUserId, onClose, onStarted }: {
  role: "sales" | "distributor";
  users: User[];
  currentUserId: string | null;
  onClose: () => void;
  onStarted: (role: "sales" | "distributor") => Promise<void>;
}) {
  const candidates = users.filter((user) => user.role === role && user.active !== 0);
  const [userId, setUserId] = useState(() => candidates.some((user) => user.id === currentUserId) ? String(currentUserId) : candidates[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/impersonation/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      await onStarted(role);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Avvio della modalità operativa non riuscito.");
      setBusy(false);
    }
  }
  const label = roleLabels[role];
  return <Modal title={`Vista ${label}`} subtitle={`Seleziona un ${label} attivo: vedrai i suoi dati e potrai usare tutti i moduli consentiti al ruolo.`} onClose={onClose}><form className="form-grid impersonation-form" onSubmit={submit}><label className="span-2">Utente<select required value={userId} onChange={(event) => setUserId(event.target.value)} disabled={!candidates.length}>{candidates.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.island ?? "Nessuna isola"} · {user.email}</option>)}</select></label>{!candidates.length && <div className="form-error span-2">Non esiste alcun {label} attivo. Crealo prima dalla sezione Utenti.</div>}<div className="impersonation-warning span-2"><strong>Attenzione: non è una simulazione</strong><p>Clienti, preventivi, contratti, consegne e Moduli OS useranno il perimetro reale dell’utente scelto. La sessione dura massimo un’ora.</p></div><label className="confirmation span-2"><input type="checkbox" required /><span><strong>Confermo l’accesso operativo</strong>Ogni modifica sarà registrata nell’audit con il Super Admin e l’utente selezionato.</span></label>{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy || !candidates.length}>{busy ? "Accesso…" : `Lavora come ${label}`}</button></div></form></Modal>;
}

function ProfileModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await api<{ message: string }>("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      await onSaved(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aggiornamento del profilo non riuscito.");
      setBusy(false);
    }
  }
  return <Modal title="Il mio profilo" subtitle="Telefono immediato; la nuova email richiede conferma dal collegamento ricevuto." onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="span-2">Nome e cognome<input name="name" required maxLength={120} defaultValue={user.name} /></label><label>Email di accesso<input name="email" type="email" required defaultValue={user.email} /></label><label>Telefono<input name="phone" type="tel" inputMode="tel" maxLength={24} defaultValue={user.phone ?? ""} placeholder="+34…" /></label><div className="profile-security span-2"><strong>{roleLabels[user.role]}</strong><span>{user.island ?? "Accesso a tutte le isole"}</span><p>Ruolo e perimetro sono modificabili soltanto da un amministratore autorizzato.</p></div>{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy}>{busy ? "Salvataggio…" : "Salva profilo"}</button></div></form></Modal>;
}

function UserEditModal({ actor, target, users, onClose, onSaved }: { actor: User; target: User; users: User[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [role, setRole] = useState<Role>(target.role);
  const [island, setIsland] = useState(target.island ?? ISLANDS[0]);
  const [salesManagerId, setSalesManagerId] = useState(target.sales_manager_id ?? "");
  const [active, setActive] = useState(target.active !== 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/users/${target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, island, salesManagerId: role === "sales" ? salesManagerId : null, active }),
      });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aggiornamento utente non riuscito.");
      setBusy(false);
    }
  }
  const roles: Role[] = actor.role === "super_admin"
    ? ["admin", "sales_manager", "sales", "distributor"]
    : ["sales_manager", "sales", "distributor"];
  const managers = users.filter((candidate) => candidate.role === "sales_manager" && candidate.active !== 0 && candidate.island === island && candidate.id !== target.id);
  return <Modal title="Gestisci utente" subtitle={`${target.name} · ${target.email}`} onClose={onClose}><form className="form-grid" onSubmit={submit}><label>Ruolo<select value={role} onChange={(event) => setRole(event.target.value as Role)}>{roles.map((value) => <option key={value} value={value}>{roleLabels[value]}</option>)}</select></label>{role !== "admin" && <label>Isola<select value={island} onChange={(event) => { setIsland(event.target.value); setSalesManagerId(""); }}>{ISLANDS.map((value) => <option key={value}>{value}</option>)}</select></label>}{role === "sales" && <label className="span-2">Sales Manager<select value={salesManagerId} onChange={(event) => setSalesManagerId(event.target.value)}><option value="">Nessuno · visibile solo ad Admin e Super Admin</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.island}</option>)}</select></label>}<label className="confirmation span-2"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>Account attivo</strong>Disattivandolo vengono revocate tutte le sessioni aperte.</span></label><div className="profile-security span-2"><strong>Contatti personali</strong><span>{target.phone || "Telefono non inserito"}</span><p>L’utente modifica direttamente email e telefono dal proprio profilo.</p></div>{error && <div className="form-error span-2">{error}</div>}<div className="modal-actions span-2"><button type="button" onClick={onClose}>Annulla</button><button className="primary" disabled={busy}>{busy ? "Aggiornamento…" : "Aggiorna utente"}</button></div></form></Modal>;
}

function AdminPanel({ data, refresh, notify }: { data: Bootstrap; refresh: () => Promise<void>; notify: (text: string, tone?: "ok" | "error") => void }) {
  const [userBusy, setUserBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [newRole, setNewRole] = useState<Role>("sales");
  const [newIsland, setNewIsland] = useState(ISLANDS[0]);
  const [editing, setEditing] = useState<User | null>(null);
  const superAdmin = data.user.role === "super_admin";
  const creatableRoles: Role[] = superAdmin ? ["admin", "sales_manager", "sales", "distributor"] : ["sales_manager", "sales", "distributor"];

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setUserBusy(true);
    try {
      const values = Object.fromEntries(new FormData(formElement).entries());
      await api("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
      formElement.reset();
      setNewRole("sales");
      setNewIsland(ISLANDS[0]);
      notify("Utente creato. Al primo accesso dovrà cambiare la password temporanea.");
      await refresh();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Creazione non riuscita.", "error");
    } finally {
      setUserBusy(false);
    }
  }

  async function uploadTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setTemplateBusy(true);
    try {
      await api("/api/templates", { method: "POST", body: new FormData(formElement) });
      formElement.reset();
      notify("Modello contrattuale archiviato.");
      await refresh();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Caricamento non riuscito.", "error");
    } finally {
      setTemplateBusy(false);
    }
  }

  const canEdit = (target: User) => target.role !== "super_admin" && (superAdmin || target.role !== "admin");
  const newUserManagers = data.users.filter((candidate) => candidate.role === "sales_manager" && candidate.active !== 0 && candidate.island === newIsland);
  return <section className="ops-page">
    <PageHeading eyebrow="Amministrazione" title="Utenti" subtitle="Crea account, assegna gerarchie commerciali e revoca immediatamente gli accessi." action={<span className="admin-badge">{superAdmin ? "Super Admin" : "Admin operativo"}</span>} />
    <div className="admin-grid">
      <article className="data-card">
        <div className="card-head"><div><h2>Nuovo utente</h2><p>{superAdmin ? "Admin operativo, Sales Manager, Sales o Distributore." : "Sales Manager, Sales o Distributore."}</p></div></div>
        <form className="stack-form" onSubmit={createUser}>
          <label>Nome e cognome<input name="name" required maxLength={120} /></label>
          <label>Email aziendale<input name="email" type="email" required /></label>
          <label>Password temporanea<input name="temporaryPassword" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /><small>Almeno 12 caratteri. Al primo accesso dovrà essere cambiata.</small></label>
          <div className="two-cols"><label>Ruolo<select name="role" value={newRole} onChange={(event) => setNewRole(event.target.value as Role)}>{creatableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>{newRole !== "admin" && <label>Isola<select name="island" value={newIsland} onChange={(event) => setNewIsland(event.target.value)}>{ISLANDS.map((island) => <option key={island}>{island}</option>)}</select></label>}</div>
          <label>Lingua iniziale<select name="language" defaultValue="es"><option value="es">Español</option><option value="it">Italiano</option><option value="en">English</option></select><small>L’utente potrà cambiarla dal proprio profilo.</small></label>
          {newRole === "sales" && <label>Sales Manager<select name="salesManagerId"><option value="">Nessuno · solo Admin e Super Admin</option>{newUserManagers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.island}</option>)}</select><small>Il Sales resta operativo anche senza manager, ma nessun Sales Manager vedrà i suoi clienti.</small></label>}
          <button className="primary" disabled={userBusy}>{userBusy ? "Creazione…" : "Crea utente"}</button>
        </form>
      </article>
      {superAdmin ? <article className="data-card"><div className="card-head"><div><h2>Carica modello</h2><p>PDF o DOCX, massimo 8 MB. Solo documenti in spagnolo.</p></div></div><form className="stack-form" onSubmit={uploadTemplate}><label>Nome modello<input name="name" required placeholder="Contrato de patrocinio" /></label><label>Versione<input name="version" required defaultValue="1.0" /></label><label>Documento<input name="file" type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /></label><label className="confirmation document-language-confirmation"><input type="checkbox" name="documentLanguage" value="es" required /><span><strong>Documento esclusivamente in spagnolo</strong>Confermo la lingua del modello caricato.</span></label><button className="primary" disabled={templateBusy}>{templateBusy ? "Caricamento…" : "Archivia modello"}</button></form></article> : <article className="data-card permission-card"><div className="card-head"><div><h2>Permessi Admin operativo</h2><p>Gestione quotidiana senza accesso alle configurazioni sensibili.</p></div></div><ul><li>CRM e consegne su tutte le isole</li><li>Crea e gestisce ruoli operativi</li><li>Non crea altri Admin</li><li>Nessun accesso ad audit, listino o commissioni</li></ul></article>}
    </div>
    <div className={`admin-grid lower ${superAdmin ? "" : "single"}`}>
      <article className="data-card"><div className="card-head"><div><h2>Utenti autorizzati</h2><p>{data.users.length} account · gerarchia Sales–Manager esplicita</p></div></div><div className="simple-list">{data.users.map((target) => <div key={target.id}><span className="avatar">{initials(target.name)}</span><div><strong>{target.name}</strong><small>{target.email}{target.phone ? ` · ${target.phone}` : ""}</small></div><p>{roleLabels[target.role]}<small>{target.island ?? "Tutte le isole"}{target.role === "sales" ? ` · ${target.sales_manager_name ? `Manager: ${target.sales_manager_name}` : "Senza Sales Manager"}` : ""}{target.active === 0 ? " · Disattivato" : ""}</small>{canEdit(target) && <button className="mini-link" onClick={() => setEditing(target)}>Modifica ruolo e accesso</button>}</p></div>)}</div></article>
      {superAdmin && <article className="data-card"><div className="card-head"><div><h2>Modelli contrattuali</h2><p>{data.templates.length} versioni attive</p></div></div><div className="simple-list">{data.templates.map((template) => <div key={template.id}><span className="file-badge">{template.mime_type.includes("pdf") ? "PDF" : "DOC"}</span><div><strong>{template.name}</strong><small>{template.original_filename}</small></div><p>v{template.version}<button className="mini-link" onClick={() => window.open(`/api/templates/${template.id}/download`, "_blank")}>Scarica</button></p></div>)}{!data.templates.length && <Empty title="Nessun modello" text="Carica i documenti già pronti." />}</div></article>}
    </div>
    {editing && <UserEditModal actor={data.user} target={editing} users={data.users} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); notify("Ruolo, gerarchia e accesso aggiornati. Le sessioni precedenti sono state revocate."); await refresh(); }} />}
  </section>;
}

function ApplicationsPanel({ applications, refresh, notify }: { applications: SalesApplication[]; refresh: () => Promise<void>; notify: (text: string, tone?: "ok" | "error") => void }) {
  const { locale } = usePlatformLanguage();
  const text = {
    it: { eyebrow: "Rete commerciale", title: "Candidature", subtitle: "Valuta le richieste ricevute dalla pagina Lavora con noi.", all: "Tutte", empty: "Nessuna candidatura", emptyText: "Le nuove candidature compariranno qui.", language: "Lingue", availability: "Disponibilità", presentation: "Presentazione", notes: "Note interne", notesHint: "Colloquio, valutazione e prossimi passi…", save: "Salva", saving: "Salvataggio…", saved: "Candidatura aggiornata.", commission: "Collaborazione a provvigioni", received: "Ricevuta", reviewed: "Gestita da" },
    es: { eyebrow: "Red comercial", title: "Candidaturas", subtitle: "Evalúa las solicitudes recibidas desde la página Trabaja con nosotros.", all: "Todas", empty: "Ninguna candidatura", emptyText: "Las nuevas candidaturas aparecerán aquí.", language: "Idiomas", availability: "Disponibilidad", presentation: "Presentación", notes: "Notas internas", notesHint: "Entrevista, evaluación y próximos pasos…", save: "Guardar", saving: "Guardando…", saved: "Candidatura actualizada.", commission: "Colaboración a comisión", received: "Recibida", reviewed: "Gestionada por" },
    en: { eyebrow: "Sales network", title: "Applications", subtitle: "Review requests received through the Work with us page.", all: "All", empty: "No applications", emptyText: "New applications will appear here.", language: "Languages", availability: "Availability", presentation: "Introduction", notes: "Internal notes", notesHint: "Interview, assessment and next steps…", save: "Save", saving: "Saving…", saved: "Application updated.", commission: "Commission-based collaboration", received: "Received", reviewed: "Managed by" },
  }[locale];
  const statusCopy = {
    it: { new: "Nuova", contacted: "Contattata", interview: "Colloquio", approved: "Approvata", rejected: "Rifiutata" },
    es: { new: "Nueva", contacted: "Contactada", interview: "Entrevista", approved: "Aprobada", rejected: "Rechazada" },
    en: { new: "New", contacted: "Contacted", interview: "Interview", approved: "Approved", rejected: "Rejected" },
  }[locale];
  const availabilityCopy = {
    it: { immediate: "Subito", two_weeks: "Entro 2 settimane", one_month: "Entro 1 mese" },
    es: { immediate: "Inmediatamente", two_weeks: "En 2 semanas", one_month: "En 1 mes" },
    en: { immediate: "Immediately", two_weeks: "Within 2 weeks", one_month: "Within 1 month" },
  }[locale];
  const [filter, setFilter] = useState<"all" | SalesApplication["status"]>("all");
  const [drafts, setDrafts] = useState<Record<string, { status: SalesApplication["status"]; adminNotes: string }>>({});
  const [busy, setBusy] = useState("");
  const visible = filter === "all" ? applications : applications.filter((item) => item.status === filter);
  const draftFor = (item: SalesApplication) => drafts[item.id] ?? { status: item.status, adminNotes: item.admin_notes };

  async function save(item: SalesApplication) {
    const draft = draftFor(item); setBusy(item.id);
    try {
      await api(`/api/sales-applications/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      setDrafts((current) => { const next = { ...current }; delete next[item.id]; return next; });
      notify(text.saved); await refresh();
    } catch (cause) { notify(cause instanceof Error ? cause.message : "Operazione non riuscita.", "error"); }
    finally { setBusy(""); }
  }

  return <section className="ops-page applications-page">
    <PageHeading eyebrow={text.eyebrow} title={text.title} subtitle={text.subtitle} action={<span className="admin-badge">{applications.length}</span>} />
    <div className="application-filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>{text.all} · {applications.length}</button>{(Object.keys(statusCopy) as SalesApplication["status"][]).map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{statusCopy[status]} · {applications.filter((item) => item.status === status).length}</button>)}</div>
    <div className="application-grid">{visible.map((item) => { const draft = draftFor(item); return <article className="application-card" key={item.id}>
      <header><div className="application-person"><span>{initials(item.name)}</span><div><h2>{item.name}</h2><p>{item.city} · {item.island}</p></div></div><span className={`application-status ${item.status}`}>{statusCopy[item.status]}</span></header>
      <div className="application-contacts"><a href={`tel:${item.phone}`}>{item.phone}</a><a href={`mailto:${item.email}`}>{item.email}</a></div>
      <dl><div><dt>{text.language}</dt><dd>{item.languages}</dd></div><div><dt>{text.availability}</dt><dd>{availabilityCopy[item.availability]}</dd></div></dl>
      <div className="application-presentation"><strong>{text.presentation}</strong><p>{item.presentation}</p></div>
      <small className="application-meta">{text.commission} · {text.received} {dateTime(item.created_at)}{item.reviewed_by_name ? ` · ${text.reviewed} ${item.reviewed_by_name}` : ""}</small>
      <div className="application-review"><label><span>{text.title}</span><select value={draft.status} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, status: event.target.value as SalesApplication["status"] } }))}>{(Object.keys(statusCopy) as SalesApplication["status"][]).map((status) => <option key={status} value={status}>{statusCopy[status]}</option>)}</select></label><label><span>{text.notes}</span><textarea rows={3} maxLength={2000} placeholder={text.notesHint} value={draft.adminNotes} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, adminNotes: event.target.value } }))} /></label><button className="primary" disabled={busy === item.id} onClick={() => void save(item)}>{busy === item.id ? text.saving : text.save}</button></div>
    </article>; })}{!visible.length && <div className="data-card"><Empty title={text.empty} text={text.emptyText} /></div>}</div>
  </section>;
}

function AuditActor({ event }: { event: AuditEvent }) {
  let effectiveName: string | null = null;
  try {
    const payload = JSON.parse(event.payload_json) as { impersonation?: { effectiveUserName?: string } };
    effectiveName = payload.impersonation?.effectiveUserName ?? null;
  } catch { /* Un payload storico può non essere JSON valido. */ }
  return <><strong>{event.actor_name ?? "Sistema"}</strong>{effectiveName && <small>come {effectiveName}</small>}</>;
}

function AuditPanel({ events, emails, refresh, notify }: { events: AuditEvent[]; emails: EmailOutboxItem[]; refresh: () => Promise<void>; notify: (text: string, tone?: "ok" | "error") => void }) {
  const [retrying, setRetrying] = useState("");
  async function retryEmail(message: EmailOutboxItem) { setRetrying(message.id); try { await api(`/api/email-outbox/${message.id}/retry`, { method: "POST" }); notify("Nuovo tentativo email avviato."); await refresh(); } catch (cause) { notify(cause instanceof Error ? cause.message : "Nuovo tentativo non riuscito.", "error"); } finally { setRetrying(""); } }
  return <section className="ops-page"><PageHeading eyebrow="Tracciabilità" title="Audit" subtitle="Registro append-only e controllo degli invii email." action={<span className="admin-badge">Ultimi {events.length} eventi</span>} />{emails.length > 0 && <div className="data-card email-alerts"><div className="card-head"><div><h2>Email da controllare</h2><p>Invii in attesa o terminati con errore.</p></div></div><div className="table-wrap"><table><thead><tr><th>Destinatario</th><th>Oggetto</th><th>Stato</th><th>Tentativi</th><th>Prossimo tentativo</th><th /></tr></thead><tbody>{emails.map((message) => <tr key={message.id}><td data-label="Destinatario">{message.recipient}</td><td data-label="Oggetto">{message.subject}<small>{message.last_error ?? "In attesa di consegna"}</small></td><td data-label="Stato"><span className={`delivery-status ${message.status === "dead" ? "issue" : "in_progress"}`}>{message.status === "dead" ? "Errore" : "In attesa"}</span></td><td data-label="Tentativi">{message.attempts}/5</td><td data-label="Prossimo tentativo">{dateTime(message.next_attempt_at)}</td><td data-label="Azioni"><button className="table-action" disabled={retrying === message.id} onClick={() => void retryEmail(message)}>{retrying === message.id ? "Invio…" : "Riprova"}</button></td></tr>)}</tbody></table></div></div>}<div className="data-card"><div className="table-wrap"><table><thead><tr><th>Data</th><th>Utente</th><th>Azione</th><th>Entità</th><th>Riferimento</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td data-label="Data">{dateTime(event.created_at)}</td><td data-label="Utente"><AuditActor event={event} /></td><td data-label="Azione"><code>{event.action}</code></td><td data-label="Entità">{event.entity_type}</td><td data-label="Riferimento"><span className="hash">{event.entity_id}</span></td></tr>)}{!events.length && <tr><td colSpan={5}><Empty title="Registro vuoto" text="Gli eventi compariranno dopo le prime operazioni." /></td></tr>}</tbody></table></div></div></section>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="ops-modal" role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button onClick={onClose} aria-label="Chiudi">×</button></header>{children}</section></div>;
}

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
