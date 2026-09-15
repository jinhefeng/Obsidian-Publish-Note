import type { PublishedResponse } from "../shared/contracts.ts";
import { viewerPath } from "../shared/paths.ts";
import type { InMemoryPublisher } from "./in-memory-publisher.ts";

export function serveLocalSite(
  publisher: InMemoryPublisher,
  siteId: string,
  requestPath = `/s/${siteId}/`,
): PublishedResponse {
  const object = publisher.getCurrentObject(siteId, viewerPath(siteId, requestPath));
  if (!object) {
    return { status: 404, contentType: "text/plain; charset=utf-8", body: "Not Found" };
  }

  return { status: 200, contentType: object.contentType, body: object.body };
}
