import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildQuotePdf } from "../worker/quote-pdf.js";

test("builds a valid one-page A4 quote PDF", async () => {
  const bytes = await buildQuotePdf({
    quoteNumber: "VLC-2026-0001",
    customerCompany: "Cliente Test SL",
    customerContact: "Mario Rossi",
    customerEmail: "mario@example.com",
    island: "Tenerife",
    createdAt: "2026-08-10T10:30:00.000Z",
    validUntil: "2026-09-09",
    months: 1,
    taxName: "IGIC",
    taxRateBps: 700,
    subtotalCents: 100_000,
    discountBps: 0,
    discountReason: null,
    discountCents: 0,
    netCents: 100_000,
    taxCents: 7_000,
    totalCents: 107_000,
    customerNote: null,
    items: [{ name: "Manchette copertina", dimensions: "70 x 38 mm", monthlyPriceCents: 100_000, quantity: 1, months: 1, lineSubtotalCents: 100_000 }],
  });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getTitle(), "Presupuesto VLC-2026-0001");
  const [page] = pdf.getPages();
  assert.ok(Math.abs(page.getWidth() - 595.28) < 0.01);
  assert.ok(Math.abs(page.getHeight() - 841.89) < 0.01);
});
