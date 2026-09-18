import { ProvisioningError } from "./errors.ts";
import type { ProvisioningService } from "./service.ts";

interface ExecutionContextLike { waitUntil?(promise: Promise<unknown>): void; }
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };

export async function routeProvisioningRequest(request: Request, service: ProvisioningService, context?: ExecutionContextLike): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...HEADERS, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" } });
  try {
    if (request.method === "GET" && url.pathname === "/healthz") return json({ status: "ok", service: "publish-note-provisioner" });
    if (request.method === "POST" && url.pathname === "/v1/cloudflare/provision/start") return json(await service.start(), 201);
    if (request.method === "POST" && url.pathname === "/v1/cloudflare/provision/poll") {
      const input = await readJson(request);
      return json(await service.poll(String(input.jobId || ""), String(input.pollSecret || "")));
    }
    if (request.method === "POST" && url.pathname === "/v1/cloudflare/provision/ack") {
      const input = await readJson(request);
      return json(await service.ack(String(input.jobId || ""), String(input.pollSecret || "")));
    }
    if (request.method === "GET" && url.pathname === "/oauth/cloudflare/callback") {
      const error = url.searchParams.get("error");
      const state = String(url.searchParams.get("state") || "");
      if (error) {
        await service.rejectAuthorization(state);
        throw new ProvisioningError("OAUTH_DENIED", "Cloudflare authorization was denied", 400);
      }
      const code = String(url.searchParams.get("code") || "");
      if (!code || !state) throw new ProvisioningError("OAUTH_CALLBACK_INVALID", "Cloudflare authorization response is incomplete", 400);
      const operation = service.handleCallback(code, state);
      if (context?.waitUntil) {
        context.waitUntil(operation.catch(() => undefined));
        return new Response("<p>Cloudflare authorization received. Return to Obsidian; deployment will continue automatically.</p>", { status: 202, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      }
      await operation;
      return new Response("<p>Cloudflare deployment is ready. Return to Obsidian.</p>", { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    return json({ error: "Not found", code: "NOT_FOUND" }, 404);
  } catch (error) {
    const safe = error instanceof ProvisioningError ? error : new ProvisioningError("PROVISIONING_FAILED", "Cloudflare provisioning failed", 502);
    return json({ error: safe.message, code: safe.code }, safe.status);
  }
}

function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: HEADERS }); }
async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 32 * 1024) throw new ProvisioningError("BAD_REQUEST", "Request is too large", 413);
  try { const value = JSON.parse(text); return value && typeof value === "object" ? value as Record<string, unknown> : {}; } catch { throw new ProvisioningError("BAD_REQUEST", "Invalid JSON", 400); }
}
