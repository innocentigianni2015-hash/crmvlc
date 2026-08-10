import assert from "node:assert/strict";
import test from "node:test";
import { calculateQuoteTotals, formatQuoteNumber } from "../worker/quote-calculations.js";

test("calculates net prices, super-admin discount and IGIC in cents", () => {
  const result = calculateQuoteTotals([
    { id: "a", monthlyPriceCents: 100_000, quantity: 1 },
    { id: "b", monthlyPriceCents: 50_000, quantity: 2 },
  ], 3, 700, 1_000);

  assert.equal(result.subtotalCents, 600_000);
  assert.equal(result.discountCents, 60_000);
  assert.equal(result.netCents, 540_000);
  assert.equal(result.taxCents, 37_800);
  assert.equal(result.totalCents, 577_800);
  assert.deepEqual(result.lines.map((line) => line.lineSubtotalCents), [300_000, 300_000]);
});

test("rounds IGIC only after applying the discount", () => {
  const result = calculateQuoteTotals([{ monthlyPriceCents: 999, quantity: 1 }], 1, 700, 333);
  assert.equal(result.discountCents, 33);
  assert.equal(result.netCents, 966);
  assert.equal(result.taxCents, 68);
  assert.equal(result.totalCents, 1_034);
});

test("formats a yearly sequential quote number", () => {
  assert.equal(formatQuoteNumber(2026, 1), "VLC-2026-0001");
  assert.equal(formatQuoteNumber(2026, 12_345), "VLC-2026-12345");
});

test("rejects empty quotes and invalid discounts", () => {
  assert.throws(() => calculateQuoteTotals([], 1, 700, 0), /required/);
  assert.throws(() => calculateQuoteTotals([{ monthlyPriceCents: 100, quantity: 1 }], 1, 700, 10_001), /discount/);
});
