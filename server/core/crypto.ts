function runtimeCrypto(): Crypto {
  const value = globalThis.crypto;
  if (!value?.subtle || !value?.getRandomValues) throw new Error("Web Crypto is unavailable");
  return value;
}

export function randomId(byteLength = 18): string {
  const bytes = new Uint8Array(byteLength);
  runtimeCrypto().getRandomValues(bytes);
  // Use the standard conversion for the final canonical value.
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function randomSecret(prefix = "", byteLength = 32): string {
  return `${prefix}${randomId(byteLength)}`;
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await runtimeCrypto().subtle.digest("SHA-256", bytes));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function hmacSha256(secret: string, value: string): Promise<string> {
  const crypto = runtimeCrypto();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

// Cloudflare Workers Web Crypto rejects PBKDF2 iteration counts above 100,000.
// Keep the default within that limit so registration and provisioning work in
// both the local runtime and the deployed D1-only Worker.
export const MAX_PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string, salt = randomSecret("", 16), iterations = MAX_PBKDF2_ITERATIONS): Promise<string> {
  const crypto = runtimeCrypto();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-256" }, key, 256);
  let binary = "";
  for (const byte of new Uint8Array(bits)) binary += String.fromCharCode(byte);
  return `pbkdf2$${iterations}$${salt}$${btoa(binary)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationText, salt, expected] = stored.split("$");
  const iterations = Number(iterationText);
  if (scheme !== "pbkdf2" || !iterationText || !salt || !expected || !Number.isInteger(iterations) || iterations < 1 || iterations > MAX_PBKDF2_ITERATIONS) return false;
  const actual = await hashPassword(password, salt, iterations);
  return constantTimeEqual(actual, stored);
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}

export function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

export function normalizePassword(password: string): string {
  return String(password || "");
}

export function normalizeTokenName(name: string): string {
  return String(name || "").trim().slice(0, 100) || "Obsidian plugin";
}

export function recoveryCode(): string {
  const value = randomId(12).toUpperCase();
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}
