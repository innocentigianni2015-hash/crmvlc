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

test("one-time products ignore the quote duration while per-issue products multiply by it", () => {
  const result = calculateQuoteTotals([
    { priceItemId: "a", monthlyPriceCents: 10_000, quantity: 2, pricingModel: "per_issue" },
    { priceItemId: "b", monthlyPriceCents: 25_000, quantity: 1, pricingModel: "one_time" },
    { priceItemId: "c", monthlyPriceCents: 5_000, quantity: 1 },
  ], 3, 700, 0);
  assert.deepEqual(result.lines.map((line) => line.lineSubtotalCents), [60_000, 25_000, 15_000]);
  assert.equal(result.lines[1].months, 1);
  assert.equal(result.subtotalCents, 100_000);
  assert.throws(() => calculateQuoteTotals([{ monthlyPriceCents: 1, quantity: 1, pricingModel: "weekly" }], 1, 700, 0), /pricing model/);
});

test("complimentary lines are shown but cost nothing and do not alter the totals", () => {
  const result = calculateQuoteTotals([
    { priceItemId: "a", monthlyPriceCents: 4_900, quantity: 1, pricingModel: "monthly", complimentary: true },
    { priceItemId: "b", monthlyPriceCents: 9_900, quantity: 1, pricingModel: "monthly" },
  ], 3, 700, 0);
  assert.deepEqual(result.lines.map((line) => line.lineSubtotalCents), [0, 29_700]);
  assert.equal(result.lines[0].complimentary, true);
  assert.equal(result.lines[1].complimentary, false);
  assert.equal(result.subtotalCents, 29_700);
});
