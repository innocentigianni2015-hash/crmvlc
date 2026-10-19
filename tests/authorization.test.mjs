import assert from "node:assert/strict";
import test from "node:test";
import {
  canCancelSignedContract,
  canApplyQuoteDiscount,
  canAssignClientOwner,
  canCreateQuote,
  canCreateUserWithRole,
  canEditDeliveryDetails,
  canManageDeliveries,
  canManageDiscountCampaigns,
  canManagePodcastCalendar,
  canManageSalesApplications,
  canManagePriceList,
  canImpersonateUsers,
  canReadDelivery,
  canReadPodcastCalendar,
  canReadPriceList,
  canReadRecord,
  canTransitionDeliveryStatus,
  canUseDiscountCampaign,
  canUpdateUserRole,
  deliveryScope,
  isIsland,
  normalizeEmail,
  recordScope,
} from "../worker/authorization.js";
import { createImpersonationToken, verifyImpersonationToken } from "../worker/impersonation.ts";
import { canaryDateKey, canaryLocalToIso, oneHourAfter } from "../worker/podcast-scheduling.ts";

const client = { island: "Tenerife", owner_user_id: "agent-1", owner_sales_manager_id: "manager-1" };

test("normalizes and validates identity inputs", () => {
  assert.equal(normalizeEmail("  AGENTE@EXAMPLE.COM "), "agente@example.com");
  assert.equal(isIsland("La Palma"), true);
  assert.equal(isIsland("El Hierro"), false);
});

test("enforces record visibility by role", () => {
  assert.equal(canReadRecord({ id: "admin", role: "super_admin", island: null }, client), true);
  assert.equal(canReadRecord({ id: "operator", role: "admin", island: null }, client), true);
  assert.equal(canReadRecord({ id: "manager-1", role: "sales_manager", island: "Tenerife" }, client), true);
  assert.equal(canReadRecord({ id: "manager-2", role: "sales_manager", island: "Tenerife" }, client), false);
  assert.equal(canReadRecord({ id: "agent-1", role: "sales", island: "Tenerife" }, client), true);
  assert.equal(canReadRecord({ id: "agent-2", role: "sales", island: "Tenerife" }, client), false);
  assert.equal(canReadRecord({ id: "driver-1", role: "distributor", island: "Tenerife" }, client), false);
});

test("limits signed-contract cancellation to the super admin", () => {
  assert.equal(canCancelSignedContract({ role: "super_admin" }, { status: "signed" }), true);
  assert.equal(canCancelSignedContract({ role: "sales_manager" }, { status: "signed" }), false);
  assert.equal(canCancelSignedContract({ role: "admin" }, { status: "signed" }), false);
  assert.equal(canCancelSignedContract({ role: "super_admin" }, { status: "draft" }), false);
});

test("builds the expected database scope", () => {
  assert.deepEqual(recordScope({ role: "super_admin" }), { sql: "", values: [] });
  assert.deepEqual(recordScope({ role: "admin" }), { sql: "", values: [] });
  assert.deepEqual(recordScope({ id: "manager-1", role: "sales_manager", island: "Gran Canaria" }), {
    sql: " AND (owner_user_id = ? OR owner_user_id IN (SELECT id FROM users WHERE role = 'sales' AND sales_manager_id = ?))",
    values: ["manager-1", "manager-1"],
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

test("allows client reassignment only inside the explicit sales team", () => {
  const teamSales = { id: "sales-1", role: "sales", island: "Tenerife", sales_manager_id: "manager-1", active: 1 };
  const otherSales = { id: "sales-2", role: "sales", island: "Tenerife", sales_manager_id: "manager-2", active: 1 };
  assert.equal(canAssignClientOwner({ id: "manager-1", role: "sales_manager" }, teamSales), true);
  assert.equal(canAssignClientOwner({ id: "manager-1", role: "sales_manager" }, otherSales), false);
  assert.equal(canAssignClientOwner({ id: "admin", role: "admin" }, otherSales), true);
  assert.equal(canAssignClientOwner({ id: "sales-1", role: "sales" }, teamSales), true);
  assert.equal(canAssignClientOwner({ id: "sales-1", role: "sales" }, { ...teamSales, active: 0 }), false);
});

test("enforces delivery visibility and management", () => {
  const delivery = { island: "Tenerife", distributor_user_id: "driver-1" };
  assert.equal(canManageDeliveries({ role: "super_admin" }), true);
  assert.equal(canManageDeliveries({ role: "admin" }), true);
  assert.equal(canManageDeliveries({ role: "sales_manager" }), true);
  assert.equal(canManageDeliveries({ role: "sales" }), false);
  assert.equal(canEditDeliveryDetails({ role: "super_admin" }), true);
  assert.equal(canEditDeliveryDetails({ role: "admin" }), true);
  assert.equal(canEditDeliveryDetails({ role: "sales_manager" }), true);
  assert.equal(canEditDeliveryDetails({ role: "sales" }), false);
  assert.equal(canEditDeliveryDetails({ role: "distributor" }), false);
  assert.equal(canTransitionDeliveryStatus({ role: "distributor" }, "assigned", "delivered"), true);
  assert.equal(canTransitionDeliveryStatus({ role: "distributor" }, "in_progress", "assigned"), false);
  assert.equal(canTransitionDeliveryStatus({ role: "distributor" }, "delivered", "issue"), false);
  assert.equal(canTransitionDeliveryStatus({ role: "sales_manager" }, "delivered", "assigned"), true);
  assert.equal(canReadDelivery({ role: "sales_manager", island: "Tenerife" }, delivery), true);
  assert.equal(canReadDelivery({ role: "admin", island: null }, delivery), true);
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
  assert.equal(canReadPriceList({ role: "admin" }), true);
  assert.equal(canReadPriceList({ role: "sales_manager" }), true);
  assert.equal(canReadPriceList({ role: "sales" }), true);
  assert.equal(canReadPriceList({ role: "distributor" }), false);
  assert.equal(canManagePriceList({ role: "super_admin" }), true);
  assert.equal(canManagePriceList({ role: "admin" }), true);
  assert.equal(canManagePriceList({ role: "sales_manager" }), false);
  assert.equal(canManagePriceList({ role: "sales" }), false);
});

test("restricts quote creation and discounts by role", () => {
  assert.equal(canCreateQuote({ role: "super_admin" }), true);
  assert.equal(canCreateQuote({ role: "admin" }), true);
  assert.equal(canCreateQuote({ role: "sales_manager" }), true);
  assert.equal(canCreateQuote({ role: "sales" }), true);
  assert.equal(canCreateQuote({ role: "distributor" }), false);
  assert.equal(canApplyQuoteDiscount({ role: "super_admin" }), true);
  assert.equal(canApplyQuoteDiscount({ role: "admin" }), true);
  assert.equal(canApplyQuoteDiscount({ role: "sales_manager" }), true);
  assert.equal(canApplyQuoteDiscount({ role: "sales" }), true);
  assert.equal(canApplyQuoteDiscount({ role: "distributor" }), false);
  assert.equal(canUseDiscountCampaign({ role: "super_admin" }), true);
  assert.equal(canUseDiscountCampaign({ role: "sales_manager" }), true);
  assert.equal(canUseDiscountCampaign({ role: "sales" }), true);
  assert.equal(canUseDiscountCampaign({ role: "admin" }), true);
  assert.equal(canUseDiscountCampaign({ role: "distributor" }), false);
  assert.equal(canManageDiscountCampaigns({ role: "super_admin" }), true);
  assert.equal(canManageDiscountCampaigns({ role: "admin" }), true);
  assert.equal(canManageDiscountCampaigns({ role: "sales_manager" }), false);
  assert.equal(canManageDiscountCampaigns({ role: "sales" }), false);
  assert.equal(canImpersonateUsers({ role: "super_admin" }), true);
  assert.equal(canImpersonateUsers({ role: "admin" }), true);
  assert.equal(canImpersonateUsers({ role: "sales_manager" }), false);
  assert.equal(canImpersonateUsers({ role: "sales" }), false);
  assert.equal(canImpersonateUsers({ role: "distributor" }), false);
});

test("separates podcast calendar visibility from management", () => {
  assert.equal(canReadPodcastCalendar({ role: "super_admin" }), true);
  assert.equal(canReadPodcastCalendar({ role: "admin" }), true);
  assert.equal(canReadPodcastCalendar({ role: "sales_manager" }), true);
  assert.equal(canReadPodcastCalendar({ role: "sales" }), true);
  assert.equal(canReadPodcastCalendar({ role: "distributor" }), false);
  assert.equal(canManagePodcastCalendar({ role: "super_admin" }), true);
  assert.equal(canManagePodcastCalendar({ role: "admin" }), true);
  assert.equal(canManagePodcastCalendar({ role: "sales_manager" }), false);
  assert.equal(canManagePodcastCalendar({ role: "sales" }), false);
});

test("reserves sales applications for administrators", () => {
  assert.equal(canManageSalesApplications({ role: "super_admin" }), true);
  assert.equal(canManageSalesApplications({ role: "admin" }), true);
  assert.equal(canManageSalesApplications({ role: "sales_manager" }), false);
  assert.equal(canManageSalesApplications({ role: "sales" }), false);
  assert.equal(canManageSalesApplications({ role: "distributor" }), false);
});

test("converts Canary podcast slots to UTC and keeps one-hour duration", () => {
  assert.equal(canaryLocalToIso("2026-01-15", "10:00"), "2026-01-15T10:00:00.000Z");
  assert.equal(canaryLocalToIso("2026-08-15", "10:00"), "2026-08-15T09:00:00.000Z");
  assert.equal(canaryLocalToIso("2026-03-29", "01:30"), null);
  assert.equal(oneHourAfter("2026-08-15T09:00:00.000Z"), "2026-08-15T10:00:00.000Z");
  assert.equal(canaryDateKey(new Date("2026-08-15T23:30:00.000Z")), "2026-08-16");
});

test("keeps privileged user management under the super admin", () => {
  assert.equal(canCreateUserWithRole({ role: "super_admin" }, "admin"), true);
  assert.equal(canCreateUserWithRole({ role: "admin" }, "admin"), false);
  assert.equal(canCreateUserWithRole({ role: "admin" }, "sales_manager"), true);
  assert.equal(canCreateUserWithRole({ role: "sales_manager" }, "sales"), false);
  assert.equal(canUpdateUserRole({ role: "super_admin" }, "admin", "sales_manager"), true);
  assert.equal(canUpdateUserRole({ role: "admin" }, "admin", "sales"), false);
  assert.equal(canUpdateUserRole({ role: "admin" }, "sales", "admin"), false);
  assert.equal(canUpdateUserRole({ role: "admin" }, "sales", "sales_manager"), true);
  assert.equal(canUpdateUserRole({ role: "super_admin" }, "super_admin", "admin"), false);
});

test("signs, validates and expires administrative impersonation tokens", async () => {
  const claims = { version: 1, actorId: "super-admin", targetId: "sales-1", startedAt: 2_000, expiresAt: 5_600 };
  const token = await createImpersonationToken("a-long-production-secret", claims);
  assert.deepEqual(await verifyImpersonationToken("a-long-production-secret", token, 2_100), claims);
  assert.equal(await verifyImpersonationToken("wrong-secret", token, 2_100), null);
  assert.equal(await verifyImpersonationToken("a-long-production-secret", `${token.slice(0, -1)}x`, 2_100), null);
  assert.equal(await verifyImpersonationToken("a-long-production-secret", token, 5_600), null);
});

