UPDATE `faq_entries`
SET `answer` = 'Apri 07 Utenti e crea l’account con nome, email, ruolo e isola. Per un Sales assegna anche il Sales Manager. Admin operativo e Super Admin gestiscono i ruoli operativi; solo il Super Admin può creare o promuovere un Admin. Dopo la creazione l’utente riceve automaticamente un’email con un collegamento valido 48 ore per scegliere la propria password.',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'faq-it-utenti-1';
--> statement-breakpoint
UPDATE `faq_entries`
SET `answer` = 'Abre 07 Usuarios y crea la cuenta con nombre, email, rol e isla. Para un Sales asigna también el Sales Manager. El Admin operativo y el Super Admin gestionan los roles operativos; solo el Super Admin puede crear o promover un Admin. Tras la creación, el usuario recibe automáticamente un email con un enlace válido durante 48 horas para elegir su contraseña.',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'faq-es-utenti-1';
--> statement-breakpoint
UPDATE `faq_entries`
SET `answer` = 'Open 07 Users and create the account with name, email, role and island. Assign a Sales Manager to each Sales user where required. Operational Admin and Super Admin manage operational roles; only the Super Admin can create or promote an Admin. After creation, the user automatically receives an email with a link valid for 48 hours to choose their password.',
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'faq-en-utenti-1';
