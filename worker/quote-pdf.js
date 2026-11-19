import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { documentLineFigures, PROMOTIONAL_SERVICE_CLAUSE, PROMOTIONAL_SERVICE_LABEL } from "./quote-calculations.js";

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
  page.drawText("PRESUPUESTO", { x: 398, y: PAGE_HEIGHT - 58, size: 15, font: bold, color: rgb(1, 1, 1) });
  page.drawText(safeText(quote.quoteNumber), { x: 410, y: PAGE_HEIGHT - 77, size: 9, font, color: rgb(0.88, 0.92, 0.95) });

  let y = 695;
  drawLabel(page, bold, muted, "CLIENTE", MARGIN, y);
  drawLabel(page, bold, muted, "DETALLES", 350, y);
  y -= 20;
  page.drawText(safeText(quote.customerCompany), { x: MARGIN, y, size: 13, font: bold, color: dark, maxWidth: 270 });
  page.drawText(`Fecha: ${formatDate(quote.createdAt)}`, { x: 350, y, size: 9, font, color: dark });
  y -= 17;
  page.drawText(safeText(quote.customerContact), { x: MARGIN, y, size: 9, font, color: muted, maxWidth: 270 });
  page.drawText(`Válido hasta: ${formatDate(quote.validUntil)}`, { x: 350, y, size: 9, font, color: dark });
  y -= 15;
  page.drawText(safeText(quote.customerEmail), { x: MARGIN, y, size: 9, font, color: muted, maxWidth: 270 });
  page.drawText(`Isla: ${safeText(quote.island)}`, { x: 350, y, size: 9, font, color: dark });
  y -= 15;
  page.drawText(`Duración comercial: ${quote.months} ${quote.months === 1 ? "mes" : "meses"}`, { x: 350, y, size: 9, font, color: dark });

  y = 602;
  const figures = documentLineFigures(quote.items, quote.discountBps, quote.discountCents);
  const tableHeader = (target, top) => {
    target.drawRectangle({ x: MARGIN, y: top, width: PAGE_WIDTH - (MARGIN * 2), height: 24, color: pale });
    target.drawText("DESCRIPCIÓN", { x: MARGIN + 8, y: top + 8, size: 7.2, font: bold, color: muted });
    target.drawText("CANT.", { x: 286, y: top + 8, size: 7.2, font: bold, color: muted });
    target.drawText("MESES", { x: 317, y: top + 8, size: 7.2, font: bold, color: muted });
    drawRight(target, bold, "PRECIO/MES", 418, top + 8, 7.2, muted);
    drawRight(target, bold, "IMPORTE", 482, top + 8, 7.2, muted);
    drawRight(target, bold, "DTO.", PAGE_WIDTH - MARGIN, top + 8, 7.2, muted);
  };
  let current = page;
  const newPage = () => {
    current = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    return PAGE_HEIGHT - 70;
  };
  tableHeader(current, y);
  y -= 23;

  for (const item of figures.lines) {
    const detail = `${item.dimensions}${item.pricingModel === "one_time" ? " · pago único" : ""}${item.complimentary ? " ·" : ""}`;
    const detailRows = wrapWidth(safeText(detail), font, 7, 225);
    const plainRows = detailRows.length;
    if (item.complimentary) detailRows.push(...wrapWidth(safeText(PROMOTIONAL_SERVICE_LABEL), font, 7, 225));
    const rowHeight = Math.max(31, 22 + detailRows.length * 9);
    if (y - rowHeight < 90) { y = newPage(); tableHeader(current, y); y -= 23; }
    current.drawText(safeText(item.name), { x: MARGIN + 8, y, size: 8.5, font: bold, color: dark, maxWidth: 230 });
    detailRows.forEach((row, index) => current.drawText(row, { x: MARGIN + 8, y: y - 11 - index * 9, size: 7, font, color: index >= plainRows ? coral : muted }));
    current.drawText(String(item.quantity), { x: 292, y: y - 4, size: 8.5, font, color: dark });
    current.drawText(item.pricingModel === "one_time" ? "-" : String(item.months), { x: 323, y: y - 4, size: 8.5, font, color: dark });
    drawRight(current, font, money(item.monthlyPriceCents), 418, y - 4, 8.2, dark);
    drawRight(current, font, money(item.grossCents), 482, y - 4, 8.2, dark);
    if (item.discountCents > 0 || item.complimentary) {
      drawRight(current, bold, percent(item.discountBps), PAGE_WIDTH - MARGIN, y - 4, 8.2, coral);
      drawRight(current, font, `-${money(item.discountCents)}`, PAGE_WIDTH - MARGIN, y - 13, 6.6, muted);
    } else {
      drawRight(current, font, "-", PAGE_WIDTH - MARGIN, y - 4, 8.2, muted);
    }
    current.drawLine({ start: { x: MARGIN, y: y - rowHeight + 13 }, end: { x: PAGE_WIDTH - MARGIN, y: y - rowHeight + 13 }, thickness: 0.6, color: line });
    y -= rowHeight;
  }

  const totalRows = [["Importe bruto", money(figures.grossCents), muted]];
  if (figures.commercialDiscountCents > 0) totalRows.push([`Descuento comercial ${percent(figures.commercialDiscountBps)}`, `-${money(figures.commercialDiscountCents)}`, coral]);
  if (figures.promotionalCents > 0) totalRows.push(["Bonificación promocional 100 %", `-${money(figures.promotionalCents)}`, coral]);
  if (figures.totalDiscountCents > 0) totalRows.push(["Total descuentos", `-${money(figures.totalDiscountCents)}`, coral]);
  totalRows.push(["Base imponible", money(quote.netCents), muted]);
  totalRows.push([`${safeText(quote.taxName)} ${percent(quote.taxRateBps)}`, money(quote.taxCents), muted]);
  const totalsHeight = totalRows.length * 18 + 30;
  if (y - 2 - totalsHeight < 80) y = newPage();
  const totalsX = 330;
  let totalsY = y - 2;
  for (const [label, value, color] of totalRows) {
    drawTotal(current, label === "Total descuentos" ? bold : font, color, safeText(label), value, totalsX, totalsY);
    totalsY -= 18;
  }
  totalsY -= 9;
  current.drawLine({ start: { x: totalsX, y: totalsY + 18 }, end: { x: PAGE_WIDTH - MARGIN, y: totalsY + 18 }, thickness: 1, color: dark });
  current.drawText("TOTAL", { x: totalsX, y: totalsY, size: 11, font: bold, color: dark });
  drawRight(current, bold, money(quote.totalCents), PAGE_WIDTH - MARGIN, totalsY, 15, coral);

  const notes = [];
  if (quote.customerNote) notes.push(`Notas: ${quote.customerNote}`);
  if (quote.discountReason && figures.commercialDiscountCents > 0) notes.push(`Motivo del descuento: ${quote.discountReason}`);
  if (figures.hasPromotional) notes.push(PROMOTIONAL_SERVICE_CLAUSE);
  notes.push(`Precios netos. ${quote.taxName} aplicado por separado.`);
  notes.push("La conversión en el CRM genera un borrador contractual que debe verificarse y someterse a firma con OTP.");
  let noteY = totalsY - 26;
  for (const paragraph of notes) {
    const rows = wrapWidth(safeText(paragraph), font, 7.5, PAGE_WIDTH - MARGIN * 2);
    if (noteY - rows.length * 10 < 70) noteY = newPage();
    for (const row of rows) {
      current.drawText(row, { x: MARGIN, y: noteY, size: 7.5, font, color: muted });
      noteY -= 10;
    }
    noteY -= 3;
  }

  for (const target of pdf.getPages()) {
    target.drawLine({ start: { x: MARGIN, y: 55 }, end: { x: PAGE_WIDTH - MARGIN, y: 55 }, thickness: 0.7, color: line });
    target.drawText("Canary 360 & Comunication SL · B56378318 · Avenida Las Américas 8, Local 396E, Arona, Santa Cruz de Tenerife", { x: MARGIN, y: 42, size: 6.2, font, color: muted });
    target.drawText("+34 822 140 134 · info@vivilecanarie.com · crmvlc.com", { x: MARGIN, y: 31, size: 6.2, font, color: muted });
    target.drawText("Plataforma creada, desarrollada y propiedad de Canary 360 & Comunication SL.", { x: MARGIN, y: 20, size: 5.6, font, color: muted });
    drawRight(target, font, safeText(quote.quoteNumber), PAGE_WIDTH - MARGIN, 31, 6.2, muted);
  }

  pdf.setTitle(`Presupuesto ${safeText(quote.quoteNumber)}`);
  pdf.setAuthor("Canary 360 & Comunication SL");
  pdf.setSubject("Presupuesto comercial VLC");
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
  // Formato spagnolo con separatore delle migliaia anche sotto 10.000 (es. 1.632,00 EUR).
  const value = Number(cents) || 0;
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(value));
  const units = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${units},${String(absolute % 100).padStart(2, "0")} EUR`;
}

function formatDate(value) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function safeText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2000-\u200F\u2060\uFEFF]/g, "")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function percent(bps) {
  return `${(Number(bps) / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
}

function wrapWidth(value, font, size, maxWidth) {
  const words = String(value).split(/\s+/).filter(Boolean);
  const rows = [];
  let row = "";
  for (const word of words) {
    const candidate = row ? `${row} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) row = candidate;
    else {
      if (row) rows.push(row);
      row = word;
    }
  }
  if (row) rows.push(row);
  return rows;
}
