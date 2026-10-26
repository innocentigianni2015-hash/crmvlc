import { normalizeEmail } from "./authorization.js";

type AuthEnv = Env & { AUTH_SECRET?: string; EMAIL_FROM?: string; SESSION_HOURS?: string };
type Role = "super_admin" | "admin" | "sales_manager" | "sales" | "distributor";
type PasswordUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  island: string | null;
  language: "es" | "it" | "en";
  active: number;
  password_hash: string | null;
  password_salt: string | null;
  password_iterations: number | null;
  must_change_password: number;
  totp_secret_encrypted: string | null;
};
type FlowPurpose = "change_password" | "password_reset" | "totp_setup" | "totp_login";
type FlowRow = {
  id: string;
  user_id: string;
  purpose: FlowPurpose;
  data_json: string | null;
  expires_at: string;
  consumed_at: string | null;
};

const SESSION_COOKIE = "vlc_session";
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_SALT_PREFIX = "p1.";
const PASSWORD_MIN_LENGTH = 12;
const encoder = new TextEncoder();

class AuthError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export async function handlePasswordAuth(request: Request, env: AuthEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const routes = new Set([
    "/api/auth/password/login",
    "/api/auth/password/change-required",
    "/api/auth/password/forgot",
    "/api/auth/password/reset",
    "/api/auth/totp/setup",
    "/api/auth/totp/confirm",
    "/api/auth/totp/verify",
  ]);
  if (!routes.has(path)) return null;
  if (request.method !== "POST") return authJson({ error: { code: "method_not_allowed", message: "Metodo non consentito." } }, 405);

  try {
    requireConfiguration(env);
    if (path === "/api/auth/password/login") return await passwordLogin(request, env);
    if (path === "/api/auth/password/change-required") return await changeRequiredPassword(request, env);
    if (path === "/api/auth/password/forgot") return await forgotPassword(request, env);
    if (path === "/api/auth/password/reset") return await resetPassword(request, env);
    if (path === "/api/auth/totp/setup") return await setupTotp(request, env);
    if (path === "/api/auth/totp/confirm") return await confirmTotp(request, env);
    return await verifyTotpLogin(request, env);
  } catch (error) {
    if (error instanceof AuthError) return authJson({ error: { code: error.code, message: error.message } }, error.status);
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    console.error(JSON.stringify({ level: "error", event: "password_auth_failure", requestId, error: error instanceof Error ? error.message : "unknown" }));
    return authJson({ error: { code: "internal_error", message: `Errore interno. Riferimento: ${requestId}` } }, 500);
  }
}

export async function createPasswordHash(password: string, authSecret: string): Promise<{ hash: string; salt: string; iterations: number }> {
  validatePassword(password);
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const material = await passwordKeyMaterial(password, requirePasswordPepper(authSecret));
  const key = await crypto.subtle.importKey("raw", exactArrayBuffer(material), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: PASSWORD_ITERATIONS }, key, 256);
  return {
    hash: bytesToBase64Url(new Uint8Array(bits)),
    salt: `${PASSWORD_SALT_PREFIX}${bytesToBase64Url(saltBytes)}`,
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function sendUserInvitation(
  request: Request,
  env: AuthEnv,
  user: Pick<PasswordUser, "id" | "email" | "name" | "language">,
): Promise<void> {
  requireConfiguration(env);
  if (!env.EMAIL || !env.EMAIL_FROM) throw new AuthError(503, "email_not_configured", "Invio email non configurato.");

  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE auth_flow_tokens SET consumed_at = ? WHERE user_id = ? AND purpose = 'password_reset' AND consumed_at IS NULL",
  ).bind(now, user.id).run();
  const token = await createFlow(env, user.id, "password_reset", 48 * 60);
  const link = `${new URL(request.url).origin}/login?reset=${encodeURIComponent(token)}`;
  const message = userInvitationMessage(user.language ?? "es", user.name, link);

  try {
    await env.EMAIL.send({
      from: { name: "CRMVLC", email: env.EMAIL_FROM },
      to: user.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    await env.DB.prepare(
      "DELETE FROM auth_flow_tokens WHERE user_id = ? AND purpose = 'password_reset' AND token_hash = ?",
    ).bind(user.id, await sha256(token)).run();
    throw error;
  }
}

async function passwordLogin(request: Request, env: AuthEnv): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  if (!isEmail(email) || !password || password.length > 256) throw new AuthError(401, "invalid_credentials", "Email o password non validi.");
  await enforceLoginRateLimit(env, email);

  const user = await getUserByEmail(env, email);
  const valid = user?.active === 1 && user.password_hash && user.password_salt && user.password_iterations
    ? await verifyPassword(password, user.password_hash, user.password_salt, user.password_iterations, env.AUTH_SECRET ?? "")
    : false;
  if (!user || !valid) {
    await recordLoginFailure(env, email);
    throw new AuthError(401, "invalid_credentials", "Email o password non validi. Se hai appena ricevuto un invito, usa “Imposta o recupera password”.");
  }
  await clearLoginFailures(env, email);

  if (user.must_change_password === 1) {
    const token = await createFlow(env, user.id, "change_password", 15);
    return authJson({ next: "change_password", token });
  }
  return continueAfterPassword(request, env, user);
}

async function changeRequiredPassword(request: Request, env: AuthEnv): Promise<Response> {
  const body = await readJson<{ token?: string; password?: string }>(request);
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  const flow = await requireFlow(env, token, "change_password");
  const credentials = await createPasswordHash(password, env.AUTH_SECRET ?? "");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, must_change_password = 0, password_changed_at = ?, updated_at = ? WHERE id = ? AND active = 1")
      .bind(credentials.hash, credentials.salt, credentials.iterations, now, now, flow.user_id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(flow.user_id),
    env.DB.prepare("UPDATE auth_flow_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(now, flow.id),
  ]);
  const user = await getUserById(env, flow.user_id);
  if (!user) throw new AuthError(401, "invalid_token", "Procedura scaduta. Ripeti l’accesso.");
  return continueAfterPassword(request, env, user);
}

async function continueAfterPassword(request: Request, env: AuthEnv, user: PasswordUser): Promise<Response> {
  if (user.role !== "super_admin") return issueSession(request, env, user);
  if (!user.totp_secret_encrypted) {
    const token = await createFlow(env, user.id, "totp_setup", 10);
    return authJson({ next: "totp_setup", token });
  }
  const token = await createFlow(env, user.id, "totp_login", 10);
  return authJson({ next: "totp", token });
}

async function setupTotp(request: Request, env: AuthEnv): Promise<Response> {
  const body = await readJson<{ token?: string }>(request);
  const token = String(body.token ?? "");
  const flow = await requireFlow(env, token, "totp_setup");
  const user = await getUserById(env, flow.user_id);
  if (!user || user.role !== "super_admin") throw new AuthError(403, "totp_not_allowed", "Configurazione riservata al Super Admin.");
  let data = safeJson(flow.data_json) as { secret?: string };
  if (!data.secret) {
    data = { secret: base32Encode(crypto.getRandomValues(new Uint8Array(20))) };
    await env.DB.prepare("UPDATE auth_flow_tokens SET data_json = ? WHERE id = ? AND consumed_at IS NULL")
      .bind(JSON.stringify(data), flow.id).run();
  }
  const issuer = "CRMVLC";
  const uri = `otpauth://totp/${encodeURIComponent(`${issuer}:${user.email}`)}?secret=${data.secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return authJson({ secret: data.secret, uri });
}

async function confirmTotp(request: Request, env: AuthEnv): Promise<Response> {
  const body = await readJson<{ token?: string; code?: string }>(request);
  const token = String(body.token ?? "");
  const code = digits(body.code);
  const flow = await requireFlow(env, token, "totp_setup");
  const data = safeJson(flow.data_json) as { secret?: string };
  if (!data.secret || !(await verifyTotp(data.secret, code))) throw new AuthError(400, "invalid_totp", "Codice dell’autenticatore non valido.");
  const encrypted = await encryptSecret(env, data.secret);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET totp_secret_encrypted = ?, updated_at = ? WHERE id = ? AND role = 'super_admin'").bind(encrypted, now, flow.user_id),
    env.DB.prepare("UPDATE auth_flow_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(now, flow.id),
  ]);
  const user = await getUserById(env, flow.user_id);
  if (!user) throw new AuthError(401, "invalid_token", "Procedura scaduta.");
  return issueSession(request, env, user);
}

async function verifyTotpLogin(request: Request, env: AuthEnv): Promise<Response> {
  const body = await readJson<{ token?: string; code?: string }>(request);
  const token = String(body.token ?? "");
  const code = digits(body.code);
  const flow = await requireFlow(env, token, "totp_login");
  const user = await getUserById(env, flow.user_id);
  if (!user?.totp_secret_encrypted) throw new AuthError(400, "totp_not_configured", "Autenticatore non configurato.");
  const secret = await decryptSecret(env, user.totp_secret_encrypted);
  if (!(await verifyTotp(secret, code))) throw new AuthError(401, "invalid_totp", "Codice dell’autenticatore non valido.");
  await env.DB.prepare("UPDATE auth_flow_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
    .bind(new Date().toISOString(), flow.id).run();
  return issueSession(request, env, user);
}

async function forgotPassword(request: Request, env: AuthEnv): Promise<Response> {
  const body = await readJson<{ email?: string }>(request);
  const email = normalizeEmail(body.email);
  if (isEmail(email)) {
    const user = await getUserByEmail(env, email);
    if (user?.active === 1) {
      const recent = await env.DB.prepare("SELECT id FROM auth_flow_tokens WHERE user_id = ? AND purpose = 'password_reset' AND consumed_at IS NULL AND created_at > ? LIMIT 1")
        .bind(user.id, new Date(Date.now() - 60_000).toISOString()).first();
      if (!recent) {
        const token = await createFlow(env, user.id, "password_reset", 30);
        const origin = new URL(request.url).origin;
        const link = `${origin}/login?reset=${encodeURIComponent(token)}`;
        if (!env.EMAIL_FROM) throw new AuthError(503, "email_not_configured", "Mittente email non configurato.");
        const message = passwordResetMessage(user.language ?? "es", link);
        await env.EMAIL.send({
          from: { name: "CRMVLC", email: env.EMAIL_FROM },
          to: user.email,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      }
    }
  }
  return authJson({ accepted: true, message: "Se l’indirizzo è autorizzato, riceverai un collegamento entro pochi minuti." }, 202);
}

async function resetPassword(request: Request, env: AuthEnv): Promise<Response> {
  const body = await readJson<{ token?: string; password?: string }>(request);
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  validatePassword(password);
  const flow = await requireFlow(env, token, "password_reset");
  const credentials = await createPasswordHash(password, env.AUTH_SECRET ?? "");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, must_change_password = 0, password_changed_at = ?, updated_at = ? WHERE id = ? AND active = 1")
      .bind(credentials.hash, credentials.salt, credentials.iterations, now, now, flow.user_id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(flow.user_id),
    env.DB.prepare("UPDATE auth_flow_tokens SET consumed_at = ? WHERE user_id = ? AND purpose = 'password_reset' AND consumed_at IS NULL").bind(now, flow.user_id),
  ]);
  return authJson({ ok: true, message: "Password impostata. Ora puoi accedere." });
}

async function issueSession(request: Request, env: AuthEnv, user: PasswordUser): Promise<Response> {
  const token = randomToken(32);
  const sessionId = await sha256(token);
  const hours = Math.min(48, Math.max(1, Number(env.SESSION_HOURS || "12")));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + hours * 3_600_000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
    .bind(sessionId, user.id, expiresAt, now.toISOString(), now.toISOString()).run();
  const response = authJson({ authenticated: true, user: publicUser(user) });
  response.headers.append("Set-Cookie", sessionCookie(token, request, hours * 3600));
  return response;
}

async function createFlow(env: AuthEnv, userId: string, purpose: FlowPurpose, minutes: number): Promise<string> {
  const token = randomToken(32);
  const id = crypto.randomUUID();
  const now = new Date();
  await env.DB.prepare("INSERT INTO auth_flow_tokens (id, token_hash, user_id, purpose, data_json, expires_at, consumed_at, created_at) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?)")
    .bind(id, await sha256(token), userId, purpose, new Date(now.getTime() + minutes * 60_000).toISOString(), now.toISOString()).run();
  return token;
}

async function requireFlow(env: AuthEnv, token: string, purpose: FlowPurpose): Promise<FlowRow> {
  if (token.length < 32 || token.length > 200) throw new AuthError(400, "invalid_token", "Procedura scaduta o non valida.");
  const flow = await env.DB.prepare("SELECT id, user_id, purpose, data_json, expires_at, consumed_at FROM auth_flow_tokens WHERE token_hash = ? AND purpose = ? LIMIT 1")
    .bind(await sha256(token), purpose).first<FlowRow>();
  if (!flow || flow.consumed_at || Date.parse(flow.expires_at) <= Date.now()) throw new AuthError(400, "invalid_token", "Procedura scaduta o non valida.");
  return flow;
}

async function getUserByEmail(env: AuthEnv, email: string): Promise<PasswordUser | null> {
  return env.DB.prepare("SELECT id, email, name, language, role, island, active, password_hash, password_salt, password_iterations, must_change_password, totp_secret_encrypted FROM users WHERE email = ? LIMIT 1")
    .bind(email).first<PasswordUser>();
}

async function getUserById(env: AuthEnv, id: string): Promise<PasswordUser | null> {
  return env.DB.prepare("SELECT id, email, name, language, role, island, active, password_hash, password_salt, password_iterations, must_change_password, totp_secret_encrypted FROM users WHERE id = ? AND active = 1 LIMIT 1")
    .bind(id).first<PasswordUser>();
}

async function verifyPassword(password: string, expected: string, storedSalt: string, iterations: number, authSecret: string): Promise<boolean> {
  if (iterations < 100_000 || iterations > PASSWORD_ITERATIONS) return false;
  try {
    const peppered = storedSalt.startsWith(PASSWORD_SALT_PREFIX);
    const salt = peppered ? storedSalt.slice(PASSWORD_SALT_PREFIX.length) : storedSalt;
    const material = peppered
      ? await passwordKeyMaterial(password, requirePasswordPepper(authSecret))
      : encoder.encode(password);
    const key = await crypto.subtle.importKey("raw", exactArrayBuffer(material), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(salt), iterations }, key, 256);
    return timingSafeBytes(new Uint8Array(bits), base64UrlToBytes(expected));
  } catch {
    return false;
  }
}

async function passwordKeyMaterial(password: string, authSecret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(authSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`CRMVLC-PASSWORD\n${password}`));
  return new Uint8Array(signature);
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function requirePasswordPepper(authSecret: string): string {
  if (!authSecret) throw new AuthError(503, "auth_not_configured", "Autenticazione non configurata.");
  return authSecret;
}

function validatePassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 256) throw new AuthError(400, "weak_password", "La password deve contenere almeno 12 caratteri.");
}

async function enforceLoginRateLimit(env: AuthEnv, email: string): Promise<void> {
  const key = await sha256(`login\n${email}`);
  const row = await env.DB.prepare("SELECT attempts, window_started_at, blocked_until FROM auth_rate_limits WHERE key = ? LIMIT 1")
    .bind(key).first<{ attempts: number; window_started_at: string; blocked_until: string | null }>();
  if (row?.blocked_until && Date.parse(row.blocked_until) > Date.now()) throw new AuthError(429, "too_many_attempts", "Troppi tentativi. Riprova tra 15 minuti.");
}

async function recordLoginFailure(env: AuthEnv, email: string): Promise<void> {
  const key = await sha256(`login\n${email}`);
  const now = new Date();
  const existing = await env.DB.prepare("SELECT attempts, window_started_at FROM auth_rate_limits WHERE key = ? LIMIT 1")
    .bind(key).first<{ attempts: number; window_started_at: string }>();
  const reset = !existing || Date.parse(existing.window_started_at) < now.getTime() - 15 * 60_000;
  const attempts = reset ? 1 : existing.attempts + 1;
  const blockedUntil = attempts >= 5 ? new Date(now.getTime() + 15 * 60_000).toISOString() : null;
  await env.DB.prepare("INSERT INTO auth_rate_limits (key, attempts, window_started_at, blocked_until) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET attempts = excluded.attempts, window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until")
    .bind(key, attempts, reset ? now.toISOString() : existing!.window_started_at, blockedUntil).run();
}

async function clearLoginFailures(env: AuthEnv, email: string): Promise<void> {
  await env.DB.prepare("DELETE FROM auth_rate_limits WHERE key = ?").bind(await sha256(`login\n${email}`)).run();
}

async function verifyTotp(secret: string, code: string): Promise<boolean> {
  if (code.length !== 6) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (const offset of [-1, 0, 1]) {
    if (timingSafeText(await hotp(secret, counter + offset), code)) return true;
  }
  return false;
}

async function hotp(secret: string, counter: number): Promise<string> {
  const counterBytes = new Uint8Array(8);
  new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = digest[digest.length - 1] & 15;
  const value = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

async function encryptSecret(env: AuthEnv, secret: string): Promise<string> {
  const key = await mfaKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(secret));
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

async function decryptSecret(env: AuthEnv, value: string): Promise<string> {
  const [iv, encrypted] = value.split(".");
  if (!iv || !encrypted) throw new AuthError(500, "totp_secret_invalid", "Configurazione autenticatore non valida.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(iv) }, await mfaKey(env), base64UrlToBytes(encrypted));
  return new TextDecoder().decode(plain);
}

async function mfaKey(env: AuthEnv): Promise<CryptoKey> {
  if (!env.AUTH_SECRET) throw new AuthError(503, "auth_not_configured", "Autenticazione non configurata.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`CRMVLC-MFA\n${env.AUTH_SECRET}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function requireConfiguration(env: AuthEnv): void {
  if (!env.DB || !env.AUTH_SECRET) throw new AuthError(503, "auth_not_configured", "Autenticazione non configurata.");
}

async function readJson<T>(request: Request): Promise<T> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw new AuthError(415, "json_required", "Invia dati JSON.");
  try { return await request.json<T>(); } catch { throw new AuthError(400, "invalid_json", "Dati JSON non validi."); }
}

function authJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function publicUser(user: PasswordUser) { return { id: user.id, email: user.email, name: user.name, language: user.language ?? "es", role: user.role, island: user.island }; }

function passwordResetMessage(language: PasswordUser["language"], link: string) {
  const safeLink = escapeHtml(link);
  if (language === "it") return {
    subject: "Imposta o recupera la password CRMVLC",
    text: `Apri questo collegamento entro 30 minuti per impostare la password: ${link}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>CRMVLC</h2><p>Apri il collegamento entro 30 minuti per impostare la password.</p><p><a href="${safeLink}">Imposta password</a></p><p>Se non hai richiesto questa operazione, ignora il messaggio.</p></div>`,
  };
  if (language === "en") return {
    subject: "Set or recover your CRMVLC password",
    text: `Open this link within 30 minutes to set your password: ${link}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>CRMVLC</h2><p>Open the link within 30 minutes to set your password.</p><p><a href="${safeLink}">Set password</a></p><p>If you did not request this action, ignore this message.</p></div>`,
  };
  return {
    subject: "Configura o recupera tu contraseña CRMVLC",
    text: `Abre este enlace en un plazo de 30 minutos para configurar tu contraseña: ${link}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>CRMVLC</h2><p>Abre el enlace en un plazo de 30 minutos para configurar tu contraseña.</p><p><a href="${safeLink}">Configurar contraseña</a></p><p>Si no has solicitado esta operación, ignora el mensaje.</p></div>`,
  };
}

function userInvitationMessage(language: PasswordUser["language"], name: string, link: string) {
  const safeLink = escapeHtml(link);
  const safeName = escapeHtml(name);
  if (language === "it") return {
    subject: "Sei stato invitato su CRMVLC",
    text: `Ciao ${name}, il tuo account CRMVLC è pronto. Apri questo collegamento entro 48 ore per scegliere la password: ${link}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>CRMVLC</h2><p>Ciao ${safeName},</p><p>il tuo account CRMVLC è pronto. Scegli la password personale entro 48 ore.</p><p><a href="${safeLink}" style="display:inline-block;padding:12px 18px;border-radius:8px;color:#fff;background:#ef6a54;text-decoration:none;font-weight:700">Imposta la password</a></p><p style="color:#667085">Se non riconosci questo invito, ignora il messaggio.</p></div>`,
  };
  if (language === "en") return {
    subject: "You have been invited to CRMVLC",
    text: `Hello ${name}, your CRMVLC account is ready. Open this link within 48 hours to choose your password: ${link}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>CRMVLC</h2><p>Hello ${safeName},</p><p>Your CRMVLC account is ready. Choose your personal password within 48 hours.</p><p><a href="${safeLink}" style="display:inline-block;padding:12px 18px;border-radius:8px;color:#fff;background:#ef6a54;text-decoration:none;font-weight:700">Set your password</a></p><p style="color:#667085">If you do not recognise this invitation, ignore this message.</p></div>`,
  };
  return {
    subject: "Has sido invitado a CRMVLC",
    text: `Hola ${name}, tu cuenta CRMVLC está lista. Abre este enlace antes de 48 horas para elegir tu contraseña: ${link}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>CRMVLC</h2><p>Hola ${safeName},</p><p>Tu cuenta CRMVLC está lista. Elige tu contraseña personal antes de 48 horas.</p><p><a href="${safeLink}" style="display:inline-block;padding:12px 18px;border-radius:8px;color:#fff;background:#ef6a54;text-decoration:none;font-weight:700">Crear contraseña</a></p><p style="color:#667085">Si no reconoces esta invitación, ignora el mensaje.</p></div>`,
  };
}
function digits(value: unknown) { return String(value ?? "").replace(/\D/g, "").slice(0, 6); }
function isEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254; }
function safeJson(value: string | null): Record<string, unknown> { try { return value ? JSON.parse(value) as Record<string, unknown> : {}; } catch { return {}; } }
function randomToken(size: number) { return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size))); }
function bytesToBase64Url(bytes: Uint8Array) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function base64UrlToBytes(value: string) { const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4); const binary = atob(padded); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
function timingSafeBytes(a: Uint8Array, b: Uint8Array) { if (a.length !== b.length) return false; let difference = 0; for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index]; return difference === 0; }
function timingSafeText(a: string, b: string) { if (a.length !== b.length) return false; let difference = 0; for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index); return difference === 0; }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function base32Encode(bytes: Uint8Array) { const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0; let value = 0; let output = ""; for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) output += alphabet[(value << (5 - bits)) & 31]; return output; }
function base32Decode(value: string) { const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0; let buffer = 0; const output: number[] = []; for (const character of value.toUpperCase().replace(/=+$/g, "")) { const index = alphabet.indexOf(character); if (index < 0) continue; buffer = (buffer << 5) | index; bits += 5; if (bits >= 8) { output.push((buffer >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(output); }
function sessionCookie(token: string, request: Request, maxAge: number) { const secure = new URL(request.url).protocol === "https:" ? "; Secure" : ""; return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`; }
function escapeHtml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

