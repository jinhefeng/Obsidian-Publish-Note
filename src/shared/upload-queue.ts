import type { PublishBundle, PublishUploadChunk } from "./contracts.ts";

export const DEFAULT_UPLOAD_CHUNK_BYTES = 1_000_000;
// Kept as an alias for callers that used the pre-Cloudflare name.
export const DEFAULT_UPLOAD_CHUNK_CHARACTERS = DEFAULT_UPLOAD_CHUNK_BYTES;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function base64ToBytes(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("Binary asset body is not valid base64");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function splitText(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = start;
    let bytes = 0;
    while (end < value.length) {
      const codePoint = value.codePointAt(end)!;
      const character = String.fromCodePoint(codePoint);
      const characterBytes = textEncoder.encode(character).byteLength;
      if (end > start && bytes + characterBytes > maxBytes) break;
      bytes += characterBytes;
      end += character.length;
      if (bytes >= maxBytes) break;
    }
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks.length > 0 ? chunks : [""];
}

function splitBytes(value: Uint8Array, maxBytes: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < value.byteLength; start += maxBytes) {
    chunks.push(value.slice(start, Math.min(value.byteLength, start + maxBytes)));
  }
  return chunks.length > 0 ? chunks : [new Uint8Array()];
}

export function createUploadChunks(
  bundle: PublishBundle,
  maxBytes = DEFAULT_UPLOAD_CHUNK_BYTES,
): PublishUploadChunk[] {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("Upload chunk size must be a positive integer");
  }

  const objects = [
    ...bundle.pages.map((page) => ({ kind: "page" as const, ...page })),
    ...bundle.assets.map((asset) => ({ kind: "asset" as const, ...asset })),
  ];
  return objects.flatMap((object) => {
    const bodyChunks = object.encoding === "base64"
      ? splitBytes(base64ToBytes(object.body), maxBytes).map(bytesToBase64)
      : splitText(object.body, maxBytes);
    return bodyChunks.map((body, chunkIndex) => ({
      chunkProtocolVersion: 2 as const,
      kind: object.kind,
      path: object.path,
      contentType: object.contentType,
      encoding: object.encoding,
      chunkIndex,
      chunkCount: bodyChunks.length,
      byteLength: object.encoding === "base64"
        ? base64ToBytes(body).byteLength
        : textEncoder.encode(body).byteLength,
      body,
    }));
  });
}

export function uploadByteSize(chunks: PublishUploadChunk[]): number {
  return chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
}

export function uploadObjectCount(bundle: PublishBundle): number {
  return bundle.pages.length + bundle.assets.length;
}

export function decodeUploadChunk(chunk: Pick<PublishUploadChunk, "encoding" | "body" | "byteLength">): Uint8Array {
  const bytes = chunk.encoding === "base64" ? base64ToBytes(chunk.body) : textEncoder.encode(chunk.body);
  if (bytes.byteLength !== chunk.byteLength) throw new Error("Upload chunk byteLength does not match body");
  return bytes;
}

export function encodePublishedBytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes);
}

export function decodePublishedText(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}
