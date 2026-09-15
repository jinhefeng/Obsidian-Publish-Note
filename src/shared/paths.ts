export function normalizeRelativePath(input: string): string {
  const normalized = input.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized === ".") {
    return "index.html";
  }

  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "." || part === "")) {
    throw new Error(`Invalid relative path: ${input}`);
  }

  return parts.join("/");
}

export function siteUrl(siteId: string, baseUrl = "https://share.example.com"): string {
  return `${baseUrl.replace(/\/$/, "")}/s/${encodeURIComponent(siteId)}`;
}

export function viewerPath(siteId: string, requestPath: string): string {
  const prefix = `/s/${encodeURIComponent(siteId)}`;
  const withoutPrefix = requestPath.startsWith(prefix)
    ? requestPath.slice(prefix.length)
    : requestPath;
  let path = withoutPrefix.replace(/^\/+/, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the encoded path so normal validation can reject malformed input.
  }
  return normalizeRelativePath(path || "index.html");
}
