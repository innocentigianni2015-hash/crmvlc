-- Riscrive le FAQ operative con istruzioni brevi, numerate e comprensibili
-- anche a chi usa il CRM per la prima volta.

UPDATE `faq_entries` SET
  `title` = CASE `translation_group_id`
    WHEN 'crm-clienti' THEN 'Clienti: cosa devo fare'
    WHEN 'moduli-os' THEN 'Moduli OS: guida facile'
    WHEN 'listino-sconti' THEN 'Prezzi e sconti: guida facile'
    WHEN 'preventivi-pdf' THEN 'Creare un preventivo'
    WHEN 'contratti-firma' THEN 'Far firmare un contratto'
    WHEN 'consegne-distributori' THEN 'Gestire una consegna'
    WHEN 'gestione-utenti' THEN 'Creare un utente'
    WHEN 'registro-audit' THEN 'Controllare cosa è successo'
    WHEN 'vista-sales' THEN 'Entrare come Sales'
    WHEN 'vista-distributore' THEN 'Entrare come Distributore'
    WHEN 'calendario-podcast' THEN 'Prenotare un podcast'
    WHEN 'guida-ai' THEN 'Chiedere aiuto'
    WHEN 'pwa-offline' THEN 'Installare il CRM sul telefono'
  END,
  `question` = CASE `translation_group_id`
    WHEN 'crm-clienti' THEN 'Come inserisco un cliente?'
    WHEN 'moduli-os' THEN 'Dove trovo punti, foto e attività operative?'
    WHEN 'listino-sconti' THEN 'Come preparo un prezzo e applico uno sconto?'
    WHEN 'preventivi-pdf' THEN 'Come creo il PDF del preventivo?'
    WHEN 'contratti-firma' THEN 'Come faccio firmare il contratto?'
    WHEN 'consegne-distributori' THEN 'Come assegno e completo una consegna?'
    WHEN 'gestione-utenti' THEN 'Come creo un nuovo utente?'
    WHEN 'registro-audit' THEN 'Come controllo modifiche ed email?'
    WHEN 'vista-sales' THEN 'Come vedo il CRM come un Sales?'
    WHEN 'vista-distributore' THEN 'Come vedo il CRM come un Distributore?'
    WHEN 'calendario-podcast' THEN 'Come prenoto un appuntamento podcast?'
    WHEN 'guida-ai' THEN 'Cosa faccio se non so usare una funzione?'
    WHEN 'pwa-offline' THEN 'Come metto il CRM sul telefono?'
  END,
  `answer` = replace(CASE `translation_group_id`
    WHEN 'crm-clienti' THEN '1. Apri 01 CRM.\n2. Premi “Nuovo cliente”.\n3. Scrivi i dati richiesti.\n4. Premi Salva.\n5. Quando cambia la trattativa, apri il cliente e cambia la fase.'
    WHEN 'moduli-os' THEN '1. Apri 02 Moduli OS.\n2. Scegli la scheda che ti serve.\n3. Per un luogo usa “Punti di distribuzione”.\n4. Per una foto usa “Audit foto”.\n5. Compila i campi e premi Salva. Se non vedi un pulsante, il tuo ruolo non può usarlo.'
    WHEN 'listino-sconti' THEN '1. Apri 03 Listino.\n2. Scegli il cliente.\n3. Scegli uno o più pacchetti e la quantità.\n4. Indica i mesi.\n5. Se vuoi, scegli una promozione oppure scrivi lo sconto manuale e il motivo.\n6. Controlla il totale. Admin e Super Admin possono anche cambiare prezzi e campagne.'
    WHEN 'preventivi-pdf' THEN '1. Prepara l’offerta in 03 Listino.\n2. Premi “Genera preventivo PDF”.\n3. Apri 04 Preventivi per vedere il documento.\n4. Se il cliente accetta, premi “Crea contratto”.'
    WHEN 'contratti-firma' THEN '1. Apri 05 Contratti.\n2. Apri il contratto giusto.\n3. Premi “Firma”.\n4. Scrivi nome ed email del cliente.\n5. Invia il codice OTP.\n6. Inserisci il codice, raccogli la firma e conferma.'
    WHEN 'consegne-distributori' THEN '1. Apri 06 Consegne.\n2. Premi “Nuova consegna”.\n3. Scegli azienda, Distributore, punto, quantità e data.\n4. Premi “Assegna consegna”.\n5. Il Distributore apre la consegna e cambia lo stato. Il luogo è nel punto di distribuzione; le foto si caricano in 02 Moduli OS → Audit foto.'
    WHEN 'gestione-utenti' THEN '1. Apri 07 Utenti.\n2. Premi “Nuovo utente”.\n3. Scrivi nome, email, telefono, ruolo e isola.\n4. Se è un Sales, scegli anche il Sales Manager.\n5. Premi “Crea utente”.\n6. Il CRM invia automaticamente un’email: il link per scegliere la password vale 48 ore.'
    WHEN 'registro-audit' THEN '1. Apri 08 Audit.\n2. Cerca la riga con la data e l’utente che ti interessano.\n3. Leggi l’azione registrata.\n4. Se un’email è in errore, premi “Riprova”. Questa pagina è disponibile al Super Admin.'
    WHEN 'vista-sales' THEN '1. Apri 09 Vista Sales.\n2. Scegli il Sales.\n3. Spunta la conferma.\n4. Premi “Lavora come Sales”.\n5. Controlla o lavora con i suoi permessi reali.\n6. Alla fine premi “Torna Admin”. Le modifiche sono reali e registrate.'
    WHEN 'vista-distributore' THEN '1. Apri 10 Vista Distributore.\n2. Scegli il Distributore.\n3. Spunta la conferma.\n4. Premi “Lavora come Distributore”.\n5. Controlla le consegne che vede.\n6. Alla fine premi “Torna Admin”. Le modifiche sono reali e registrate.'
    WHEN 'calendario-podcast' THEN '1. Apri 11 Podcast.\n2. Premi per creare un appuntamento.\n3. Scrivi ospite, tema, intervistatore, giorno e ora.\n4. Scegli il pacchetto.\n5. Controlla il totale e premi Salva.'
    WHEN 'guida-ai' THEN '1. Apri 12 Guida.\n2. Scrivi la domanda con parole semplici.\n3. Premi Invia.\n4. Leggi la risposta e premi “Apri modulo” se compare. L’Assistente spiega cosa fare, ma non modifica i dati al posto tuo.'
    WHEN 'pwa-offline' THEN '1. Apri il CRM dal telefono.\n2. Premi “Installa” oppure “Aggiungi alla schermata Home”.\n3. Apri l’icona come una normale app.\n4. Senza rete puoi vedere gli ultimi dati salvati; per contratti, amministrazione e Assistente AI serve internet.'
  END, '\n', char(10)),
  `updated_at` = CURRENT_TIMESTAMP
WHERE `language` = 'it'
  AND `status` = 'published'
  AND `translation_group_id` IN ('crm-clienti','moduli-os','listino-sconti','preventivi-pdf','contratti-firma','consegne-distributori','gestione-utenti','registro-audit','vista-sales','vista-distributore','calendario-podcast','guida-ai','pwa-offline');

UPDATE `faq_entries` SET
  `title` = CASE `translation_group_id`
    WHEN 'crm-clienti' THEN 'Clientes: qué hacer'
    WHEN 'moduli-os' THEN 'Módulos OS: guía fácil'
    WHEN 'listino-sconti' THEN 'Precios y descuentos: guía fácil'
    WHEN 'preventivi-pdf' THEN 'Crear un presupuesto'
    WHEN 'contratti-firma' THEN 'Firmar un contrato'
    WHEN 'consegne-distributori' THEN 'Gestionar una entrega'
    WHEN 'gestione-utenti' THEN 'Crear un usuario'
    WHEN 'registro-audit' THEN 'Comprobar qué pasó'
    WHEN 'vista-sales' THEN 'Entrar como Sales'
    WHEN 'vista-distributore' THEN 'Entrar como Distribuidor'
    WHEN 'calendario-podcast' THEN 'Reservar un podcast'
    WHEN 'guida-ai' THEN 'Pedir ayuda'
    WHEN 'pwa-offline' THEN 'Instalar el CRM en el móvil'
  END,
  `question` = CASE `translation_group_id`
    WHEN 'crm-clienti' THEN '¿Cómo añado un cliente?'
    WHEN 'moduli-os' THEN '¿Dónde encuentro puntos, fotos y tareas operativas?'
    WHEN 'listino-sconti' THEN '¿Cómo preparo un precio y aplico un descuento?'
    WHEN 'preventivi-pdf' THEN '¿Cómo creo el PDF del presupuesto?'
    WHEN 'contratti-firma' THEN '¿Cómo hago firmar el contrato?'
    WHEN 'consegne-distributori' THEN '¿Cómo asigno y completo una entrega?'
    WHEN 'gestione-utenti' THEN '¿Cómo creo un usuario nuevo?'
    WHEN 'registro-audit' THEN '¿Cómo reviso cambios y emails?'
    WHEN 'vista-sales' THEN '¿Cómo veo el CRM como un Sales?'
    WHEN 'vista-distributore' THEN '¿Cómo veo el CRM como un Distribuidor?'
    WHEN 'calendario-podcast' THEN '¿Cómo reservo una cita de podcast?'
    WHEN 'guida-ai' THEN '¿Qué hago si no sé usar una función?'
    WHEN 'pwa-offline' THEN '¿Cómo pongo el CRM en el móvil?'
  END,
  `answer` = replace(CASE `translation_group_id`
    WHEN 'crm-clienti' THEN '1. Abre 01 CRM.\n2. Pulsa “Nuevo cliente”.\n3. Escribe los datos pedidos.\n4. Pulsa Guardar.\n5. Cuando cambie la negociación, abre el cliente y cambia la fase.'
    WHEN 'moduli-os' THEN '1. Abre 02 Módulos OS.\n2. Elige la ficha que necesitas.\n3. Para un lugar usa “Puntos de distribución”.\n4. Para una foto usa “Auditoría de fotos”.\n5. Completa los campos y pulsa Guardar. Si no ves un botón, tu rol no puede usarlo.'
    WHEN 'listino-sconti' THEN '1. Abre 03 Tarifa.\n2. Elige el cliente.\n3. Elige uno o más paquetes y la cantidad.\n4. Indica los meses.\n5. Si quieres, elige una promoción o escribe el descuento manual y el motivo.\n6. Revisa el total. Admin y Super Admin también pueden cambiar precios y campañas.'
    WHEN 'preventivi-pdf' THEN '1. Prepara la oferta en 03 Tarifa.\n2. Pulsa “Generar presupuesto PDF”.\n3. Abre 04 Presupuestos para ver el documento.\n4. Si el cliente acepta, pulsa “Crear contrato”.'
    WHEN 'contratti-firma' THEN '1. Abre 05 Contratos.\n2. Abre el contrato correcto.\n3. Pulsa “Firmar”.\n4. Escribe nombre y email del cliente.\n5. Envía el código OTP.\n6. Introduce el código, recoge la firma y confirma.'
    WHEN 'consegne-distributori' THEN '1. Abre 06 Entregas.\n2. Pulsa “Nueva entrega”.\n3. Elige empresa, Distribuidor, punto, cantidad y fecha.\n4. Pulsa “Asignar entrega”.\n5. El Distribuidor abre la entrega y cambia el estado. El lugar está en el punto de distribución; las fotos se cargan en 02 Módulos OS → Auditoría de fotos.'
    WHEN 'gestione-utenti' THEN '1. Abre 07 Usuarios.\n2. Pulsa “Nuevo usuario”.\n3. Escribe nombre, email, teléfono, rol e isla.\n4. Si es Sales, elige también el Sales Manager.\n5. Pulsa “Crear usuario”.\n6. El CRM envía automáticamente un email: el enlace para elegir la contraseña dura 48 horas.'
    WHEN 'registro-audit' THEN '1. Abre 08 Auditoría.\n2. Busca la fila con la fecha y el usuario.\n3. Lee la acción registrada.\n4. Si un email tiene error, pulsa “Reintentar”. Esta página está disponible para el Super Admin.'
    WHEN 'vista-sales' THEN '1. Abre 09 Vista Sales.\n2. Elige el Sales.\n3. Marca la confirmación.\n4. Pulsa “Trabajar como Sales”.\n5. Revisa o trabaja con sus permisos reales.\n6. Al terminar pulsa “Volver a Admin”. Los cambios son reales y quedan registrados.'
    WHEN 'vista-distributore' THEN '1. Abre 10 Vista Distribuidor.\n2. Elige el Distribuidor.\n3. Marca la confirmación.\n4. Pulsa “Trabajar como Distribuidor”.\n5. Revisa las entregas que puede ver.\n6. Al terminar pulsa “Volver a Admin”. Los cambios son reales y quedan registrados.'
    WHEN 'calendario-podcast' THEN '1. Abre 11 Podcast.\n2. Pulsa para crear una cita.\n3. Escribe invitado, tema, entrevistador, día y hora.\n4. Elige el paquete.\n5. Revisa el total y pulsa Guardar.'
    WHEN 'guida-ai' THEN '1. Abre 12 Guía.\n2. Escribe la pregunta con palabras sencillas.\n3. Pulsa Enviar.\n4. Lee la respuesta y pulsa “Abrir módulo” si aparece. El Asistente explica qué hacer, pero no modifica los datos por ti.'
    WHEN 'pwa-offline' THEN '1. Abre el CRM desde el móvil.\n2. Pulsa “Instalar” o “Añadir a pantalla de inicio”.\n3. Abre el icono como una app normal.\n4. Sin red puedes ver los últimos datos guardados; contratos, administración y Asistente IA necesitan internet.'
  END, '\n', char(10)),
  `updated_at` = CURRENT_TIMESTAMP
WHERE `language` = 'es'
  AND `status` = 'published'
  AND `translation_group_id` IN ('crm-clienti','moduli-os','listino-sconti','preventivi-pdf','contratti-firma','consegne-distributori','gestione-utenti','registro-audit','vista-sales','vista-distributore','calendario-podcast','guida-ai','pwa-offline');

UPDATE `faq_entries` SET
  `title` = CASE `translation_group_id`
    WHEN 'crm-clienti' THEN 'Clients: what to do'
    WHEN 'moduli-os' THEN 'OS Modules: easy guide'
    WHEN 'listino-sconti' THEN 'Prices and discounts: easy guide'
    WHEN 'preventivi-pdf' THEN 'Create a quote'
    WHEN 'contratti-firma' THEN 'Sign a contract'
    WHEN 'consegne-distributori' THEN 'Manage a delivery'
    WHEN 'gestione-utenti' THEN 'Create a user'
    WHEN 'registro-audit' THEN 'Check what happened'
    WHEN 'vista-sales' THEN 'Enter as a Sales user'
    WHEN 'vista-distributore' THEN 'Enter as a Distributor'
    WHEN 'calendario-podcast' THEN 'Book a podcast'
    WHEN 'guida-ai' THEN 'Ask for help'
    WHEN 'pwa-offline' THEN 'Install the CRM on your phone'
  END,
  `question` = CASE `translation_group_id`
    WHEN 'crm-clienti' THEN 'How do I add a client?'
    WHEN 'moduli-os' THEN 'Where do I find locations, photos and operational tasks?'
    WHEN 'listino-sconti' THEN 'How do I prepare a price and apply a discount?'
    WHEN 'preventivi-pdf' THEN 'How do I create the quote PDF?'
    WHEN 'contratti-firma' THEN 'How do I get the contract signed?'
    WHEN 'consegne-distributori' THEN 'How do I assign and complete a delivery?'
    WHEN 'gestione-utenti' THEN 'How do I create a new user?'
    WHEN 'registro-audit' THEN 'How do I check changes and emails?'
    WHEN 'vista-sales' THEN 'How do I see the CRM as a Sales user?'
    WHEN 'vista-distributore' THEN 'How do I see the CRM as a Distributor?'
    WHEN 'calendario-podcast' THEN 'How do I book a podcast appointment?'
    WHEN 'guida-ai' THEN 'What do I do if I cannot use a feature?'
    WHEN 'pwa-offline' THEN 'How do I put the CRM on my phone?'
  END,
  `answer` = replace(CASE `translation_group_id`
    WHEN 'crm-clienti' THEN '1. Open 01 CRM.\n2. Tap “New client”.\n3. Enter the requested details.\n4. Tap Save.\n5. When the deal changes, open the client and change its stage.'
    WHEN 'moduli-os' THEN '1. Open 02 OS Modules.\n2. Choose the section you need.\n3. For a location use “Distribution points”.\n4. For a photo use “Photo audit”.\n5. Fill in the fields and tap Save. If you cannot see a button, your role cannot use it.'
    WHEN 'listino-sconti' THEN '1. Open 03 Price list.\n2. Choose the client.\n3. Choose one or more packages and the quantity.\n4. Enter the number of months.\n5. If needed, choose a promotion or enter a manual discount and its reason.\n6. Check the total. Admin and Super Admin can also change prices and campaigns.'
    WHEN 'preventivi-pdf' THEN '1. Prepare the offer in 03 Price list.\n2. Tap “Generate quote PDF”.\n3. Open 04 Quotes to view the document.\n4. If the client accepts, tap “Create contract”.'
    WHEN 'contratti-firma' THEN '1. Open 05 Contracts.\n2. Open the correct contract.\n3. Tap “Sign”.\n4. Enter the client’s name and email.\n5. Send the OTP code.\n6. Enter the code, collect the signature and confirm.'
    WHEN 'consegne-distributori' THEN '1. Open 06 Deliveries.\n2. Tap “New delivery”.\n3. Choose the company, Distributor, point, quantity and date.\n4. Tap “Assign delivery”.\n5. The Distributor opens the delivery and changes its status. The location is stored in the distribution point; upload photos in 02 OS Modules → Photo audit.'
    WHEN 'gestione-utenti' THEN '1. Open 07 Users.\n2. Tap “New user”.\n3. Enter name, email, phone, role and island.\n4. For a Sales user, also choose the Sales Manager.\n5. Tap “Create user”.\n6. The CRM automatically sends an email: the password setup link is valid for 48 hours.'
    WHEN 'registro-audit' THEN '1. Open 08 Audit.\n2. Find the row with the date and user you need.\n3. Read the recorded action.\n4. If an email failed, tap “Retry”. This page is available to the Super Admin.'
    WHEN 'vista-sales' THEN '1. Open 09 Sales View.\n2. Choose the Sales user.\n3. Tick the confirmation.\n4. Tap “Work as Sales”.\n5. Check or work with their real permissions.\n6. When finished, tap “Back to Admin”. Changes are real and audited.'
    WHEN 'vista-distributore' THEN '1. Open 10 Distributor View.\n2. Choose the Distributor.\n3. Tick the confirmation.\n4. Tap “Work as Distributor”.\n5. Check the deliveries they can see.\n6. When finished, tap “Back to Admin”. Changes are real and audited.'
    WHEN 'calendario-podcast' THEN '1. Open 11 Podcast.\n2. Tap to create an appointment.\n3. Enter the guest, topic, interviewer, day and time.\n4. Choose the package.\n5. Check the total and tap Save.'
    WHEN 'guida-ai' THEN '1. Open 12 Help.\n2. Write the question in simple words.\n3. Tap Send.\n4. Read the answer and tap “Open module” if it appears. The Assistant explains what to do but does not change data for you.'
    WHEN 'pwa-offline' THEN '1. Open the CRM on your phone.\n2. Tap “Install” or “Add to Home Screen”.\n3. Open the icon like a normal app.\n4. Offline you can see the latest saved data; contracts, administration and the AI Assistant need internet.'
  END, '\n', char(10)),
  `updated_at` = CURRENT_TIMESTAMP
WHERE `language` = 'en'
  AND `status` = 'published'
  AND `translation_group_id` IN ('crm-clienti','moduli-os','listino-sconti','preventivi-pdf','contratti-firma','consegne-distributori','gestione-utenti','registro-audit','vista-sales','vista-distributore','calendario-podcast','guida-ai','pwa-offline');
