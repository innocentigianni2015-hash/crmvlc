"use client";

import QRCode from "qrcode";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Language = "it" | "es";
type Sponsor = {
  id: string;
  name: string;
  island: string;
  category: string;
  offerTitle: string;
  discountText: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  instagramHandle: string | null;
  mapUrl: string | null;
};
type Member = { name: string; island: string; tier: string; streakMonths: number };
type DirectoryData = {
  sponsors: Sponsor[];
  categories: string[];
  islands: string[];
  member: Member | null;
  prize: { eyebrow: string; title: string; description: string };
  instagram: { handle: string; url: string };
  whatsappConfigured: boolean;
};
type Coupon = { id: string; code: string; expiresAt: string; sponsor: Sponsor };

const copy = {
  it: {
    kicker: "IL PASS UFFICIALE DI VIVI LE CANARIE",
    hero: "Più vivi le isole, più vantaggi sblocchi.",
    intro: "Offerte selezionate, esperienze locali e premi riservati alla community Vivi le Canarie.",
    activate: "Attiva gratis il VIP Pass",
    active: "Pass attivo",
    sponsors: "Sponsor VIP",
    offers: "offerte disponibili",
    allIslands: "Tutte le isole",
    allCategories: "Tutte le categorie",
    unlock: "Sblocca coupon",
    map: "Apri mappa",
    empty: "Le prime offerte VIP di questa selezione stanno arrivando.",
    emptyNote: "Cambia filtro oppure torna presto: pubblichiamo solo sponsor verificati.",
    registerTitle: "Sblocca tutti i coupon",
    registerText: "Bastano tre dati. Il tuo numero viene usato per il VIP Pass e per ricevere i coupon richiesti.",
    name: "Nome e cognome",
    phone: "Numero WhatsApp",
    island: "La tua isola",
    consent: "Accetto il regolamento VIP Pass e autorizzo l’invio dei coupon richiesti su WhatsApp.",
    confirm: "Attiva il mio VIP Pass",
    cancel: "Non ora",
    couponReady: "Coupon sbloccato",
    showCode: "Mostra questo codice in cassa",
    whatsappSent: "Lo stiamo inviando anche su WhatsApp.",
    whatsappPending: "WhatsApp non è ancora collegato: conserva questo codice.",
    expires: "Valido fino al",
    close: "Chiudi",
    streak: "streak mensile",
    instagram: "Segui @vivi_le_canarie e commenta VIVI per raddoppiare le possibilità di vincita.",
    follow: "Vai su Instagram",
    loading: "Prepariamo il tuo VIP Pass…",
  },
  es: {
    kicker: "EL PASE OFICIAL DE VIVI LE CANARIE",
    hero: "Cuanto más vives las islas, más ventajas desbloqueas.",
    intro: "Ofertas seleccionadas, experiencias locales y premios para la comunidad Vivi le Canarie.",
    activate: "Activa gratis el VIP Pass",
    active: "Pase activo",
    sponsors: "Patrocinadores VIP",
    offers: "ofertas disponibles",
    allIslands: "Todas las islas",
    allCategories: "Todas las categorías",
    unlock: "Desbloquear cupón",
    map: "Abrir mapa",
    empty: "Las primeras ofertas VIP de esta selección están llegando.",
    emptyNote: "Cambia el filtro o vuelve pronto: publicamos solo patrocinadores verificados.",
    registerTitle: "Desbloquea todos los cupones",
    registerText: "Solo necesitamos tres datos. Tu número se usa para el VIP Pass y los cupones solicitados.",
    name: "Nombre y apellidos",
    phone: "Número de WhatsApp",
    island: "Tu isla",
    consent: "Acepto las condiciones del VIP Pass y el envío por WhatsApp de los cupones solicitados.",
    confirm: "Activar mi VIP Pass",
    cancel: "Ahora no",
    couponReady: "Cupón desbloqueado",
    showCode: "Muestra este código en caja",
    whatsappSent: "También lo estamos enviando por WhatsApp.",
    whatsappPending: "WhatsApp aún no está conectado: guarda este código.",
    expires: "Válido hasta",
    close: "Cerrar",
    streak: "racha mensual",
    instagram: "Sigue @vivi_le_canarie y comenta VIVI para duplicar tus posibilidades de ganar.",
    follow: "Ir a Instagram",
    loading: "Estamos preparando tu VIP Pass…",
  },
} as const;

class ApiError extends Error {}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new ApiError(payload.error?.message ?? "Operazione non riuscita.");
  return payload;
}

export default function VipPage() {
  const [language, setLanguage] = useState<Language>("it");
  const [data, setData] = useState<DirectoryData | null>(null);
  const [island, setIsland] = useState("");
  const [category, setCategory] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [pendingSponsor, setPendingSponsor] = useState<Sponsor | null>(null);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [whatsappQueued, setWhatsappQueued] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = copy[language];

  const loadDirectory = useCallback(async () => {
    const params = new URLSearchParams();
    if (island) params.set("island", island);
    if (category) params.set("category", category);
    const result = await api<DirectoryData>(`/api/vip/directory?${params}`);
    setData(result);
  }, [category, island]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadDirectory().catch((cause) => setError(cause instanceof Error ? cause.message : "Errore temporaneo.")); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDirectory]);

  useEffect(() => {
    if (!coupon) return;
    let active = true;
    void QRCode.toDataURL(`VLCVIP:${coupon.id}:${coupon.code}`, { width: 320, margin: 1, color: { dark: "#10382fff", light: "#ffffffff" }, errorCorrectionLevel: "M" })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch(() => { if (active) setQrDataUrl(""); });
    return () => { active = false; };
  }, [coupon]);

  const visibleSponsors = useMemo(() => data?.sponsors ?? [], [data]);

  async function unlock(sponsor: Sponsor) {
    setError("");
    await track("sponsor_view", sponsor.id);
    if (!data?.member) {
      setPendingSponsor(sponsor);
      setRegistrationOpen(true);
      return;
    }
    await issueCoupon(sponsor);
  }

  async function issueCoupon(sponsor: Sponsor) {
    setBusy(true);
    try {
      const result = await api<{ coupon: Coupon; whatsappQueued: boolean }>("/api/vip/coupons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sponsorId: sponsor.id }),
      });
      setQrDataUrl("");
      setCoupon(result.coupon);
      setWhatsappQueued(result.whatsappQueued);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Coupon non disponibile."); }
    finally { setBusy(false); }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const result = await api<{ member: Member }>("/api/vip/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: values.get("name"), phone: values.get("phone"), island: values.get("island"), consent: values.get("consent") === "on" }),
      });
      setData((current) => current ? { ...current, member: result.member } : current);
      setRegistrationOpen(false);
      form.reset();
      if (pendingSponsor && pendingSponsor.island === result.member.island) await issueCoupon(pendingSponsor);
      setPendingSponsor(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Registrazione non riuscita."); }
    finally { setBusy(false); }
  }

  async function track(eventType: "sponsor_view" | "instagram_click", sponsorId?: string) {
    try {
      await api("/api/vip/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventType, sponsorId }) });
    } catch { /* analytics must never block the reader */ }
  }

  if (!data) return <main className="vip-loading"><div className="vip-mark">V</div><p>{t.loading}</p>{error && <span>{error}</span>}</main>;

  return <main className="vip-page">
    <header className="vip-topbar">
      <a className="vip-brand" href="/vip" aria-label="Vivi le Canarie VIP Pass"><span>V</span><div><strong>VIVI LE CANARIE</strong><small>VIP PASS</small></div></a>
      <div className="vip-top-actions">
        {data.member && <div className="vip-member-chip"><span>{initials(data.member.name)}</span><div><strong>{data.member.name}</strong><small>{data.member.tier === "platinum" ? "Platinum" : "VIP"} · {data.member.island}</small></div></div>}
        <div className="vip-language" aria-label="Lingua"><button className={language === "it" ? "active" : ""} onClick={() => setLanguage("it")}>IT</button><button className={language === "es" ? "active" : ""} onClick={() => setLanguage("es")}>ES</button></div>
      </div>
    </header>

    <section className="vip-hero">
      <div className="vip-hero-copy"><small>{t.kicker}</small><h1>{t.hero}</h1><p>{t.intro}</p><button onClick={() => setRegistrationOpen(true)}>{data.member ? `✓ ${t.active}` : t.activate}</button></div>
      <div className="vip-prize-card"><div className="vip-sun">✦</div><small>{data.prize.eyebrow}</small><h2>{data.prize.title}</h2><p>{data.prize.description}</p><div><strong>{data.member?.streakMonths ?? 0}</strong><span>{t.streak}</span></div></div>
    </section>

    <section className="vip-directory">
      <div className="vip-directory-head"><div><small>DIRECTORY 2026</small><h2>{t.sponsors}</h2><p>{visibleSponsors.length} {t.offers}</p></div><div className="vip-filters"><select value={island} onChange={(event) => { setIsland(event.target.value); setCategory(""); }} aria-label="Isola"><option value="">{t.allIslands}</option>{data.islands.map((item) => <option key={item}>{item}</option>)}</select><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Categoria"><option value="">{t.allCategories}</option>{data.categories.map((item) => <option key={item}>{item}</option>)}</select></div></div>

      {error && <div className="vip-error">{error}</div>}
      <div className="vip-sponsor-grid">
        {visibleSponsors.map((sponsor, index) => <article className="vip-sponsor-card" key={sponsor.id}>
          <div className={`vip-card-art art-${index % 5}`}><span>{initials(sponsor.name)}</span><small>{sponsor.island}</small></div>
          <div className="vip-card-body"><div className="vip-card-meta"><span>{sponsor.category}</span><b>{sponsor.discountText}</b></div><h3>{sponsor.name}</h3><p>{sponsor.offerTitle}</p><small>{sponsor.address ?? sponsor.island}</small><div className="vip-card-actions"><button disabled={busy} onClick={() => void unlock(sponsor)}>{t.unlock}</button>{sponsor.mapUrl && <a href={sponsor.mapUrl} target="_blank" rel="noreferrer">{t.map}</a>}</div></div>
        </article>)}
      </div>
      {!visibleSponsors.length && <div className="vip-empty"><span>V</span><h3>{t.empty}</h3><p>{t.emptyNote}</p><button onClick={() => { setIsland(""); setCategory(""); }}>{t.allIslands}</button></div>}
    </section>

    <section className="vip-instagram"><div><span>02×</span><div><small>EXTRA CHANCE</small><h2>{t.instagram}</h2></div></div><a href={data.instagram.url} target="_blank" rel="noreferrer" onClick={() => void track("instagram_click")}>{t.follow} ↗</a></section>
    <footer className="vip-footer"><div className="vip-brand light"><span>V</span><div><strong>VIVI LE CANARIE</strong><small>VIP PASS</small></div></div><p>© 2026 Vivi le Canarie · Tenerife · Gran Canaria · Lanzarote · Fuerteventura · La Palma</p></footer>

    {registrationOpen && <div className="vip-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRegistrationOpen(false); }}><section className="vip-modal" role="dialog" aria-modal="true" aria-labelledby="vip-register-title"><header><div><small>VIP PASS</small><h2 id="vip-register-title">{t.registerTitle}</h2><p>{t.registerText}</p></div><button aria-label={t.close} disabled={busy} onClick={() => setRegistrationOpen(false)}>×</button></header><form onSubmit={register}><label>{t.name}<input name="name" autoComplete="name" required maxLength={120} /></label><label>{t.phone}<input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+34 600 000 000" required /></label><label>{t.island}<select name="island" defaultValue={pendingSponsor?.island ?? island} required><option value="">—</option>{data.islands.map((item) => <option key={item}>{item}</option>)}</select></label><label className="vip-consent"><input name="consent" type="checkbox" required /><span>{t.consent}</span></label>{error && <div className="vip-form-error">{error}</div>}<button className="vip-submit" disabled={busy}>{busy ? "…" : t.confirm}</button><button type="button" className="vip-cancel" disabled={busy} onClick={() => setRegistrationOpen(false)}>{t.cancel}</button></form></section></div>}

    {coupon && <div className="vip-modal-backdrop"><section className="vip-modal coupon-modal" role="dialog" aria-modal="true" aria-labelledby="coupon-title"><header><div><small>{coupon.sponsor.name}</small><h2 id="coupon-title">{t.couponReady}</h2><p>{coupon.sponsor.offerTitle}</p></div><button aria-label={t.close} onClick={() => setCoupon(null)}>×</button></header><div className="vip-coupon-body"><div className="vip-coupon-value">{coupon.sponsor.discountText}</div>{qrDataUrl ? <Image unoptimized src={qrDataUrl} alt={`QR coupon ${coupon.code}`} width={220} height={220} /> : <div className="vip-qr-placeholder" />}<p>{t.showCode}</p><strong className="vip-code">{coupon.code}</strong><small>{t.expires} {new Intl.DateTimeFormat(language === "it" ? "it-IT" : "es-ES", { dateStyle: "long" }).format(new Date(coupon.expiresAt))}</small><div className={`vip-whatsapp-note ${whatsappQueued ? "sent" : "pending"}`}>{whatsappQueued ? t.whatsappSent : t.whatsappPending}</div><button className="vip-submit" onClick={() => setCoupon(null)}>{t.close}</button></div></section></div>}
  </main>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
