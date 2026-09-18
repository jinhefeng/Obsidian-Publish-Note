import { constantTimeEqual, hmacSha256, randomId, sha256 } from "../core/crypto.ts";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export { constantTimeEqual, hmacSha256, sha256 };

export async function encryptSecret(value: string, encryptionKey: string): Promise<string> {
  const digest = base64UrlToBytes(await sha256(encryptionKey));
  const crypto = globalThis.crypto;
  const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`;
}

export async function decryptSecret(value: string, encryptionKey: string): Promise<string> {
  const [ivValue, ciphertextValue] = String(value || "").split(".");
  if (!ivValue || !ciphertextValue) throw new Error("Invalid encrypted secret");
  const digest = base64UrlToBytes(await sha256(encryptionKey));
  const key = await globalThis.crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(ivValue) }, key, base64UrlToBytes(ciphertextValue));
  return new TextDecoder().decode(plaintext);
}

export function safeJobId(): string { return randomId(18); }
