"use client";

import { FormEvent, useState } from "react";
import { LanguageSelector, platformOwnership, usePlatformLanguage } from "./i18n";

const ISLANDS = ["Tenerife", "Gran Canaria", "Lanzarote", "Fuerteventura", "La Palma"];

const copy = {
  it: {
    back: "Torna al sito", crm: "Accesso CRM", eyebrow: "Lavora con Vivi Le Canarie", title: "Diventa il riferimento commerciale della tua isola.",
    intro: "Cerchiamo persone dinamiche, affidabili e vicine al territorio per sviluppare relazioni con aziende e professionisti delle Canarie.",
    badge: "Collaborazione a provvigioni", badgeText: "Il compenso è legato ai risultati commerciali. Non si tratta di un’offerta di lavoro subordinato.",
    one: "Territorio", oneText: "Lavori con imprese e professionisti della tua isola.", two: "Strumenti reali", twoText: "CRM mobile, pipeline, preventivi e contratti.", three: "Supporto", threeText: "Metodo commerciale, materiali e coordinamento del team.",
    formTag: "Candidatura commerciale", formTitle: "Raccontaci chi sei.", formText: "Non serve il curriculum: bastano i tuoi contatti e una breve presentazione.",
    name: "Nome e cognome", email: "Email", phone: "Telefono", city: "Città", island: "Isola", chooseIsland: "Seleziona la tua isola", languages: "Lingue parlate", languagesHint: "Esempio: italiano, spagnolo, inglese", availability: "Quando puoi iniziare?", chooseAvailability: "Seleziona", immediate: "Subito", twoWeeks: "Entro 2 settimane", oneMonth: "Entro 1 mese", presentation: "Breve presentazione", presentationHint: "Raccontaci la tua esperienza commerciale, la conoscenza del territorio e perché vuoi collaborare con Vivi Le Canarie.",
    privacyBefore: "Acconsento al trattamento dei dati per la gestione della candidatura. Ho letto l’", privacy: "informativa privacy", submit: "Invia candidatura", submitting: "Invio in corso…", successTitle: "Candidatura ricevuta.", successText: "Admin e Super Admin la valuteranno e ti contatteranno ai recapiti indicati.", again: "Invia un’altra candidatura", error: "Non siamo riusciti a registrare la candidatura. Controlla i dati e riprova.",
  },
  es: {
    back: "Volver al sitio", crm: "Acceso CRM", eyebrow: "Trabaja con Vivi Le Canarie", title: "Conviértete en el referente comercial de tu isla.",
    intro: "Buscamos personas dinámicas, responsables y cercanas al territorio para desarrollar relaciones con empresas y profesionales de Canarias.",
    badge: "Colaboración a comisión", badgeText: "La remuneración está vinculada a los resultados comerciales. No es una oferta de empleo por cuenta ajena.",
    one: "Territorio", oneText: "Trabajas con empresas y profesionales de tu isla.", two: "Herramientas reales", twoText: "CRM móvil, pipeline, presupuestos y contratos.", three: "Apoyo", threeText: "Método comercial, materiales y coordinación del equipo.",
    formTag: "Candidatura comercial", formTitle: "Cuéntanos quién eres.", formText: "No necesitas currículum: solo tus datos de contacto y una breve presentación.",
    name: "Nombre y apellidos", email: "Email", phone: "Teléfono", city: "Ciudad", island: "Isla", chooseIsland: "Selecciona tu isla", languages: "Idiomas", languagesHint: "Ejemplo: italiano, español, inglés", availability: "¿Cuándo puedes empezar?", chooseAvailability: "Selecciona", immediate: "Inmediatamente", twoWeeks: "En 2 semanas", oneMonth: "En 1 mes", presentation: "Breve presentación", presentationHint: "Cuéntanos tu experiencia comercial, tu conocimiento del territorio y por qué quieres colaborar con Vivi Le Canarie.",
    privacyBefore: "Acepto el tratamiento de mis datos para gestionar la candidatura. He leído la ", privacy: "política de privacidad", submit: "Enviar candidatura", submitting: "Enviando…", successTitle: "Candidatura recibida.", successText: "Admin y Super Admin la evaluarán y se pondrán en contacto contigo.", again: "Enviar otra candidatura", error: "No hemos podido registrar la candidatura. Revisa los datos e inténtalo de nuevo.",
  },
  en: {
    back: "Back to website", crm: "CRM access", eyebrow: "Work with Vivi Le Canarie", title: "Become the sales representative for your island.",
    intro: "We are looking for proactive, reliable people with local knowledge to build relationships with businesses and professionals across the Canary Islands.",
    badge: "Commission-based collaboration", badgeText: "Compensation is linked to sales results. This is not an offer of salaried employment.",
    one: "Local focus", oneText: "Work with businesses and professionals on your island.", two: "Real tools", twoText: "Mobile CRM, pipeline, quotes and contracts.", three: "Support", threeText: "Sales method, materials and team coordination.",
    formTag: "Sales application", formTitle: "Tell us about yourself.", formText: "No CV required: just your contact details and a short introduction.",
    name: "Full name", email: "Email", phone: "Phone", city: "City", island: "Island", chooseIsland: "Select your island", languages: "Languages spoken", languagesHint: "Example: Italian, Spanish, English", availability: "When can you start?", chooseAvailability: "Select", immediate: "Immediately", twoWeeks: "Within 2 weeks", oneMonth: "Within 1 month", presentation: "Short introduction", presentationHint: "Tell us about your sales experience, local knowledge and why you would like to work with Vivi Le Canarie.",
    privacyBefore: "I consent to the processing of my data for this application. I have read the ", privacy: "privacy policy", submit: "Send application", submitting: "Sending…", successTitle: "Application received.", successText: "Admin and Super Admin will review it and contact you using the details provided.", again: "Send another application", error: "We could not save your application. Check your details and try again.",
  },
} as const;

export default function CareersPage() {
  const { locale } = usePlatformLanguage();
  const t = copy[locale];
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError("");
    try {
      const values = Object.fromEntries(new FormData(form).entries());
      const response = await fetch("/api/public/sales-applications", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, locale, consent: values.consent === "yes" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? t.error);
      }
      form.reset(); setSent(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
    finally { setBusy(false); }
  }

  return <main className="careers-page">
    <header className="careers-header"><a className="careers-brand" href="/landing"><img src="/brand/viv-le-canarie-icon.svg" alt="ViV! Le Canarie" /><strong>CRMVLC</strong></a><nav><LanguageSelector compact /><a href="/landing">{t.back}</a><a className="careers-login" href="/">{t.crm}</a></nav></header>
    <section className="careers-hero">
      <div className="careers-intro"><span>{t.eyebrow}</span><h1>{t.title}</h1><p>{t.intro}</p><div className="careers-commission"><strong>{t.badge}</strong><p>{t.badgeText}</p></div>
        <div className="careers-benefits"><article><b>01</b><strong>{t.one}</strong><p>{t.oneText}</p></article><article><b>02</b><strong>{t.two}</strong><p>{t.twoText}</p></article><article><b>03</b><strong>{t.three}</strong><p>{t.threeText}</p></article></div>
      </div>
      <article className="careers-form-card">
        {sent ? <div className="careers-success"><span>✓</span><h2>{t.successTitle}</h2><p>{t.successText}</p><button onClick={() => setSent(false)}>{t.again}</button></div> : <>
          <div className="careers-form-head"><span>{t.formTag}</span><h2>{t.formTitle}</h2><p>{t.formText}</p></div>
          <form onSubmit={submit}>
            <div className="careers-two"><label>{t.name}<input name="name" required maxLength={120} autoComplete="name" /></label><label>{t.email}<input name="email" type="email" required autoComplete="email" /></label></div>
            <div className="careers-two"><label>{t.phone}<input name="phone" type="tel" required maxLength={40} autoComplete="tel" /></label><label>{t.city}<input name="city" required maxLength={100} autoComplete="address-level2" /></label></div>
            <div className="careers-two"><label>{t.island}<select name="island" required defaultValue=""><option value="" disabled>{t.chooseIsland}</option>{ISLANDS.map((island) => <option key={island}>{island}</option>)}</select></label><label>{t.availability}<select name="availability" required defaultValue=""><option value="" disabled>{t.chooseAvailability}</option><option value="immediate">{t.immediate}</option><option value="two_weeks">{t.twoWeeks}</option><option value="one_month">{t.oneMonth}</option></select></label></div>
            <label>{t.languages}<input name="languages" required maxLength={180} placeholder={t.languagesHint} /></label>
            <label>{t.presentation}<textarea name="presentation" required minLength={40} maxLength={1500} rows={6} placeholder={t.presentationHint} /></label>
            <label className="careers-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
            <label className="careers-consent"><input type="checkbox" name="consent" value="yes" required /><span>{t.privacyBefore}<a href="/privacy" target="_blank">{t.privacy}</a>.</span></label>
            {error && <div className="careers-error">{error}</div>}
            <button className="careers-submit" disabled={busy}>{busy ? t.submitting : t.submit}</button>
          </form>
        </>}
      </article>
    </section>
    <footer><span>© {new Date().getFullYear()} Vivi Le Canarie</span><small>{platformOwnership(locale)}</small></footer>
  </main>;
}
