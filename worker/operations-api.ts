type RuntimeEnv = Env & {
  AI?: Ai;
  AUTH_SECRET?: string;
  EMAIL_FROM?: string;
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  STRIPE_SECRET_KEY?: string;
  MAPS_TOKEN?: string;
  NEUTRINO_USER_ID?: string;
  NEUTRINO_API_KEY?: string;
};

export type OperationsUser = {
  id: string;
  email: string;
  name: string;
  role: "super_admin" | "admin" | "sales_manager" | "sales" | "distributor";
  island: string | null;
  active: number;
  sessionActor?: { id: string; name: string; email: string; role: "super_admin" | "admin" | "sales_manager" | "sales" | "distributor" };
  impersonation?: { startedAt: string; expiresAt: string } | null;
};

const ISLANDS = ["Tenerife", "Gran Canaria", "Lanzarote", "Fuerteventura", "La Palma"] as const;
const MAX_JSON_BYTES = 512_000;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_AI_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct" as const;

const ISLAND_CENTERS: Record<string, { latitude: number; longitude: number }> = {
  Tenerife: { latitude: 28.2916, longitude: -16.6291 },
  "Gran Canaria": { latitude: 27.9202, longitude: -15.5474 },
  Lanzarote: { latitude: 29.0469, longitude: -13.5899 },
  Fuerteventura: { latitude: 28.3587, longitude: -14.0537 },
  "La Palma": { latitude: 28.7134, longitude: -17.9058 },
};

class OperationsError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export async function handlePublicOperationsApi(request: Request, env: RuntimeEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/public/distribution-points") return null;
  if (request.method !== "GET") return json({ error: { code: "method_not_allowed", message: "Metodo non consentito." } }, 405);
  const island = clean(url.searchParams.get("island"), 40);
  if (island && !isIsland(island)) return json({ error: { code: "invalid_island", message: "Isola non valida." } }, 400);
  const points = (await env.DB.prepare(
    `SELECT id, name, island, address, latitude_e6, longitude_e6 FROM distribution_points WHERE public_visible = 1${island ? " AND island = ?" : ""} ORDER BY island, name LIMIT 500`,
  ).bind(...(island ? [island] : [])).all<{ id: string; name: string; island: string; address: string; latitude_e6: number; longitude_e6: number }>()).results;
  return new Response(JSON.stringify({
    points: points.map((point) => ({ ...point, latitude: point.latitude_e6 / 1_000_000, longitude: point.longitude_e6 / 1_000_000, latitude_e6: undefined, longitude_e6: undefined })),
    islands: ISLANDS,
  }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300, stale-while-revalidate=3600" } });
}

export async function handleOperationsApi(
  request: Request,
  env: RuntimeEnv,
  user: OperationsUser,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/operations")) return null;

  try {
    if (url.pathname === "/api/operations" && request.method === "GET") {
      return operationsSnapshot(env, user);
    }
    if (url.pathname === "/api/operations/sponsors" && request.method === "POST") {
      return createSponsor(request, env, user);
    }
    if (url.pathname === "/api/operations/vip-members" && request.method === "POST") {
      return createVipMember(request, env, user);
    }
    if (url.pathname === "/api/operations/coupons" && request.method === "POST") {
      return issueCoupon(request, env, user);
    }
    if (url.pathname === "/api/operations/coupons/redeem" && request.method === "POST") {
      return redeemCoupon(request, env, user);
    }
    if (url.pathname === "/api/operations/commission-rules" && request.method === "POST") {
      return createCommissionRule(request, env, user);
    }
    if (url.pathname === "/api/operations/payout-requests" && request.method === "POST") {
      return createPayoutRequest(request, env, user);
    }
    if (url.pathname === "/api/operations/payout-requests/review" && request.method === "POST") {
      return reviewPayoutRequest(request, env, user);
    }
    if (url.pathname === "/api/operations/inventory" && request.method === "POST") {
      return createInventorySlot(request, env, user);
    }
    if (url.pathname === "/api/operations/inventory/status" && request.method === "POST") {
      return updateInventoryStatus(request, env, user);
    }
    if (url.pathname === "/api/operations/distribution-points" && request.method === "POST") {
      return createDistributionPoint(request, env, user);
    }
    if (url.pathname === "/api/operations/distribution-points/self-register" && request.method === "POST") {
      return selfRegisterDistributionPoint(request, env, user);
    }
    if (url.pathname === "/api/operations/distribution-points/stock" && request.method === "POST") {
      return updateDistributionStock(request, env, user);
    }
    if (url.pathname === "/api/operations/photo-audits" && request.method === "POST") {
      return uploadPhotoAudit(request, env, user);
    }
    if (url.pathname === "/api/operations/delivery-checks" && request.method === "POST") {
      return createDeliveryCheck(request, env, user);
    }
    if (url.pathname === "/api/operations/photo-audits/review" && request.method === "POST") {
      return reviewPhotoAudit(request, env, user);
    }
    if (url.pathname === "/api/operations/sales-checkins" && request.method === "POST") {
      return createSalesCheckin(request, env, user);
    }
    if (url.pathname === "/api/operations/sales-tasks" && request.method === "POST") {
      return createSalesTask(request, env, user);
    }
    if (url.pathname === "/api/operations/sales-tasks/complete" && request.method === "POST") {
      return completeSalesTask(request, env, user);
    }
    throw new OperationsError(404, "not_found", "Risorsa operativa non trovata.");
  } catch (error) {
    if (error instanceof OperationsError) return errorResponse(error);
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    console.error(JSON.stringify({ level: "error", event: "operations_api_failure", requestId, error: error instanceof Error ? error.message : "unknown" }));
    return errorResponse(new OperationsError(500, "internal_error", `Errore operativo. Riferimento: ${requestId}`));
  }
}

async function operationsSnapshot(env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  const sponsorScope = scopeFor(user, "s.island", "s.owner_user_id");
  const islandScope = scopeFor(user, "x.island", null);
  const couponScope = user.role === "sales"
    ? { sql: " AND s.owner_user_id = ? AND m.created_by_user_id = ?", values: [user.id, user.id] }
    : sponsorScope;
  const financeScope = isGlobalOperator(user)
    ? { sql: "", values: [] as string[] }
    : user.role === "sales_manager"
      ? { sql: " AND u.island = ?", values: [String(user.island)] }
      : { sql: " AND u.id = ?", values: [user.id] };

  const sponsors = user.role === "distributor"
    ? (await env.DB.prepare("SELECT s.id, s.name, s.island, s.category, s.status, s.offer_title, s.discount_text, s.address, s.latitude_e6, s.longitude_e6, s.instagram_handle, s.client_id, s.updated_at FROM sponsors s WHERE s.client_id IN (SELECT d.client_id FROM deliveries d WHERE d.distributor_user_id = ?) ORDER BY s.updated_at DESC LIMIT 150").bind(user.id).all()).results
    : (await env.DB.prepare(`SELECT s.id, s.name, s.island, s.category, s.status, s.offer_title, s.discount_text, s.address, s.latitude_e6, s.longitude_e6, s.instagram_handle, s.client_id, s.updated_at FROM sponsors s WHERE 1 = 1${sponsorScope.sql} ORDER BY s.updated_at DESC LIMIT 150`).bind(...sponsorScope.values).all()).results;

  const vipMembers = user.role === "distributor"
    ? []
    : user.role === "sales"
      ? (await env.DB.prepare(
        "SELECT x.id, x.name, x.phone, x.island, x.tier, x.streak_months, x.consent_at, x.created_at FROM vip_members x WHERE x.created_by_user_id = ? ORDER BY x.created_at DESC LIMIT 150",
      ).bind(user.id).all()).results
      : (await env.DB.prepare(
        `SELECT x.id, x.name, x.phone, x.island, x.tier, x.streak_months, x.consent_at, x.created_at FROM vip_members x WHERE 1 = 1${islandScope.sql} ORDER BY x.created_at DESC LIMIT 150`,
      ).bind(...islandScope.values).all()).results;

  const coupons = user.role === "distributor" ? [] : (await env.DB.prepare(
    `SELECT c.id, c.code, c.status, c.issued_at, c.expires_at, c.redeemed_at, s.name AS sponsor_name, s.island, m.name AS member_name, m.phone AS member_phone FROM coupons c JOIN sponsors s ON s.id = c.sponsor_id JOIN vip_members m ON m.id = c.member_id WHERE 1 = 1${couponScope.sql} ORDER BY c.issued_at DESC LIMIT 200`,
  ).bind(...couponScope.values).all()).results;

  const commissionRules = user.role === "super_admin" ? (await env.DB.prepare(
    "SELECT id, name, role, island, rate_bps, active, created_at, updated_at FROM commission_rules ORDER BY active DESC, role, island",
  ).all()).results : [];

  const walletEntries = (await env.DB.prepare(
    `SELECT w.id, w.user_id, u.name AS user_name, u.island, w.source_type, w.description, w.amount_cents, w.status, w.available_at, w.created_at FROM wallet_entries w JOIN users u ON u.id = w.user_id WHERE 1 = 1${financeScope.sql} ORDER BY w.created_at DESC LIMIT 200`,
  ).bind(...financeScope.values).all()).results;

  const payoutRequests = (await env.DB.prepare(
    `SELECT p.id, p.user_id, u.name AS user_name, u.island, p.amount_cents, p.status, p.note, p.created_at, p.updated_at FROM payout_requests p JOIN users u ON u.id = p.user_id WHERE 1 = 1${financeScope.sql} ORDER BY p.created_at DESC LIMIT 100`,
  ).bind(...financeScope.values).all()).results;

  const inventoryScope = scopeFor(user, "x.island", null);
  const inventory = user.role === "distributor" ? [] : (await env.DB.prepare(
    `SELECT x.id, x.issue_label, x.island, x.slot_code, x.slot_name, x.width_mm, x.height_mm, x.status, x.client_id, c.company_name AS client_company, x.contract_id, x.updated_at FROM ad_inventory x LEFT JOIN clients c ON c.id = x.client_id WHERE 1 = 1${inventoryScope.sql} ORDER BY x.issue_label DESC, x.island, x.slot_code LIMIT 250`,
  ).bind(...inventoryScope.values).all()).results;

  const nowIsoForDue = new Date().toISOString();
  const distributionPoints = user.role === "distributor"
    ? (await env.DB.prepare(
      "SELECT x.id, x.client_id, c.company_name AS client_company, x.name, x.island, x.address, x.latitude_e6, x.longitude_e6, x.capacity, x.stock, x.public_visible, x.self_registered, x.created_by, x.next_check_due_at, x.updated_at FROM distribution_points x LEFT JOIN clients c ON c.id = x.client_id WHERE x.island = ? AND x.public_visible = 1 ORDER BY (x.next_check_due_at IS NOT NULL AND x.next_check_due_at <= ?) DESC, x.next_check_due_at IS NULL, x.next_check_due_at, x.name LIMIT 300",
    ).bind(String(user.island ?? ""), nowIsoForDue).all()).results
    : (await env.DB.prepare(
      `SELECT x.id, x.client_id, c.company_name AS client_company, x.name, x.island, x.address, x.latitude_e6, x.longitude_e6, x.capacity, x.stock, x.public_visible, x.self_registered, x.created_by, x.next_check_due_at, x.updated_at FROM distribution_points x LEFT JOIN clients c ON c.id = x.client_id WHERE 1 = 1${islandScope.sql} ORDER BY x.island, x.stock, x.name LIMIT 300`,
    ).bind(...islandScope.values).all()).results;

  const checkScope = isGlobalOperator(user) ? { sql: "", values: [] as string[] }
    : user.role === "sales_manager" ? { sql: " AND dc.island = ?", values: [String(user.island)] }
      : { sql: " AND dc.distributor_user_id = ?", values: [user.id] };
  const deliveryChecks = user.role === "sales" ? [] : (await env.DB.prepare(
    `SELECT dc.id, dc.distribution_point_id, p.name AS point_name, dc.distributor_user_id, u.name AS distributor_name, dc.delivery_id, dc.island, dc.quantity_left, dc.quantity_found, dc.quantity_taken, dc.geofence_distance_m, dc.notes, dc.created_at FROM delivery_checks dc JOIN distribution_points p ON p.id = dc.distribution_point_id JOIN users u ON u.id = dc.distributor_user_id WHERE 1 = 1${checkScope.sql} ORDER BY dc.created_at DESC LIMIT 150`,
  ).bind(...checkScope.values).all()).results;

  const auditScope = isGlobalOperator(user) ? { sql: "", values: [] as string[] }
    : user.role === "sales_manager" ? { sql: " AND p.island = ?", values: [String(user.island)] }
      : { sql: " AND p.distributor_user_id = ?", values: [user.id] };
  const photoAudits = user.role === "sales" ? [] : (await env.DB.prepare(
    `SELECT p.id, p.delivery_id, p.distributor_user_id, u.name AS distributor_name, p.island, p.sha256, p.latitude_e6, p.longitude_e6, p.geofence_distance_m, p.status, p.quality_score, p.duplicate_of_audit_id, p.ai_model, p.ai_verdict, p.ai_result_json, p.watermark_text, p.created_at, p.reviewed_at FROM photo_audits p JOIN users u ON u.id = p.distributor_user_id WHERE 1 = 1${auditScope.sql} ORDER BY p.created_at DESC LIMIT 150`,
  ).bind(...auditScope.values).all()).results;

  const salesScope = isGlobalOperator(user) ? { sql: "", values: [] as string[] }
    : user.role === "sales_manager" ? { sql: " AND x.island = ?", values: [String(user.island)] }
      : { sql: " AND x.user_id = ?", values: [user.id] };
  const salesCheckins = user.role === "distributor" ? [] : (await env.DB.prepare(
    `SELECT x.id, x.user_id, u.name AS user_name, x.island, x.latitude_e6, x.longitude_e6, x.checked_in_at, x.status FROM sales_checkins x JOIN users u ON u.id = x.user_id WHERE 1 = 1${salesScope.sql} ORDER BY x.checked_in_at DESC LIMIT 120`,
  ).bind(...salesScope.values).all()).results;
  const salesTasks = user.role === "distributor" ? [] : (await env.DB.prepare(
    `SELECT x.id, x.user_id, u.name AS user_name, x.client_id, c.company_name AS client_company, x.island, x.kind, x.title, x.status, x.scheduled_for, x.completed_at, x.updated_at FROM sales_tasks x JOIN users u ON u.id = x.user_id LEFT JOIN clients c ON c.id = x.client_id WHERE 1 = 1${salesScope.sql} ORDER BY CASE x.status WHEN 'open' THEN 0 ELSE 1 END, x.scheduled_for LIMIT 200`,
  ).bind(...salesScope.values).all()).results;

  const leaderboard = user.role === "distributor" ? [] : (await env.DB.prepare(
    `SELECT u.id AS user_id, u.name AS user_name, u.island, COUNT(CASE WHEN c.stage = 'won' THEN 1 END) AS won_count, COALESCE(SUM(CASE WHEN c.stage = 'won' THEN c.value_cents ELSE 0 END), 0) AS won_value_cents FROM users u LEFT JOIN clients c ON c.owner_user_id = u.id AND c.archived_at IS NULL WHERE u.active = 1 AND u.role IN ('sales_manager','sales')${isGlobalOperator(user) ? "" : user.role === "sales_manager" ? " AND u.island = ?" : " AND u.id = ?"} GROUP BY u.id, u.name, u.island ORDER BY won_value_cents DESC, won_count DESC LIMIT 30`,
  ).bind(...(isGlobalOperator(user) ? [] : user.role === "sales_manager" ? [String(user.island)] : [user.id])).all()).results;

  const bundles = user.role === "distributor" ? [] : (await env.DB.prepare(
    "SELECT id, code, name, description, monthly_price_cents, active FROM bundles WHERE active = 1 ORDER BY monthly_price_cents",
  ).all()).results;

  const counts = {
    sponsors: sponsors.length,
    vipMembers: vipMembers.length,
    couponsIssued: coupons.filter((item) => String(item.status) === "issued").length,
    couponsRedeemed: coupons.filter((item) => String(item.status) === "redeemed").length,
    distributionPoints: distributionPoints.length,
    pendingPhotoAudits: photoAudits.filter((item) => String(item.status) === "pending").length,
    openSalesTasks: salesTasks.filter((item) => String(item.status) === "open").length,
    availableWalletCents: walletEntries.filter((item) => String(item.status) === "available").reduce((sum, item) => sum + Number(item.amount_cents), 0),
  };

  return json({
    counts,
    sponsors,
    vipMembers,
    coupons,
    commissionRules,
    walletEntries,
    payoutRequests,
    inventory,
    distributionPoints,
    photoAudits,
    deliveryChecks,
    salesCheckins,
    salesTasks,
    leaderboard,
    bundles,
    integrations: {
      email: Boolean(env.EMAIL && env.EMAIL_FROM),
      whatsapp: true,
      payments: Boolean(env.STRIPE_SECRET_KEY),
      maps: true,
      photoAi: Boolean(env.AI),
    },
  });
}

async function createSponsor(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  requireManager(user);
  if (!env.AUTH_SECRET) throw new OperationsError(503, "auth_secret_missing", "La chiave di sicurezza non è configurata.");
  const body = await readJson<Record<string, unknown>>(request);
  const name = clean(body.name, 120);
  const requestedIsland = clean(body.island, 40);
  const island = isGlobalOperator(user) ? requestedIsland : String(user.island ?? "");
  const category = clean(body.category, 80);
  const offerTitle = clean(body.offerTitle, 160);
  const discountText = clean(body.discountText, 160);
  const merchantPin = clean(body.merchantPin, 4);
  if (!name || !isIsland(island) || !category || !offerTitle || !discountText || !/^\d{4}$/.test(merchantPin)) {
    throw new OperationsError(400, "invalid_sponsor", "Compila sponsor, isola, categoria, offerta, vantaggio e PIN commerciante di 4 cifre.");
  }
  const ownerUserId = clean(body.ownerUserId, 80) || user.id;
  const clientId = cleanOptional(body.clientId, 80);
  if (clientId) await assertClientScope(env, user, clientId, island);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const merchantPinHash = await sha256(`${env.AUTH_SECRET}\n${id}\n${merchantPin}`);
  const latitude = optionalCoordinate(body.latitude, -90, 90);
  const longitude = optionalCoordinate(body.longitude, -180, 180);
  await env.DB.prepare("INSERT INTO sponsors (id, client_id, name, island, category, status, offer_title, discount_text, merchant_pin_hash, address, latitude_e6, longitude_e6, instagram_handle, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, clientId, name, island, category, offerTitle, discountText, merchantPinHash, cleanOptional(body.address, 260), toE6(latitude), toE6(longitude), cleanOptional(body.instagramHandle, 80), ownerUserId, now, now).run();
  await appendOperationsAudit(env, request, user, "sponsor.created", "sponsor", id, { name, island, category });
  return json({ id }, 201);
}

async function createVipMember(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  if (user.role === "distributor") throw new OperationsError(403, "not_allowed", "Il Distributore non gestisce gli iscritti VIP.");
  const body = await readJson<Record<string, unknown>>(request);
  const name = clean(body.name, 120);
  const phone = normalizePhone(body.phone);
  const requestedIsland = clean(body.island, 40);
  const island = isGlobalOperator(user) ? requestedIsland : String(user.island ?? "");
  if (!name || phone.length < 8 || !isIsland(island) || body.consent !== true) {
    throw new OperationsError(400, "invalid_member", "Nome, WhatsApp, isola e consenso sono obbligatori.");
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare("INSERT INTO vip_members (id, name, phone, island, tier, streak_months, consent_at, created_by_user_id, created_at) VALUES (?, ?, ?, ?, 'standard', 0, ?, ?, ?)")
      .bind(id, name, phone, island, now, user.id, now).run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new OperationsError(409, "member_exists", "Questo numero WhatsApp è già registrato.");
    throw error;
  }
  await appendOperationsAudit(env, request, user, "vip_member.created", "vip_member", id, { island, phoneSuffix: phone.slice(-4) });
  return json({ id }, 201);
}

async function issueCoupon(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  if (user.role === "distributor") throw new OperationsError(403, "not_allowed", "Il Distributore non può emettere coupon.");
  const body = await readJson<Record<string, unknown>>(request);
  const sponsorId = clean(body.sponsorId, 80);
  const memberId = clean(body.memberId, 80);
  const sponsor = await getSponsor(env, sponsorId);
  const member = await env.DB.prepare("SELECT id, island, created_by_user_id FROM vip_members WHERE id = ? LIMIT 1").bind(memberId).first<{ id: string; island: string; created_by_user_id: string | null }>();
  if (!sponsor || !member || !canAccessIsland(user, sponsor.island) || !canAccessIsland(user, member.island)) {
    throw new OperationsError(404, "coupon_subject_not_found", "Sponsor o membro VIP non disponibile nel tuo perimetro.");
  }
  if (user.role === "sales" && (sponsor.owner_user_id !== user.id || member.created_by_user_id !== user.id)) {
    throw new OperationsError(404, "coupon_subject_not_found", "Sponsor o membro VIP non disponibile nel tuo perimetro.");
  }
  const id = crypto.randomUUID();
  const code = secureCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO coupons (id, member_id, sponsor_id, code, status, issued_at, expires_at) VALUES (?, ?, ?, ?, 'issued', ?, ?)")
    .bind(id, member.id, sponsor.id, code, now.toISOString(), expiresAt).run();
  await appendOperationsAudit(env, request, user, "coupon.issued", "coupon", id, { sponsorId, memberId, code });
  return json({ id, code, expiresAt }, 201);
}

async function redeemCoupon(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  if (!env.AUTH_SECRET) throw new OperationsError(503, "auth_secret_missing", "La chiave di sicurezza non è configurata.");
  const body = await readJson<Record<string, unknown>>(request);
  const code = clean(body.code, 20).toUpperCase();
  const merchantPin = clean(body.merchantPin, 4);
  const row = await env.DB.prepare("SELECT c.id, c.status, c.expires_at, c.sponsor_id, s.island, s.client_id, s.merchant_pin_hash FROM coupons c JOIN sponsors s ON s.id = c.sponsor_id WHERE c.code = ? LIMIT 1")
    .bind(code).first<{ id: string; status: string; expires_at: string; sponsor_id: string; island: string; client_id: string | null; merchant_pin_hash: string }>();
  if (!row || !canAccessIsland(user, row.island)) throw new OperationsError(404, "coupon_not_found", "Coupon non trovato.");
  if (row.status !== "issued" || Date.parse(row.expires_at) <= Date.now()) throw new OperationsError(409, "coupon_not_redeemable", "Coupon già usato o scaduto.");
  if (user.role === "distributor" && row.client_id) {
    const linked = await env.DB.prepare("SELECT 1 AS ok FROM deliveries WHERE distributor_user_id = ? AND client_id = ? LIMIT 1").bind(user.id, row.client_id).first();
    if (!linked) throw new OperationsError(403, "not_allowed", "Sponsor non collegato alle tue consegne.");
  }
  const candidate = await sha256(`${env.AUTH_SECRET}\n${row.sponsor_id}\n${merchantPin}`);
  if (!timingSafeHex(candidate, row.merchant_pin_hash)) throw new OperationsError(403, "invalid_merchant_pin", "PIN commerciante non valido.");
  const now = new Date().toISOString();
  const latitude = optionalCoordinate(body.latitude, -90, 90);
  const longitude = optionalCoordinate(body.longitude, -180, 180);
  const result = await env.DB.prepare("UPDATE coupons SET status = 'redeemed', redeemed_at = ?, redeemed_by_user_id = ?, latitude_e6 = ?, longitude_e6 = ? WHERE id = ? AND status = 'issued'")
    .bind(now, user.id, toE6(latitude), toE6(longitude), row.id).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new OperationsError(409, "coupon_race", "Coupon già utilizzato.");
  await appendOperationsAudit(env, request, user, "coupon.redeemed", "coupon", row.id, { sponsorId: row.sponsor_id, latitude, longitude });
  return json({ ok: true, redeemedAt: now });
}

async function createCommissionRule(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  requireSuperAdmin(user);
  const body = await readJson<Record<string, unknown>>(request);
  const name = clean(body.name, 120);
  const role = clean(body.role, 30);
  const island = cleanOptional(body.island, 40);
  const ratePercent = Number(body.ratePercent);
  if (!name || !["sales_manager", "sales", "distributor"].includes(role) || (island && !isIsland(island)) || !Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new OperationsError(400, "invalid_commission", "Regola commissione non valida.");
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO commission_rules (id, name, role, island, rate_bps, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)")
    .bind(id, name, role, island, Math.round(ratePercent * 100), now, now).run();
  await appendOperationsAudit(env, request, user, "commission_rule.created", "commission_rule", id, { name, role, island, ratePercent });
  return json({ id }, 201);
}

async function createPayoutRequest(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(request);
  const amountCents = Math.round(Number(body.amountEuros) * 100);
  if (!Number.isInteger(amountCents) || amountCents < 1000 || amountCents > 10_000_000) throw new OperationsError(400, "invalid_amount", "Richiedi almeno 10 € con un importo valido.");
  const balance = await env.DB.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM wallet_entries WHERE user_id = ? AND status = 'available'").bind(user.id).first<{ cents: number }>();
  const reserved = await env.DB.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM payout_requests WHERE user_id = ? AND status IN ('requested','approved')").bind(user.id).first<{ cents: number }>();
  if (amountCents > Number(balance?.cents ?? 0) - Number(reserved?.cents ?? 0)) throw new OperationsError(409, "insufficient_wallet", "Saldo disponibile insufficiente.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO payout_requests (id, user_id, amount_cents, status, note, created_at, updated_at) VALUES (?, ?, ?, 'requested', ?, ?, ?)")
    .bind(id, user.id, amountCents, cleanOptional(body.note, 300), now, now).run();
  await appendOperationsAudit(env, request, user, "payout.requested", "payout_request", id, { amountCents });
  return json({ id }, 201);
}

async function reviewPayoutRequest(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  requireSuperAdmin(user);
  const body = await readJson<Record<string, unknown>>(request);
  const id = clean(body.id, 80);
  const status = clean(body.status, 20);
  if (!["approved", "paid", "rejected"].includes(status)) throw new OperationsError(400, "invalid_status", "Stato pagamento non valido.");
  const current = await env.DB.prepare("SELECT id, user_id, amount_cents, status FROM payout_requests WHERE id = ? LIMIT 1").bind(id).first<{ id: string; user_id: string; amount_cents: number; status: string }>();
  if (!current || !["requested", "approved"].includes(current.status)) throw new OperationsError(409, "payout_not_reviewable", "Richiesta non disponibile.");
  const now = new Date().toISOString();
  const statements = [env.DB.prepare("UPDATE payout_requests SET status = ?, reviewed_by = ?, updated_at = ? WHERE id = ? AND status = ?").bind(status, user.id, now, id, current.status)];
  if (status === "paid") {
    statements.push(env.DB.prepare("INSERT INTO wallet_entries (id, user_id, source_type, source_id, description, amount_cents, status, available_at, created_at) VALUES (?, ?, 'payout', ?, 'Liquidazione commissioni', ?, 'paid', ?, ?)")
      .bind(crypto.randomUUID(), current.user_id, current.id, -current.amount_cents, now, now));
  }
  await env.DB.batch(statements);
  await appendOperationsAudit(env, request, user, `payout.${status}`, "payout_request", id, { amountCents: current.amount_cents });
  return json({ ok: true });
}

async function createInventorySlot(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  requireManager(user);
  const body = await readJson<Record<string, unknown>>(request);
  const requestedIsland = clean(body.island, 40);
  const island = isGlobalOperator(user) ? requestedIsland : String(user.island ?? "");
  const issueLabel = clean(body.issueLabel, 80);
  const slotCode = clean(body.slotCode, 40).toUpperCase();
  const slotName = clean(body.slotName, 120);
  const widthMm = positiveInt(body.widthMm, 1000);
  const heightMm = positiveInt(body.heightMm, 1000);
  if (!isIsland(island) || !issueLabel || !slotCode || !slotName) throw new OperationsError(400, "invalid_inventory", "Dati dello spazio pubblicitario incompleti.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO ad_inventory (id, issue_label, island, slot_code, slot_name, width_mm, height_mm, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)")
    .bind(id, issueLabel, island, slotCode, slotName, widthMm, heightMm, now, now).run();
  await appendOperationsAudit(env, request, user, "inventory.created", "ad_inventory", id, { issueLabel, island, slotCode });
  return json({ id }, 201);
}

async function updateInventoryStatus(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  requireManager(user);
  const body = await readJson<Record<string, unknown>>(request);
  const id = clean(body.id, 80);
  const status = clean(body.status, 20);
  if (!["available", "held", "sold"].includes(status)) throw new OperationsError(400, "invalid_status", "Stato spazio non valido.");
  const row = await env.DB.prepare("SELECT id, island FROM ad_inventory WHERE id = ? LIMIT 1").bind(id).first<{ id: string; island: string }>();
  if (!row || !canAccessIsland(user, row.island)) throw new OperationsError(404, "inventory_not_found", "Spazio non trovato.");
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE ad_inventory SET status = ?, client_id = ?, contract_id = ?, updated_at = ? WHERE id = ?")
    .bind(status, cleanOptional(body.clientId, 80), cleanOptional(body.contractId, 80), now, id).run();
  await appendOperationsAudit(env, request, user, "inventory.updated", "ad_inventory", id, { status });
  return json({ ok: true });
}

async function createDistributionPoint(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  requireManager(user);
  const body = await readJson<Record<string, unknown>>(request);
  const requestedIsland = clean(body.island, 40);
  const island = isGlobalOperator(user) ? requestedIsland : String(user.island ?? "");
  const name = clean(body.name, 120);
  const address = clean(body.address, 260);
  const latitude = requiredCoordinate(body.latitude, -90, 90);
  const longitude = requiredCoordinate(body.longitude, -180, 180);
  const capacity = nonNegativeInt(body.capacity, 1_000_000);
  const stock = nonNegativeInt(body.stock, 1_000_000);
  if (!isIsland(island) || !name || !address) throw new OperationsError(400, "invalid_point", "Nome, isola, indirizzo e coordinate sono obbligatori.");
  const clientId = cleanOptional(body.clientId, 80);
  if (clientId) await assertClientScope(env, user, clientId, island);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO distribution_points (id, client_id, name, island, address, latitude_e6, longitude_e6, capacity, stock, public_visible, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, clientId, name, island, address, toE6(latitude), toE6(longitude), capacity, stock, body.publicVisible === false ? 0 : 1, now, now).run();
  await appendOperationsAudit(env, request, user, "distribution_point.created", "distribution_point", id, { name, island, stock });
  return json({ id }, 201);
}

async function updateDistributionStock(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  if (!["super_admin", "admin", "sales_manager", "distributor"].includes(user.role)) throw new OperationsError(403, "not_allowed", "Non puoi modificare le giacenze.");
  const body = await readJson<Record<string, unknown>>(request);
  const id = clean(body.id, 80);
  const stock = nonNegativeInt(body.stock, 1_000_000);
  const row = await env.DB.prepare("SELECT id, island FROM distribution_points WHERE id = ? LIMIT 1").bind(id).first<{ id: string; island: string }>();
  if (!row || !canAccessIsland(user, row.island)) throw new OperationsError(404, "point_not_found", "Punto distribuzione non trovato.");
  if (user.role === "distributor") {
    const assigned = await env.DB.prepare(
      "SELECT 1 AS ok FROM deliveries WHERE distributor_user_id = ? AND distribution_point_id = ? LIMIT 1",
    ).bind(user.id, row.id).first();
    if (!assigned) throw new OperationsError(404, "point_not_found", "Punto distribuzione non trovato.");
  }
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE distribution_points SET stock = ?, updated_at = ? WHERE id = ?").bind(stock, now, id).run();
  await appendOperationsAudit(env, request, user, "distribution_point.stock_updated", "distribution_point", id, { stock });
  return json({ ok: true });
}

async function geocodeAddress(env: RuntimeEnv, address: string, island: string): Promise<{ latitude: number; longitude: number; formattedAddress: string; locationType: string } | null> {
  if (!env.NEUTRINO_USER_ID || !env.NEUTRINO_API_KEY) return null;
  try {
    const query = `${address}, ${island}, Islas Canarias, España`;
    const response = await fetch("https://neutrinoapi.net/geocode-address", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-ID": env.NEUTRINO_USER_ID,
        "API-Key": env.NEUTRINO_API_KEY,
      },
      body: new URLSearchParams({ address: query, "country-code": "ES", "fuzzy-search": "true" }).toString(),
    });
    if (!response.ok) return null;
    const payload = await response.json<{ found: number; locations: Array<{ latitude: number; longitude: number; address: string; "location-type": string }> }>();
    if (!payload.found || !payload.locations?.length) return null;
    const best = payload.locations[0];
    return { latitude: best.latitude, longitude: best.longitude, formattedAddress: best.address, locationType: best["location-type"] };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "geocode_failed", error: error instanceof Error ? error.message : "unknown" }));
    return null;
  }
}

async function selfRegisterDistributionPoint(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  if (!env.BUCKET) throw new OperationsError(503, "storage_missing", "Archivio fotografico non configurato.");
  if (user.role !== "distributor" || !user.island) throw new OperationsError(403, "not_allowed", "La registrazione di un nuovo punto è riservata ai Distributori.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_PHOTO_BYTES + 256_000) throw new OperationsError(413, "photo_too_large", "La foto supera 8 MB.");
  if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) throw new OperationsError(415, "form_required", "Invia nome, foto e coordinate del punto.");
  const form = await request.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0 || photo.size > MAX_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
    throw new OperationsError(400, "invalid_photo", "Carica una foto JPG, PNG o WebP fino a 8 MB.");
  }
  const name = clean(form.get("name"), 120);
  const address = clean(form.get("address"), 260);
  const latitude = requiredCoordinate(form.get("latitude"), -90, 90);
  const longitude = requiredCoordinate(form.get("longitude"), -180, 180);
  const quantity = positiveInt(form.get("quantity"), 1_000_000);
  const unit = clean(form.get("unit"), 30) || "copie";
  const reminderDays = Math.min(60, Math.max(1, nonNegativeInt(form.get("reminderDays"), 60) || 7));
  if (!name || !address) throw new OperationsError(400, "invalid_point", "Nome e indirizzo del punto sono obbligatori.");

  const geocode = await geocodeAddress(env, address, user.island);
  const addressVerified = geocode !== null;
  const addressDistanceM = geocode ? Math.round(haversineMeters(latitude, longitude, geocode.latitude, geocode.longitude)) : null;
  const addressMismatch = addressDistanceM !== null && addressDistanceM > 600;

  const bytes = await photo.arrayBuffer();
  const digest = await sha256(bytes);
  const duplicate = await env.DB.prepare("SELECT id, delivery_id FROM photo_audits WHERE sha256 = ? ORDER BY created_at DESC LIMIT 1").bind(digest).first<{ id: string; delivery_id: string }>();
  const pointId = crypto.randomUUID();
  const deliveryId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const key = `distribution-points/${user.island}/${nowIso.slice(0, 10)}/${pointId}.${extensionFor(photo.type)}`;
  const watermarkText = `CRMVLC | NUOVO PUNTO | ${user.island} | ${nowIso} | ${latitude.toFixed(6)},${longitude.toFixed(6)} | ${digest.slice(0, 12)}`;
  const aiAnalysis = await analyzeDeliveryPhoto(env, bytes, photo.type, {
    quantity,
    unit,
    pointName: name,
    pointAddress: address,
    geofenceDistanceM: 0,
    exactDuplicate: Boolean(duplicate),
  }, null);
  if (addressMismatch || !addressVerified) aiAnalysis.verdict = "review_required";
  if (addressMismatch) aiAnalysis.reasons = [`Indirizzo digitato a ${addressDistanceM} m dalla posizione GPS rilevata dal geocoding.`, ...aiAnalysis.reasons].slice(0, 4);
  else if (!addressVerified) aiAnalysis.reasons = ["Indirizzo non verificabile tramite geocoding: revisione manuale consigliata.", ...aiAnalysis.reasons].slice(0, 4);
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: photo.type, cacheControl: "private, no-store" }, customMetadata: { sha256: digest, watermark: watermarkText, pointId, deliveryId } });
  const nextCheckDueAt = new Date(now.getTime() + reminderDays * 86_400_000).toISOString();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO distribution_points (id, client_id, name, island, address, latitude_e6, longitude_e6, capacity, stock, public_visible, created_at, updated_at, created_by, self_registered, point_photo_r2_key, next_check_due_at) VALUES (?, NULL, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?, 1, ?, ?)",
    ).bind(pointId, name, user.island, address, toE6(latitude), toE6(longitude), quantity, nowIso, nowIso, user.id, key, nextCheckDueAt),
    env.DB.prepare(
      "INSERT INTO deliveries (id, client_id, distributor_user_id, distribution_point_id, island, status, quantity, unit, scheduled_for, delivery_contact_name, delivery_contact_email, delivery_contact_phone, delivery_address, notes, version, created_by, completed_at, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, 'delivered', ?, ?, ?, NULL, NULL, NULL, ?, ?, 1, ?, ?, ?, ?)",
    ).bind(deliveryId, user.id, pointId, user.island, quantity, unit, canaryDateKey(now), address, "Punto registrato e prima consegna dal Distributore.", user.id, nowIso, nowIso, nowIso),
    env.DB.prepare(
      "INSERT INTO photo_audits (id, delivery_id, distributor_user_id, island, r2_key, sha256, latitude_e6, longitude_e6, geofence_distance_m, status, quality_score, duplicate_of_audit_id, ai_model, ai_verdict, ai_result_json, watermark_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?, ?, ?, ?, ?, ?)",
    ).bind(auditId, deliveryId, user.id, user.island, key, digest, toE6(latitude), toE6(longitude), aiAnalysis.qualityScore, duplicate?.id ?? null, aiAnalysis.model, aiAnalysis.verdict, JSON.stringify(aiAnalysis), watermarkText, nowIso),
  ]);

  await appendOperationsAudit(env, request, user, "distribution_point.self_registered", "distribution_point", pointId, { name, address, quantity, unit, reminderDays, deliveryId, duplicateOfAuditId: duplicate?.id ?? null, addressVerified, addressDistanceM, geocodedAddress: geocode?.formattedAddress ?? null });
  return json({ id: pointId, deliveryId, auditId, nextCheckDueAt, addressVerified, addressDistanceM, geocodedAddress: geocode?.formattedAddress ?? null, addressMismatch }, 201);
}

async function createDeliveryCheck(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  if (!env.BUCKET) throw new OperationsError(503, "storage_missing", "Archivio fotografico non configurato.");
  if (user.role !== "distributor" || !user.island) throw new OperationsError(403, "not_allowed", "Il controllo di un punto è riservato ai Distributori.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_PHOTO_BYTES + 256_000) throw new OperationsError(413, "photo_too_large", "La foto supera 8 MB.");
  if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) throw new OperationsError(415, "form_required", "Invia foto e coordinate del controllo.");
  const form = await request.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0 || photo.size > MAX_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
    throw new OperationsError(400, "invalid_photo", "Carica una foto JPG, PNG o WebP fino a 8 MB.");
  }
  const pointId = clean(form.get("distributionPointId"), 80);
  const quantityFound = nonNegativeInt(form.get("quantityFound"), 1_000_000);
  const latitude = requiredCoordinate(form.get("latitude"), -90, 90);
  const longitude = requiredCoordinate(form.get("longitude"), -180, 180);
  const notes = cleanOptional(form.get("notes"), 500);

  const point = await env.DB.prepare("SELECT id, island, latitude_e6, longitude_e6 FROM distribution_points WHERE id = ? LIMIT 1").bind(pointId).first<{ id: string; island: string; latitude_e6: number; longitude_e6: number }>();
  if (!point || !canAccessIsland(user, point.island)) throw new OperationsError(404, "point_not_found", "Punto di distribuzione non trovato.");

  const lastDelivery = await env.DB.prepare(
    "SELECT id, quantity FROM deliveries WHERE distribution_point_id = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(pointId).first<{ id: string; quantity: number }>();
  const quantityLeft = lastDelivery?.quantity ?? 0;
  const quantityTaken = Math.max(0, quantityLeft - quantityFound);

  const bytes = await photo.arrayBuffer();
  const digest = await sha256(bytes);
  const distanceM = Math.round(haversineMeters(latitude, longitude, point.latitude_e6 / 1_000_000, point.longitude_e6 / 1_000_000));
  const id = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const key = `distribution-checks/${point.island}/${nowIso.slice(0, 10)}/${id}.${extensionFor(photo.type)}`;
  const watermarkText = `CRMVLC | CONTROLLO | ${point.island} | ${nowIso} | ${latitude.toFixed(6)},${longitude.toFixed(6)} | ${digest.slice(0, 12)}`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: photo.type, cacheControl: "private, no-store" }, customMetadata: { sha256: digest, watermark: watermarkText, pointId } });

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO delivery_checks (id, distribution_point_id, delivery_id, distributor_user_id, island, quantity_left, quantity_found, quantity_taken, r2_key, latitude_e6, longitude_e6, geofence_distance_m, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, pointId, lastDelivery?.id ?? null, user.id, point.island, quantityLeft, quantityFound, quantityTaken, key, toE6(latitude), toE6(longitude), distanceM, notes, nowIso),
    env.DB.prepare("UPDATE distribution_points SET next_check_due_at = NULL, updated_at = ? WHERE id = ?").bind(nowIso, pointId),
  ]);

  await appendOperationsAudit(env, request, user, "delivery_check.created", "delivery_check", id, { pointId, deliveryId: lastDelivery?.id ?? null, quantityLeft, quantityFound, quantityTaken, distanceM });
  return json({ id, quantityLeft, quantityFound, quantityTaken, geofenceDistanceM: distanceM }, 201);
}

async function uploadPhotoAudit(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  if (!env.BUCKET) throw new OperationsError(503, "storage_missing", "Archivio fotografico non configurato.");
  if (!["super_admin", "admin", "sales_manager", "distributor"].includes(user.role)) throw new OperationsError(403, "not_allowed", "Non puoi caricare verifiche fotografiche.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_PHOTO_BYTES + 256_000) throw new OperationsError(413, "photo_too_large", "La foto supera 8 MB.");
  if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) throw new OperationsError(415, "form_required", "Invia una foto con coordinate.");
  const form = await request.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0 || photo.size > MAX_PHOTO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
    throw new OperationsError(400, "invalid_photo", "Carica una foto JPG, PNG o WebP fino a 8 MB.");
  }
  let deliveryId = clean(form.get("deliveryId"), 80);
  const onBehalfOfDistributorId = ["super_admin", "admin", "sales_manager"].includes(user.role)
    ? cleanOptional(form.get("distributorId"), 80)
    : null;
  let selfReported = false;
  let adminBulkUpload = false;
  let latitude: number;
  let longitude: number;
  if (!deliveryId && onBehalfOfDistributorId) {
    adminBulkUpload = true;
    const distributor = await env.DB.prepare("SELECT id, island FROM users WHERE id = ? AND role = 'distributor' AND active = 1 LIMIT 1")
      .bind(onBehalfOfDistributorId).first<{ id: string; island: string | null }>();
    if (!distributor || !distributor.island || !canAccessIsland(user, distributor.island)) {
      throw new OperationsError(400, "invalid_distributor", "Distributore non disponibile nel tuo perimetro.");
    }
    const distributionPointId = clean(form.get("distributionPointId"), 80);
    const quantity = positiveInt(form.get("quantity"), 1_000_000);
    const unit = clean(form.get("unit"), 30);
    const reminderDays = Math.min(60, Math.max(1, nonNegativeInt(form.get("reminderDays"), 60) || 7));
    const point = await env.DB.prepare(
      "SELECT p.id, p.client_id, p.island, p.address, p.latitude_e6, p.longitude_e6, c.contact_name, c.email, c.phone FROM distribution_points p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ? AND p.island = ? LIMIT 1",
    ).bind(distributionPointId, distributor.island).first<{ id: string; client_id: string | null; island: string; address: string; latitude_e6: number; longitude_e6: number; contact_name: string | null; email: string | null; phone: string | null }>();
    if (!point || !unit) throw new OperationsError(404, "point_not_found", "Scegli un punto di distribuzione valido per l'isola del distributore.");
    latitude = point.latitude_e6 / 1_000_000;
    longitude = point.longitude_e6 / 1_000_000;
    deliveryId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const nextCheckDueAt = new Date(Date.now() + reminderDays * 86_400_000).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO deliveries (id, client_id, distributor_user_id, distribution_point_id, island, status, quantity, unit, scheduled_for, delivery_contact_name, delivery_contact_email, delivery_contact_phone, delivery_address, notes, version, created_by, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'delivered', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)",
      ).bind(deliveryId, point.client_id, distributor.id, point.id, point.island, quantity, unit, canaryDateKey(new Date()), point.contact_name, point.email, point.phone, point.address, "Carico multiplo registrato dall'amministrazione per conto del Distributore.", user.id, createdAt, createdAt, createdAt),
      env.DB.prepare("UPDATE distribution_points SET next_check_due_at = ?, updated_at = ? WHERE id = ?").bind(nextCheckDueAt, createdAt, point.id),
    ]);
    selfReported = true;
  } else if (!deliveryId) {
    latitude = requiredCoordinate(form.get("latitude"), -90, 90);
    longitude = requiredCoordinate(form.get("longitude"), -180, 180);
    if (user.role !== "distributor" || !user.island) throw new OperationsError(400, "delivery_required", "Seleziona una consegna.");
    const distributionPointId = clean(form.get("distributionPointId"), 80);
    const quantity = positiveInt(form.get("quantity"), 1_000_000);
    const unit = clean(form.get("unit"), 30);
    const reminderDays = Math.min(60, Math.max(1, nonNegativeInt(form.get("reminderDays"), 60) || 7));
    const point = await env.DB.prepare(
      "SELECT p.id, p.client_id, p.island, p.address, c.contact_name, c.email, c.phone FROM distribution_points p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ? AND p.island = ? AND p.public_visible = 1 LIMIT 1",
    ).bind(distributionPointId, user.island).first<{ id: string; client_id: string | null; island: string; address: string; contact_name: string | null; email: string | null; phone: string | null }>();
    if (!point || !unit) throw new OperationsError(404, "point_not_found", "Scegli un punto di distribuzione valido per la tua isola.");
    deliveryId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const nextCheckDueAt = new Date(Date.now() + reminderDays * 86_400_000).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO deliveries (id, client_id, distributor_user_id, distribution_point_id, island, status, quantity, unit, scheduled_for, delivery_contact_name, delivery_contact_email, delivery_contact_phone, delivery_address, notes, version, created_by, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'delivered', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)",
      ).bind(deliveryId, point.client_id, user.id, point.id, point.island, quantity, unit, canaryDateKey(new Date()), point.contact_name, point.email, point.phone, point.address, "Conferma libera registrata dal Distributore.", user.id, createdAt, createdAt, createdAt),
      env.DB.prepare("UPDATE distribution_points SET next_check_due_at = ?, updated_at = ? WHERE id = ?").bind(nextCheckDueAt, createdAt, point.id),
    ]);
    selfReported = true;
  } else {
    latitude = requiredCoordinate(form.get("latitude"), -90, 90);
    longitude = requiredCoordinate(form.get("longitude"), -180, 180);
  }
  const delivery = await env.DB.prepare("SELECT d.id, d.distributor_user_id, d.island, d.quantity, d.unit, d.distribution_point_id, p.name AS point_name, p.address AS point_address, p.latitude_e6 AS point_latitude_e6, p.longitude_e6 AS point_longitude_e6 FROM deliveries d LEFT JOIN distribution_points p ON p.id = d.distribution_point_id WHERE d.id = ? LIMIT 1").bind(deliveryId).first<{ id: string; distributor_user_id: string; island: string; quantity: number; unit: string; distribution_point_id: string | null; point_name: string | null; point_address: string | null; point_latitude_e6: number | null; point_longitude_e6: number | null }>();
  if (!delivery || !canAccessIsland(user, delivery.island) || (user.role === "distributor" && delivery.distributor_user_id !== user.id)) {
    throw new OperationsError(404, "delivery_not_found", "Consegna non disponibile nel tuo perimetro.");
  }
  const nearest = delivery.distribution_point_id && delivery.point_latitude_e6 !== null && delivery.point_longitude_e6 !== null
    ? { id: delivery.distribution_point_id, distanceM: Math.round(haversineMeters(latitude, longitude, delivery.point_latitude_e6 / 1_000_000, delivery.point_longitude_e6 / 1_000_000)) }
    : await nearestDistributionPoint(env, delivery.island, latitude, longitude);
  const bytes = await photo.arrayBuffer();
  const digest = await sha256(bytes);
  const duplicate = await env.DB.prepare("SELECT id, delivery_id FROM photo_audits WHERE sha256 = ? ORDER BY created_at DESC LIMIT 1").bind(digest).first<{ id: string; delivery_id: string }>();
  const previous = await env.DB.prepare("SELECT id, r2_key FROM photo_audits WHERE delivery_id = ? ORDER BY created_at DESC LIMIT 1").bind(delivery.id).first<{ id: string; r2_key: string }>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const watermarkText = `CRMVLC | ${delivery.island} | ${now} | ${latitude.toFixed(6)},${longitude.toFixed(6)} | ${digest.slice(0, 12)}`;
  const aiAnalysis = await analyzeDeliveryPhoto(env, bytes, photo.type, {
    quantity: delivery.quantity,
    unit: delivery.unit,
    pointName: delivery.point_name,
    pointAddress: delivery.point_address,
    geofenceDistanceM: nearest?.distanceM ?? null,
    exactDuplicate: Boolean(duplicate),
  }, previous?.r2_key ?? null);
  const qualityScore = aiAnalysis.qualityScore;
  const key = `distribution-audit/${delivery.island}/${now.slice(0, 10)}/${id}.${extensionFor(photo.type)}`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: photo.type, cacheControl: "private, no-store" }, customMetadata: { sha256: digest, watermark: watermarkText, deliveryId } });
  const mutations = [
    env.DB.prepare("INSERT INTO photo_audits (id, delivery_id, distributor_user_id, island, r2_key, sha256, latitude_e6, longitude_e6, geofence_distance_m, status, quality_score, duplicate_of_audit_id, ai_model, ai_verdict, ai_result_json, watermark_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, delivery.id, delivery.distributor_user_id, delivery.island, key, digest, toE6(latitude), toE6(longitude), nearest?.distanceM ?? null, qualityScore, duplicate?.id ?? null, aiAnalysis.model, aiAnalysis.verdict, JSON.stringify(aiAnalysis), watermarkText, now),
  ];
  if (user.role === "distributor" && !selfReported) {
    mutations.push(env.DB.prepare("UPDATE deliveries SET status = 'delivered', completed_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND distributor_user_id = ? AND status IN ('assigned','in_progress','issue')").bind(now, now, delivery.id, user.id));
  }
  await env.DB.batch(mutations);
  await appendOperationsAudit(env, request, user, "photo_audit.created", "photo_audit", id, { deliveryId, selfReported, digest, distanceM: nearest?.distanceM ?? null, qualityScore, duplicateOfAuditId: duplicate?.id ?? null, aiVerdict: aiAnalysis.verdict, adminBulkUpload, onBehalfOfDistributorId: adminBulkUpload ? delivery.distributor_user_id : null });
  return json({ id, deliveryId, selfReported, adminBulkUpload, distributorUserId: delivery.distributor_user_id, status: "pending", qualityScore, geofenceDistanceM: nearest?.distanceM ?? null, watermarkText, aiVerdict: aiAnalysis.verdict, duplicate: Boolean(duplicate) }, 201);
}

type PhotoAiResult = {
  model: string | null;
  verdict: "compliant_candidate" | "review_required";
  qualityScore: number;
  magazinesDetected: boolean;
  displayDetected: boolean;
  deliveryConsistent: boolean;
  possibleDuplicate: boolean;
  confidence: number;
  reasons: string[];
};

async function analyzeDeliveryPhoto(
  env: RuntimeEnv,
  bytes: ArrayBuffer,
  mimeType: string,
  expected: { quantity: number; unit: string; pointName: string | null; pointAddress: string | null; geofenceDistanceM: number | null; exactDuplicate: boolean },
  previousR2Key: string | null,
): Promise<PhotoAiResult> {
  const fallback: PhotoAiResult = {
    model: null,
    verdict: "review_required",
    qualityScore: 0,
    magazinesDetected: false,
    displayDetected: false,
    deliveryConsistent: false,
    possibleDuplicate: expected.exactDuplicate,
    confidence: 0,
    reasons: [env.AI ? "Analisi AI temporaneamente non disponibile." : "Workers AI non configurata."],
  };
  if (!env.AI) return fallback;
  try {
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "text", text: `Controlla questa prova di consegna CRMVLC. Atteso: ${expected.quantity} ${expected.unit}; punto: ${expected.pointName ?? "non indicato"}, ${expected.pointAddress ?? "indirizzo non indicato"}; distanza GPS dal punto: ${expected.geofenceDistanceM ?? "non disponibile"} metri. Valuta presenza visibile di riviste Vivi Le Canarie o di un espositore, qualità tecnica, coerenza generale con una consegna e possibile riuso della fotografia. Non affermare quantità esatte se non leggibili. Rispondi solo JSON con: qualityScore 0-100, magazinesDetected boolean, displayDetected boolean, deliveryConsistent boolean, possibleDuplicate boolean, confidence 0-100, reasons array di massimo 4 stringhe brevi in italiano.` },
      { type: "image_url", image_url: { url: dataUrl(bytes, mimeType) } },
    ];
    if (previousR2Key && env.BUCKET) {
      const previous = await env.BUCKET.get(previousR2Key);
      if (previous) {
        const previousBytes = await previous.arrayBuffer();
        if (previousBytes.byteLength <= MAX_PHOTO_BYTES) {
          content.push({ type: "text", text: "Foto precedente della stessa consegna: confrontala con quella attuale per individuare un possibile duplicato." });
          content.push({ type: "image_url", image_url: { url: dataUrl(previousBytes, previous.httpMetadata?.contentType ?? "image/jpeg") } });
        }
      }
    }
    const output = await env.AI.run(PHOTO_AI_MODEL, {
      messages: [{ role: "system", content: "Sei un revisore prudente di prove fotografiche. Non approvi né rifiuti: produci indicatori verificabili per un revisore umano." }, { role: "user", content }],
      response_format: { type: "json_object" },
      max_tokens: 350,
      temperature: 0,
    });
    const parsed = JSON.parse(output.response) as Record<string, unknown>;
    const score = clampScore(parsed.qualityScore);
    const magazinesDetected = parsed.magazinesDetected === true;
    const displayDetected = parsed.displayDetected === true;
    const deliveryConsistent = parsed.deliveryConsistent === true;
    const possibleDuplicate = expected.exactDuplicate || parsed.possibleDuplicate === true;
    const confidence = clampScore(parsed.confidence);
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.map((item) => clean(item, 180)).filter(Boolean).slice(0, 4) : [];
    const reviewRequired = possibleDuplicate || (!magazinesDetected && !displayDetected) || !deliveryConsistent || score < 60 || confidence < 55 || (expected.geofenceDistanceM !== null && expected.geofenceDistanceM > 250);
    return { model: PHOTO_AI_MODEL, verdict: reviewRequired ? "review_required" : "compliant_candidate", qualityScore: score, magazinesDetected, displayDetected, deliveryConsistent, possibleDuplicate, confidence, reasons };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "photo_ai_failed", error: error instanceof Error ? error.message : "unknown" }));
    return fallback;
  }
}

function dataUrl(bytes: ArrayBuffer, mimeType: string): string {
  const array = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < array.length; offset += chunk) binary += String.fromCharCode(...array.subarray(offset, offset + chunk));
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function clampScore(value: unknown): number {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
}

async function reviewPhotoAudit(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  requireManager(user);
  const body = await readJson<Record<string, unknown>>(request);
  const id = clean(body.id, 80);
  const status = clean(body.status, 20);
  if (!["approved", "rejected"].includes(status)) throw new OperationsError(400, "invalid_status", "Esito verifica non valido.");
  const row = await env.DB.prepare("SELECT id, island, status FROM photo_audits WHERE id = ? LIMIT 1").bind(id).first<{ id: string; island: string; status: string }>();
  if (!row || !canAccessIsland(user, row.island)) throw new OperationsError(404, "audit_not_found", "Verifica fotografica non trovata.");
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE photo_audits SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'").bind(status, user.id, now, id).run();
  await appendOperationsAudit(env, request, user, `photo_audit.${status}`, "photo_audit", id, {});
  return json({ ok: true });
}

async function createSalesCheckin(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  if (!["sales", "sales_manager"].includes(user.role) || !user.island) throw new OperationsError(403, "not_allowed", "Check-in riservato alla rete commerciale.");
  const body = await readJson<Record<string, unknown>>(request);
  const latitude = requiredCoordinate(body.latitude, -90, 90);
  const longitude = requiredCoordinate(body.longitude, -180, 180);
  const center = ISLAND_CENTERS[user.island];
  const distanceM = center ? haversineMeters(latitude, longitude, center.latitude, center.longitude) : Number.POSITIVE_INFINITY;
  const now = new Date();
  const canaryTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Atlantic/Canary", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(canaryTime.find((part) => part.type === "hour")?.value ?? 99);
  const minute = Number(canaryTime.find((part) => part.type === "minute")?.value ?? 99);
  const status = distanceM > 80_000 ? "outside_geofence" : (hour < 9 || (hour === 9 && minute <= 15)) ? "on_time" : "late";
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO sales_checkins (id, user_id, island, latitude_e6, longitude_e6, checked_in_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, user.id, user.island, toE6(latitude), toE6(longitude), now.toISOString(), status).run();
  await appendOperationsAudit(env, request, user, "sales.checkin", "sales_checkin", id, { status, distanceM: Math.round(distanceM) });
  return json({ id, status, distanceM: Math.round(distanceM) }, 201);
}

async function createSalesTask(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  requireManager(user);
  const body = await readJson<Record<string, unknown>>(request);
  const targetUserId = clean(body.userId, 80);
  const target = await env.DB.prepare("SELECT id, island, role FROM users WHERE id = ? AND active = 1 LIMIT 1").bind(targetUserId).first<{ id: string; island: string | null; role: string }>();
  if (!target || !target.island || !["sales", "sales_manager"].includes(target.role) || !canAccessIsland(user, target.island)) throw new OperationsError(400, "invalid_assignee", "Commerciale non disponibile nel tuo perimetro.");
  const kind = clean(body.kind, 30);
  const title = clean(body.title, 160);
  const scheduledFor = clean(body.scheduledFor, 30);
  if (!['visit', 'display_check'].includes(kind) || !title || Number.isNaN(Date.parse(scheduledFor))) throw new OperationsError(400, "invalid_task", "Attività commerciale non valida.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO sales_tasks (id, user_id, client_id, island, kind, title, status, scheduled_for, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)")
    .bind(id, target.id, cleanOptional(body.clientId, 80), target.island, kind, title, new Date(scheduledFor).toISOString(), now, now).run();
  await appendOperationsAudit(env, request, user, "sales_task.created", "sales_task", id, { targetUserId, kind, targetIsland: target.island });
  return json({ id }, 201);
}

async function completeSalesTask(request: Request, env: RuntimeEnv, user: OperationsUser): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(request);
  const id = clean(body.id, 80);
  const task = await env.DB.prepare("SELECT id, user_id, island, status FROM sales_tasks WHERE id = ? LIMIT 1").bind(id).first<{ id: string; user_id: string; island: string; status: string }>();
  if (!task || task.status !== "open" || (task.user_id !== user.id && !(["super_admin", "admin", "sales_manager"].includes(user.role) && canAccessIsland(user, task.island)))) {
    throw new OperationsError(404, "task_not_found", "Attività non disponibile.");
  }
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE sales_tasks SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'open'").bind(now, now, id).run();
  await appendOperationsAudit(env, request, user, "sales_task.completed", "sales_task", id, {});
  return json({ ok: true });
}

function scopeFor(user: OperationsUser, islandColumn: string, ownerColumn: string | null): { sql: string; values: string[] } {
  if (isGlobalOperator(user)) return { sql: "", values: [] };
  if (user.role === "sales_manager" || user.role === "distributor" || !ownerColumn) return { sql: ` AND ${islandColumn} = ?`, values: [String(user.island)] };
  return { sql: ` AND ${ownerColumn} = ?`, values: [user.id] };
}

function requireSuperAdmin(user: OperationsUser): void {
  if (user.role !== "super_admin") throw new OperationsError(403, "super_admin_required", "Operazione riservata al Super Admin.");
}

function requireManager(user: OperationsUser): void {
  if (!["super_admin", "admin", "sales_manager"].includes(user.role)) throw new OperationsError(403, "manager_required", "Operazione riservata alla gestione operativa.");
}

function canAccessIsland(user: OperationsUser, island: string): boolean {
  return isGlobalOperator(user) || Boolean(user.island && user.island === island);
}

function isGlobalOperator(user: OperationsUser): boolean {
  return user.role === "super_admin" || user.role === "admin";
}

async function assertClientScope(env: RuntimeEnv, user: OperationsUser, clientId: string, island: string): Promise<void> {
  const client = await env.DB.prepare("SELECT id, island, owner_user_id FROM clients WHERE id = ? AND archived_at IS NULL LIMIT 1").bind(clientId).first<{ id: string; island: string; owner_user_id: string }>();
  if (!client || client.island !== island || !canAccessIsland(user, client.island) || (user.role === "sales" && client.owner_user_id !== user.id)) {
    throw new OperationsError(404, "client_not_found", "Cliente non disponibile nel tuo perimetro.");
  }
}

async function getSponsor(env: RuntimeEnv, id: string): Promise<{ id: string; island: string; owner_user_id: string; client_id: string | null } | null> {
  return env.DB.prepare("SELECT id, island, owner_user_id, client_id FROM sponsors WHERE id = ? AND status = 'active' LIMIT 1").bind(id).first();
}

async function nearestDistributionPoint(env: RuntimeEnv, island: string, latitude: number, longitude: number): Promise<{ id: string; distanceM: number } | null> {
  const points = (await env.DB.prepare("SELECT id, latitude_e6, longitude_e6 FROM distribution_points WHERE island = ? LIMIT 300").bind(island).all<{ id: string; latitude_e6: number; longitude_e6: number }>()).results;
  let nearest: { id: string; distanceM: number } | null = null;
  for (const point of points) {
    const distanceM = Math.round(haversineMeters(latitude, longitude, point.latitude_e6 / 1_000_000, point.longitude_e6 / 1_000_000));
    if (!nearest || distanceM < nearest.distanceM) nearest = { id: point.id, distanceM };
  }
  return nearest;
}

async function appendOperationsAudit(env: RuntimeEnv, request: Request, user: OperationsUser, action: string, entityType: string, entityId: string, payload: unknown): Promise<void> {
  const auditedPayload = user.impersonation
    ? {
      ...(payload !== null && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : { value: payload }),
      impersonation: {
        actorUserId: user.sessionActor?.id ?? user.id,
        actorName: user.sessionActor?.name ?? user.name,
        effectiveUserId: user.id,
        effectiveUserName: user.name,
        effectiveRole: user.role,
        startedAt: user.impersonation.startedAt,
      },
    }
    : payload;
  const payloadJson = stableJson(auditedPayload);
  const rawIp = request.headers.get("cf-connecting-ip");
  const ipHash = rawIp ? await sha256(`${env.AUTH_SECRET ?? "vlc"}:${rawIp}`) : null;
  await env.DB.prepare("INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, payload_json, payload_sha256, ip_hash, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), user.sessionActor?.id ?? user.id, action, entityType, entityId, payloadJson, await sha256(payloadJson), ipHash, cleanOptional(request.headers.get("user-agent"), 300), new Date().toISOString()).run();
}

async function readJson<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_JSON_BYTES) throw new OperationsError(413, "payload_too_large", "Richiesta troppo grande.");
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw new OperationsError(415, "json_required", "Invia dati JSON.");
  try { return await request.json<T>(); } catch { throw new OperationsError(400, "invalid_json", "Dati JSON non validi."); }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function errorResponse(error: OperationsError): Response {
  return json({ error: { code: error.code, message: error.message } }, error.status);
}

function clean(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanOptional(value: unknown, maxLength: number): string | null {
  return clean(value, maxLength) || null;
}

function normalizePhone(value: unknown): string {
  const raw = String(value ?? "").trim();
  const plus = raw.startsWith("+") ? "+" : "";
  return `${plus}${raw.replace(/\D/g, "")}`.slice(0, 20);
}

function isIsland(value: string): value is typeof ISLANDS[number] {
  return ISLANDS.includes(value as typeof ISLANDS[number]);
}

function positiveInt(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new OperationsError(400, "invalid_number", `Inserisci un intero tra 1 e ${max}.`);
  return parsed;
}

function nonNegativeInt(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) throw new OperationsError(400, "invalid_number", `Inserisci un intero tra 0 e ${max}.`);
  return parsed;
}

function canaryDateKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Canary", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function requiredCoordinate(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new OperationsError(400, "invalid_coordinates", "Coordinate geografiche non valide.");
  return parsed;
}

function optionalCoordinate(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return requiredCoordinate(value, min, max);
}

function toE6(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1_000_000);
}

function secureCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}
