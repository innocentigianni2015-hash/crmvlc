import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Vivi Le Canarie",
  description: "Informativa sul trattamento dei dati inviati tramite la landing Vivi Le Canarie.",
};

export default function PrivacyPage() {
  return (
    <div className="public-legal">
      <main className="legal-page">
        <Link className="legal-back" href="/">← Torna alla landing</Link>
        <p className="eyebrow">Informativa privacy</p>
        <h1>Come utilizziamo i dati della richiesta</h1>
        <p>Questa informativa riguarda i dati inviati attraverso il modulo “Richiedi una chiamata” di Vivi Le Canarie.</p>
        <h2>Titolare del trattamento</h2>
        <p>Canary 360 &amp; Comunication SL · NIF B56378318 · Avenida Las Americas 8, Local 396E, Arona, Santa Cruz de Tenerife.</p>
        <h2>Dati raccolti</h2>
        <p>Raccogliamo azienda, referente, telefono, email, città, isola, servizio richiesto e l’eventuale messaggio inserito.</p>
        <h2>Finalità</h2>
        <p>I dati vengono utilizzati per gestire la richiesta commerciale, assegnarla al referente dell’isola indicata e ricontattare l’interessato.</p>
        <h2>Conservazione e accesso</h2>
        <p>I dati sono accessibili soltanto al personale autorizzato e vengono conservati per il tempo necessario alla gestione della richiesta e agli eventuali obblighi applicabili.</p>
        <h2>Diritti</h2>
        <p>È possibile richiedere accesso, rettifica o cancellazione dei dati scrivendo a <a href="mailto:info@vivilecanarie.com">info@vivilecanarie.com</a>.</p>
      </main>
    </div>
  );
}
