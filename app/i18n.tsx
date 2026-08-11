"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export type UiLocale = "es" | "it" | "en";

const STORAGE_KEY = "crmvlc:ui-language";
const LOCALE_TAGS: Record<UiLocale, string> = { es: "es-ES", it: "it-IT", en: "en-GB" };

type Translation = { es: string; en: string };

// The CRM predates its i18n layer. Keeping the canonical Italian copy here lets every
// legacy module share one audited vocabulary while new components can call translate()
// directly. User-entered values are never sent to an external translation service.
const COPY: Record<string, Translation> = {
  "CRM & Contratti": { es: "CRM y Contratos", en: "CRM & Contracts" },
  "CRM & contratti": { es: "CRM y contratos", en: "CRM & contracts" },
  "Area operativa": { es: "Área operativa", en: "Operations area" },
  "Caricamento area operativa…": { es: "Cargando área operativa…", en: "Loading operations area…" },
  "Caricamento moduli operativi…": { es: "Cargando módulos operativos…", en: "Loading operations modules…" },
  "Accedi alla tua area di lavoro CRMVLC.": { es: "Accede a tu área de trabajo CRMVLC.", en: "Sign in to your CRMVLC workspace." },
  "Il lavoro commerciale, in un unico posto.": { es: "Todo el trabajo comercial, en un solo lugar.", en: "All your commercial work, in one place." },
  "Clienti, pipeline, preventivi, contratti, consegne e podcast: dati reali, permessi per ruolo e operatività pensata per il cellulare.": { es: "Clientes, pipeline, presupuestos, contratos, entregas y pódcast: datos reales, permisos por rol y operativa diseñada para el móvil.", en: "Clients, pipeline, quotes, contracts, deliveries and podcasts: live data, role-based permissions and mobile-first operations." },
  "Dati per ruolo": { es: "Datos por rol", en: "Role-based data" },
  "Contratti con audit": { es: "Contratos con auditoría", en: "Contracts with audit" },
  "PWA installabile": { es: "PWA instalable", en: "Installable PWA" },
  "CRM OPERATIVO · CINQUE ISOLE": { es: "CRM OPERATIVO · CINCO ISLAS", en: "OPERATIONS CRM · FIVE ISLANDS" },
  "Cerca clienti, preventivi, contratti o consegne…": { es: "Buscar clientes, presupuestos, contratos o entregas…", en: "Search clients, quotes, contracts or deliveries…" },
  "Cerca": { es: "Buscar", en: "Search" },
  "Installa": { es: "Instalar", en: "Install" },
  "Esci": { es: "Salir", en: "Sign out" },
  "Modifica il profilo": { es: "Editar perfil", en: "Edit profile" },
  "Moduli OS": { es: "Módulos OS", en: "OS Modules" },
  "Listino": { es: "Tarifa", en: "Price list" },
  "Preventivi": { es: "Presupuestos", en: "Quotes" },
  "Contratti": { es: "Contratos", en: "Contracts" },
  "Documento esclusivamente in spagnolo": { es: "Documento exclusivamente en español", en: "Document exclusively in Spanish" },
  "Confermo che tutto il contenuto del PDF è redatto in spagnolo.": { es: "Confirmo que todo el contenido del PDF está redactado en español.", en: "I confirm that all PDF content is written in Spanish." },
  "Confermo che tutto il contenuto del nuovo PDF è redatto in spagnolo.": { es: "Confirmo que todo el contenido del nuevo PDF está redactado en español.", en: "I confirm that all content in the new PDF is written in Spanish." },
  "Confermo la lingua del modello caricato.": { es: "Confirmo el idioma del modelo cargado.", en: "I confirm the language of the uploaded template." },
  "Lingua iniziale": { es: "Idioma inicial", en: "Initial language" },
  "L’utente potrà cambiarla dal proprio profilo.": { es: "El usuario podrá cambiarlo desde su perfil.", en: "The user can change it from their profile." },
  "Solo documenti in spagnolo.": { es: "Solo documentos en español.", en: "Spanish documents only." },
  "PDF o DOCX, massimo 8 MB. Solo documenti in spagnolo.": { es: "PDF o DOCX, máximo 8 MB. Solo documentos en español.", en: "PDF or DOCX, maximum 8 MB. Spanish documents only." },
  "Consegne": { es: "Entregas", en: "Deliveries" },
  "Utenti": { es: "Usuarios", en: "Users" },
  "Vista Distributore": { es: "Vista Distribuidor", en: "Distributor View" },
  "Guida & AI": { es: "Guía e IA", en: "Help & AI" },
  "Guida & Assistente AI": { es: "Guía y Asistente IA", en: "Help & AI Assistant" },
  "Dati reali": { es: "Datos reales", en: "Live data" },
  "Dati dimostrativi": { es: "Datos de demostración", en: "Demo data" },
  "Tutte le isole": { es: "Todas las islas", en: "All islands" },
  "Modalità operativa": { es: "Modo operativo", en: "Operational mode" },
  "Torna Super Admin": { es: "Volver a Super Admin", en: "Return to Super Admin" },
  "Modalità offline": { es: "Modo sin conexión", en: "Offline mode" },
  "Sincronizzazione": { es: "Sincronización", en: "Synchronisation" },
  "Modalità demo": { es: "Modo demo", en: "Demo mode" },
  "Usa esclusivamente dati fittizi. Le email OTP non sono attive.": { es: "Usa exclusivamente datos ficticios. Los emails OTP no están activos.", en: "Use fictional data only. OTP emails are disabled." },
  "Operatività commerciale": { es: "Operativa comercial", en: "Commercial operations" },
  "Ogni utente vede soltanto il perimetro autorizzato.": { es: "Cada usuario solo ve el ámbito autorizado.", en: "Each user only sees their authorised scope." },
  "＋ Nuovo cliente": { es: "＋ Nuevo cliente", en: "＋ New client" },
  "Clienti visibili": { es: "Clientes visibles", en: "Visible clients" },
  "Pipeline aperta": { es: "Pipeline abierta", en: "Open pipeline" },
  "Proposte": { es: "Propuestas", en: "Proposals" },
  "Contratti firmati": { es: "Contratos firmados", en: "Signed contracts" },
  "assegnati a te": { es: "asignados a ti", en: "assigned to you" },
  "nel tuo perimetro": { es: "en tu ámbito", en: "within your scope" },
  "valore non chiuso": { es: "valor sin cerrar", en: "unclosed value" },
  "in fase proposta": { es: "en fase de propuesta", en: "at proposal stage" },
  "con evidenza OTP": { es: "con evidencia OTP", en: "with OTP evidence" },
  "Pipeline commerciale": { es: "Pipeline comercial", en: "Sales pipeline" },
  "Trascina le schede oppure usa il selettore su mobile.": { es: "Arrastra las fichas o usa el selector en el móvil.", en: "Drag cards or use the selector on mobile." },
  "Primo contatto": { es: "Primer contacto", en: "First contact" },
  "In trattativa": { es: "En negociación", en: "In negotiation" },
  "Proposta": { es: "Propuesta", en: "Proposal" },
  "Chiuso": { es: "Ganado", en: "Won" },
  "Perso": { es: "Perdido", en: "Lost" },
  "Ciclo documentale": { es: "Ciclo documental", en: "Document workflow" },
  "Documento, OTP, firma e conferma agente conservati con audit.": { es: "Documento, OTP, firma y confirmación del agente conservados con auditoría.", en: "Document, OTP, signature and agent confirmation retained with an audit trail." },
  "＋ Nuovo contratto": { es: "＋ Nuevo contrato", en: "＋ New contract" },
  "Archivio contratti": { es: "Archivo de contratos", en: "Contract archive" },
  "Un contratto firmato non può essere modificato.": { es: "Un contrato firmado no puede modificarse.", en: "A signed contract cannot be changed." },
  "Firmato": { es: "Firmado", en: "Signed" },
  "In firma": { es: "En firma", en: "Awaiting signature" },
  "Bozza": { es: "Borrador", en: "Draft" },
  "Firma in attesa": { es: "Firma pendiente", en: "Signature pending" },
  "Annullato": { es: "Anulado", en: "Cancelled" },
  "Documento": { es: "Documento", en: "Document" },
  "Evidenza": { es: "Evidencia", en: "Evidence" },
  "Firma": { es: "Firmar", en: "Sign" },
  "Annulla + nuova": { es: "Anular + nueva", en: "Cancel + new" },
  "Nessun contratto": { es: "Ningún contrato", en: "No contracts" },
  "Carica il primo contratto PDF da inviare alla firma.": { es: "Carga el primer contrato PDF para enviarlo a firma.", en: "Upload the first PDF contract for signature." },
  "Crea prima un cliente nel CRM.": { es: "Crea primero un cliente en el CRM.", en: "Create a client in the CRM first." },
  "Vendita pubblicitaria": { es: "Venta publicitaria", en: "Advertising sales" },
  "Dodici formati mensili, prezzi netti e IGIC calcolato separatamente per tutte le isole.": { es: "Doce formatos mensuales, precios netos e IGIC calculado por separado para todas las islas.", en: "Twelve monthly formats, net prices and IGIC calculated separately for every island." },
  "Prezzi base mensili": { es: "Precios base mensuales", en: "Monthly base prices" },
  "Prezzo netto / mese": { es: "Precio neto / mes", en: "Net price / month" },
  "Durata mesi": { es: "Duración en meses", en: "Duration in months" },
  "Sconto %": { es: "Descuento %", en: "Discount %" },
  "Motivo sconto": { es: "Motivo del descuento", en: "Discount reason" },
  "Subtotale netto": { es: "Subtotal neto", en: "Net subtotal" },
  "Genera preventivo PDF": { es: "Generar presupuesto PDF", en: "Generate PDF quote" },
  "Generazione PDF…": { es: "Generando PDF…", en: "Generating PDF…" },
  "Azzera calcolo": { es: "Reiniciar cálculo", en: "Reset calculation" },
  "Archivio preventivi": { es: "Archivo de presupuestos", en: "Quote archive" },
  "PDF numerati, collegati al cliente e congelati con prezzi, sconto e IGIC del momento.": { es: "PDF numerados, vinculados al cliente y congelados con precios, descuento e IGIC del momento.", en: "Numbered PDFs linked to the client and frozen with the current prices, discount and IGIC." },
  "Nessun preventivo": { es: "Ningún presupuesto", en: "No quotes" },
  "Crea contratto": { es: "Crear contrato", en: "Create contract" },
  "Conversione…": { es: "Convirtiendo…", en: "Converting…" },
  "Emesso": { es: "Emitido", en: "Issued" },
  "Convertito": { es: "Convertido", en: "Converted" },
  "Scaduto": { es: "Caducado", en: "Expired" },
  "Numero": { es: "Número", en: "Number" },
  "Cliente": { es: "Cliente", en: "Client" },
  "Periodo": { es: "Periodo", en: "Period" },
  "Imponibile": { es: "Base imponible", en: "Taxable amount" },
  "Totale": { es: "Total", en: "Total" },
  "Stato": { es: "Estado", en: "Status" },
  "Azioni": { es: "Acciones", en: "Actions" },
  "Piano consegne": { es: "Plan de entregas", en: "Delivery plan" },
  "Consegne, quantità e aziende visibili soltanto nel perimetro assegnato.": { es: "Entregas, cantidades y empresas visibles solo dentro del ámbito asignado.", en: "Deliveries, quantities and companies are only visible within the assigned scope." },
  "＋ Nuova consegna": { es: "＋ Nueva entrega", en: "＋ New delivery" },
  "Nessuna consegna": { es: "Ninguna entrega", en: "No deliveries" },
  "Assegna la prima consegna a un Distributore.": { es: "Asigna la primera entrega a un Distribuidor.", en: "Assign the first delivery to a Distributor." },
  "Assegnata": { es: "Asignada", en: "Assigned" },
  "In corso": { es: "En curso", en: "In progress" },
  "Consegnata": { es: "Entregada", en: "Delivered" },
  "Problema": { es: "Problema", en: "Issue" },
  "Quantità": { es: "Cantidad", en: "Quantity" },
  "Data programmata": { es: "Fecha programada", en: "Scheduled date" },
  "Referente consegna": { es: "Contacto de entrega", en: "Delivery contact" },
  "Telefono referente": { es: "Teléfono de contacto", en: "Contact phone" },
  "Email referente": { es: "Email de contacto", en: "Contact email" },
  "Indirizzo consegna": { es: "Dirección de entrega", en: "Delivery address" },
  "Note operative": { es: "Notas operativas", en: "Operational notes" },
  "Gestisci consegna": { es: "Gestionar entrega", en: "Manage delivery" },
  "Assegna consegna": { es: "Asignar entrega", en: "Assign delivery" },
  "Aggiorna consegna": { es: "Actualizar entrega", en: "Update delivery" },
  "Amministrazione": { es: "Administración", en: "Administration" },
  "Crea account, assegna gerarchie commerciali e revoca immediatamente gli accessi.": { es: "Crea cuentas, asigna jerarquías comerciales y revoca los accesos inmediatamente.", en: "Create accounts, assign sales hierarchies and revoke access immediately." },
  "Nuovo utente": { es: "Nuevo usuario", en: "New user" },
  "Nome e cognome": { es: "Nombre y apellidos", en: "Full name" },
  "Email aziendale": { es: "Email corporativo", en: "Business email" },
  "Password temporanea": { es: "Contraseña temporal", en: "Temporary password" },
  "Almeno 12 caratteri. Al primo accesso dovrà essere cambiata.": { es: "Al menos 12 caracteres. Deberá cambiarse en el primer acceso.", en: "At least 12 characters. It must be changed on first sign-in." },
  "Ruolo": { es: "Rol", en: "Role" },
  "Isola": { es: "Isla", en: "Island" },
  "Sales responsabile": { es: "Sales responsable", en: "Responsible Sales" },
  "Crea utente": { es: "Crear usuario", en: "Create user" },
  "Creazione…": { es: "Creando…", en: "Creating…" },
  "Utenti autorizzati": { es: "Usuarios autorizados", en: "Authorised users" },
  "Modifica ruolo e accesso": { es: "Editar rol y acceso", en: "Edit role and access" },
  "Account attivo": { es: "Cuenta activa", en: "Active account" },
  "Disattivandolo vengono revocate tutte le sessioni aperte.": { es: "Al desactivarlo se revocan todas las sesiones abiertas.", en: "Disabling it revokes all open sessions." },
  "Contatti personali": { es: "Datos de contacto", en: "Contact details" },
  "Telefono non inserito": { es: "Teléfono no indicado", en: "Phone not provided" },
  "Gestisci utente": { es: "Gestionar usuario", en: "Manage user" },
  "Aggiorna utente": { es: "Actualizar usuario", en: "Update user" },
  "Modelli contrattuali": { es: "Modelos contractuales", en: "Contract templates" },
  "Carica modello": { es: "Cargar modelo", en: "Upload template" },
  "Nome modello": { es: "Nombre del modelo", en: "Template name" },
  "Versione": { es: "Versión", en: "Version" },
  "Archivia modello": { es: "Archivar modelo", en: "Archive template" },
  "Nessun modello": { es: "Ningún modelo", en: "No templates" },
  "Carica i documenti già pronti.": { es: "Carga los documentos ya preparados.", en: "Upload the prepared documents." },
  "Permessi Admin operativo": { es: "Permisos de Admin operativo", en: "Operational Admin permissions" },
  "Gestione quotidiana senza accesso alle configurazioni sensibili.": { es: "Gestión diaria sin acceso a configuraciones sensibles.", en: "Daily management without access to sensitive settings." },
  "CRM e consegne su tutte le isole": { es: "CRM y entregas en todas las islas", en: "CRM and deliveries across all islands" },
  "Crea e gestisce ruoli operativi": { es: "Crea y gestiona roles operativos", en: "Creates and manages operational roles" },
  "Non crea altri Admin": { es: "No crea otros Admin", en: "Cannot create other Admins" },
  "Nessun accesso ad audit, listino o commissioni": { es: "Sin acceso a auditoría, tarifa o comisiones", en: "No access to audit, price list or commissions" },
  "Tracciabilità": { es: "Trazabilidad", en: "Traceability" },
  "Registro append-only e controllo degli invii email.": { es: "Registro append-only y control de envíos de email.", en: "Append-only log and email delivery monitoring." },
  "Email da controllare": { es: "Emails para revisar", en: "Emails to review" },
  "Invii in attesa o terminati con errore.": { es: "Envíos pendientes o finalizados con error.", en: "Pending or failed deliveries." },
  "Destinatario": { es: "Destinatario", en: "Recipient" },
  "Oggetto": { es: "Asunto", en: "Subject" },
  "Tentativi": { es: "Intentos", en: "Attempts" },
  "Prossimo tentativo": { es: "Próximo intento", en: "Next attempt" },
  "Riprova": { es: "Reintentar", en: "Retry" },
  "Registro vuoto": { es: "Registro vacío", en: "Empty log" },
  "Gli eventi compariranno dopo le prime operazioni.": { es: "Los eventos aparecerán tras las primeras operaciones.", en: "Events will appear after the first operations." },
  "Calendario podcast": { es: "Calendario de podcast", en: "Podcast calendar" },
  "Appuntamenti di un’ora nel fuso delle Canarie, senza sovrapposizioni per intervistatore.": { es: "Citas de una hora en el huso horario de Canarias, sin solapamientos por entrevistador.", en: "One-hour appointments in the Canary Islands time zone, with no interviewer overlaps." },
  "＋ Nuovo appuntamento": { es: "＋ Nueva cita", en: "＋ New appointment" },
  "Prossimi appuntamenti": { es: "Próximas citas", en: "Upcoming appointments" },
  "Non ci sono appuntamenti podcast futuri.": { es: "No hay próximas citas de podcast.", en: "There are no upcoming podcast appointments." },
  "Nuovo appuntamento podcast": { es: "Nueva cita de podcast", en: "New podcast appointment" },
  "Modifica appuntamento": { es: "Editar cita", en: "Edit appointment" },
  "Ospite": { es: "Invitado", en: "Guest" },
  "Tema": { es: "Tema", en: "Topic" },
  "Intervistatore": { es: "Entrevistador", en: "Interviewer" },
  "Giorno": { es: "Día", en: "Day" },
  "Orario": { es: "Hora", en: "Time" },
  "Durata fissa: 1 ora · fuso Atlantic/Canary": { es: "Duración fija: 1 hora · huso Atlantic/Canary", en: "Fixed duration: 1 hour · Atlantic/Canary time" },
  "Annulla appuntamento": { es: "Cancelar cita", en: "Cancel appointment" },
  "Supporto operativo": { es: "Soporte operativo", en: "Operational support" },
  "Procedure approvate, risposte per ruolo e assistenza vocale pensata per il cellulare.": { es: "Procedimientos aprobados, respuestas por rol y asistencia de voz diseñada para el móvil.", en: "Approved procedures, role-based answers and mobile-first voice assistance." },
  "＋ Nuova FAQ": { es: "＋ Nueva FAQ", en: "＋ New FAQ" },
  "Solo procedure autorizzate": { es: "Solo procedimientos autorizados", en: "Authorised procedures only" },
  "Spiega, non modifica": { es: "Explica, no modifica", en: "Explains, never changes" },
  "L’AI non può eseguire azioni o cambiare dati.": { es: "La IA no puede ejecutar acciones ni cambiar datos.", en: "The AI cannot perform actions or change data." },
  "Risposte approvate": { es: "Respuestas aprobadas", en: "Approved answers" },
  "Usa solo FAQ pubblicate per il tuo ruolo.": { es: "Usa solo FAQ publicadas para tu rol.", en: "Uses only FAQs published for your role." },
  "Voce privata": { es: "Voz privada", en: "Private voice" },
  "CRMVLC riceve solo la trascrizione e non conserva audio.": { es: "CRMVLC solo recibe la transcripción y no conserva audio.", en: "CRMVLC receives only the transcript and stores no audio." },
  "Manuale operativo": { es: "Manual operativo", en: "Operations manual" },
  "Cerca una procedura…": { es: "Buscar una operación…", en: "Search a procedure…" },
  "Apri modulo": { es: "Abrir módulo", en: "Open module" },
  "Nessuna procedura trovata": { es: "No se encontró ningún procedimiento", en: "No procedures found" },
  "Prova con parole diverse o cambia lingua.": { es: "Prueba con otras palabras o cambia de idioma.", en: "Try different words or change language." },
  "Assistente AI": { es: "Asistente IA", en: "AI Assistant" },
  "Aiuto": { es: "Ayuda", en: "Help" },
  "Apri Assistente AI": { es: "Abrir Asistente IA", en: "Open AI Assistant" },
  "Chiudi": { es: "Cerrar", en: "Close" },
  "FASE 1 · SOLO GUIDA": { es: "FASE 1 · SOLO GUÍA", en: "PHASE 1 · GUIDANCE ONLY" },
  "Chiedi al CRMVLC": { es: "Pregunta a CRMVLC", en: "Ask CRMVLC" },
  "Ti spiego la procedura e apro il modulo corretto.": { es: "Te explico el procedimiento y abro el módulo correcto.", en: "I explain the procedure and open the right module." },
  "Come posso aiutarti?": { es: "¿Cómo puedo ayudarte?", en: "How can I help?" },
  "Chiedi come svolgere un’operazione nel modulo attuale.": { es: "Pregunta cómo realizar una operación en el módulo actual.", en: "Ask how to perform an operation in the current module." },
  "Cosa posso fare in questo modulo?": { es: "¿Qué puedo hacer en este módulo?", en: "What can I do in this module?" },
  "Funzioni del modulo": { es: "Funciones del módulo", en: "Module features" },
  "Quali permessi ho?": { es: "¿Qué permisos tengo?", en: "What permissions do I have?" },
  "I miei permessi": { es: "Mis permisos", en: "My permissions" },
  "Inviata agli Admin": { es: "Enviada a los Admin", en: "Sent to Admins" },
  "Scrivi la tua domanda…": { es: "Escribe tu pregunta…", en: "Type your question…" },
  "Dettatura vocale": { es: "Dictado por voz", en: "Voice dictation" },
  "● Voce": { es: "● Voz", en: "● Voice" },
  "Invia": { es: "Enviar", en: "Send" },
  "L’Assistente AI richiede la rete. Le FAQ pubblicate restano consultabili nella Pagina 12.": { es: "El Asistente IA necesita conexión. Las FAQ publicadas siguen disponibles en la Página 12.", en: "The AI Assistant requires a connection. Published FAQs remain available on Page 12." },
  "CRMVLC registra domanda e risposta, ma non riceve né conserva l’audio. Il servizio vocale del browser può elaborarlo.": { es: "CRMVLC registra la pregunta y la respuesta, pero no recibe ni conserva el audio. El servicio de voz del navegador puede procesarlo.", en: "CRMVLC records the question and answer, but never receives or stores audio. The browser voice service may process it." },
  "Il mio profilo": { es: "Mi perfil", en: "My profile" },
  "Telefono immediato; la nuova email richiede conferma dal collegamento ricevuto.": { es: "El teléfono se actualiza al instante; el nuevo email requiere confirmación desde el enlace recibido.", en: "Phone updates immediately; a new email must be confirmed through the link received." },
  "Email di accesso": { es: "Email de acceso", en: "Sign-in email" },
  "Telefono": { es: "Teléfono", en: "Phone" },
  "Accesso a tutte le isole": { es: "Acceso a todas las islas", en: "Access to all islands" },
  "Ruolo e perimetro sono modificabili soltanto da un amministratore autorizzato.": { es: "El rol y el ámbito solo pueden modificarse por un administrador autorizado.", en: "Role and scope can only be changed by an authorised administrator." },
  "Salva profilo": { es: "Guardar perfil", en: "Save profile" },
  "Salvataggio…": { es: "Guardando…", en: "Saving…" },
  "Annulla": { es: "Cancelar", en: "Cancel" },
  "Nuovo cliente": { es: "Nuevo cliente", en: "New client" },
  "Il Sales assegnato determina la visibilità della pipeline e di tutti i documenti collegati.": { es: "El Sales asignado determina la visibilidad de la pipeline y de todos los documentos vinculados.", en: "The assigned Sales user determines visibility of the pipeline and all linked documents." },
  "Azienda": { es: "Empresa", en: "Company" },
  "Referente": { es: "Contacto", en: "Contact" },
  "Valore stimato €": { es: "Valor estimado €", en: "Estimated value €" },
  "Seleziona un Sales": { es: "Selecciona un Sales", en: "Select a Sales user" },
  "Note": { es: "Notas", en: "Notes" },
  "Crea cliente": { es: "Crear cliente", en: "Create client" },
  "Nuovo contratto": { es: "Nuevo contrato", en: "New contract" },
  "Carica il PDF definitivo da sottoporre alla firma.": { es: "Carga el PDF definitivo que se enviará a firma.", en: "Upload the final PDF to be signed." },
  "Titolo contratto": { es: "Título del contrato", en: "Contract title" },
  "Modello usato": { es: "Modelo utilizado", en: "Template used" },
  "Nessun modello associato": { es: "Ningún modelo asociado", en: "No linked template" },
  "PDF compilato": { es: "PDF cumplimentado", en: "Completed PDF" },
  "Crea bozza": { es: "Crear borrador", en: "Create draft" },
  "Archiviazione…": { es: "Archivando…", en: "Archiving…" },
  "Annulla e crea nuova versione": { es: "Anular y crear nueva versión", en: "Cancel and create a new version" },
  "Il contratto firmato resterà conservato e marcato come annullato.": { es: "El contrato firmado se conservará y quedará marcado como anulado.", en: "The signed contract will be retained and marked as cancelled." },
  "Motivazione obbligatoria": { es: "Motivo obligatorio", en: "Required reason" },
  "Titolo nuova versione": { es: "Título de la nueva versión", en: "New version title" },
  "Nuovo PDF": { es: "Nuevo PDF", en: "New PDF" },
  "Annulla e crea versione": { es: "Anular y crear versión", en: "Cancel and create version" },
  "Firma del cliente": { es: "Firma del cliente", en: "Client signature" },
  "Nome del firmatario": { es: "Nombre del firmante", en: "Signatory name" },
  "Email per codice OTP": { es: "Email para el código OTP", en: "Email for OTP code" },
  "Invia codice": { es: "Enviar código", en: "Send code" },
  "Codice OTP": { es: "Código OTP", en: "OTP code" },
  "Conferma agente": { es: "Confirmación del agente", en: "Agent confirmation" },
  "Dichiaro che il firmatario è presente e ha apposto personalmente la firma.": { es: "Declaro que el firmante está presente y ha realizado personalmente la firma.", en: "I confirm that the signatory is present and personally provided the signature." },
  "Completa firma": { es: "Completar firma", en: "Complete signature" },
  "Configurazione autenticatore": { es: "Configuración del autenticador", en: "Authenticator setup" },
  "Accesso protetto": { es: "Acceso protegido", en: "Protected access" },
  "Bentornato": { es: "Bienvenido de nuevo", en: "Welcome back" },
  "Password cifrate con derivazione PBKDF2. Il Super Admin usa anche l’autenticatore TOTP.": { es: "Contraseñas protegidas mediante derivación PBKDF2. El Super Admin también utiliza autenticación TOTP.", en: "Passwords are protected using PBKDF2 derivation. The Super Admin also uses TOTP authentication." },
  "Navigazione principale": { es: "Navegación principal", en: "Main navigation" },
  "Copertura": { es: "Cobertura", en: "Coverage" },
  "STORIE · IMPRESE · TERRITORIO": { es: "HISTORIAS · EMPRESAS · TERRITORIO", en: "STORIES · BUSINESSES · TERRITORY" },
  "LA TUA": { es: "TU", en: "YOUR" },
  "STORIA": { es: "HISTORIA", en: "STORY" },
  "MERITA": { es: "MERECE", en: "DESERVES" },
  "SPAZIO.": { es: "ESPACIO.", en: "SPACE." },
  "DIRECTORY 2026": { es: "DIRECTORIO 2026", en: "DIRECTORY 2026" },
  "EXTRA CHANCE": { es: "OPORTUNIDAD EXTRA", en: "EXTRA CHANCE" },
  "Categoria": { es: "Categoría", en: "Category" },
  "Email": { es: "Email", en: "Email" },
  "Password": { es: "Contraseña", en: "Password" },
  "Accedi": { es: "Acceder", en: "Sign in" },
  "Accesso…": { es: "Accediendo…", en: "Signing in…" },
  "Password dimenticata?": { es: "¿Has olvidado la contraseña?", en: "Forgot password?" },
  "Recupera password": { es: "Recuperar contraseña", en: "Recover password" },
  "Invia collegamento": { es: "Enviar enlace", en: "Send link" },
  "Torna all’accesso": { es: "Volver al acceso", en: "Back to sign in" },
  "Cambia la password temporanea": { es: "Cambiar la contraseña temporal", en: "Change temporary password" },
  "Nuova password": { es: "Nueva contraseña", en: "New password" },
  "Conferma password": { es: "Confirmar contraseña", en: "Confirm password" },
  "Cambia e continua": { es: "Cambiar y continuar", en: "Change and continue" },
  "Configura l’autenticatore": { es: "Configurar el autenticador", en: "Set up authenticator" },
  "Scansiona il QR con Google Authenticator, Microsoft Authenticator o un’app compatibile.": { es: "Escanea el QR con Google Authenticator, Microsoft Authenticator o una app compatible.", en: "Scan the QR with Google Authenticator, Microsoft Authenticator or a compatible app." },
  "Chiave manuale:": { es: "Clave manual:", en: "Manual key:" },
  "Codice autenticatore": { es: "Código del autenticador", en: "Authenticator code" },
  "Conferma e accedi": { es: "Confirmar y acceder", en: "Confirm and sign in" },
  "Inserisci il codice a 6 cifre generato dall’app autenticatore.": { es: "Introduce el código de 6 dígitos generado por la app autenticadora.", en: "Enter the 6-digit code generated by your authenticator app." },
  "Codice a 6 cifre": { es: "Código de 6 dígitos", en: "6-digit code" },
  "Imposta o recupera password": { es: "Establecer o recuperar contraseña", en: "Set or recover password" },
  "Imposta password": { es: "Establecer contraseña", en: "Set password" },
  "Italiano": { es: "Italiano", en: "Italian" },
  "Español": { es: "Español", en: "Spanish" },
  "Inglese": { es: "Inglés", en: "English" },
  "Lingua": { es: "Idioma", en: "Language" },
  "Operazione non riuscita.": { es: "La operación no se ha completado.", en: "Operation failed." },
  "Salvataggio non riuscito.": { es: "No se ha podido guardar.", en: "Could not save." },
  "Aggiornamento non riuscito.": { es: "No se ha podido actualizar.", en: "Update failed." },
  "Creazione non riuscita.": { es: "No se ha podido crear.", en: "Creation failed." },
  "Caricamento non riuscito.": { es: "No se ha podido cargar.", en: "Upload failed." },
  "Accesso non riuscito.": { es: "No se ha podido acceder.", en: "Sign-in failed." },
  "Assistente non disponibile.": { es: "Asistente no disponible.", en: "Assistant unavailable." },
  "Admin operativo": { es: "Admin operativo", en: "Operational Admin" },
  "Distributore": { es: "Distribuidor", en: "Distributor" },
  "Senza Sales Manager": { es: "Sin Sales Manager", en: "Without Sales Manager" },
  "Disattivato": { es: "Desactivado", en: "Disabled" },
  "Sistema": { es: "Sistema", en: "System" },
};

let currentLocale: UiLocale = "es";

export function isUiLocale(value: unknown): value is UiLocale {
  return value === "es" || value === "it" || value === "en";
}

export function localeTag(locale = currentLocale): string {
  return LOCALE_TAGS[locale];
}

export function translate(source: string, locale = currentLocale): string {
  if (locale === "it" || !source) return source;
  const exact = COPY[source];
  if (exact) return exact[locale];

  // React often splits sentences around dynamic values. Translate audited fragments
  // without touching long user-entered content.
  if (source.length > 260) return source;
  let translated = source;
  const entries = Object.entries(COPY).sort((a, b) => b[0].length - a[0].length);
  for (const [canonical, value] of entries) {
    if (canonical.length < 4 || !translated.includes(canonical)) continue;
    translated = translated.replaceAll(canonical, value[locale]);
  }
  return translatePatterns(translated, locale);
}

function translatePatterns(source: string, locale: Exclude<UiLocale, "it">): string {
  const patterns: Array<[RegExp, string, string]> = [
    [/(\d+) procedure disponibili/g, "$1 procedimientos disponibles", "$1 procedures available"],
    [/(\d+) versioni attive/g, "$1 versiones activas", "$1 active versions"],
    [/(\d+) account/g, "$1 cuentas", "$1 accounts"],
    [/Ultimi (\d+) eventi/g, "Últimos $1 eventos", "Latest $1 events"],
    [/(\d+) richieste/g, "$1 solicitudes", "$1 requests"],
    [/(\d+) aperte/g, "$1 abiertas", "$1 open"],
    [/versione (\d+)/g, "versión $1", "version $1"],
    [/Aggiornato /g, "Actualizado ", "Updated "],
    [/valido fino al /g, "válido hasta ", "valid until "],
    [/(\d+) mesi/g, "$1 meses", "$1 months"],
    [/(\d+) mese/g, "$1 mes", "$1 month"],
  ];
  return patterns.reduce((value, [pattern, es, en]) => value.replace(pattern, locale === "es" ? es : en), source);
}

type LanguageContextValue = {
  locale: UiLocale;
  setLocale(locale: UiLocale): void;
};

const LanguageContext = createContext<LanguageContextValue>({ locale: "es", setLocale: () => undefined });

export function usePlatformLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

export function platformOwnership(locale: UiLocale): string {
  if (locale === "it") return "La piattaforma CRMVLC.com è stata creata e sviluppata ed è di proprietà di Great Consulting LLC — 8 The Green, Suite R, Dover, Delaware 19901, USA.";
  if (locale === "en") return "The CRMVLC.com platform was created and developed by, and is owned by, Great Consulting LLC — 8 The Green, Suite R, Dover, Delaware 19901, USA.";
  return "La plataforma CRMVLC.com ha sido creada y desarrollada y es propiedad de Great Consulting LLC — 8 The Green, Suite R, Dover, Delaware 19901, USA.";
}

export function PlatformI18n({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>("es");
  const setLocale = useCallback((next: UiLocale) => {
    currentLocale = next;
    setLocaleState(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isUiLocale(stored)) setLocale(stored);
  }, [setLocale]);

  useEffect(() => {
    currentLocale = locale;
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LanguageContext.Provider value={value}><LegacyTextTranslator locale={locale}>{children}</LegacyTextTranslator></LanguageContext.Provider>;
}

export function LanguageSelector({ onSelect, compact = false }: { onSelect?: (locale: UiLocale) => void | Promise<void>; compact?: boolean }) {
  const { locale, setLocale } = usePlatformLanguage();
  const choose = (next: UiLocale) => {
    setLocale(next);
    void onSelect?.(next);
  };
  return <div className={`platform-language ${compact ? "compact" : ""}`} aria-label={translate("Lingua", locale)}>
    {(["es", "it", "en"] as UiLocale[]).map((item) => <button type="button" key={item} className={locale === item ? "active" : ""} aria-pressed={locale === item} onClick={() => choose(item)}>{item.toUpperCase()}</button>)}
  </div>;
}

function LegacyTextTranslator({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textMemoryRef = useRef(new WeakMap<Text, { source: string; last: string }>());
  const attributeMemoryRef = useRef(new WeakMap<Element, Map<string, { source: string; last: string }>>());
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const textMemory = textMemoryRef.current;
    const attributeMemory = attributeMemoryRef.current;
    const attributes = ["placeholder", "title", "aria-label", "data-label"];

    const locked = (node: Node) => node.parentElement?.closest("[data-i18n-lock]") !== null;
    const translateTextNode = (node: Text) => {
      if (locked(node) || node.parentElement?.closest("script,style,code,pre")) return;
      const current = node.data;
      let remembered = textMemory.get(node);
      if (!remembered || current !== remembered.last) remembered = { source: current, last: current };
      const match = remembered.source.match(/^(\s*)([\s\S]*?)(\s*)$/);
      const next = match ? `${match[1]}${translate(match[2], locale)}${match[3]}` : translate(remembered.source, locale);
      remembered.last = next;
      textMemory.set(node, remembered);
      if (current !== next) node.data = next;
    };
    const translateElement = (element: Element) => {
      if (element.closest("[data-i18n-lock]")) return;
      let remembered = attributeMemory.get(element);
      if (!remembered) { remembered = new Map(); attributeMemory.set(element, remembered); }
      for (const attribute of attributes) {
        const current = element.getAttribute(attribute);
        if (!current) continue;
        let item = remembered.get(attribute);
        if (!item || current !== item.last) item = { source: current, last: current };
        const next = translate(item.source, locale);
        item.last = next;
        remembered.set(attribute, item);
        if (current !== next) element.setAttribute(attribute, next);
      }
    };
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text);
      if (node.nodeType === Node.ELEMENT_NODE) {
        translateElement(node as Element);
        for (const child of Array.from(node.childNodes)) walk(child);
      }
    };
    walk(root);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") translateTextNode(mutation.target as Text);
        if (mutation.type === "attributes") translateElement(mutation.target as Element);
        for (const node of Array.from(mutation.addedNodes)) walk(node);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
    return () => observer.disconnect();
  }, [locale]);
  return <div ref={rootRef} className="platform-i18n-root">{children}</div>;
}
