// Tutte le foto (distributori, gestione operativa, caricamenti massivi) sono approvate automaticamente:
// il CRM funziona in autonomia. Le anomalie (fuori zona, possibile duplicato, esito AI) restano segnalate
// nei dati e la gestione può comunque rifiutare una foto in seguito.
export function photoReviewForUploader(role, userId, reviewedAt) {
  return {
    status: "approved",
    reviewedBy: userId,
    reviewedAt,
    autoApproved: true,
  };
}
