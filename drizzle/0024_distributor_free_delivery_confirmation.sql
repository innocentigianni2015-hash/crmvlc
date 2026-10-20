UPDATE `faq_entries`
SET `answer` = replace('1. Apri 06 Consegne per vedere gli incarichi assegnati.\n2. Per confermare una consegna apri 02 Moduli OS → Geo audit.\n3. Se hai un incarico, selezionalo. Se non ne hai, scegli “Conferma libera”, il punto e la quantità.\n4. Scatta la foto: il CRM salva posizione e orario e chiude la consegna a tuo nome.\n5. La foto resta in attesa di verifica.', '\n', char(10)),
    `updated_at` = CURRENT_TIMESTAMP
WHERE `translation_group_id` = 'consegne-distributori' AND `language` = 'it' AND `status` = 'published';
--> statement-breakpoint
UPDATE `faq_entries`
SET `answer` = replace('1. Abre 06 Entregas para ver los encargos asignados.\n2. Para confirmar una entrega abre 02 Módulos OS → Geo audit.\n3. Si tienes un encargo, selecciónalo. Si no tienes ninguno, elige “Confirmación libre”, el punto y la cantidad.\n4. Haz la foto: el CRM guarda posición y hora y cierra la entrega a tu nombre.\n5. La foto queda pendiente de revisión.', '\n', char(10)),
    `updated_at` = CURRENT_TIMESTAMP
WHERE `translation_group_id` = 'consegne-distributori' AND `language` = 'es' AND `status` = 'published';
--> statement-breakpoint
UPDATE `faq_entries`
SET `answer` = replace('1. Open 06 Deliveries to see assigned jobs.\n2. To confirm a delivery open 02 OS Modules → Geo audit.\n3. If you have a job, select it. If you have none, choose “Free confirmation”, the point and the quantity.\n4. Take the photo: the CRM saves the location and time and closes the delivery under your name.\n5. The photo remains pending review.', '\n', char(10)),
    `updated_at` = CURRENT_TIMESTAMP
WHERE `translation_group_id` = 'consegne-distributori' AND `language` = 'en' AND `status` = 'published';
