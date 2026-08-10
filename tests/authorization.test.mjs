import assert from "node:assert/strict";
import test from "node:test";
import {
  canCancelSignedContract,
  canApplyQuoteDiscount,
  canCreateQuote,
  canManageDeliveries,
  canManagePriceList,
  canReadDelivery,
  canReadPriceList,
  canReadRecord,
  deliveryScope,
  isIsland,
  normalizeEmail,
  recordScope,
} from "../worker/authorization.js";

const client = { island: "Tenerife", owner_user_id: "agent-1" };

test("normalizes and validates identity inputs", () => {
  assert.equal(normalizeEmail("  AGENTE@EXAMPLE.COM "), "agente@example.com");
  assert.equal(isIsland("La Palma"), true);
  assert.equal(isIsland("El Hierro"), false);
});

test("enforces record visibility by role", () => {
  assert.equal(canReadRecord({ id: "admin", role: "super_admin", island: null }, client), true);
  assert.equal(canReadRecord({ id: "manager", role: "sales_manager", island: "Tenerife" }, client), true);
  assert.equal(canReadRecord({ id: "manager", role: "sales_manager", island: "Lanzarote" }, client), false);
  assert.equal(canReadRecord({ id: "agent-1", role: "sales", island: "Tenerife" }, client), true);
  assert.equal(canReadRecord({ id: "agent-2", role: "sales", island: "Tenerife" }, client), false);
  assert.equal(canReadRecord({ id: "driver-1", role: "distributor", island: "Tenerife" }, client), false);
});

test("limits signed-contract cancellation to the super admin", () => {
  assert.equal(canCancelSignedContract({ role: "super_admin" }, { status: "signed" }), true);
  assert.equal(canCancelSignedContract({ role: "sales_manager" }, { status: "signed" }), false);
  assert.equal(canCancelSignedContract({ role: "super_admin" }, { status: "draft" }), false);
});

test("builds the expected database scope", () => {
  assert.deepEqual(recordScope({ role: "super_admin" }), { sql: "", values: [] });
  assert.deepEqual(recordScope({ role: "sales_manager", island: "Gran Canaria" }), {
    sql: " AND island = ?",
    values: ["Gran Canaria"],
  });
  assert.deepEqual(recordScope({ role: "sales", id: "agent-1" }), {
    sql: " AND owner_user_id = ?",
    values: ["agent-1"],
  });
  assert.deepEqual(recordScope({ role: "distributor", id: "driver-1" }), {
    sql: " AND 1 = 0",
    values: [],
  });
});

test("enforces delivery visibility and management", () => {
  const delivery = { island: "Tenerife", distributor_user_id: "driver-1" };
  assert.equal(canManageDeliveries({ role: "super_admin" }), true);
  assert.equal(canManageDeliveries({ role: "sales_manager" }), true);
  assert.equal(canManageDeliveries({ role: "sales" }), false);
  assert.equal(canReadDelivery({ role: "sales_manager", island: "Tenerife" }, delivery), true);
  assert.equal(canReadDelivery({ role: "sales_manager", island: "Lanzarote" }, delivery), false);
  assert.equal(canReadDelivery({ id: "driver-1", role: "distributor" }, delivery), true);
  assert.equal(canReadDelivery({ id: "driver-2", role: "distributor" }, delivery), false);
  assert.deepEqual(deliveryScope({ role: "distributor", id: "driver-1" }), {
    sql: " AND d.distributor_user_id = ?",
    values: ["driver-1"],
  });
});

test("keeps the commercial price list away from distributors", () => {
  assert.equal(canReadPriceList({ role: "super_admin" }), true);
  assert.equal(canReadPriceList({ role: "sales_manager" }), true);
  assert.equal(canReadPriceList({ role: "sales" }), true);
  assert.equal(canReadPriceList({ role: "distributor" }), false);
  assert.equal(canManagePriceList({ role: "super_admin" }), true);
  assert.equal(canManagePriceList({ role: "sales_manager" }), false);
  assert.equal(canManagePriceList({ role: "sales" }), false);
});

test("restricts quote creation and discounts by role", () => {
  assert.equal(canCreateQuote({ role: "super_admin" }), true);
  assert.equal(canCreateQuote({ role: "sales_manager" }), true);
  assert.equal(canCreateQuote({ role: "sales" }), true);
  assert.equal(canCreateQuote({ role: "distributor" }), false);
  assert.equal(canApplyQuoteDiscount({ role: "super_admin" }), true);
  assert.equal(canApplyQuoteDiscount({ role: "sales_manager" }), false);
  assert.equal(canApplyQuoteDiscount({ role: "sales" }), false);
});
