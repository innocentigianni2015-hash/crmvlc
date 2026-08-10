# CRMVLC — CRM e contratti

Versione operativa Cloudflare Workers di CRMVLC per Tenerife, Gran Canaria, Lanzarote, Fuerteventura e La Palma.

## Funzioni attive

- autenticazione senza password tramite OTP email;
- ruoli `Super Admin`, `Sales Manager`, `Sales` e `Distributore`;
- Sales limitati ai propri clienti e contratti;
- Sales Manager limitati all'isola assegnata;
- Distributori limitati a consegne, quantità e aziende collegate agli incarichi assegnati;
- Super Admin con visibilità globale;
- CRM persistente con controllo delle modifiche concorrenti;
- listino pubblicitario importato dal PDF sorgente con 12 formati, prezzi mensili netti, calcolo IGIC al 7% e validità per tutte le cinque isole;
- calcolatore commerciale per cliente, quantità, durata e isola, con modifica prezzi riservata al Super Admin e audit di ogni variazione;
- preventivi PDF numerati progressivamente per anno, con dati cliente, prezzi, IGIC, validità e righe commerciali congelati al momento dell'emissione;
- sconti applicabili esclusivamente dal Super Admin, con motivazione obbligatoria e controllo anche lato server;
- archivio preventivi separato per ruolo e isola, download del PDF immutabile e conversione atomica in bozza contratto collegata;
- modelli contrattuali PDF/DOCX archiviati e versionati;
- caricamento del PDF definitivo del contratto;
- OTP del firmatario, firma su schermo e conferma nominativa dell'agente;
- generazione di un PDF firmato con certificato di firma allegato;
- invio della copia firmata via email con outbox e tentativi automatici ogni cinque minuti;
- documento originale, PDF firmato, immagine della firma ed evidenza JSON conservati separatamente;
- contratti firmati non modificabili e non eliminabili;
- annullamento e nuova versione consentiti soltanto al Super Admin;
- audit append-only protetto da trigger del database;
- gestione consegne con quantità, stato, referente logistico e controllo delle modifiche concorrenti.

## Servizi Cloudflare

| Binding | Servizio | Uso |
| --- | --- | --- |
| `DB` | D1 | utenti, sessioni, CRM, listino, contratti, consegne, outbox email e audit |
| `BUCKET` | R2 | modelli, PDF, firme ed evidenze |
| `EMAIL` | Email Service | OTP di accesso/firma e copia del contratto firmato |
| `ASSETS` | Workers Assets | interfaccia web |
| `IMAGES` | Images | ottimizzazione immagini Vinext |

## Configurazione obbligatoria

In `wrangler.jsonc` valorizzare:

- `ADMIN_EMAIL`: email aziendale del primo Super Admin;
- `ADMIN_NAME`: nome visualizzato del Super Admin;
- `EMAIL_FROM`: mittente verificato in Cloudflare Email Service;
- `SESSION_HOURS`: durata della sessione, predefinita a 12 ore.

Non inserire `AUTH_SECRET` nel file. Deve essere salvato come secret Cloudflare.

## Pubblicazione nell'account Cloudflare

```bash
npm ci
npm run cloudflare:types
npm run test:unit
npm run build
npx wrangler login
npx wrangler deploy
npx wrangler secret put AUTH_SECRET
npx wrangler d1 migrations apply vlc-os-crm --remote
```

Usare per `AUTH_SECRET` una stringa casuale di almeno 32 byte. Dopo la migrazione aprire `/api/health`: tutti i valori in `configured` devono risultare `true`.

Prima di inviare email reali, il dominio deve essere attivo in Cloudflare Email Service con SPF, DKIM, DMARC e mittente verificato.

## Verifiche

```bash
npm run test:unit
npx tsc --noEmit
npm run lint
npm run cloudflare:dry-run
```

Il collaudo produttivo deve includere almeno un utente per ruolo, un cliente per isola, una consegna assegnata, un contratto di prova, ricezione OTP, firma, ricezione della copia firmata, verifica dell'evidenza e annullamento con nuova versione.
