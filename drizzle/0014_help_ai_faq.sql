CREATE TABLE `faq_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `translation_group_id` text NOT NULL,
  `language` text NOT NULL CHECK (`language` IN ('it', 'es')),
  `module_key` text NOT NULL,
  `title` text NOT NULL,
  `question` text NOT NULL,
  `answer` text NOT NULL,
  `allowed_roles_json` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL CHECK (`status` IN ('draft', 'published', 'retired')),
  `version` integer DEFAULT 1 NOT NULL,
  `created_by` text REFERENCES `users`(`id`),
  `updated_by` text REFERENCES `users`(`id`),
  `approved_by` text REFERENCES `users`(`id`),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `published_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `faq_entries_version_unique` ON `faq_entries` (`translation_group_id`,`language`,`version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `faq_entries_one_published_unique` ON `faq_entries` (`translation_group_id`,`language`) WHERE `status` = 'published';
--> statement-breakpoint
CREATE INDEX `faq_entries_published_idx` ON `faq_entries` (`status`,`language`,`module_key`);
--> statement-breakpoint
CREATE TABLE `ai_interactions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `role` text NOT NULL,
  `island` text,
  `language` text NOT NULL CHECK (`language` IN ('it', 'es')),
  `module_key` text NOT NULL,
  `question` text NOT NULL,
  `answer` text NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('answered', 'escalated', 'budget_blocked', 'error')),
  `sources_json` text DEFAULT '[]' NOT NULL,
  `model` text,
  `prompt_tokens` integer DEFAULT 0 NOT NULL,
  `completion_tokens` integer DEFAULT 0 NOT NULL,
  `estimated_cost_micro_usd` integer DEFAULT 0 NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_interactions_user_idx` ON `ai_interactions` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `ai_interactions_status_idx` ON `ai_interactions` (`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `faq_tickets` (
  `id` text PRIMARY KEY NOT NULL,
  `interaction_id` text NOT NULL REFERENCES `ai_interactions`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `role` text NOT NULL,
  `island` text,
  `language` text NOT NULL CHECK (`language` IN ('it', 'es')),
  `module_key` text NOT NULL,
  `question` text NOT NULL,
  `reason` text NOT NULL,
  `status` text DEFAULT 'open' NOT NULL CHECK (`status` IN ('open', 'resolved')),
  `resolution_note` text,
  `resolved_by` text REFERENCES `users`(`id`),
  `created_at` text NOT NULL,
  `resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `faq_tickets_queue_idx` ON `faq_tickets` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `faq_tickets_user_idx` ON `faq_tickets` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `ai_monthly_usage` (
  `month_key` text PRIMARY KEY NOT NULL,
  `spent_micro_usd` integer DEFAULT 0 NOT NULL,
  `reserved_micro_usd` integer DEFAULT 0 NOT NULL,
  `request_count` integer DEFAULT 0 NOT NULL,
  `budget_micro_usd` integer DEFAULT 25000000 NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `faq_entries` (`id`,`translation_group_id`,`language`,`module_key`,`title`,`question`,`answer`,`allowed_roles_json`,`status`,`version`,`created_at`,`updated_at`,`published_at`) VALUES
('faq-it-crm-1','crm-clienti','it','crm','Gestire clienti e pipeline','Come creo o aggiorno un cliente nel CRM?','Apri 01 CRM e tocca “Nuovo cliente”. Compila azienda, referente, email, telefono, isola, valore e note. Dopo il salvataggio puoi spostare la scheda nelle fasi Primo contatto, In trattativa, Proposta, Stand-by, Chiuso o Perso. Un Sales vede i propri clienti; il Sales Manager vede quelli della propria isola e dei Sales assegnati.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-crm-1','crm-clienti','es','crm','Gestionar clientes y pipeline','¿Cómo creo o actualizo un cliente en el CRM?','Abre 01 CRM y pulsa “Nuevo cliente”. Completa empresa, contacto, email, teléfono, isla, valor y notas. Después puedes mover la ficha entre Primer contacto, En negociación, Propuesta, En espera, Ganado o Perdido. Un Sales ve sus clientes; el Sales Manager ve los de su isla y sus Sales asignados.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-it-os-1','moduli-os','it','operations','Usare i Moduli OS','A cosa servono i Moduli OS?','Apri 02 Moduli OS per sponsor e coupon VIP, commissioni, inventario pubblicitario, punti di distribuzione, audit fotografici, check-in e attività Sales. I pulsanti disponibili dipendono dal ruolo e dall’isola; se un comando non compare, il tuo account non ha quel permesso.','["all"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-os-1','moduli-os','es','operations','Usar los Módulos OS','¿Para qué sirven los Módulos OS?','Abre 02 Módulos OS para sponsors y cupones VIP, comisiones, inventario publicitario, puntos de distribución, auditorías fotográficas, check-in y tareas Sales. Los botones dependen del rol y la isla; si un comando no aparece, tu cuenta no tiene ese permiso.','["all"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-it-listino-1','listino-sconti','it','pricing','Listino, IGIC e promozioni','Come preparo un prezzo con lo sconto autorizzato?','Apri 03 Listino, scegli il formato e i mesi. Se esiste una promozione attiva autorizzata dal Super Admin, selezionala prima di emettere il preventivo. Il sistema calcola imponibile, sconto, IGIC e totale. Solo il Super Admin modifica prezzi e campagne; una promozione già usata resta nello storico e non viene riscritta.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-listino-1','listino-sconti','es','pricing','Tarifa, IGIC y promociones','¿Cómo preparo un precio con el descuento autorizado?','Abre 03 Tarifa, elige formato y meses. Si existe una promoción activa autorizada por el Super Admin, selecciónala antes de emitir el presupuesto. El sistema calcula base, descuento, IGIC y total. Solo el Super Admin modifica precios y campañas; una promoción ya utilizada permanece en el historial.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-it-preventivi-1','preventivi-pdf','it','quotes','Creare e convertire preventivi','Come emetto un preventivo e lo trasformo in contratto?','Da 03 Listino configura l’offerta e crea il preventivo. In 04 Preventivi puoi aprire il PDF e, finché è valido e non convertito, toccare “Crea contratto”. La conversione genera una bozza contrattuale collegata e congela prezzi, sconto e IGIC del momento.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-preventivi-1','preventivi-pdf','es','quotes','Crear y convertir presupuestos','¿Cómo emito un presupuesto y lo convierto en contrato?','Desde 03 Tarifa configura la oferta y crea el presupuesto. En 04 Presupuestos puedes abrir el PDF y, mientras sea válido y no esté convertido, pulsar “Crear contrato”. La conversión genera un borrador vinculado y congela precios, descuento e IGIC.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-it-contratti-1','contratti-firma','it','contracts','Contratti, OTP e firma','Come faccio firmare un contratto?','Apri 05 Contratti, crea o verifica la bozza PDF e tocca “Firma”. Inserisci nome ed email del firmatario, invia l’OTP, acquisisci la firma sullo schermo e attiva la conferma agente. Il contratto firmato e la sua evidenza di audit diventano immutabili; solo il Super Admin può annullarlo motivando e creare una nuova versione.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-contratti-1','contratti-firma','es','contracts','Contratos, OTP y firma','¿Cómo hago firmar un contrato?','Abre 05 Contratos, crea o revisa el borrador PDF y pulsa “Firmar”. Indica nombre y email del firmante, envía el OTP, recoge la firma en pantalla y activa la confirmación del agente. El contrato firmado y su auditoría quedan inmutables; solo el Super Admin puede anularlo con motivo y crear una nueva versión.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-it-consegne-1','consegne-distributori','it','distribution','Assegnare e chiudere consegne','Come funziona una consegna?','Super Admin, Admin e Sales Manager possono aprire 06 Consegne e assegnare azienda, distributore, quantità, data e contatti nel proprio perimetro. Il Distributore vede soltanto le consegne assegnate e le aziende collegate, quindi aggiorna lo stato fino a Consegnata o segnala un Problema.','["super_admin","admin","sales_manager","distributor"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-consegne-1','consegne-distributori','es','distribution','Asignar y cerrar entregas','¿Cómo funciona una entrega?','Super Admin, Admin y Sales Manager pueden abrir 06 Entregas y asignar empresa, distribuidor, cantidad, fecha y contactos dentro de su ámbito. El Distribuidor solo ve sus entregas y empresas vinculadas, actualiza el estado hasta Entregada o informa de un Problema.','["super_admin","admin","sales_manager","distributor"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-it-utenti-1','gestione-utenti','it','admin','Creare utenti e assegnare ruoli','Come registro un Sales o modifico un utente?','Apri 07 Utenti e crea l’account con nome, email, telefono, ruolo e isola. Per un Sales assegna anche il Sales Manager. Admin operativo e Super Admin possono gestire i ruoli operativi; solo il Super Admin può creare o promuovere un Admin. Dopo la creazione l’utente riceve l’email per impostare la password temporanea.','["super_admin","admin"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-utenti-1','gestione-utenti','es','admin','Crear usuarios y asignar roles','¿Cómo registro un Sales o modifico un usuario?','Abre 07 Usuarios y crea la cuenta con nombre, email, teléfono, rol e isla. Para un Sales asigna también el Sales Manager. Admin operativo y Super Admin gestionan roles operativos; solo el Super Admin puede crear o promover un Admin. El usuario recibe un email para configurar su contraseña temporal.','["super_admin","admin"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-it-audit-1','registro-audit','it','audit','Controllare audit ed email','Dove controllo le operazioni sensibili?','Il Super Admin apre 08 Audit per vedere gli ultimi eventi append-only, l’attore, l’entità e il riferimento. Qui controlla anche le email in attesa o in errore e può richiedere un nuovo tentativo. Le azioni effettuate durante Vista Sales o Vista Distributore registrano sia il Super Admin sia l’utente operativo.','["super_admin"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-audit-1','registro-audit','es','audit','Controlar auditoría y emails','¿Dónde controlo las operaciones sensibles?','El Super Admin abre 08 Auditoría para ver los últimos eventos append-only, actor, entidad y referencia. También controla emails pendientes o con error y puede reintentarlos. Las acciones realizadas en Vista Sales o Vista Distribuidor registran tanto al Super Admin como al usuario operativo.','["super_admin"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-it-sales-view-1','vista-sales','it','sales_view','Lavorare nella Vista Sales','Come verifico la dashboard reale di un Sales?','Solo il Super Admin apre 09 Vista Sales, seleziona un Sales attivo e conferma l’accesso operativo. Per massimo un’ora vede e usa tutti i moduli con i dati e i permessi reali del Sales. Le modifiche sono reali e vengono attribuite nell’audit anche al Super Admin.','["super_admin"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-sales-view-1','vista-sales','es','sales_view','Trabajar en Vista Sales','¿Cómo verifico el panel real de un Sales?','Solo el Super Admin abre 09 Vista Sales, selecciona un Sales activo y confirma el acceso operativo. Durante un máximo de una hora ve y usa todos los módulos con los datos y permisos reales del Sales. Los cambios son reales y la auditoría identifica también al Super Admin.','["super_admin"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-it-distributor-view-1','vista-distributore','it','distributor_view','Lavorare nella Vista Distributore','Come verifico la dashboard reale di un Distributore?','Solo il Super Admin apre 10 Vista Distributore, seleziona un Distributore attivo e conferma. Per massimo un’ora vede consegne, quantità, aziende e Moduli OS esattamente come quell’utente. Le modifiche sono reali e completamente registrate nell’audit.','["super_admin"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-distributor-view-1','vista-distributore','es','distributor_view','Trabajar en Vista Distribuidor','¿Cómo verifico el panel real de un Distribuidor?','Solo el Super Admin abre 10 Vista Distribuidor, selecciona un Distribuidor activo y confirma. Durante un máximo de una hora ve entregas, cantidades, empresas y Módulos OS como ese usuario. Los cambios son reales y quedan registrados en la auditoría.','["super_admin"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-it-podcast-1','calendario-podcast','it','podcast','Prenotare un podcast','Come aggiungo un appuntamento podcast?','Apri 11 Podcast e scegli ospite, tema, intervistatore, giorno e orario nel fuso delle Canarie. Ogni appuntamento dura un’ora e il sistema impedisce sovrapposizioni per lo stesso intervistatore. Puoi scegliere il formato gratuito da 1 minuto oppure il pacchetto 3–5 minuti e l’eventuale presenza Marcolifestyle.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-podcast-1','calendario-podcast','es','podcast','Reservar un podcast','¿Cómo añado una cita de podcast?','Abre 11 Podcast y elige invitado, tema, entrevistador, día y hora en el huso de Canarias. Cada cita dura una hora y el sistema evita solapamientos del mismo entrevistador. Puedes elegir el formato gratuito de 1 minuto, el paquete de 3–5 minutos y la presencia opcional de Marcolifestyle.','["super_admin","admin","sales_manager","sales"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-it-help-1','guida-ai','it','help','Usare la Guida e l’Assistente AI','Cosa può fare l’Assistente AI?','L’Assistente spiega procedure approvate e indica il modulo corretto in base al tuo ruolo. In questa prima fase non modifica dati e non esegue azioni. Se non trova una risposta sicura apre una richiesta nella coda condivisa degli Admin. Puoi usare il microfono sul telefono: CRMVLC riceve e conserva soltanto la trascrizione, mai l’audio.','["all"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-help-1','guida-ai','es','help','Usar la Guía y el Asistente IA','¿Qué puede hacer el Asistente IA?','El Asistente explica procedimientos aprobados e indica el módulo correcto según tu rol. En esta primera fase no modifica datos ni ejecuta acciones. Si no encuentra una respuesta segura abre una solicitud en la cola compartida de Admin. Puedes usar el micrófono del teléfono: CRMVLC solo recibe y conserva la transcripción, nunca el audio.','["all"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-it-pwa-1','pwa-offline','it','help','Installazione e lavoro offline','Come installo CRMVLC e cosa funziona offline?','Tocca “Installa” nella barra superiore oppure usa “Aggiungi alla schermata Home” dal browser. Offline puoi consultare l’ultima istantanea salvata e acquisire le foto previste dal flusso operativo; verranno sincronizzate al ritorno della rete. Contratti, amministrazione e Assistente AI richiedono una connessione. Dopo un’ora in background l’accesso viene bloccato.','["all"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('faq-es-pwa-1','pwa-offline','es','help','Instalación y trabajo sin conexión','¿Cómo instalo CRMVLC y qué funciona sin conexión?','Pulsa “Instalar” en la barra superior o usa “Añadir a pantalla de inicio” desde el navegador. Sin conexión puedes consultar la última copia guardada y capturar las fotos del flujo operativo; se sincronizan al volver la red. Contratos, administración y Asistente IA necesitan conexión. Tras una hora en segundo plano el acceso se bloquea.','["all"]','published',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
