"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useMemo, useState } from "react";
import { platformOwnership, usePlatformLanguage } from "./i18n";

type Service = "magazine" | "podcast" | "both";

const islands = [
  "Tenerife",
  "Gran Canaria",
  "Lanzarote",
  "Fuerteventura",
  "La Palma",
] as const;

const copy = {
  it: {
    navServices: "Opportunità",
    navAbout: "Chi siamo",
    navMethod: "Come funziona",
    navContact: "Contatti",
    crm: "Accesso CRM",
    eyebrow: "Vivi Le Canarie · Media per imprese locali",
    titleTop: "Il tuo brand,",
    titleAccent: "davanti alle persone",
    titleBottom: "che vivono le Canarie.",
    intro:
      "Raccontiamo aziende, professionisti e luoghi attraverso la rivista Vivi Le Canarie e format podcast costruiti per farsi ricordare.",
    primaryCta: "Richiedi una chiamata",
    secondaryCta: "Scopri le opportunità",
    coverAlt: "Copertina di Vivi Le Canarie, edizione agosto 2026",
    insideAlt: "Pagina due di Vivi Le Canarie, edizione agosto 2026",
    proofOne: "5 isole",
    proofOneText: "una rete commerciale locale",
    proofTwo: "IT · ES · EN",
    proofTwoText: "comunicazione trilingue",
    proofThree: "Rivista + video",
    proofThreeText: "una storia, più canali",
    featureLabel: "Visibilità che parte dal territorio",
    featureTitle: "Non vendiamo spazi. Costruiamo attenzione.",
    featureText:
      "Partiamo dal pubblico, dall’isola e dall’obiettivo della tua impresa. Per questo non troverai un prezzo standard: prima capiamo cosa deve produrre la campagna.",
    magazineTag: "01 · Rivista",
    magazineTitle: "Pubblicità sulla rivista",
    magazineText:
      "Presenza editoriale e pubblicitaria pensata per imprese che vogliono essere riconosciute da residenti, visitatori e comunità italiane nelle Canarie.",
    magazinePoints: [
      "Campagna costruita sull’isola e sul pubblico",
      "Supporto nella definizione del messaggio",
      "Possibilità di integrare contenuti e video",
    ],
    magazineCta: "Parliamo della rivista",
    podcastTag: "02 · Podcast",
    podcastTitle: "Porta la tua storia davanti alle telecamere",
    podcastText:
      "Dal contenuto rapido al racconto completo: scegliamo insieme il formato capace di trasformare un’intervista in un vero punto di contatto.",
    podcastFormats: [
      "1 minuto · 1 telecamera",
      "3–5 minuti · 3 telecamere e montaggio",
      "Format speciale con MarcoLifestyle",
    ],
    podcastCta: "Parliamo del podcast",
    aboutLabel: "Direzione e gestione",
    aboutTitle: "Persone, territorio e una visione editoriale concreta.",
    aboutText: "Vivi Le Canarie unisce esperienza gestionale, produzione, comunicazione e sviluppo commerciale per raccontare le imprese e le comunità dell’arcipelago.",
    gianniRole: "Direzione gestionale e commerciale",
    gianniBio: "Managing Director e cofondatore di LAVISIONARIA. In Vivi Le Canarie coordina organizzazione, sviluppo, partnership e rete commerciale.",
    marcoRole: "Direzione editoriale e immagine",
    marcoBio: "Presidente e cofondatore di LAVISIONARIA, Executive Producer. In Vivi Le Canarie guida identità, contenuti, relazioni e sviluppo dei format.",
    aboutSource: "Conosci anche il progetto LAVISIONARIA",
    methodLabel: "Il metodo",
    methodTitle: "Una richiesta. Il referente giusto. Nessun giro a vuoto.",
    steps: [
      ["01", "Scegli l’obiettivo", "Rivista, podcast o una campagna integrata."],
      ["02", "Indicaci la tua isola", "La richiesta viene indirizzata al team commerciale locale."],
      ["03", "Parliamo del progetto", "Un consulente ti richiama e costruisce la proposta con te."],
    ],
    formKicker: "Richiedi una chiamata",
    formTitle: "Raccontaci dove vuoi arrivare.",
    formText:
      "Nessun preventivo automatico e nessun pacchetto imposto. Ti contattiamo per capire obiettivo, pubblico e territorio.",
    company: "Azienda",
    contact: "Nome e cognome",
    phone: "Telefono",
    email: "Email",
    city: "Città",
    island: "Isola",
    chooseIsland: "Seleziona l’isola",
    service: "Di cosa vuoi parlare?",
    magazineOption: "Pubblicità sulla rivista",
    podcastOption: "Pacchetto podcast",
    bothOption: "Entrambi",
    notes: "Cosa vuoi ottenere? (facoltativo)",
    notesPlaceholder: "Descrivi in poche parole il tuo obiettivo...",
    privacyBefore: "Acconsento al trattamento dei dati per essere ricontattato. Ho letto l’",
    privacyLink: "informativa privacy",
    submit: "Invia la richiesta",
    submitting: "Invio in corso…",
    successTitle: "Richiesta ricevuta.",
    successText:
      "Il team commerciale della tua isola prenderà in carico la richiesta e ti contatterà.",
    another: "Invia un’altra richiesta",
    error: "Non siamo riusciti a registrare la richiesta. Riprova tra poco.",
    contactDirect: "Preferisci scriverci subito?",
    whatsapp: "WhatsApp +34 602 576 044",
    footerText: "Media, territorio e imprese nelle Canarie.",
    privacy: "Privacy",
    maps: "Punti di distribuzione",
  },
  es: {
    navServices: "Oportunidades",
    navAbout: "Quiénes somos",
    navMethod: "Cómo funciona",
    navContact: "Contacto",
    crm: "Acceso CRM",
    eyebrow: "Vivi Le Canarie · Medios para empresas locales",
    titleTop: "Tu marca,",
    titleAccent: "delante de las personas",
    titleBottom: "que viven Canarias.",
    intro:
      "Contamos empresas, profesionales y lugares a través de la revista Vivi Le Canarie y formatos de pódcast creados para dejar huella.",
    primaryCta: "Solicitar una llamada",
    secondaryCta: "Ver oportunidades",
    coverAlt: "Portada de Vivi Le Canarie, edición de agosto de 2026",
    insideAlt: "Página dos de Vivi Le Canarie, edición de agosto de 2026",
    proofOne: "5 islas",
    proofOneText: "una red comercial local",
    proofTwo: "IT · ES · EN",
    proofTwoText: "comunicación trilingüe",
    proofThree: "Revista + vídeo",
    proofThreeText: "una historia, más canales",
    featureLabel: "Visibilidad desde el territorio",
    featureTitle: "No vendemos espacios. Creamos atención.",
    featureText:
      "Partimos del público, de la isla y del objetivo de tu empresa. Por eso no encontrarás un precio estándar: primero entendemos qué debe producir la campaña.",
    magazineTag: "01 · Revista",
    magazineTitle: "Publicidad en la revista",
    magazineText:
      "Presencia editorial y publicitaria para empresas que quieren ser reconocidas por residentes, visitantes y comunidades italianas en Canarias.",
    magazinePoints: [
      "Campaña adaptada a la isla y al público",
      "Apoyo para definir el mensaje",
      "Posibilidad de integrar contenidos y vídeo",
    ],
    magazineCta: "Hablemos de la revista",
    podcastTag: "02 · Pódcast",
    podcastTitle: "Lleva tu historia delante de las cámaras",
    podcastText:
      "Desde un contenido rápido hasta una historia completa: elegimos el formato que convierte una entrevista en un punto de contacto real.",
    podcastFormats: [
      "1 minuto · 1 cámara",
      "3–5 minutos · 3 cámaras y edición",
      "Formato especial con MarcoLifestyle",
    ],
    podcastCta: "Hablemos del pódcast",
    aboutLabel: "Dirección y gestión",
    aboutTitle: "Equipo, territorio y una visión editorial concreta.",
    aboutText: "Vivi Le Canarie une experiencia de gestión, producción, comunicación y desarrollo comercial para contar las empresas y comunidades del archipiélago.",
    gianniRole: "Dirección de gestión y comercial",
    gianniBio: "Managing Director y cofundador de LAVISIONARIA. En Vivi Le Canarie coordina organización, desarrollo, alianzas y red comercial.",
    marcoRole: "Dirección editorial e imagen",
    marcoBio: "Presidente y cofundador de LAVISIONARIA, Executive Producer. En Vivi Le Canarie dirige identidad, contenidos, relaciones y desarrollo de formatos.",
    aboutSource: "Conoce también el proyecto LAVISIONARIA",
    methodLabel: "El método",
    methodTitle: "Una solicitud. La persona adecuada. Sin vueltas.",
    steps: [
      ["01", "Elige el objetivo", "Revista, pódcast o una campaña integrada."],
      ["02", "Indica tu isla", "La solicitud se dirige al equipo comercial local."],
      ["03", "Hablemos del proyecto", "Un asesor te llama y crea la propuesta contigo."],
    ],
    formKicker: "Solicitar una llamada",
    formTitle: "Cuéntanos adónde quieres llegar.",
    formText:
      "Sin presupuesto automático y sin paquetes impuestos. Te contactamos para entender objetivo, público y territorio.",
    company: "Empresa",
    contact: "Nombre y apellidos",
    phone: "Teléfono",
    email: "Email",
    city: "Ciudad",
    island: "Isla",
    chooseIsland: "Selecciona la isla",
    service: "¿De qué quieres hablar?",
    magazineOption: "Publicidad en la revista",
    podcastOption: "Paquete pódcast",
    bothOption: "Ambos",
    notes: "¿Qué quieres conseguir? (opcional)",
    notesPlaceholder: "Describe brevemente tu objetivo...",
    privacyBefore: "Acepto el tratamiento de mis datos para recibir una llamada. He leído la ",
    privacyLink: "política de privacidad",
    submit: "Enviar solicitud",
    submitting: "Enviando…",
    successTitle: "Solicitud recibida.",
    successText:
      "El equipo comercial de tu isla gestionará la solicitud y se pondrá en contacto contigo.",
    another: "Enviar otra solicitud",
    error: "No hemos podido registrar la solicitud. Inténtalo de nuevo en unos minutos.",
    contactDirect: "¿Prefieres escribirnos ahora?",
    whatsapp: "WhatsApp +34 602 576 044",
    footerText: "Medios, territorio y empresas en Canarias.",
    privacy: "Privacidad",
    maps: "Puntos de distribución",
  },
  en: {
    navServices: "Opportunities",
    navAbout: "About us",
    navMethod: "How it works",
    navContact: "Contact",
    crm: "CRM access",
    eyebrow: "Vivi Le Canarie · Media for local businesses",
    titleTop: "Your brand,",
    titleAccent: "in front of the people",
    titleBottom: "who live in the Canary Islands.",
    intro: "We tell the stories of businesses, professionals and places through Vivi Le Canarie magazine and memorable podcast formats.",
    primaryCta: "Request a call",
    secondaryCta: "View opportunities",
    coverAlt: "Vivi Le Canarie magazine cover, August 2026 edition",
    insideAlt: "Page two of Vivi Le Canarie, August 2026 edition",
    proofOne: "5 islands",
    proofOneText: "one local sales network",
    proofTwo: "IT · ES · EN",
    proofTwoText: "trilingual communication",
    proofThree: "Magazine + video",
    proofThreeText: "one story, more channels",
    featureLabel: "Visibility rooted in the territory",
    featureTitle: "We do not sell space. We build attention.",
    featureText: "We start with your audience, island and business goal. That is why there is no standard price: first we understand what the campaign needs to achieve.",
    magazineTag: "01 · Magazine",
    magazineTitle: "Magazine advertising",
    magazineText: "Editorial and advertising presence for businesses that want to be recognised by residents, visitors and Italian communities in the Canary Islands.",
    magazinePoints: ["A campaign tailored to the island and audience", "Support defining the message", "Option to integrate content and video"],
    magazineCta: "Discuss the magazine",
    podcastTag: "02 · Podcast",
    podcastTitle: "Put your story in front of the cameras",
    podcastText: "From quick content to a complete story, we choose the format that turns an interview into a genuine point of contact.",
    podcastFormats: ["1 minute · 1 camera", "3–5 minutes · 3 cameras and editing", "Special format with MarcoLifestyle"],
    podcastCta: "Discuss the podcast",
    aboutLabel: "Direction and management",
    aboutTitle: "People, territory and a clear editorial vision.",
    aboutText: "Vivi Le Canarie combines management, production, communication and business development expertise to tell the stories of the archipelago’s companies and communities.",
    gianniRole: "Management and commercial direction",
    gianniBio: "Managing Director and co-founder of LAVISIONARIA. At Vivi Le Canarie he coordinates operations, development, partnerships and the sales network.",
    marcoRole: "Editorial and image direction",
    marcoBio: "President and co-founder of LAVISIONARIA, Executive Producer. At Vivi Le Canarie he leads identity, content, relationships and format development.",
    aboutSource: "Discover the LAVISIONARIA project",
    methodLabel: "The method",
    methodTitle: "One request. The right contact. No runaround.",
    steps: [["01", "Choose your goal", "Magazine, podcast or an integrated campaign."], ["02", "Tell us your island", "The request goes to the local sales team."], ["03", "Discuss the project", "An adviser calls you and builds the proposal with you."]],
    formKicker: "Request a call",
    formTitle: "Tell us where you want to go.",
    formText: "No automatic quote and no imposed package. We contact you to understand your objective, audience and territory.",
    company: "Company",
    contact: "Full name",
    phone: "Phone",
    email: "Email",
    city: "City",
    island: "Island",
    chooseIsland: "Select the island",
    service: "What would you like to discuss?",
    magazineOption: "Magazine advertising",
    podcastOption: "Podcast package",
    bothOption: "Both",
    notes: "What would you like to achieve? (optional)",
    notesPlaceholder: "Briefly describe your objective...",
    privacyBefore: "I consent to the processing of my data so that I can be contacted. I have read the ",
    privacyLink: "privacy policy",
    submit: "Send request",
    submitting: "Sending…",
    successTitle: "Request received.",
    successText: "The sales team for your island will manage your request and contact you.",
    another: "Send another request",
    error: "We could not register your request. Please try again shortly.",
    contactDirect: "Would you rather message us now?",
    whatsapp: "WhatsApp +34 602 576 044",
    footerText: "Media, territory and businesses in the Canary Islands.",
    privacy: "Privacy",
    maps: "Distribution points",
  },
} as const;

export default function PublicLanding() {
  const { locale, setLocale } = usePlatformLanguage();
  const [service, setService] = useState<Service>("magazine");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const t = copy[locale];
  const year = useMemo(() => new Date().getFullYear(), []);

  function selectService(next: Service) {
    setService(next);
    document.getElementById("contatti")?.scrollIntoView({ behavior: "smooth" });
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, locale, service, consent: formData.get("consent") === "on" }),
      });
      if (!response.ok) throw new Error("lead_submission_failed");
      form.reset();
      setService("magazine");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="public-landing">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Vivi Le Canarie — home">
          <img src="/brand/viv-le-canarie-icon.svg" alt="Vivi Le Canarie" />
        </a>
        <nav className="desktop-nav" aria-label="Navigazione principale">
          <a href="#opportunita">{t.navServices}</a>
          <a href="#chi-siamo">{t.navAbout}</a>
          <a href="#metodo">{t.navMethod}</a>
          <a href="#contatti">{t.navContact}</a>
        </nav>
        <div className="header-actions">
          <div className="language-switch" aria-label="Lingua">
            <button className={locale === "it" ? "active" : ""} onClick={() => setLocale("it")} aria-pressed={locale === "it"}>IT</button>
            <span>/</span>
            <button className={locale === "es" ? "active" : ""} onClick={() => setLocale("es")} aria-pressed={locale === "es"}>ES</button>
            <span>/</span>
            <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")} aria-pressed={locale === "en"}>EN</button>
          </div>
          <a className="crm-link" href="/login">{t.crm}</a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{t.titleTop}<br /><em>{t.titleAccent}</em><br />{t.titleBottom}</h1>
          <p className="hero-intro">{t.intro}</p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={() => document.getElementById("contatti")?.scrollIntoView({ behavior: "smooth" })}>{t.primaryCta}<span aria-hidden="true">↗</span></button>
            <a className="button button-secondary" href="#opportunita">{t.secondaryCta}</a>
          </div>
        </div>
        <div className="hero-visual">
          <div className="sun-disc" aria-hidden="true" />
          <a className="editorial-card card-back magazine-page-link" href="https://www.vivilecanarie.com/" target="_blank" rel="noreferrer">
            <img
              src="/brand/vlc-08-2026-page-02.jpg"
              alt={t.insideAlt}
              width="1124"
              height="1400"
              loading="eager"
              decoding="async"
            />
          </a>
          <a className="editorial-card card-front magazine-page-link" href="https://www.vivilecanarie.com/" target="_blank" rel="noreferrer">
            <img
              src="/brand/vlc-08-2026-cover.jpg"
              alt={t.coverAlt}
              width="1124"
              height="1400"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </a>
          <a className="location-chip" href="https://www.vivilecanarie.com/" target="_blank" rel="noreferrer">VIVILECANARIE.COM ↗</a>
        </div>
      </section>

      <section className="proof-strip" aria-label="Copertura">
        <div><strong>{t.proofOne}</strong><span>{t.proofOneText}</span></div>
        <div><strong>{t.proofTwo}</strong><span>{t.proofTwoText}</span></div>
        <div><strong>{t.proofThree}</strong><span>{t.proofThreeText}</span></div>
      </section>

      <section className="services-section" id="opportunita">
        <div className="section-heading">
          <p className="eyebrow">{t.featureLabel}</p>
          <h2>{t.featureTitle}</h2>
          <p>{t.featureText}</p>
        </div>

        <div className="service-grid">
          <article className="service-card service-magazine">
            <div>
              <span className="service-tag">{t.magazineTag}</span>
              <h3>{t.magazineTitle}</h3>
              <p>{t.magazineText}</p>
              <ul>{t.magazinePoints.map((point) => <li key={point}>{point}</li>)}</ul>
            </div>
            <button onClick={() => selectService("magazine")}>{t.magazineCta}<span aria-hidden="true">→</span></button>
          </article>

          <article className="service-card service-podcast">
            <div className="camera-mark" aria-hidden="true"><span /><span /><span /></div>
            <div>
              <span className="service-tag">{t.podcastTag}</span>
              <h3>{t.podcastTitle}</h3>
              <p>{t.podcastText}</p>
              <ul>{t.podcastFormats.map((point) => <li key={point}>{point}</li>)}</ul>
            </div>
            <button onClick={() => selectService("podcast")}>{t.podcastCta}<span aria-hidden="true">→</span></button>
          </article>
        </div>
      </section>

      <section className="about-section" id="chi-siamo">
        <div className="about-heading">
          <p className="eyebrow">{t.aboutLabel}</p>
          <h2>{t.aboutTitle}</h2>
          <p>{t.aboutText}</p>
        </div>
        <div className="about-grid">
          <article className="about-card about-gianni">
            <span className="profile-number">01</span>
            <p className="profile-role">{t.gianniRole}</p>
            <h3>Gianni Innocenti</h3>
            <p>{t.gianniBio}</p>
          </article>
          <article className="about-card about-marco">
            <span className="profile-number">02</span>
            <p className="profile-role">{t.marcoRole}</p>
            <h3>MarcoLifestyle</h3>
            <p>{t.marcoBio}</p>
          </article>
        </div>
        <a className="about-source" href="https://lavisionaria.com/tenerife" target="_blank" rel="noreferrer">{t.aboutSource}<span aria-hidden="true">↗</span></a>
      </section>

      <section className="method-section" id="metodo">
        <div className="method-intro">
          <p className="eyebrow">{t.methodLabel}</p>
          <h2>{t.methodTitle}</h2>
        </div>
        <div className="steps">
          {t.steps.map(([number, title, text]) => (
            <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>
          ))}
        </div>
      </section>

      <section className="contact-section" id="contatti">
        <div className="contact-copy">
          <p className="eyebrow">{t.formKicker}</p>
          <h2>{t.formTitle}</h2>
          <p>{t.formText}</p>
          <div className="direct-contact">
            <span>{t.contactDirect}</span>
            <a href="https://wa.me/34602576044" target="_blank" rel="noreferrer">{t.whatsapp}<span aria-hidden="true">↗</span></a>
          </div>
        </div>

        <div className="form-card">
          {status === "success" ? (
            <div className="success-state" role="status">
              <div className="success-mark">✓</div>
              <h3>{t.successTitle}</h3>
              <p>{t.successText}</p>
              <button className="button button-primary" onClick={() => setStatus("idle")}>{t.another}</button>
            </div>
          ) : (
            <form onSubmit={submitLead}>
              <div className="form-row">
                <label>{t.company}<input name="company" required maxLength={120} autoComplete="organization" /></label>
                <label>{t.contact}<input name="contact" required maxLength={120} autoComplete="name" /></label>
              </div>
              <div className="form-row">
                <label>{t.phone}<input name="phone" required maxLength={40} inputMode="tel" autoComplete="tel" /></label>
                <label>{t.email}<input name="email" required maxLength={160} type="email" autoComplete="email" /></label>
              </div>
              <div className="form-row">
                <label>{t.city}<input name="city" required maxLength={100} autoComplete="address-level2" /></label>
                <label>{t.island}<select name="island" required defaultValue=""><option value="" disabled>{t.chooseIsland}</option>{islands.map((island) => <option key={island} value={island}>{island}</option>)}</select></label>
              </div>
              <fieldset>
                <legend>{t.service}</legend>
                <div className="service-options">
                  <label className={service === "magazine" ? "selected" : ""}><input type="radio" name="serviceChoice" value="magazine" checked={service === "magazine"} onChange={() => setService("magazine")} /><span>{t.magazineOption}</span></label>
                  <label className={service === "podcast" ? "selected" : ""}><input type="radio" name="serviceChoice" value="podcast" checked={service === "podcast"} onChange={() => setService("podcast")} /><span>{t.podcastOption}</span></label>
                  <label className={service === "both" ? "selected" : ""}><input type="radio" name="serviceChoice" value="both" checked={service === "both"} onChange={() => setService("both")} /><span>{t.bothOption}</span></label>
                </div>
              </fieldset>
              <label>{t.notes}<textarea name="notes" maxLength={1000} rows={4} placeholder={t.notesPlaceholder} /></label>
              <label className="honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
              <label className="consent"><input name="consent" type="checkbox" required /><span>{t.privacyBefore}<a href="/privacy">{t.privacyLink}</a>.</span></label>
              {status === "error" && <p className="form-error" role="alert">{t.error}</p>}
              <button className="button button-primary submit-button" type="submit" disabled={status === "submitting"}>{status === "submitting" ? t.submitting : t.submit}<span aria-hidden="true">↗</span></button>
            </form>
          )}
        </div>
      </section>

      <footer>
        <div className="footer-brand"><img src="/brand/viv-le-canarie-icon.svg" alt="Vivi Le Canarie" /><p>{t.footerText}</p></div>
        <div className="footer-links"><a href="https://www.vivilecanarie.com/" target="_blank" rel="noreferrer">Vivi Le Canarie ↗</a><a href="#chi-siamo">{t.navAbout}</a><a href="/mappe">{t.maps}</a><a href="/privacy">{t.privacy}</a><a href="/login">{t.crm}</a><span>© {year} VIV!</span></div>
        <p className="footer-owner">{platformOwnership(locale)}</p>
      </footer>
    </main>
  );
}
