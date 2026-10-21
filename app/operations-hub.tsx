"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { loadOfflineSnapshot, prepareDeliveryPhoto, queuePhotoAudit, saveOfflineSnapshot } from "./offline";
import { localeTag } from "./i18n";
import { buildGoogleMapsSegments, optimizeDeliveryRoute } from "./delivery-route";

type Role = "super_admin" | "admin" | "sales_manager" | "sales" | "distributor";
type User = { id: string; name: string; role: Role; island: string | null };
type Client = { id: string; company_name: string; island: string };
type Delivery = {
  id: string; client_company?: string; island: string; status: string; distributor_user_id?: string; distributor_name?: string;
  scheduled_for?: string | null; quantity?: number; unit?: string; distribution_point_id?: string | null; distribution_point_name?: string | null;
  distribution_point_address?: string | null; distribution_point_latitude_e6?: number | null; distribution_point_longitude_e6?: number | null;
};
type RecordRow = Record<string, string | number | null>;

type Snapshot = {
  counts: { sponsors: number; vipMembers: number; couponsIssued: number; couponsRedeemed: number; distributionPoints: number; pendingPhotoAudits: number; openSalesTasks: number; availableWalletCents: number };
  sponsors: RecordRow[];
  vipMembers: RecordRow[];
  coupons: RecordRow[];
  commissionRules: RecordRow[];
  walletEntries: RecordRow[];
  payoutRequests: RecordRow[];
  inventory: RecordRow[];
  distributionPoints: RecordRow[];
  photoAudits: RecordRow[];
  deliveryChecks: RecordRow[];
  salesCheckins: RecordRow[];
  salesTasks: RecordRow[];
  leaderboard: RecordRow[];
  bundles: RecordRow[];
  integrations: { email: boolean; whatsapp: boolean; payments: boolean; maps: boolean; photoAi: boolean };
};

const ISLANDS = ["Tenerife", "Gran Canaria", "Lanzarote", "Fuerteventura", "La Palma"];
const WHATSAPP_URL = "https://wa.me/34602576044?text=Buongiorno%2C%20contatto%20CRMVLC%20per%20un%27informazione.";
const TABS = [
  ["overview", "Regia"],
  ["vip", "VIP & Sponsor"],
  ["finance", "Finanza"],
  ["inventory", "Spazi"],
  ["distribution", "Geo audit"],
  ["sales", "Sales Ops"],
] as const;

class RequestError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const payload = isJson ? await response.json() as { error?: { message?: string } } & T : null;
  if (!response.ok) throw new RequestError(payload?.error?.message ?? "Operazione non riuscita.", response.status);
  return payload as T;
}

async function post(path: string, value: Record<string, unknown>) {
  return request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
}

function euros(cents: number) {
  return new Intl.NumberFormat(localeTag(), { style: "currency", currency: "EUR" }).format(cents / 100);
}

function when(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(localeTag(), { dateStyle: "short", timeStyle: "short" }).format(new Date(String(value)));
}

export function OperationsHub({ user, clients, users, deliveries, notify }: {
  user: User;
  clients: Client[];
  users: User[];
  deliveries: Delivery[];
  notify: (text: string, tone?: "ok" | "error") => void;
}) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>(user.role === "distributor" ? "distribution" : "overview");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await request<Snapshot>("/api/operations");
      setData(result);
      await saveOfflineSnapshot(`operations:${user.id}`, user.id, result);
    } catch (error) {
      if (!(error instanceof RequestError)) {
        const cached = await loadOfflineSnapshot<Snapshot>(`operations:${user.id}`).catch(() => null);
        if (cached?.userId === user.id) {
          setData(cached.value);
          notify("Moduli operativi disponibili in sola lettura offline.");
          return;
        }
      }
      notify(error instanceof Error ? error.message : "Moduli non disponibili.", "error");
    }
  }, [notify, user.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const online = () => { void refresh(); };
    window.addEventListener("online", online);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
    };
  }, [refresh]);

  useEffect(() => {
    if (user.role === "distributor") return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
    }, 45_000);
    return () => window.clearInterval(interval);
  }, [refresh, user.role]);

  async function run(action: () => Promise<unknown>, success: string, form?: HTMLFormElement) {
    setBusy(true);
    try {
      await action();
      form?.reset();
      notify(success);
      await refresh();
    } catch (error) { notify(error instanceof Error ? error.message : "Operazione non riuscita.", "error"); }
    finally { setBusy(false); }
  }

  async function submitPhotoAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      const location = await currentLocation();
      const formData = new FormData(form);
      const deliveryId = String(formData.get("deliveryId") ?? "");
      const distributionPointId = String(formData.get("distributionPointId") ?? "");
      const quantity = String(formData.get("quantity") ?? "");
      const unit = String(formData.get("unit") ?? "copie");
      const reminderDays = String(formData.get("reminderDays") ?? "7");
      const selected = formData.get("photo");
      if (!(selected instanceof File) || selected.size === 0) {
        throw new Error("Scatta la fotografia della consegna.");
      }
      if (!deliveryId && (user.role !== "distributor" || !distributionPointId || Number(quantity) < 1)) {
        throw new Error("Seleziona una consegna oppure un punto e indica la quantità consegnata.");
      }
      if (!deliveryId && !navigator.onLine) {
        throw new Error("La conferma libera richiede la rete. Riprova quando il telefono è online.");
      }

      const photo = await prepareDeliveryPhoto(selected);
      let queued = !navigator.onLine;
      if (!queued) {
        const upload = new FormData();
        upload.set("deliveryId", deliveryId);
        if (!deliveryId) {
          upload.set("distributionPointId", distributionPointId);
          upload.set("quantity", quantity);
          upload.set("unit", unit);
          upload.set("reminderDays", reminderDays);
        }
        upload.set("latitude", String(location.latitude));
        upload.set("longitude", String(location.longitude));
        upload.set("photo", photo, photo.name);
        try {
          await request("/api/operations/photo-audits", { method: "POST", body: upload });
        } catch (error) {
          if (error instanceof RequestError) throw error;
          if (!deliveryId) throw new Error("Connessione persa: la conferma libera non è stata registrata. Riprova quando sei online.");
          queued = true;
        }
      }
      if (queued) {
        await queuePhotoAudit({
          userId: user.id,
          deliveryId,
          photo,
          filename: photo.name,
          latitude: location.latitude,
          longitude: location.longitude,
        });
      }

      form.reset();
      notify(queued
        ? "Foto di consegna salvata sul dispositivo. Verrà inviata appena torna la rete."
        : "Verifica fotografica inviata.");
      if (!queued) await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Acquisizione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitPointRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      if (!navigator.onLine) throw new Error("La registrazione di un nuovo punto richiede la rete.");
      const location = await currentLocation();
      const formData = new FormData(form);
      const name = String(formData.get("name") ?? "");
      const address = String(formData.get("address") ?? "");
      const quantity = String(formData.get("quantity") ?? "1");
      const unit = String(formData.get("unit") ?? "copie");
      const reminderDays = String(formData.get("reminderDays") ?? "7");
      const selected = formData.get("photo");
      if (!name || !address) throw new Error("Indica nome e indirizzo del punto vendita.");
      if (!(selected instanceof File) || selected.size === 0) throw new Error("Scatta la foto del punto vendita.");

      const photo = await prepareDeliveryPhoto(selected);
      const upload = new FormData();
      upload.set("name", name);
      upload.set("address", address);
      upload.set("quantity", quantity);
      upload.set("unit", unit);
      upload.set("reminderDays", reminderDays);
      upload.set("latitude", String(location.latitude));
      upload.set("longitude", String(location.longitude));
      upload.set("photo", photo, photo.name);
      await request("/api/operations/distribution-points/self-register", { method: "POST", body: upload });

      form.reset();
      notify("Punto vendita registrato e prima consegna inviata.");
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Registrazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitDeliveryCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      if (!navigator.onLine) throw new Error("Il controllo del punto richiede la rete.");
      const location = await currentLocation();
      const formData = new FormData(form);
      const distributionPointId = String(formData.get("distributionPointId") ?? "");
      const quantityFound = String(formData.get("quantityFound") ?? "0");
      const notes = String(formData.get("notes") ?? "");
      const reminderDays = String(formData.get("reminderDays") ?? "7");
      const selected = formData.get("photo");
      if (!distributionPointId) throw new Error("Seleziona il punto da controllare.");
      if (!(selected instanceof File) || selected.size === 0) throw new Error("Scatta la foto del punto al ritiro.");

      const photo = await prepareDeliveryPhoto(selected);
      const upload = new FormData();
      upload.set("distributionPointId", distributionPointId);
      upload.set("quantityFound", quantityFound);
      upload.set("notes", notes);
      upload.set("reminderDays", reminderDays);
      upload.set("latitude", String(location.latitude));
      upload.set("longitude", String(location.longitude));
      upload.set("photo", photo, photo.name);
      await request("/api/operations/delivery-checks", { method: "POST", body: upload });

      form.reset();
      notify("Controllo registrato.");
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Controllo non riuscito.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitBulkPhotoAudit(
    distributorId: string,
    items: Array<{ distributionPointId: string; quantity: string; unit: string; file: File }>,
    onProgress: (index: number, status: "ok" | "error", message?: string) => void,
  ) {
    if (!distributorId) { notify("Seleziona il distributore.", "error"); return; }
    if (!items.length) { notify("Aggiungi almeno una foto.", "error"); return; }
    setBusy(true);
    let okCount = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      try {
        if (!item.distributionPointId) throw new Error("Seleziona il punto di distribuzione per questa foto.");
        if (!(item.file instanceof File) || item.file.size === 0) throw new Error("Foto mancante.");
        const upload = new FormData();
        upload.set("distributorId", distributorId);
        upload.set("distributionPointId", item.distributionPointId);
        upload.set("quantity", item.quantity || "1");
        upload.set("unit", item.unit || "copie");
        upload.set("reminderDays", "7");
        upload.set("photo", item.file, item.file.name);
        await request("/api/operations/photo-audits", { method: "POST", body: upload });
        okCount += 1;
        onProgress(index, "ok");
      } catch (error) {
        onProgress(index, "error", error instanceof Error ? error.message : "Caricamento non riuscito.");
      }
    }
    notify(`${okCount}/${items.length} foto caricate e attribuite al distributore.`, okCount === items.length ? "ok" : "error");
    await refresh();
    setBusy(false);
  }

  if (!data) return <section className="ops-page"><div className="module-loading"><span /><p>Caricamento moduli operativi…</p></div></section>;

  return <section className="ops-page operations-hub">
    <div className="hub-heading">
      <div><small>CRMVLC · infrastruttura completa</small><h1>Regia operativa</h1><p>Sei moduli con dati reali, audit e separazione per isola.</p></div>
      <div className="hub-live"><span /> Dati sincronizzati</div>
    </div>
    <div className="hub-tabs" role="tablist" aria-label="Moduli CRMVLC">
      {TABS.filter(([key]) => user.role !== "distributor" || ["overview", "distribution"].includes(key)).map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}
    </div>

    {tab === "overview" && <Overview data={data} user={user} />}
    {tab === "vip" && user.role !== "distributor" && <VipPanel data={data} user={user} clients={clients} busy={busy} run={run} />}
    {tab === "finance" && user.role !== "distributor" && <FinancePanel data={data} user={user} busy={busy} run={run} />}
    {tab === "inventory" && user.role !== "distributor" && <InventoryPanel data={data} user={user} busy={busy} run={run} />}
    {tab === "distribution" && <GeoAuditPanel data={data} user={user} users={users} clients={clients} deliveries={deliveries} busy={busy} run={run} submitPhotoAudit={submitPhotoAudit} submitPointRegistration={submitPointRegistration} submitDeliveryCheck={submitDeliveryCheck} submitBulkPhotoAudit={submitBulkPhotoAudit} />}
    {tab === "sales" && user.role !== "distributor" && <SalesPanel data={data} user={user} users={users} clients={clients} busy={busy} run={run} />}
  </section>;
}

function Overview({ data, user }: { data: Snapshot; user: User }) {
  const integrations = [
    ["Email OTP", data.integrations.email, "Identità e ricevute"],
    ["WhatsApp", data.integrations.whatsapp, "Chat diretta · +34 602 576 044"],
    ["Stripe / SEPA", data.integrations.payments, "Incassi ricorrenti"],
    ["Mappe", data.integrations.maps, "Percorsi e mappe pubbliche"],
    ["AI fotografica", data.integrations.photoAi, "Controllo qualità immagini"],
  ] as const;
  return <>
    <div className="hub-metrics">
      <HubMetric label="Sponsor attivi" value={data.counts.sponsors} note="directory VIP" />
      <HubMetric label="Membri VIP" value={data.counts.vipMembers} note="consenso registrato" />
      <HubMetric label="Coupon usati" value={data.counts.couponsRedeemed} note={`${data.counts.couponsIssued} ancora validi`} />
      <HubMetric label="Punti distribuzione" value={data.counts.distributionPoints} note="sulle cinque isole" />
      <HubMetric label="Foto da verificare" value={data.counts.pendingPhotoAudits} note="audit geolocalizzato" />
      <HubMetric label="Task commerciali" value={data.counts.openSalesTasks} note="ancora aperti" />
    </div>
    <div className="hub-two">
      <div className="module-card">
        <header><div><span className="module-index">01</span><h2>Stato piattaforma</h2></div><small>Perimetro: {user.island ?? "tutte le isole"}</small></header>
        <div className="integration-list">{integrations.map(([label, connected, note]) => <div key={label}><span className={`integration-dot ${connected ? "connected" : "pending"}`} /><div><strong>{label}</strong><small>{note}</small></div>{label === "WhatsApp" ? <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Apri chat</a> : <b>{connected ? "Collegato" : "Da collegare"}</b>}</div>)}</div>
      </div>
      <div className="module-card readiness-card">
        <header><div><span className="module-index">02</span><h2>Copertura moduli</h2></div></header>
        <div className="readiness-list">
          <Progress label="CRM, preventivi e contratti" value={90} />
          <Progress label="VIP Pass e sponsor" value={55} />
          <Progress label="Finanza e commissioni" value={45} />
          <Progress label="Distribuzione e foto" value={55} />
          <Progress label="Sales workflow" value={60} />
        </div>
        <p className="truth-note"><strong>Nota operativa:</strong> “Da collegare” significa che il modulo conserva già i dati, ma non comunica ancora con il servizio esterno.</p>
      </div>
    </div>
  </>;
}

function VipPanel({ data, user, clients, busy, run }: PanelProps & { clients: Client[] }) {
  const canManage = ["super_admin", "admin", "sales_manager"].includes(user.role);
  return <div className="hub-stack">
    <div className="hub-three">
      {canManage && <ActionCard index="01" title="Nuovo sponsor" text="Directory, vantaggio e PIN di redemption.">
        <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); void run(() => post("/api/operations/sponsors", { name: fd.get("name"), island: fd.get("island"), category: fd.get("category"), offerTitle: fd.get("offerTitle"), discountText: fd.get("discountText"), merchantPin: fd.get("merchantPin"), clientId: fd.get("clientId") }), "Sponsor creato.", form); }}>
          <input name="name" placeholder="Nome sponsor" required />
          <select name="clientId"><option value="">Nessun cliente collegato</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}</select>
          <IslandSelect user={user} />
          <input name="category" placeholder="Categoria (es. Ristorante)" required />
          <input name="offerTitle" placeholder="Titolo offerta" required />
          <input name="discountText" placeholder="Vantaggio (es. -15%)" required />
          <input name="merchantPin" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="PIN negozio · 4 cifre" required />
          <button className="primary" disabled={busy}>Crea sponsor</button>
        </form>
      </ActionCard>}
      <ActionCard index="02" title="Nuovo membro VIP" text="Registrazione 1-click con consenso.">
        <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); void run(() => post("/api/operations/vip-members", { name: fd.get("name"), phone: fd.get("phone"), island: fd.get("island"), consent: fd.get("consent") === "on" }), "Membro VIP registrato.", form); }}>
          <input name="name" placeholder="Nome e cognome" required />
          <input name="phone" placeholder="WhatsApp +34…" required />
          <IslandSelect user={user} />
          <label className="check-line"><input name="consent" type="checkbox" required /> Consenso contatto e regolamento</label>
          <button className="primary" disabled={busy}>Registra</button>
        </form>
      </ActionCard>
      <ActionCard index="03" title="Emetti coupon" text="Codice unico, tracciato e valido 30 giorni.">
        <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); void run(() => post("/api/operations/coupons", { sponsorId: fd.get("sponsorId"), memberId: fd.get("memberId") }), "Coupon emesso.", form); }}>
          <select name="sponsorId" required><option value="">Seleziona sponsor</option>{data.sponsors.map((row) => <option key={String(row.id)} value={String(row.id)}>{row.name} · {row.island}</option>)}</select>
          <select name="memberId" required><option value="">Seleziona membro VIP</option>{data.vipMembers.map((row) => <option key={String(row.id)} value={String(row.id)}>{row.name} · {row.phone}</option>)}</select>
          <button className="primary" disabled={busy || !data.sponsors.length || !data.vipMembers.length}>Genera codice</button>
        </form>
      </ActionCard>
    </div>
    <div className="hub-two">
      <DataCard title="Sponsor e offerte" count={data.sponsors.length}>{data.sponsors.length ? data.sponsors.map((row) => <ListRow key={String(row.id)} title={String(row.name)} subtitle={`${row.category} · ${row.island}`} meta={String(row.discount_text)} status={String(row.status)} />) : <MiniEmpty text="Nessuno sponsor registrato." />}</DataCard>
      <DataCard title="Coupon e redemption" count={data.coupons.length}>{data.coupons.length ? data.coupons.map((row) => <ListRow key={String(row.id)} title={String(row.code)} subtitle={`${row.member_name} → ${row.sponsor_name}`} meta={row.redeemed_at ? `Usato ${when(row.redeemed_at)}` : `Scade ${when(row.expires_at)}`} status={String(row.status)} />) : <MiniEmpty text="Nessun coupon emesso." />}</DataCard>
    </div>
  </div>;
}

function FinancePanel({ data, user, busy, run }: PanelProps) {
  return <div className="hub-stack">
    <div className="hub-metrics compact"><HubMetric label="Disponibile" value={euros(data.counts.availableWalletCents)} note="wallet nel tuo perimetro" /><HubMetric label="Richieste" value={data.payoutRequests.filter((row) => row.status === "requested").length} note="da processare" /><HubMetric label="Regole attive" value={data.commissionRules.filter((row) => Number(row.active) === 1).length} note="commissioni" /></div>
    <div className="hub-two">
      <ActionCard index="01" title="Richiedi liquidazione" text="Il sistema blocca richieste oltre il saldo disponibile.">
        <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); void run(() => post("/api/operations/payout-requests", { amountEuros: fd.get("amountEuros"), note: fd.get("note") }), "Richiesta inviata.", form); }}>
          <input name="amountEuros" type="number" min="10" step="0.01" placeholder="Importo €" required />
          <input name="note" placeholder="Nota facoltativa" />
          <button className="primary" disabled={busy}>Richiedi pagamento</button>
        </form>
      </ActionCard>
      {user.role === "super_admin" && <ActionCard index="02" title="Regola commissione" text="Percentuale globale o specifica per isola.">
        <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); void run(() => post("/api/operations/commission-rules", { name: fd.get("name"), role: fd.get("role"), island: fd.get("island") || null, ratePercent: fd.get("ratePercent") }), "Regola commissione creata.", form); }}>
          <input name="name" placeholder="Nome regola" required />
          <select name="role" required><option value="sales">Sales</option><option value="sales_manager">Sales Manager</option><option value="distributor">Distributore</option></select>
          <select name="island"><option value="">Tutte le isole</option>{ISLANDS.map((island) => <option key={island}>{island}</option>)}</select>
          <input name="ratePercent" type="number" min="0" max="100" step="0.01" placeholder="Percentuale" required />
          <button className="primary" disabled={busy}>Salva regola</button>
        </form>
      </ActionCard>}
    </div>
    <div className="hub-two">
      <DataCard title="Movimenti wallet" count={data.walletEntries.length}>{data.walletEntries.length ? data.walletEntries.map((row) => <ListRow key={String(row.id)} title={String(row.description)} subtitle={`${row.user_name} · ${when(row.created_at)}`} meta={euros(Number(row.amount_cents))} status={String(row.status)} />) : <MiniEmpty text="I movimenti nasceranno da contratti e consegne approvate." />}</DataCard>
      <DataCard title="Richieste pagamento" count={data.payoutRequests.length}>{data.payoutRequests.length ? data.payoutRequests.map((row) => <div className="hub-list-row" key={String(row.id)}><div><strong>{row.user_name}</strong><small>{when(row.created_at)}</small></div><b>{euros(Number(row.amount_cents))}</b><span className={`module-status ${row.status}`}>{row.status}</span>{user.role === "super_admin" && row.status === "requested" && <div className="inline-actions"><button disabled={busy} onClick={() => void run(() => post("/api/operations/payout-requests/review", { id: row.id, status: "approved" }), "Pagamento approvato.")}>Approva</button><button disabled={busy} onClick={() => void run(() => post("/api/operations/payout-requests/review", { id: row.id, status: "rejected" }), "Pagamento rifiutato.")}>Rifiuta</button></div>}</div>) : <MiniEmpty text="Nessuna richiesta di pagamento." />}</DataCard>
    </div>
  </div>;
}

function InventoryPanel({ data, user, busy, run }: PanelProps) {
  const canManage = ["super_admin", "admin", "sales_manager"].includes(user.role);
  return <div className="hub-stack">
    {canManage && <ActionCard index="01" title="Nuovo spazio editoriale" text="Inventario per numero, isola e formato.">
      <form className="wide-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); void run(() => post("/api/operations/inventory", Object.fromEntries(fd)), "Spazio creato.", form); }}>
        <input name="issueLabel" placeholder="Numero (es. Settembre 2026)" required /><IslandSelect user={user} /><input name="slotCode" placeholder="Codice (es. P04-A)" required /><input name="slotName" placeholder="Nome spazio" required /><input name="widthMm" type="number" min="1" placeholder="Larghezza mm" required /><input name="heightMm" type="number" min="1" placeholder="Altezza mm" required /><button className="primary" disabled={busy}>Aggiungi spazio</button>
      </form>
    </ActionCard>}
    <div className="inventory-grid">{data.inventory.length ? data.inventory.map((row) => <article key={String(row.id)} className={`inventory-slot ${row.status}`}><header><span>{row.slot_code}</span><b>{row.status}</b></header><h3>{row.slot_name}</h3><p>{row.issue_label} · {row.island}</p><small>{row.width_mm} × {row.height_mm} mm</small>{canManage && <div className="inline-actions"><button disabled={busy} onClick={() => void run(() => post("/api/operations/inventory/status", { id: row.id, status: "held" }), "Spazio bloccato.")}>Blocca</button><button disabled={busy} onClick={() => void run(() => post("/api/operations/inventory/status", { id: row.id, status: "available" }), "Spazio liberato.")}>Libera</button></div>}</article>) : <MiniEmpty text="Crea il primo menabò commerciale." />}</div>
    <div className="bundle-strip"><div><small>Pacchetti preset</small><h2>Entry · Business · VIP</h2></div>{data.bundles.map((row) => <div key={String(row.id)}><strong>{row.name}</strong><span>{euros(Number(row.monthly_price_cents))}/mese</span><small>{row.description}</small></div>)}</div>
  </div>;
}

function GeoAuditPanel({ data, user, users, clients, deliveries, busy, run, submitPhotoAudit, submitPointRegistration, submitDeliveryCheck, submitBulkPhotoAudit }: PanelProps & {
  users: User[];
  clients: Client[];
  deliveries: Delivery[];
  submitPhotoAudit: (event: FormEvent<HTMLFormElement>) => void;
  submitPointRegistration: (event: FormEvent<HTMLFormElement>) => void;
  submitDeliveryCheck: (event: FormEvent<HTMLFormElement>) => void;
  submitBulkPhotoAudit: (
    distributorId: string,
    items: Array<{ distributionPointId: string; quantity: string; unit: string; file: File }>,
    onProgress: (index: number, status: "ok" | "error", message?: string) => void,
  ) => Promise<void>;
}) {
  const canManage = ["super_admin", "admin", "sales_manager"].includes(user.role);
  const freeConfirmationPoints = data.distributionPoints;
  const nowMs = Date.now();
  const isOverdue = (row: RecordRow) => Boolean(row.next_check_due_at) && new Date(String(row.next_check_due_at)).getTime() <= nowMs;
  return <div className="hub-stack">
    <DailyRouteCard deliveries={deliveries} user={user} />
    {user.role === "distributor" && <DistributorPointsBoard points={freeConfirmationPoints} deliveries={deliveries} busy={busy} submitPointRegistration={submitPointRegistration} submitRefill={submitPhotoAudit} submitDeliveryCheck={submitDeliveryCheck} submitAssignedDelivery={submitPhotoAudit} />}
    <div className="hub-two">
      {canManage && <ActionCard index="01" title="Punto distribuzione" text="Coordinate, capacità, stock e visibilità pubblica.">
        <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); void run(() => post("/api/operations/distribution-points", { ...Object.fromEntries(fd), publicVisible: fd.get("publicVisible") === "on" }), "Punto distribuzione creato.", form); }}>
          <input name="name" placeholder="Nome punto" required /><select name="clientId"><option value="">Nessun cliente collegato</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}</select><IslandSelect user={user} /><input name="address" placeholder="Indirizzo" required /><div className="field-pair"><input name="latitude" type="number" step="0.000001" placeholder="Latitudine" required /><input name="longitude" type="number" step="0.000001" placeholder="Longitudine" required /></div><div className="field-pair"><input name="capacity" type="number" min="0" placeholder="Capacità" required /><input name="stock" type="number" min="0" placeholder="Stock" required /></div><label className="check-line"><input type="checkbox" name="publicVisible" defaultChecked /> Visibile nella mappa pubblica</label><button className="primary" disabled={busy}>Salva punto</button>
        </form>
      </ActionCard>}
      {user.role !== "distributor" && <ActionCard index="02" title="Foto di consegna" text="Conferma una consegna già assegnata con foto, posizione e controllo geofence.">
        <form onSubmit={submitPhotoAudit}>
          <select name="deliveryId" required><option value="">Seleziona consegna</option>{deliveries.map((delivery) => <option key={delivery.id} value={delivery.id}>{delivery.client_company ?? delivery.id} · {delivery.island}</option>)}</select>
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required />
          <p className="form-microcopy">Foto, coordinate e orario vengono acquisiti insieme.</p>
          <button className="primary" disabled={busy || !deliveries.length}>Scatta foto e registra consegna</button>
        </form>
      </ActionCard>}
      {canManage && <BulkPhotoUploadCard user={user} users={users} distributionPoints={data.distributionPoints} busy={busy} onSubmit={submitBulkPhotoAudit} />}
    </div>
    <div className="hub-two">
      <DataCard title="Punti e stock" count={data.distributionPoints.length}><a className="public-map-link" href="/mappe" target="_blank" rel="noopener noreferrer">Apri mappa pubblica ↗</a>{data.distributionPoints.length ? data.distributionPoints.map((row) => <div className="hub-list-row" key={String(row.id)}><div><strong>{row.name}</strong><small>{row.address} · {row.island}{Number(row.self_registered) === 1 ? " · registrato da distributore" : ""}</small>{row.next_check_due_at && <small className={isOverdue(row) ? "ai-review" : ""}>{isOverdue(row) ? "Da controllare" : `Controllo entro ${when(row.next_check_due_at)}`}</small>}</div><b className={Number(row.stock) <= Math.max(5, Number(row.capacity) * .15) ? "low-stock" : ""}>{row.stock}/{row.capacity}</b></div>) : <MiniEmpty text="Nessun punto geolocalizzato." />}</DataCard>
      <DataCard title="Audit fotografici" count={data.photoAudits.length}>{data.photoAudits.length ? data.photoAudits.map((row) => { const ai = photoAiSummary(row); return <div className="hub-list-row audit-row" key={String(row.id)}><div><strong>{row.distributor_name}</strong><small>{row.island} · {when(row.created_at)} · distanza {row.geofence_distance_m ?? "—"} m</small>{ai && <small className={ai.verdict === "compliant_candidate" ? "ai-pass" : "ai-review"}>AI: {ai.magazinesDetected || ai.displayDetected ? "riviste/espositore rilevati" : "contenuto da verificare"} · {ai.possibleDuplicate ? "possibile duplicato" : "nessun duplicato rilevato"} · confidenza {ai.confidence}%</small>}{row.duplicate_of_audit_id && <small className="ai-review">Hash identico a una foto già registrata.</small>}</div><b>Qualità {row.quality_score}%</b><span className={`module-status ${row.status}`}>{row.status}</span>{canManage && row.status === "pending" && <div className="inline-actions"><button disabled={busy} onClick={() => void run(() => post("/api/operations/photo-audits/review", { id: row.id, status: "approved" }), "Foto approvata.")}>Approva</button><button disabled={busy} onClick={() => void run(() => post("/api/operations/photo-audits/review", { id: row.id, status: "rejected" }), "Foto rifiutata.")}>Rifiuta</button></div>}</div>; }) : <MiniEmpty text="Nessuna foto da verificare." />}</DataCard>
    </div>
    <DataCard title="Controlli ritiro" count={data.deliveryChecks.length}>{data.deliveryChecks.length ? data.deliveryChecks.map((row) => <div className="hub-list-row" key={String(row.id)}><div><strong>{row.point_name}</strong><small>{row.distributor_name ? `${row.distributor_name} · ` : ""}{when(row.created_at)} · distanza {row.geofence_distance_m ?? "—"} m</small></div><b>{row.quantity_found}/{row.quantity_left}</b><span className="module-status">prese {row.quantity_taken}</span></div>) : <MiniEmpty text="Nessun controllo di ritiro registrato." />}</DataCard>
  </div>;
}

function DistributorPointsBoard({ points, deliveries, busy, submitPointRegistration, submitRefill, submitDeliveryCheck, submitAssignedDelivery }: {
  points: RecordRow[];
  deliveries: Delivery[];
  busy: boolean;
  submitPointRegistration: (event: FormEvent<HTMLFormElement>) => void;
  submitRefill: (event: FormEvent<HTMLFormElement>) => void;
  submitDeliveryCheck: (event: FormEvent<HTMLFormElement>) => void;
  submitAssignedDelivery: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const nowMs = Date.now();
  const isOverdue = (row: RecordRow) => Boolean(row.next_check_due_at) && new Date(String(row.next_check_due_at)).getTime() <= nowMs;
  const [showNewPoint, setShowNewPoint] = useState(points.length === 0);
  const [expanded, setExpanded] = useState<{ id: string; mode: "refill" | "check" } | null>(null);
  const overdueCount = points.filter(isOverdue).length;
  const sorted = [...points].sort((a, b) => {
    const aOverdue = isOverdue(a) ? 0 : 1;
    const bOverdue = isOverdue(b) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    const aDue = a.next_check_due_at ? new Date(String(a.next_check_due_at)).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.next_check_due_at ? new Date(String(b.next_check_due_at)).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return String(a.name).localeCompare(String(b.name));
  });

  function toggle(id: string, mode: "refill" | "check") {
    setExpanded((current) => (current && current.id === id && current.mode === mode ? null : { id, mode }));
  }

  return <div className="hub-stack">
    {deliveries.length > 0 && <ActionCard index="00" title="Consegne assegnate da oggi" text="Hai consegne già pianificate dall'amministrazione: fotografa e confermale qui.">
      <form onSubmit={submitAssignedDelivery}>
        <select name="deliveryId" required><option value="">Seleziona consegna assegnata</option>{deliveries.map((delivery) => <option key={delivery.id} value={delivery.id}>{delivery.client_company ?? delivery.id}</option>)}</select>
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required />
        <button className="primary" disabled={busy}>Scatta foto e registra consegna</button>
      </form>
    </ActionCard>}
    <ActionCard index="01" title={points.length ? "Nuovo punto vendita" : "Comincia da qui"} text="Negozio mai visitato prima: nome, indirizzo, foto, quante copie lasci e quando torni a controllare.">
      {!showNewPoint
        ? <button type="button" className="primary" onClick={() => setShowNewPoint(true)}>+ Registra un nuovo punto vendita</button>
        : <form onSubmit={(event) => { submitPointRegistration(event); setShowNewPoint(false); }}>
          <input name="name" placeholder="Nome punto (es. Bar/Negozio)" required maxLength={120} />
          <input name="address" placeholder="Indirizzo o riferimento" required maxLength={260} />
          <div className="field-pair"><input name="quantity" type="number" min="1" max="1000000" defaultValue="1" placeholder="Quante copie lasci" /><input name="unit" defaultValue="copie" maxLength={30} placeholder="Unità" /></div>
          <input name="reminderDays" type="number" min="1" max="60" defaultValue="7" placeholder="Torna a controllare dopo (giorni)" />
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required />
          <p className="form-microcopy">Foto del negozio/espositore al momento della consegna. Posizione GPS acquisita automaticamente.</p>
          <div className="inline-actions">
            <button className="primary" disabled={busy}>Registra punto e prima consegna</button>
            {points.length > 0 && <button type="button" disabled={busy} onClick={() => setShowNewPoint(false)}>Annulla</button>}
          </div>
        </form>}
    </ActionCard>
    <ActionCard index="02" title="I tuoi punti vendita" text={points.length ? `${overdueCount} da controllare su ${points.length} punti totali.` : "Appariranno qui dopo la prima registrazione."}>
      {!points.length
        ? <MiniEmpty text="Nessun punto ancora: registra il primo qui sopra." />
        : sorted.map((row) => {
          const overdue = isOverdue(row);
          const rowId = String(row.id);
          return <div className="hub-list-row distributor-point-row" key={rowId} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid rgba(0,0,0,.08)" }}>
            <div style={{ flex: "1 1 200px" }}>
              <strong>{row.name}</strong>
              <small style={{ display: "block" }}>{row.address}</small>
              <small className={overdue ? "ai-review" : ""}>{overdue ? "DA CONTROLLARE" : row.next_check_due_at ? `Controllo entro ${when(row.next_check_due_at)}` : "Nessun controllo programmato"}</small>
            </div>
            <b>{row.stock}/{row.capacity}</b>
            <div className="inline-actions">
              <button type="button" disabled={busy} onClick={() => toggle(rowId, "refill")}>Rifornisci</button>
              <button type="button" disabled={busy} onClick={() => toggle(rowId, "check")}>{overdue ? "Fai il controllo" : "Controlla ora"}</button>
            </div>
            {expanded?.id === rowId && expanded.mode === "refill" && <form style={{ flexBasis: "100%" }} onSubmit={(event) => { submitRefill(event); setExpanded(null); }}>
              <input type="hidden" name="distributionPointId" value={rowId} />
              <div className="field-pair"><input name="quantity" type="number" min="1" max="1000000" defaultValue="1" placeholder="Quante copie lasci" /><input name="unit" defaultValue="copie" maxLength={30} placeholder="Unità" /></div>
              <input name="reminderDays" type="number" min="1" max="60" defaultValue="7" placeholder="Torna a controllare dopo (giorni)" />
              <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required />
              <button className="primary" disabled={busy}>Scatta foto e registra rifornimento</button>
            </form>}
            {expanded?.id === rowId && expanded.mode === "check" && <form style={{ flexBasis: "100%" }} onSubmit={(event) => { submitDeliveryCheck(event); setExpanded(null); }}>
              <input type="hidden" name="distributionPointId" value={rowId} />
              <input name="quantityFound" type="number" min="0" max="1000000" placeholder="Quante copie trovi ancora" required />
              <input name="reminderDays" type="number" min="1" max="60" defaultValue="7" placeholder="Torna a controllare dopo (giorni)" />
              <input name="notes" placeholder="Nota facoltativa" maxLength={500} />
              <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required />
              <p className="form-microcopy">Il CRM calcola quante copie sono state prese e fissa da solo il prossimo controllo.</p>
              <button className="primary" disabled={busy}>Registra controllo</button>
            </form>}
          </div>;
        })}
    </ActionCard>
  </div>;
}

type BulkPhotoRow = { key: string; distributionPointId: string; quantity: string; unit: string; file: File | null; status: "idle" | "ok" | "error"; error?: string };

function BulkPhotoUploadCard({ user, users, distributionPoints, busy, onSubmit }: {
  user: User;
  users: User[];
  distributionPoints: RecordRow[];
  busy: boolean;
  onSubmit: (
    distributorId: string,
    items: Array<{ distributionPointId: string; quantity: string; unit: string; file: File }>,
    onProgress: (index: number, status: "ok" | "error", message?: string) => void,
  ) => Promise<void>;
}) {
  const distributors = users.filter((item) => item.role === "distributor");
  const [distributorId, setDistributorId] = useState("");
  const [rows, setRows] = useState<BulkPhotoRow[]>([]);
  const selectedDistributor = distributors.find((item) => item.id === distributorId) ?? null;
  const points = selectedDistributor ? distributionPoints.filter((row) => row.island === selectedDistributor.island) : distributionPoints;

  function addFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setRows((current) => [
      ...current,
      ...Array.from(files).map((file) => ({ key: crypto.randomUUID(), distributionPointId: "", quantity: "1", unit: "copie", file, status: "idle" as const })),
    ]);
  }

  function updateRow(key: string, patch: Partial<BulkPhotoRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  async function handleSubmit() {
    setRows((current) => current.map((row) => ({ ...row, status: "idle", error: undefined })));
    await onSubmit(
      distributorId,
      rows.map((row) => ({ distributionPointId: row.distributionPointId, quantity: row.quantity, unit: row.unit, file: row.file as File })),
      (index, status, message) => {
        setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, status, error: message } : row)));
      },
    );
  }

  const ready = rows.length > 0 && rows.every((row) => row.distributionPointId && row.file instanceof File);

  return <ActionCard index="05" title="Carico multiplo" text="Seleziona un distributore e carica più foto di consegna in un'unica operazione, senza impersonazione.">
    <div className="bulk-upload-form">
      <select value={distributorId} onChange={(event) => { setDistributorId(event.target.value); setRows([]); }}>
        <option value="">Seleziona distributore</option>
        {distributors.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.island}</option>)}
      </select>
      {distributorId && <>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <span className="primary" style={{ display: "inline-block" }}>+ Aggiungi foto</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: "none" }} onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
        </label>
        {rows.map((row, index) => <div key={row.key} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid rgba(0,0,0,.08)" }}>
          <span style={{ minWidth: 18 }}>{index + 1}</span>
          <small style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{row.file?.name ?? "—"}</small>
          <select value={row.distributionPointId} onChange={(event) => updateRow(row.key, { distributionPointId: event.target.value })}>
            <option value="">Punto di distribuzione</option>
            {points.map((point) => <option key={String(point.id)} value={String(point.id)}>{point.name} · {point.address}</option>)}
          </select>
          <input type="number" min="1" max="1000000" value={row.quantity} style={{ width: 70 }} onChange={(event) => updateRow(row.key, { quantity: event.target.value })} placeholder="Quantità" />
          <input value={row.unit} maxLength={30} style={{ width: 80 }} onChange={(event) => updateRow(row.key, { unit: event.target.value })} placeholder="Unità" />
          <button type="button" onClick={() => removeRow(row.key)} disabled={busy}>✕</button>
          {row.status === "ok" && <span style={{ color: "seagreen" }}>✓ caricata</span>}
          {row.status === "error" && <span style={{ color: "crimson" }} title={row.error}>⚠ {row.error ?? "errore"}</span>}
        </div>)}
        <p className="form-microcopy">Ogni foto crea una conferma di consegna attribuita al distributore selezionato, con le coordinate del punto scelto: non serve il GPS di chi carica, perché non è sul posto.</p>
        <button type="button" className="primary" disabled={busy || !ready} onClick={() => void handleSubmit()}>Carica {rows.length || ""} foto e attribuisci</button>
      </>}
    </div>
  </ActionCard>;
}

type RouteStop = Delivery & { latitude: number; longitude: number };

function DailyRouteCard({ deliveries, user }: { deliveries: Delivery[]; user: User }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Canary", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const distributors = Array.from(new Map(deliveries.filter((item) => item.distributor_user_id).map((item) => [item.distributor_user_id!, item.distributor_name ?? "Distributore"])).entries());
  const [distributorId, setDistributorId] = useState(user.role === "distributor" ? user.id : distributors[0]?.[0] ?? "");
  const [route, setRoute] = useState<RouteStop[]>([]);
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const candidates = deliveries.filter((item) => item.distributor_user_id === distributorId && item.scheduled_for === today && item.status !== "delivered" && item.distribution_point_latitude_e6 != null && item.distribution_point_longitude_e6 != null);

  async function calculate() {
    const current = await currentLocation();
    const stops = candidates.map((item) => ({ ...item, latitude: Number(item.distribution_point_latitude_e6) / 1_000_000, longitude: Number(item.distribution_point_longitude_e6) / 1_000_000 }));
    setOrigin(current);
    setRoute(optimizeDeliveryRoute(current, stops));
  }

  const segments = origin ? buildGoogleMapsSegments(origin, route) : [];
  return <article className="module-card daily-route-card"><header><div><span className="module-index">00</span><div><h2>Percorso consegne di oggi</h2><p>{today} · ordinamento dalla posizione attuale</p></div></div><span className="route-count">{candidates.length} tappe</span></header>{user.role !== "distributor" && <select value={distributorId} onChange={(event) => { setDistributorId(event.target.value); setRoute([]); setOrigin(null); }}><option value="">Seleziona Distributore</option>{distributors.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select>}<button className="primary location-button" disabled={!candidates.length} onClick={() => void calculate()}>Ordina dalla mia posizione</button>{!candidates.length && <p className="form-microcopy">Nessuna consegna di oggi collegata a un punto autorizzato.</p>}{route.length > 0 && <><ol className="route-stop-list">{route.map((stop, index) => <li key={stop.id}><span>{index + 1}</span><div><strong>{stop.distribution_point_name ?? stop.client_company}</strong><small>{stop.distribution_point_address} · {stop.quantity} {stop.unit}</small></div><a href={pointNavigationUrl(stop)} target="_blank" rel="noopener noreferrer">Apri ↗</a></li>)}</ol><div className="route-segments">{segments.map((url, index) => <a href={url} target="_blank" rel="noopener noreferrer" key={url}>Avvia tratta {index + 1} ↗</a>)}</div><p className="form-microcopy">Le tratte sono divise in gruppi compatibili con la navigazione mobile; insieme coprono tutte le consegne ordinate.</p></>}</article>;
}

function pointNavigationUrl(stop: RouteStop) { return `https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`; }

function photoAiSummary(row: RecordRow): { verdict: string; magazinesDetected: boolean; displayDetected: boolean; possibleDuplicate: boolean; confidence: number } | null {
  if (!row.ai_result_json) return null;
  try { return JSON.parse(String(row.ai_result_json)); } catch { return null; }
}

function SalesPanel({ data, user, users, clients, busy, run }: PanelProps & { users: User[]; clients: Client[] }) {
  const canManage = ["super_admin", "admin", "sales_manager"].includes(user.role);
  const salesUsers = users.filter((item) => ["sales", "sales_manager"].includes(item.role));
  return <div className="hub-stack">
    <div className="hub-two">
      {["sales", "sales_manager"].includes(user.role) && <ActionCard index="01" title="Check-in commerciale" text="Obiettivo ore 09:00, tolleranza fino alle 09:15.">
        <button className="primary location-button" disabled={busy} onClick={() => void run(async () => { const location = await currentLocation(); await post("/api/operations/sales-checkins", location); }, "Check-in registrato.")}>Registra posizione adesso</button>
        <p className="form-microcopy">Fuori dall’area dell’isola il check-in viene marcato per verifica.</p>
      </ActionCard>}
      {canManage && <ActionCard index="02" title="Assegna doppio task" text="Visita commerciale o controllo display.">
        <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); void run(() => post("/api/operations/sales-tasks", Object.fromEntries(fd)), "Attività assegnata.", form); }}>
          <select name="userId" required><option value="">Commerciale</option>{salesUsers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.island}</option>)}</select><select name="clientId"><option value="">Nessun cliente collegato</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}</select><select name="kind"><option value="visit">Visita</option><option value="display_check">Controllo display</option></select><input name="title" placeholder="Obiettivo attività" required /><input name="scheduledFor" type="datetime-local" required /><button className="primary" disabled={busy}>Assegna</button>
        </form>
      </ActionCard>}
    </div>
    <div className="hub-two">
      <DataCard title="Attività aperte" count={data.salesTasks.filter((row) => row.status === "open").length}>{data.salesTasks.length ? data.salesTasks.map((row) => <div className="hub-list-row" key={String(row.id)}><div><strong>{row.title}</strong><small>{row.user_name} · {row.kind === "visit" ? "Visita" : "Display"} · {when(row.scheduled_for)}</small></div><span className={`module-status ${row.status}`}>{row.status}</span>{row.status === "open" && (row.user_id === user.id || canManage) && <button className="mini-complete" disabled={busy} onClick={() => void run(() => post("/api/operations/sales-tasks/complete", { id: row.id }), "Attività completata.")}>Completa</button>}</div>) : <MiniEmpty text="Nessuna attività commerciale." />}</DataCard>
      <DataCard title="Leaderboard" count={data.leaderboard.length}>{data.leaderboard.length ? data.leaderboard.map((row, index) => <div className="leader-row" key={String(row.user_id)}><span>{index + 1}</span><div><strong>{row.user_name}</strong><small>{row.island} · {row.won_count} chiusi</small></div><b>{euros(Number(row.won_value_cents))}</b></div>) : <MiniEmpty text="La classifica si alimenta con le opportunità chiuse." />}</DataCard>
    </div>
    <div className="bundle-strip"><div><small>Bundle live</small><h2>Offerta commerciale pronta</h2></div>{data.bundles.map((row) => <div key={String(row.id)}><strong>{row.name}</strong><span>{euros(Number(row.monthly_price_cents))}/mese</span><small>{row.description}</small></div>)}</div>
  </div>;
}

type PanelProps = { data: Snapshot; user: User; busy: boolean; run: (action: () => Promise<unknown>, success: string, form?: HTMLFormElement) => Promise<void> };

function ActionCard({ index, title, text, children }: { index: string; title: string; text: string; children: React.ReactNode }) {
  return <article className="module-card action-card"><header><div><span className="module-index">{index}</span><div><h2>{title}</h2><p>{text}</p></div></div></header><div className="action-body">{children}</div></article>;
}

function DataCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <article className="module-card data-module"><header><div><h2>{title}</h2></div><small>{count} record</small></header><div className="hub-list">{children}</div></article>;
}

function ListRow({ title, subtitle, meta, status }: { title: string; subtitle: string; meta: string; status: string }) {
  return <div className="hub-list-row"><div><strong>{title}</strong><small>{subtitle}</small></div><b>{meta}</b><span className={`module-status ${status}`}>{status}</span></div>;
}

function HubMetric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="hub-metric"><small>{label}</small><strong>{value}</strong><span>{note}</span></div>;
}

function Progress({ label, value }: { label: string; value: number }) {
  return <div><header><strong>{label}</strong><span>{value}%</span></header><div className="progress-track"><i style={{ width: `${value}%` }} /></div></div>;
}

function IslandSelect({ user }: { user: User }) {
  if (!["super_admin", "admin"].includes(user.role)) return <input type="hidden" name="island" value={user.island ?? ""} />;
  return <select name="island" required><option value="">Seleziona isola</option>{ISLANDS.map((island) => <option key={island}>{island}</option>)}</select>;
}

function MiniEmpty({ text }: { text: string }) { return <div className="mini-empty"><span>◇</span><p>{text}</p></div>; }

async function currentLocation(): Promise<{ latitude: number; longitude: number }> {
  if (!("geolocation" in navigator)) throw new RequestError("Geolocalizzazione non disponibile sul dispositivo.");
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    () => reject(new RequestError("Consenti l’accesso alla posizione per completare l’operazione.")),
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
  ));
}

