import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildContractPdf } from "../worker/contract-pdf.js";

const fixture = {
  quoteId: "quote-1",
  quoteNumber: "VLC-2026-0042",
  customerCompany: "Cliente Test SL",
  customerEmail: "administracion@cliente.es",
  customerPhone: "+34600111222",
  taxId: "B12345678",
  fiscalAddress: "Calle del Mar 10, 38001 Santa Cruz de Tenerife",
  billingEmail: "facturas@cliente.es",
  legalSignerName: "María Pérez",
  legalSignerRole: "Administradora",
  island: "Tenerife",
  campaignStartDate: "2026-09-01",
  campaignEndDate: "2027-02-28",
  destinationUrl: "https://cliente.es/",
  printEdition: "N. 12 · septiembre 2026",
  printRun: 10_000,
  distribution: "Tenerife · hoteles, restaurantes y puntos autorizados",
  months: 6,
  taxName: "IGIC",
  taxRateBps: 700,
  subtotalCents: 600_000,
  discountBps: 500,
  discountReason: "Campaña lanzamiento",
  discountCents: 30_000,
  netCents: 570_000,
  taxCents: 39_900,
  totalCents: 609_900,
  generatedAt: "2026-08-11T12:00:00.000Z",
  items: [
    { code: "INT-01", name: "Página interior alta visibilidad", dimensions: "210 × 297 mm", monthlyPriceCents: 100_000, quantity: 1, months: 6, lineSubtotalCents: 600_000 },
  ],
};

test("builds a valid multi-page Spanish commercial contract", async () => {
  const bytes = await buildContractPdf(fixture);
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 4);
  assert.equal(pdf.getTitle(), "Acuerdo comercial VLC-2026-0042");
  assert.equal(pdf.getAuthor(), "Canary 360 & Comunication S.L.");
  for (const page of pdf.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 595.28) < 0.01);
    assert.ok(Math.abs(page.getHeight() - 841.89) < 0.01);
  }
  assert.ok(bytes.byteLength < 2_800_000);
});

test("supports enough product lines to force safe pagination", async () => {
  const items = Array.from({ length: 30 }, (_, index) => ({
    code: `ITEM-${index + 1}`,
    name: `Producto publicitario número ${index + 1}`,
    dimensions: "210 × 297 mm",
    monthlyPriceCents: 10_000,
    quantity: 1,
    months: 1,
    lineSubtotalCents: 10_000,
  }));
  const bytes = await buildContractPdf({ ...fixture, items, subtotalCents: 300_000, discountBps: 0, discountCents: 0, netCents: 300_000, taxCents: 21_000, totalCents: 321_000 });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 5);
});
