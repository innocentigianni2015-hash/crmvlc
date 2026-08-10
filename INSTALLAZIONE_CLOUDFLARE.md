# VLC OS CRM — installazione diretta nel proprio account Cloudflare

Questo archivio contiene il codice sorgente completo della versione 13 del CRM
Vivi le Canarie, inclusa la pagina pubblica `/vip`.

## Punto importante

Non è un singolo file da incollare nell'editor di Cloudflare. È un'applicazione
Workers completa che usa:

- Workers e Assets per interfaccia e API;
- D1 per utenti, CRM, contratti, consegne, VIP Pass e audit;
- R2 per PDF, firme, modelli e fotografie;
- Images per l'ottimizzazione delle immagini;
- Send Email per OTP e documenti firmati;
- un trigger programmato ogni cinque minuti per la coda email.

L'archivio non contiene password, token, documenti, dati reali, database o file
R2. Questa separazione è intenzionale: il codice può essere consegnato, mentre
i segreti e i dati aziendali non devono essere inseriti in uno ZIP.

## Requisiti

- account Cloudflare con Workers Paid;
- zona DNS `vivilecanarie.es` nello stesso account;
- Node.js 22 o successivo;
- mittente configurato e autorizzato per Cloudflare Send Email;
- terminale locale con accesso al proprio account Cloudflare.

## 1. Configurazione aziendale

Aprire `wrangler.jsonc` e valorizzare soltanto le variabili non segrete:

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "ADMIN_EMAIL": "innocentigianni@proton.me",
  "ADMIN_NAME": "Gianni Innocenti",
  "EMAIL_FROM": "INSERIRE_MITTENTE_VERIFICATO",
  "SESSION_HOURS": "12"
}
```

`EMAIL_FROM` deve essere un mittente accettato dalla configurazione email del
proprio account Cloudflare. Non dare per scontato che `contratti@proton.me` sia
utilizzabile: va verificato prima del collaudo OTP.

In produzione lasciare disattivata la modalità demo. Non aggiungere
`DEMO_MODE=true` e non riutilizzare una password condivisa per gli utenti reali.

## 2. Installazione e verifica locale

Dalla cartella del progetto:

```bash
npm ci
npm run test
npm run build
bash scripts/sites-env.sh -- npx wrangler deploy --dry-run --outdir .wrangler/dry-run
```

Il dry-run deve elencare i binding `DB`, `BUCKET`, `EMAIL`, `IMAGES` e `ASSETS`
senza errori.

## 3. Primo deploy e creazione delle risorse

```bash
npx wrangler login
npx wrangler deploy
npx wrangler d1 migrations apply vlc-os-crm --remote
```

Il primo deploy consente a Wrangler di predisporre le risorse dichiarate in
`wrangler.jsonc`. Le migrazioni creano lo schema completo e importano il listino
iniziale. Il database CRM parte senza clienti e contratti reali.

## 4. Segreti obbligatori

Generare una chiave casuale lunga, conservarla in un password manager e
inserirla nella richiesta protetta di Wrangler:

```bash
openssl rand -base64 48
npx wrangler secret put AUTH_SECRET
```

Non copiare `AUTH_SECRET` in `wrangler.jsonc`, `.env`, documentazione o Git.

## 5. WhatsApp VIP Pass

Per attivare l'invio dei coupon servono credenziali e template approvati dal
proprio account WhatsApp Business / Meta Cloud API:

```bash
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put WHATSAPP_API_URL
npx wrangler secret put WHATSAPP_TEMPLATE_NAME
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
```

Senza questi valori la directory `/vip` e i QR coupon funzionano, ma il coupon
non viene inviato automaticamente su WhatsApp.

## 6. Email OTP e contratti

Il codice usa il binding Cloudflare `EMAIL`; non si collega direttamente a un
server SMTP con username e password. Prima del collaudo:

1. configurare il servizio email compatibile nel proprio account Cloudflare;
2. verificare il mittente indicato in `EMAIL_FROM`;
3. verificare SPF, DKIM e DMARC del dominio;
4. effettuare un OTP reale e controllare la consegna del PDF firmato.

Se si vuole usare esclusivamente l'SMTP aziendale, il modulo email deve essere
adattato: il solo caricamento del codice non trasforma automaticamente il
binding `EMAIL` in una connessione SMTP.

## 7. Dominio

Dopo il deploy, nel pannello Cloudflare aprire il Worker `vlc-os-crm`, quindi
aggiungere come Custom Domain:

```text
crm.vivilecanarie.es
```

La pagina VIP sarà:

```text
https://crm.vivilecanarie.es/vip
```

Prima di collegare il dominio verificare che non sia già assegnato a un altro
Worker o servizio: un collegamento sovrapposto può interrompere il sito attuale.

## 8. Collaudo minimo prima dell'uso reale

- `/api/health` conferma database, archivio, email, amministratore e chiave;
- accesso OTP del Super Admin `innocentigianni@proton.me`;
- un utente di prova per ciascun ruolo;
- permessi verificati sulle cinque isole;
- creazione cliente, preventivo, contratto, OTP firma e PDF firmato;
- contratto firmato immutabile e nuova versione solo dal Super Admin;
- consegna assegnata e fotografia di audit;
- registrazione VIP, coupon QR, riscatto e log evento;
- invio email e WhatsApp reali;
- controllo dei log Worker senza errori.

## Contenuto funzionale conservato

- ruoli Super Admin, Sales Manager, Sales e Distributore;
- separazione dati per isola e proprietario;
- Tenerife, Gran Canaria, Lanzarote, Fuerteventura e La Palma;
- CRM, listino con IGIC, preventivi, contratti e firma con audit;
- inventario, distribuzione, fotografie e Sales Ops;
- directory VIP, registrazione, coupon QR ed eventi sponsor.

