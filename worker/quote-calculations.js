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
    const lineSubtotalCents = monthlyPriceCents * quantity * months;
    if (!Number.isSafeInteger(lineSubtotalCents)) throw new Error("quote amount is too large");
    return { ...line, monthlyPriceCents, quantity, months, lineSubtotalCents };
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
