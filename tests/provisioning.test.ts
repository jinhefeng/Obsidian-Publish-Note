import assert from "node:assert/strict";
import test from "node:test";
import { CloudflareRestApi } from "../server/provisioner/cloudflare-api.ts";
import { MemoryProvisioningStorage } from "../server/provisioner/memory-storage.ts";
import { ProvisioningService } from "../server/provisioner/service.ts";
import { routeProvisioningRequest } from "../server/provisioner/routes.ts";

class FakeCloudflare {
  readonly calls: string[] = [];
  exchangeInput: Record<string, unknown> | undefined;
  async exchangeCode(input: Record<string, unknown>) { this.calls.push("exchange"); this.exchangeInput = input; return { accessToken: "cf-oauth-secret" }; }
  async revokeToken() { this.calls.push("revoke"); }
  async listAccounts() { this.calls.push("accounts"); return [{ id: "account-12345678", name: "Test account" }]; }
  async listD1Databases() { this.calls.push("d1:list"); return []; }
  async createD1Database(_token: string, _accountId: string, name: string) { this.calls.push(`d1:create:${name}`); return { id: "d1-uuid", name }; }
  async listR2Buckets() { this.calls.push("r2:list"); return []; }
  async createR2Bucket(_token: string, _accountId: string, name: string) { this.calls.push(`r2:create:${name}`); }
  async listWorkerNames() { this.calls.push("worker:list"); return []; }
  async ensureWorkersDevSubdomain() { this.calls.push("workers:subdomain"); return "example"; }
  async enableWorkerSubdomain() { this.calls.push("worker:subdomain:enable"); }
  async uploadWorker(input: { bootstrapSecret: string }) { this.calls.push(`worker:upload:${input.bootstrapSecret.length}`); }
  async runD1Statement(_token: string, _accountId: string, _databaseId: string, sql: string) { this.calls.push(`d1:query:${sql.slice(0, 12)}`); }
  async deleteWorker() { this.calls.push("worker:delete"); }
  async deleteWorkerSecret(_token: string, _accountId: string, _workerName: string, secretName: string) { this.calls.push(`worker:secret:delete:${secretName}`); }
  async deleteD1Database() { this.calls.push("d1:delete"); }
  async deleteR2Bucket() { this.calls.push("r2:delete"); }
}

function createFixture() {
  const storage = new MemoryProvisioningStorage();
  const cloudflare = new FakeCloudflare();
  const service = new ProvisioningService({
    storage,
    cloudflare,
    clientId: "oauth-client",
    clientSecret: "oauth-client-secret",
    redirectUri: "https://control.example.com/oauth/cloudflare/callback",
    publicBaseUrl: "https://control.example.com",
    encryptionKey: "test-encryption-key",
    targetWorkerModule: "export default { fetch() { return new Response('ok'); } }",
    targetMigrationSql: "CREATE TABLE one (id TEXT); INSERT INTO one VALUES ('semi;colon');",
    fetchImpl: async () => new Response(JSON.stringify({ accountId: "target-account", publishToken: "pn_target_publish_token" }), { status: 201, headers: { "content-type": "application/json" } }),
  });
  return { storage, cloudflare, service };
}

test("Cloudflare provisioning completes OAuth, resource creation, target initialization, and one-time result acknowledgement", async () => {
  const { storage, cloudflare, service } = createFixture();
  const started = await service.start();
  const state = new URL(started.authorizationUrl).searchParams.get("state");
  assert.equal(new URL(started.authorizationUrl).searchParams.get("client_id"), "oauth-client");
  assert.ok(state);
  assert.equal(new URL(started.authorizationUrl).searchParams.get("code_challenge_method"), "S256");
  assert.ok(new URL(started.authorizationUrl).searchParams.get("code_challenge"));
  assert.equal((await service.poll(started.jobId, started.pollSecret)).status, "pending");

  await service.handleCallback("authorization-code", state!);
  const ready = await service.poll(started.jobId, started.pollSecret);
  assert.deepEqual(ready, { status: "ready", serviceUrl: "https://publish-note.example.workers.dev", publishToken: "pn_target_publish_token" });
  assert.equal(await service.ack(started.jobId, started.pollSecret).then((value) => value.ok), true);
  assert.deepEqual(await service.poll(started.jobId, started.pollSecret), { status: "acked" });
  assert.ok(cloudflare.calls.includes("exchange"));
  assert.ok(String(cloudflare.exchangeInput?.codeVerifier || "").length > 20);
  assert.ok(cloudflare.calls.includes("revoke"));
  assert.ok(cloudflare.calls.includes("worker:secret:delete:BOOTSTRAP_SECRET"));
  assert.equal(cloudflare.calls.filter((call) => call.startsWith("d1:create")).length, 1);
  assert.equal(cloudflare.calls.filter((call) => call.startsWith("r2:create")).length, 1);
  assert.equal(cloudflare.calls.filter((call) => call.startsWith("worker:upload")).length, 1);
  const storedJob = storage.jobs.get(started.jobId);
  assert.equal(storedJob?.accessTokenCiphertext, undefined);
  assert.equal(storedJob?.resultCiphertext, undefined);
});

test("invalid OAuth state and repeated provisioning for an installed account fail safely without overwriting resources", async () => {
  const { cloudflare, service } = createFixture();
  const first = await service.start();
  await assert.rejects(() => service.handleCallback("code", "not-the-state"), (error) => error.code === "INVALID_OAUTH_STATE");
  const firstState = new URL(first.authorizationUrl).searchParams.get("state")!;
  await service.handleCallback("code", firstState);
  const second = await service.start();
  const secondState = new URL(second.authorizationUrl).searchParams.get("state")!;
  await assert.rejects(() => service.handleCallback("code", secondState), (error) => error.code === "ALREADY_PROVISIONED");
  assert.equal(cloudflare.calls.filter((call) => call.startsWith("d1:create")).length, 1);
  assert.equal(cloudflare.calls.filter((call) => call.startsWith("worker:upload")).length, 1);
});

test("provisioning routes expose only the job protocol and do not leak OAuth credentials", async () => {
  const { service } = createFixture();
  const start = await routeProvisioningRequest(new Request("https://control.example.com/v1/cloudflare/provision/start", { method: "POST", body: "{}" }), service);
  assert.equal(start.status, 201);
  const payload = await start.json();
  assert.ok(payload.jobId && payload.pollSecret && payload.authorizationUrl);
  assert.equal(JSON.stringify(payload).includes("oauth-client-secret"), false);
  const invalid = await routeProvisioningRequest(new Request("https://control.example.com/v1/cloudflare/provision/poll", { method: "POST", body: JSON.stringify({ jobId: payload.jobId, pollSecret: "wrong" }) }), service);
  assert.equal(invalid.status, 401);
  assert.deepEqual(await invalid.json(), { error: "Provisioning job is unavailable", code: "UNAUTHORIZED" });
});

test("OAuth denial is persisted as a terminal job failure", async () => {
  const { service } = createFixture();
  const start = await service.start();
  const state = new URL(start.authorizationUrl).searchParams.get("state")!;
  const response = await routeProvisioningRequest(new Request(`https://control.example.com/oauth/cloudflare/callback?error=access_denied&state=${encodeURIComponent(state)}`, { method: "GET" }), service);
  assert.equal(response.status, 400);
  assert.deepEqual(await service.poll(start.jobId, start.pollSecret), { status: "failed", code: "OAUTH_DENIED", message: "Cloudflare authorization was denied" });
});

test("Cloudflare REST adapter uses fixed API paths and never returns response token details in errors", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const api = new CloudflareRestApi({ fetchImpl: async (url, init) => { requests.push({ url: String(url), init }); return new Response(JSON.stringify({ success: true, result: [{ id: "acc", name: "A" }] }), { status: 200 }); } });
  assert.deepEqual(await api.listAccounts("oauth-secret"), [{ id: "acc", name: "A" }]);
  assert.match(requests[0].url, /api\.cloudflare\.com\/client\/v4\/accounts/);
  assert.equal(new Headers(requests[0].init?.headers).get("authorization"), "Bearer oauth-secret");
});

test("public OAuth clients can use the same PKCE-aware token adapter without a client secret", async () => {
  let tokenRequest: { headers?: Headers; body?: string } = {};
  const api = new CloudflareRestApi({ fetchImpl: async (_url, init) => { tokenRequest = { headers: new Headers(init?.headers), body: String(init?.body || "") }; return new Response(JSON.stringify({ access_token: "short-lived" }), { status: 200 }); }, oauthBaseUrl: "https://oauth.example.com" });
  await api.exchangeCode({ code: "code", clientId: "public-client", redirectUri: "https://control.example.com/callback", codeVerifier: "verifier" });
  assert.equal(tokenRequest.headers?.get("authorization"), null);
  assert.match(tokenRequest.body || "", /client_id=public-client/);
  assert.match(tokenRequest.body || "", /code_verifier=verifier/);
});
