import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;

export async function buildQuotePdf(quote) {
  const pdf = await PDFDocument.create();
  const [font, bold] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  const dark = rgb(0.055, 0.145, 0.235);
  const coral = rgb(0.88, 0.31, 0.24);
  const muted = rgb(0.38, 0.45, 0.51);
  const line = rgb(0.86, 0.89, 0.91);
  const pale = rgb(0.965, 0.973, 0.978);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 112, width: PAGE_WIDTH, height: 112, color: dark });
  page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - 80, width: 32, height: 32, color: coral });
  page.drawText("V", { x: MARGIN + 10.5, y: PAGE_HEIGHT - 70, size: 15, font: bold, color: rgb(1, 1, 1) });
  page.drawText("VIVI LE CANARIE", { x: MARGIN + 44, y: PAGE_HEIGHT - 59, size: 13, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Canary 360 & Comunication SL", { x: MARGIN + 44, y: PAGE_HEIGHT - 75, size: 7.5, font, color: rgb(0.77, 0.84, 0.88) });
  page.drawText("PREVENTIVO", { x: 410, y: PAGE_HEIGHT - 58, size: 17, font: bold, color: rgb(1, 1, 1) });
  page.drawText(safeText(quote.quoteNumber), { x: 410, y: PAGE_HEIGHT - 77, size: 9, font, color: rgb(0.88, 0.92, 0.95) });

  let y = 695;
  drawLabel(page, bold, muted, "CLIENTE", MARGIN, y);
  drawLabel(page, bold, muted, "DETTAGLI", 350, y);
  y -= 20;
  page.drawText(safeText(quote.customerCompany), { x: MARGIN, y, size: 13, font: bold, color: dark, maxWidth: 270 });
  page.drawText(`Data: ${formatDate(quote.createdAt)}`, { x: 350, y, size: 9, font, color: dark });
  y -= 17;
  page.drawText(safeText(quote.customerContact), { x: MARGIN, y, size: 9, font, color: muted, maxWidth: 270 });
  page.drawText(`Valido fino al: ${formatDate(quote.validUntil)}`, { x: 350, y, size: 9, font, color: dark });
  y -= 15;
  page.drawText(safeText(quote.customerEmail), { x: MARGIN, y, size: 9, font, color: muted, maxWidth: 270 });
  page.drawText(`Isola: ${safeText(quote.island)}`, { x: 350, y, size: 9, font, color: dark });
  y -= 15;
  page.drawText(`Durata commerciale: ${quote.months} ${quote.months === 1 ? "mese" : "mesi"}`, { x: 350, y, size: 9, font, color: dark });

  y = 602;
  page.drawRectangle({ x: MARGIN, y, width: PAGE_WIDTH - (MARGIN * 2), height: 24, color: pale });
  page.drawText("DESCRIZIONE", { x: MARGIN + 8, y: y + 8, size: 7.5, font: bold, color: muted });
  page.drawText("QTA", { x: 348, y: y + 8, size: 7.5, font: bold, color: muted });
  page.drawText("MESI", { x: 383, y: y + 8, size: 7.5, font: bold, color: muted });
  page.drawText("PREZZO/MESE", { x: 423, y: y + 8, size: 7.5, font: bold, color: muted });
  page.drawText("TOTALE", { x: 512, y: y + 8, size: 7.5, font: bold, color: muted });
  y -= 23;

  for (const item of quote.items) {
    page.drawText(safeText(item.name), { x: MARGIN + 8, y, size: 8.5, font: bold, color: dark, maxWidth: 268 });
    page.drawText(safeText(item.dimensions), { x: MARGIN + 8, y: y - 11, size: 7, font, color: muted, maxWidth: 268 });
    page.drawText(String(item.quantity), { x: 352, y: y - 4, size: 8.5, font, color: dark });
    page.drawText(String(item.months), { x: 390, y: y - 4, size: 8.5, font, color: dark });
    drawRight(page, font, money(item.monthlyPriceCents), 491, y - 4, 8.5, dark);
    drawRight(page, bold, money(item.lineSubtotalCents), 549, y - 4, 8.5, dark);
    page.drawLine({ start: { x: MARGIN, y: y - 18 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 18 }, thickness: 0.6, color: line });
    y -= 31;
  }

  const totalsTop = Math.max(126, y - 2);
  const totalsX = 356;
  drawTotal(page, font, muted, "Subtotale", money(quote.subtotalCents), totalsX, totalsTop);
  let totalsY = totalsTop - 18;
  if (quote.discountCents > 0) {
    drawTotal(page, font, coral, `Sconto ${(quote.discountBps / 100).toLocaleString("it-IT")}%`, `-${money(quote.discountCents)}`, totalsX, totalsY);
    totalsY -= 18;
  }
  drawTotal(page, font, muted, "Imponibile", money(quote.netCents), totalsX, totalsY);
  totalsY -= 18;
  drawTotal(page, font, muted, `${safeText(quote.taxName)} ${(quote.taxRateBps / 100).toLocaleString("it-IT")}%`, money(quote.taxCents), totalsX, totalsY);
  totalsY -= 27;
  page.drawLine({ start: { x: totalsX, y: totalsY + 18 }, end: { x: PAGE_WIDTH - MARGIN, y: totalsY + 18 }, thickness: 1, color: dark });
  page.drawText("TOTALE", { x: totalsX, y: totalsY, size: 11, font: bold, color: dark });
  drawRight(page, bold, money(quote.totalCents), PAGE_WIDTH - MARGIN, totalsY, 15, coral);

  const notes = [];
  if (quote.customerNote) notes.push(`Note: ${quote.customerNote}`);
  if (quote.discountReason) notes.push(`Motivo sconto: ${quote.discountReason}`);
  notes.push(`Prezzi netti. ${quote.taxName} applicato separatamente.`);
  notes.push("La conversione nel CRM genera una bozza contrattuale da verificare e sottoporre a firma OTP.");
  let noteY = Math.min(178, totalsY - 8);
  for (const paragraph of notes) {
    for (const row of wrapText(safeText(paragraph), 72)) {
      page.drawText(row, { x: MARGIN, y: noteY, size: 7.5, font, color: muted });
      noteY -= 10;
    }
    noteY -= 3;
  }

  page.drawLine({ start: { x: MARGIN, y: 55 }, end: { x: PAGE_WIDTH - MARGIN, y: 55 }, thickness: 0.7, color: line });
  page.drawText("Canary 360 & Comunication SL · B56378318 · Avenida Las Americas 8, Local 396E, Arona, Santa Cruz de Tenerife", { x: MARGIN, y: 40, size: 6.5, font, color: muted });
  page.drawText("+34 822 140 134 · info@vivilecanarie.com · crmvlc.com", { x: MARGIN, y: 28, size: 6.5, font, color: muted });
  drawRight(page, font, safeText(quote.quoteNumber), PAGE_WIDTH - MARGIN, 28, 6.5, muted);

  pdf.setTitle(`Preventivo ${safeText(quote.quoteNumber)}`);
  pdf.setAuthor("Canary 360 & Comunication SL");
  pdf.setSubject("Preventivo commerciale VLC");
  pdf.setProducer("CRMVLC");
  return pdf.save({ useObjectStreams: true });
}

function drawLabel(page, font, color, value, x, y) {
  page.drawText(value, { x, y, size: 7.5, font, color });
}

function drawRight(page, font, value, right, y, size, color) {
  page.drawText(value, { x: right - font.widthOfTextAtSize(value, size), y, size, font, color });
}

function drawTotal(page, font, color, label, value, x, y) {
  page.drawText(label, { x, y, size: 8.5, font, color });
  drawRight(page, font, value, PAGE_WIDTH - MARGIN, y, 8.5, color);
}

function money(cents) {
  return `${(Number(cents) / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function formatDate(value) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function safeText(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrapText(value, maxCharacters) {
  const words = value.split(/\s+/).filter(Boolean);
  const rows = [];
  let row = "";
  for (const word of words) {
    const candidate = row ? `${row} ${word}` : word;
    if (candidate.length <= maxCharacters) row = candidate;
    else {
      if (row) rows.push(row);
      row = word.slice(0, maxCharacters);
    }
  }
  if (row) rows.push(row);
  return rows.slice(0, 5);
}
