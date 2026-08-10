import { mkdir, writeFile } from "node:fs/promises";
import { buildQuotePdf } from "../worker/quote-pdf.js";

const items = [
  ["Manchette copertina", "70 x 38 mm", 100_000, 1],
  ["Banner sotto il titolo", "185 x 30 mm", 150_000, 1],
  ["Piedone copertina", "259 x 75 mm", 200_000, 1],
  ["Pagina intera interna", "259 x 330 mm", 70_000, 2],
  ["Mezza pagina interna", "259 x 160 mm", 50_000, 1],
  ["Piedone interno", "259 x 75 mm", 38_000, 1],
  ["Quarto di pagina", "127 x 160 mm", 30_000, 1],
  ["Mezza ultima pagina", "259 x 160 mm", 120_000, 1],
].map(([name, dimensions, monthlyPriceCents, quantity], index) => ({
  name,
  dimensions,
  monthlyPriceCents,
  quantity,
  months: 3,
  lineSubtotalCents: monthlyPriceCents * quantity * 3,
  code: `TEST-${index + 1}`,
}));

const subtotalCents = items.reduce((sum, item) => sum + item.lineSubtotalCents, 0);
const discountBps = 1_000;
const discountCents = Math.round(subtotalCents * discountBps / 10_000);
const netCents = subtotalCents - discountCents;
const taxCents = Math.round(netCents * 700 / 10_000);
const bytes = await buildQuotePdf({
  quoteNumber: "VLC-2026-0001",
  customerCompany: "Hotel Atlántico Canarias SL",
  customerContact: "María Fernández",
  customerEmail: "maria@example.com",
  island: "Gran Canaria",
  createdAt: "2026-08-10T10:30:00.000Z",
  validUntil: "2026-09-09",
  months: 3,
  taxName: "IGIC",
  taxRateBps: 700,
  subtotalCents,
  discountBps,
  discountReason: "Campagna trimestrale multisoggetto",
  discountCents,
  netCents,
  taxCents,
  totalCents: netCents + taxCents,
  customerNote: "Materiali grafici da consegnare almeno sette giorni prima della pubblicazione.",
  items,
});

await mkdir("tmp/pdfs", { recursive: true });
await writeFile("tmp/pdfs/preventivo-campione.pdf", bytes);
console.log("tmp/pdfs/preventivo-campione.pdf");
