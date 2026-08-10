type RuntimeEnv = Env & {
  AUTH_SECRET?: string;
  WHATSAPP_TOKEN?: string;
  WHATSAPP_API_URL?: string;
  WHATSAPP_TEMPLATE_NAME?: string;
};

const VIP_COOKIE = "vlc_vip_member";
const ISLANDS = ["Tenerife", "Gran Canaria", "Lanzarote", "Fuerteventura", "La Palma"] as const;
const EVENT_TYPES = ["directory_view", "sponsor_view", "registration", "coupon_issued", "instagram_click"] as const;
const MAX_JSON_BYTES = 32_000;
const COOKIE_DAYS = 365;
const textEncoder = new TextEncoder();

type VipEventType = typeof EVENT_TYPES[number];
type VipMember = { id: string; name: string; phone: string; island: string; tier: string; streak_months: number };
type SponsorRow = {
  id: string;
  name: string;
  island: string;
  category: string;
  offer_title: string;
  discount_text: string;
  address: string | null;
  latitude_e6: number | null;
  longitude_e6: number | null;
  instagram_handle: string | null;
};

class VipApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function handleVipPublicApi(
  request: Request,
  env: RuntimeEnv,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/vip/")) return null;

  try {
    if (url.pathname === "/api/vip/directory" && request.method === "GET") {
      return publicDirectory(request, env, ctx);
    }
    if (url.pathname === "/api/vip/me" && request.method === "GET") {
      return currentVipMember(request, env);
    }
    if (url.pathname === "/api/vip/register" && request.method === "POST") {
      return registerVipMember(request, env, ctx);
    }
    if (url.pathname === "/api/vip/coupons" && request.method === "POST") {
      return issuePublicCoupon(request, env, ctx);
    }
    if (url.pathname === "/api/vip/track" && request.method === "POST") {
      return trackPublicEvent(request, env);
    }
    throw new VipApiError(404, "not_found", "Risorsa VIP non trovata.");
  } catch (error) {
    if (error instanceof VipApiError) return errorResponse(error);
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    console.error(JSON.stringify({ level: "error", event: "vip_public_api_failure", requestId, error: error instanceof Error ? error.message : "unknown" }));
    return errorResponse(new VipApiError(500, "internal_error", `Errore temporaneo. Riferimento: ${requestId}`));
  }
}

async function publicDirectory(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const island = clean(url.searchParams.get("island"), 40);
  const category = clean(url.searchParams.get("category"), 80);
  if (island && !isIsland(island)) throw new VipApiError(400, "invalid_island", "Isola non valida.");

  const clauses = ["status = 'active'"];
  const values: string[] = [];
  if (island) { clauses.push("island = ?"); values.push(island); }
  if (category) { clauses.push("category = ?"); values.push(category); }
  const sponsors = (await env.DB.prepare(
    `SELECT id, name, island, category, offer_title, discount_text, address, latitude_e6, longitude_e6, instagram_handle FROM sponsors WHERE ${clauses.join(" AND ")} ORDER BY island, category, name LIMIT 250`,
  ).bind(...values).all<SponsorRow>()).results;
  const categories = (await env.DB.prepare("SELECT DISTINCT category FROM sponsors WHERE status = 'active' ORDER BY category LIMIT 80").all<{ category: string }>()).results.map((row) => row.category);
  const member = await memberFromRequest(request, env);
  ctx.waitUntil(recordEvent(env, request, "directory_view", member?.id ?? null, null, island || member?.island || null, { category: category || null }));

  return json({
    sponsors: sponsors.map(publicSponsor),
    categories,
    islands: ISLANDS,
    member: member ? publicMember(member) : null,
    prize: { eyebrow: "Premio del mese", title: "Vivi l'isola da protagonista", description: "Usa i coupon VIP e mantieni attiva la tua streak mensile." },
    instagram: { handle: "@vivi_le_canarie", url: "https://www.instagram.com/vivi_le_canarie/" },
    whatsappConfigured: isWhatsAppConfigured(env),
  });
}

async function currentVipMember(request: Request, env: RuntimeEnv): Promise<Response> {
  const member = await memberFromRequest(request, env);
  return json({ registered: Boolean(member), member: member ? publicMember(member) : null });
}

async function registerVipMember(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  requirePublicConfiguration(env);
  await enforceRateLimit(env, request, "vip-register", 5, 10);
  const body = await readJson<Record<string, unknown>>(request);
  const name = clean(body.name, 120);
  const phone = normalizePhone(body.phone);
  const island = clean(body.island, 40);
  if (!name || phone.length < 9 || !isIsland(island) || body.consent !== true) {
    throw new VipApiError(400, "invalid_registration", "Nome, isola, numero WhatsApp e consenso sono obbligatori.");
  }

  const now = new Date().toISOString();
  let member = await env.DB.prepare("SELECT id, name, phone, island, tier, streak_months FROM vip_members WHERE phone = ? LIMIT 1").bind(phone).first<VipMember>();
  if (member) {
    await env.DB.prepare("UPDATE vip_members SET name = ?, island = ?, consent_at = ? WHERE id = ?").bind(name, island, now, member.id).run();
    member = { ...member, name, island };
  } else {
    member = { id: crypto.randomUUID(), name, phone, island, tier: "standard", streak_months: 0 };
    await env.DB.prepare("INSERT INTO vip_members (id, name, phone, island, tier, streak_months, consent_at, created_at) VALUES (?, ?, ?, ?, 'standard', 0, ?, ?)")
      .bind(member.id, name, phone, island, now, now).run();
  }

  await recordEvent(env, request, "registration", member.id, null, island, { consent: true });
  const response = json({ registered: true, member: publicMember(member), whatsappConfigured: isWhatsAppConfigured(env) }, 201);
  response.headers.append("Set-Cookie", await vipCookie(member.id, request, env));
  ctx.waitUntil(cleanExpiredRateLimits(env));
  return response;
}

async function issuePublicCoupon(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  requirePublicConfiguration(env);
  await enforceRateLimit(env, request, "vip-coupon", 12, 10);
  const member = await memberFromRequest(request, env);
  if (!member) throw new VipApiError(401, "registration_required", "Registrati per sbloccare il coupon.");
  const body = await readJson<Record<string, unknown>>(request);
  const sponsorId = clean(body.sponsorId, 80);
  const sponsor = await env.DB.prepare("SELECT id, name, island, category, offer_title, discount_text, address, latitude_e6, longitude_e6, instagram_handle FROM sponsors WHERE id = ? AND status = 'active' LIMIT 1")
    .bind(sponsorId).first<SponsorRow>();
  if (!sponsor || sponsor.island !== member.island) throw new VipApiError(404, "sponsor_not_available", "Questo sponsor non è disponibile per la tua isola.");

  const now = new Date();
  await env.DB.prepare("UPDATE coupons SET status = 'expired' WHERE member_id = ? AND sponsor_id = ? AND status = 'issued' AND expires_at <= ?")
    .bind(member.id, sponsor.id, now.toISOString()).run();
  const existing = await env.DB.prepare("SELECT id, code, expires_at, whatsapp_sent_at FROM coupons WHERE member_id = ? AND sponsor_id = ? AND status = 'issued' AND expires_at > ? ORDER BY issued_at DESC LIMIT 1")
    .bind(member.id, sponsor.id, now.toISOString()).first<{ id: string; code: string; expires_at: string; whatsapp_sent_at: string | null }>();

  let coupon = existing;
  if (!coupon) {
    const id = crypto.randomUUID();
    const code = secureCode();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO coupons (id, member_id, sponsor_id, code, status, issued_at, expires_at) VALUES (?, ?, ?, ?, 'issued', ?, ?)")
        .bind(id, member.id, sponsor.id, code, now.toISOString(), expiresAt),
      env.DB.prepare("INSERT INTO vip_events (id, member_id, sponsor_id, event_type, island, visitor_hash, metadata_json, created_at) VALUES (?, ?, ?, 'coupon_issued', ?, ?, '{}', ?)")
        .bind(crypto.randomUUID(), member.id, sponsor.id, member.island, await visitorHash(env, request), now.toISOString()),
    ]);
    coupon = { id, code, expires_at: expiresAt, whatsapp_sent_at: null };
  }

  const whatsappQueued = isWhatsAppConfigured(env) && !coupon.whatsapp_sent_at;
  if (whatsappQueued) ctx.waitUntil(sendCouponOnWhatsApp(env, member, sponsor, coupon).catch((error) => {
    console.error(JSON.stringify({ level: "error", event: "vip_whatsapp_failed", couponId: coupon?.id, error: error instanceof Error ? error.message : "unknown" }));
  }));
  ctx.waitUntil(cleanExpiredRateLimits(env));

  return json({
    coupon: {
      id: coupon.id,
      code: coupon.code,
      expiresAt: coupon.expires_at,
      sponsor: publicSponsor(sponsor),
    },
    whatsappQueued,
    whatsappConfigured: isWhatsAppConfigured(env),
  }, existing ? 200 : 201);
}

async function trackPublicEvent(request: Request, env: RuntimeEnv): Promise<Response> {
  await enforceRateLimit(env, request, "vip-track", 60, 10);
  const body = await readJson<Record<string, unknown>>(request);
  const eventType = clean(body.eventType, 40) as VipEventType;
  if (!EVENT_TYPES.includes(eventType) || ["registration", "coupon_issued", "directory_view"].includes(eventType)) {
    throw new VipApiError(400, "invalid_event", "Evento non valido.");
  }
  const sponsorId = cleanOptional(body.sponsorId, 80);
  if (sponsorId) {
    const sponsor = await env.DB.prepare("SELECT id FROM sponsors WHERE id = ? AND status = 'active' LIMIT 1").bind(sponsorId).first();
    if (!sponsor) throw new VipApiError(404, "sponsor_not_found", "Sponsor non trovato.");
  }
  const member = await memberFromRequest(request, env);
  await recordEvent(env, request, eventType, member?.id ?? null, sponsorId, member?.island ?? null, {});
  return json({ ok: true }, 202);
}

async function sendCouponOnWhatsApp(env: RuntimeEnv, member: VipMember, sponsor: SponsorRow, coupon: { id: string; code: string; expires_at: string }): Promise<void> {
  if (!env.WHATSAPP_API_URL || !env.WHATSAPP_TOKEN || !env.WHATSAPP_TEMPLATE_NAME) return;
  const response = await fetch(env.WHATSAPP_API_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: member.phone.replace(/^\+/, ""),
      type: "template",
      template: {
        name: env.WHATSAPP_TEMPLATE_NAME,
        language: { code: "it" },
        components: [{ type: "body", parameters: [
          { type: "text", text: sponsor.name },
          { type: "text", text: sponsor.discount_text },
          { type: "text", text: sponsor.address ?? sponsor.island },
          { type: "text", text: coupon.code },
        ] }],
      },
    }),
  });
  const payload = await readLimitedResponse(response, 64_000);
  if (!response.ok) throw new Error(`WhatsApp ${response.status}: ${payload.slice(0, 300)}`);
  let messageId: string | null = null;
  try {
    const parsed = JSON.parse(payload) as { messages?: Array<{ id?: string }> };
    messageId = parsed.messages?.[0]?.id ?? null;
  } catch { /* response id is optional */ }
  await env.DB.prepare("UPDATE coupons SET whatsapp_sent_at = ?, whatsapp_message_id = ? WHERE id = ? AND whatsapp_sent_at IS NULL")
    .bind(new Date().toISOString(), messageId, coupon.id).run();
}

async function memberFromRequest(request: Request, env: RuntimeEnv): Promise<VipMember | null> {
  if (!env.AUTH_SECRET) return null;
  const token = cookieValue(request, VIP_COOKIE);
  if (!token) return null;
  const memberId = await verifyVipToken(token, env.AUTH_SECRET);
  if (!memberId) return null;
  return env.DB.prepare("SELECT id, name, phone, island, tier, streak_months FROM vip_members WHERE id = ? LIMIT 1").bind(memberId).first<VipMember>();
}

export async function vipCookie(memberId: string, request: Request, env: RuntimeEnv): Promise<string> {
  if (!env.AUTH_SECRET) throw new VipApiError(503, "vip_not_configured", "Il VIP Pass non è ancora configurato.");
  const expires = Math.floor(Date.now() / 1000) + COOKIE_DAYS * 24 * 60 * 60;
  const payload = `${memberId}.${expires}`;
  const signature = await hmac(payload, env.AUTH_SECRET);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  // The page lives under /vip while its API lives under /api/vip, so the
  // browser must send the same opaque session cookie to both path trees.
  return `${VIP_COOKIE}=${encodeURIComponent(`${payload}.${signature}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_DAYS * 24 * 60 * 60}${secure}`;
}

export async function verifyVipToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [memberId, expiresText, signature] = parts;
  const expires = Number(expiresText);
  if (!memberId || !Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return null;
  const expected = await hmac(`${memberId}.${expiresText}`, secret);
  return timingSafeText(signature, expected) ? memberId : null;
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return base64Url(new Uint8Array(signature));
}

async function enforceRateLimit(env: RuntimeEnv, request: Request, action: string, limit: number, minutes: number): Promise<void> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const fingerprint = await sha256(`${env.AUTH_SECRET ?? "vlc-public"}\n${ip}\n${request.headers.get("user-agent") ?? ""}`);
  const now = new Date();
  const bucket = Math.floor(now.getTime() / (minutes * 60_000));
  const key = `${action}:${fingerprint}:${bucket}`;
  const expiresAt = new Date((bucket + 1) * minutes * 60_000).toISOString();
  const result = await env.DB.prepare("INSERT INTO public_rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count")
    .bind(key, expiresAt).first<{ count: number }>();
  if (Number(result?.count ?? 1) > limit) throw new VipApiError(429, "rate_limited", "Troppe richieste. Riprova tra qualche minuto.");
}

async function cleanExpiredRateLimits(env: RuntimeEnv): Promise<void> {
  await env.DB.prepare("DELETE FROM public_rate_limits WHERE expires_at < ?").bind(new Date().toISOString()).run();
}

async function recordEvent(env: RuntimeEnv, request: Request, eventType: VipEventType, memberId: string | null, sponsorId: string | null, island: string | null, metadata: Record<string, unknown>): Promise<void> {
  await env.DB.prepare("INSERT INTO vip_events (id, member_id, sponsor_id, event_type, island, visitor_hash, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), memberId, sponsorId, eventType, island, await visitorHash(env, request), JSON.stringify(metadata), new Date().toISOString()).run();
}

async function visitorHash(env: RuntimeEnv, request: Request): Promise<string | null> {
  const ip = request.headers.get("cf-connecting-ip");
  return ip ? sha256(`${env.AUTH_SECRET ?? "vlc-public"}\n${ip}`) : null;
}

function publicSponsor(sponsor: SponsorRow) {
  const latitude = sponsor.latitude_e6 === null ? null : sponsor.latitude_e6 / 1_000_000;
  const longitude = sponsor.longitude_e6 === null ? null : sponsor.longitude_e6 / 1_000_000;
  return {
    id: sponsor.id,
    name: sponsor.name,
    island: sponsor.island,
    category: sponsor.category,
    offerTitle: sponsor.offer_title,
    discountText: sponsor.discount_text,
    address: sponsor.address,
    latitude,
    longitude,
    instagramHandle: sponsor.instagram_handle,
    mapUrl: latitude === null || longitude === null ? null : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`,
  };
}

function publicMember(member: VipMember) {
  return { name: member.name, island: member.island, tier: member.tier, streakMonths: member.streak_months };
}

function requirePublicConfiguration(env: RuntimeEnv): void {
  if (!env.DB || !env.AUTH_SECRET) throw new VipApiError(503, "vip_not_configured", "Il VIP Pass non è ancora configurato.");
}

function isWhatsAppConfigured(env: RuntimeEnv): boolean {
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_API_URL && env.WHATSAPP_TEMPLATE_NAME);
}

async function readJson<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_JSON_BYTES) throw new VipApiError(413, "payload_too_large", "Richiesta troppo grande.");
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw new VipApiError(415, "json_required", "Invia dati JSON.");
  try { return await request.json<T>(); } catch { throw new VipApiError(400, "invalid_json", "Dati non validi."); }
}

async function readLimitedResponse(bodyResponse: Response, maxBytes: number): Promise<string> {
  if (!bodyResponse.body) return "";
  const reader = bodyResponse.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("Provider response too large");
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

function errorResponse(error: VipApiError): Response {
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

function secureCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function timingSafeText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const item of cookie.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}
