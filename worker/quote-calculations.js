export const PRICING_MODELS = ["monthly", "per_issue", "one_time"];

export function calculateQuoteTotals(lines, months, taxRateBps, discountBps) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("quote lines are required");
  if (!Number.isInteger(months) || months < 1 || months > 36) throw new Error("invalid quote duration");
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000) throw new Error("invalid tax rate");
  if (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 10_000) throw new Error("invalid discount");

  const calculatedLines = lines.map((line) => {
    const monthlyPriceCents = Number(line.monthlyPriceCents);
    const quantity = Number(line.quantity);
    if (!Number.isSafeInteger(monthlyPriceCents) || monthlyPriceCents < 0) throw new Error("invalid monthly price");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("invalid quantity");
    const pricingModel = line.pricingModel ?? "per_issue";
    if (!PRICING_MODELS.includes(pricingModel)) throw new Error("invalid pricing model");
    // Le voci "una tantum" non dipendono dalla durata del preventivo: prezzo x quantita.
    const lineMonths = pricingModel === "one_time" ? 1 : months;
    const complimentary = line.complimentary === true;
    // Le righe in omaggio mantengono il prezzo di listino (per mostrarne il valore) ma non entrano nel totale.
    const lineSubtotalCents = complimentary ? 0 : monthlyPriceCents * quantity * lineMonths;
    if (!Number.isSafeInteger(lineSubtotalCents)) throw new Error("quote amount is too large");
    return { ...line, pricingModel, monthlyPriceCents, quantity, months: lineMonths, complimentary, lineSubtotalCents };
  });

  const subtotalCents = calculatedLines.reduce((sum, line) => sum + line.lineSubtotalCents, 0);
  if (!Number.isSafeInteger(subtotalCents)) throw new Error("quote amount is too large");
  const discountCents = Math.round(subtotalCents * discountBps / 10_000);
  const netCents = subtotalCents - discountCents;
  const taxCents = Math.round(netCents * taxRateBps / 10_000);
  const totalCents = netCents + taxCents;
  return { lines: calculatedLines, subtotalCents, discountCents, netCents, taxCents, totalCents };
}

export function formatQuoteNumber(year, sequence) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error("invalid quote year");
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999) throw new Error("invalid quote sequence");
  return `VLC-${year}-${String(sequence).padStart(4, "0")}`;
}

// Righe e totali "da documento" (preventivo e contratto): ogni riga mostra l'importo pieno, lo sconto applicato
// e il netto. Le righe promozionali (omaggio) hanno importo pieno e bonificazione del 100 %; lo sconto commerciale
// del documento viene ripartito sulle righe a pagamento in proporzione all'importo, così la somma delle righe
// coincide sempre con il totale dello sconto. Funziona anche con i documenti già emessi (omaggio salvato a 0).
export const PROMOTIONAL_SERVICE_LABEL = "Servicio promocional incluido en acuerdo comercial (Bonificación 100%)";
export const PROMOTIONAL_SERVICE_CLAUSE = "El servicio promocional incluido sin cargo forma parte integrante de la oferta comercial vinculada a la contratación principal.";

export function documentLineFigures(items, discountBps, discountCents) {
  const commercialBps = Number(discountBps) || 0;
  const commercialCents = Math.max(0, Number(discountCents) || 0);
  const lines = (Array.isArray(items) ? items : []).map((item) => {
    const complimentary = item.complimentary === true || item.complimentary === 1;
    const months = item.pricingModel === "one_time" ? 1 : Number(item.months) || 1;
    const grossCents = complimentary
      ? Number(item.monthlyPriceCents) * Number(item.quantity) * months
      : Number(item.lineSubtotalCents) || 0;
    return { ...item, complimentary, grossCents, discountBps: complimentary ? 10_000 : commercialBps, discountCents: complimentary ? grossCents : 0 };
  });
  const paid = lines.filter((line) => !line.complimentary);
  const paidTotal = paid.reduce((sum, line) => sum + line.grossCents, 0);
  let allocated = 0;
  paid.forEach((line, index) => {
    const share = index === paid.length - 1
      ? commercialCents - allocated
      : paidTotal > 0 ? Math.floor(commercialCents * line.grossCents / paidTotal) : 0;
    line.discountCents = share;
    allocated += share;
  });
  for (const line of lines) line.netCents = line.grossCents - line.discountCents;
  const grossCents = lines.reduce((sum, line) => sum + line.grossCents, 0);
  const promotionalCents = lines.filter((line) => line.complimentary).reduce((sum, line) => sum + line.grossCents, 0);
  return {
    lines,
    grossCents,
    commercialDiscountCents: commercialCents,
    commercialDiscountBps: commercialBps,
    promotionalCents,
    totalDiscountCents: commercialCents + promotionalCents,
    hasPromotional: promotionalCents > 0 || lines.some((line) => line.complimentary),
  };
}
