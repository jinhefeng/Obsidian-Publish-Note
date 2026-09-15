import type { PublishBundle, PublishUploadChunk } from "./contracts.ts";

export const DEFAULT_UPLOAD_CHUNK_CHARACTERS = 1_000_000;

function splitText(value: string, maxCharacters: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(value.length, start + maxCharacters);
    if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1] || "")) {
      end = end - 1 > start ? end - 1 : Math.min(value.length, end + 1);
    }
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks.length > 0 ? chunks : [""];
}

export function createUploadChunks(
  bundle: PublishBundle,
  maxCharacters = DEFAULT_UPLOAD_CHUNK_CHARACTERS,
): PublishUploadChunk[] {
  if (!Number.isInteger(maxCharacters) || maxCharacters <= 0) {
    throw new Error("Upload chunk size must be a positive integer");
  }

  const objects = [
    ...bundle.pages.map((page) => ({ kind: "page" as const, ...page })),
    ...bundle.assets.map((asset) => ({ kind: "asset" as const, ...asset })),
  ];
  return objects.flatMap((object) => {
    const bodies = splitText(object.body, maxCharacters);
    return bodies.map((body, chunkIndex) => ({
      kind: object.kind,
      path: object.path,
      contentType: object.contentType,
      encoding: object.encoding,
      chunkIndex,
      chunkCount: bodies.length,
      body,
    }));
  });
}
