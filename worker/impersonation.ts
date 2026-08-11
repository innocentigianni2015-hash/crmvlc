const encoder = new TextEncoder();

export type ImpersonationClaims = {
  version: 1;
  actorId: string;
  targetId: string;
  startedAt: number;
  expiresAt: number;
};

const MAX_IMPERSONATION_SECONDS = 60 * 60;

export async function createImpersonationToken(secret: string, claims: ImpersonationClaims): Promise<string> {
  if (!secret) throw new Error("Missing impersonation secret.");
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await sign(secret, payload);
  return `${payload}.${bytesToBase64Url(signature)}`;
}

export async function verifyImpersonationToken(
  secret: string,
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<ImpersonationClaims | null> {
  if (!secret || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, ["verify"]),
      arrayBuffer(base64UrlToBytes(parts[1])),
      encoder.encode(parts[0]),
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0]))) as Partial<ImpersonationClaims>;
    if (
      claims.version !== 1
      || typeof claims.actorId !== "string"
      || typeof claims.targetId !== "string"
      || !claims.actorId
      || !claims.targetId
      || claims.actorId.length > 128
      || claims.targetId.length > 128
      || !Number.isSafeInteger(claims.startedAt)
      || !Number.isSafeInteger(claims.expiresAt)
      || Number(claims.startedAt) > nowSeconds + 60
      || Number(claims.expiresAt) <= nowSeconds
      || Number(claims.expiresAt) - Number(claims.startedAt) > MAX_IMPERSONATION_SECONDS
      || Number(claims.expiresAt) <= Number(claims.startedAt)
    ) return null;

    return claims as ImpersonationClaims;
  } catch {
    return null;
  }
}

async function sign(secret: string, payload: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), encoder.encode(payload)));
}

function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
