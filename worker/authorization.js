export const ISLANDS = Object.freeze([
  "Tenerife",
  "Gran Canaria",
  "Lanzarote",
  "Fuerteventura",
  "La Palma",
]);

export const ROLES = Object.freeze(["super_admin", "admin", "sales_manager", "sales", "distributor"]);

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isIsland(value) {
  return ISLANDS.includes(value);
}

export function isRole(value) {
  return ROLES.includes(value);
}

export function canReadRecord(user, record) {
  if (user.role === "super_admin" || user.role === "admin") return true;
  if (user.role === "sales_manager") {
    return user.id === record.owner_user_id || user.id === record.owner_sales_manager_id;
  }
  if (user.role === "sales") return user.id === record.owner_user_id;
  return false;
}

export function canWriteRecord(user, record) {
  return canReadRecord(user, record);
}

export function canCancelSignedContract(user, contract) {
  return user.role === "super_admin" && contract.status === "signed";
}

export function recordScope(user) {
  if (user.role === "super_admin" || user.role === "admin") return { sql: "", values: [] };
  if (user.role === "sales_manager") {
    return {
      sql: " AND (owner_user_id = ? OR owner_user_id IN (SELECT id FROM users WHERE role = 'sales' AND sales_manager_id = ?))",
      values: [user.id, user.id],
    };
  }
  if (user.role === "sales") return { sql: " AND owner_user_id = ?", values: [user.id] };
  return { sql: " AND 1 = 0", values: [] };
}

export function canAssignClientOwner(actor, owner) {
  if (!owner || owner.active === 0 || owner.role !== "sales") return false;
  if (actor.role === "super_admin" || actor.role === "admin") return true;
  if (actor.role === "sales_manager") return owner.sales_manager_id === actor.id;
  return actor.role === "sales" && owner.id === actor.id;
}

export function canManageDeliveries(user) {
  return user.role === "super_admin" || user.role === "admin" || user.role === "sales_manager";
}

export function canReadDelivery(user, delivery) {
  if (user.role === "super_admin" || user.role === "admin") return true;
  if (user.role === "sales_manager") return Boolean(user.island) && user.island === delivery.island;
  if (user.role === "distributor") return user.id === delivery.distributor_user_id;
  return false;
}

export function canWriteDelivery(user, delivery) {
  return canReadDelivery(user, delivery);
}

export function deliveryScope(user) {
  if (user.role === "super_admin" || user.role === "admin") return { sql: "", values: [] };
  if (user.role === "sales_manager") return { sql: " AND d.island = ?", values: [user.island] };
  if (user.role === "distributor") return { sql: " AND d.distributor_user_id = ?", values: [user.id] };
  return { sql: " AND 1 = 0", values: [] };
}

export function canReadPriceList(user) {
  return user.role !== "distributor";
}

export function canManagePriceList(user) {
  return user.role === "super_admin" || user.role === "admin";
}

export function canManageDiscountCampaigns(user) {
  return user.role === "super_admin" || user.role === "admin";
}

export function canImpersonateUsers(user) {
  return user.role === "super_admin" || user.role === "admin";
}

export function canCreateQuote(user) {
  return user.role !== "distributor";
}

export function canApplyQuoteDiscount(user) {
  return ["super_admin", "admin", "sales_manager", "sales"].includes(user.role);
}

export function canUseDiscountCampaign(user) {
  return ["super_admin", "admin", "sales_manager", "sales"].includes(user.role);
}

export function canReadPodcastCalendar(user) {
  return user.role !== "distributor";
}

export function canManagePodcastCalendar(user) {
  return user.role === "super_admin" || user.role === "admin";
}

export function canManageSalesApplications(user) {
  return user.role === "super_admin" || user.role === "admin";
}

export function canCreateUserWithRole(user, role) {
  if (user.role === "super_admin") return role !== "super_admin" && isRole(role);
  return user.role === "admin" && ["sales_manager", "sales", "distributor"].includes(role);
}

export function canUpdateUserRole(user, targetRole, nextRole) {
  if (targetRole === "super_admin" || nextRole === "super_admin" || !isRole(nextRole)) return false;
  if (user.role === "super_admin") return true;
  return user.role === "admin" && targetRole !== "admin" && ["sales_manager", "sales", "distributor"].includes(nextRole);
}
