import { ProvisioningError } from "./errors.ts";

export interface CloudflareAccount { id: string; name?: string; }
export interface CloudflareD1Database { id: string; name: string; }

export interface CloudflareApi {
  exchangeCode(input: { code: string; clientId: string; clientSecret?: string; redirectUri: string; codeVerifier?: string }): Promise<{ accessToken: string; expiresIn?: number }>;
  revokeToken(accessToken: string, clientId: string, clientSecret?: string): Promise<void>;
  listAccounts(accessToken: string): Promise<CloudflareAccount[]>;
  listD1Databases(accessToken: string, accountId: string): Promise<CloudflareD1Database[]>;
  createD1Database(accessToken: string, accountId: string, name: string): Promise<CloudflareD1Database>;
  listR2Buckets(accessToken: string, accountId: string): Promise<string[]>;
  createR2Bucket(accessToken: string, accountId: string, name: string): Promise<void>;
  listWorkerNames(accessToken: string, accountId: string): Promise<string[]>;
  ensureWorkersDevSubdomain(accessToken: string, accountId: string, desiredSubdomain: string): Promise<string>;
  enableWorkerSubdomain(accessToken: string, accountId: string, workerName: string): Promise<void>;
  uploadWorker(input: { accessToken: string; accountId: string; workerName: string; module: string; d1DatabaseId: string; r2BucketName: string; bootstrapSecret: string; publicBaseUrl: string }): Promise<void>;
  runD1Statement(accessToken: string, accountId: string, databaseId: string, sql: string): Promise<void>;
  deleteWorker(accessToken: string, accountId: string, workerName: string): Promise<void>;
  deleteWorkerSecret(accessToken: string, accountId: string, workerName: string, secretName: string): Promise<void>;
  deleteD1Database(accessToken: string, accountId: string, databaseId: string): Promise<void>;
  deleteR2Bucket(accessToken: string, accountId: string, name: string): Promise<void>;
}

export interface CloudflareApiOptions { fetchImpl?: typeof fetch; apiBaseUrl?: string; oauthBaseUrl?: string; }

export class CloudflareRestApi implements CloudflareApi {
  private readonly fetchImpl: typeof fetch;
  private readonly apiBaseUrl: string;
  private readonly oauthBaseUrl: string;

  constructor(options: CloudflareApiOptions = {}) {
    this.fetchImpl = options.fetchImpl || fetch;
    this.apiBaseUrl = (options.apiBaseUrl || "https://api.cloudflare.com/client/v4").replace(/\/$/, "");
    this.oauthBaseUrl = (options.oauthBaseUrl || "https://dash.cloudflare.com").replace(/\/$/, "");
  }

  async exchangeCode(input: { code: string; clientId: string; clientSecret?: string; redirectUri: string; codeVerifier?: string }) {
    const body = new URLSearchParams({ grant_type: "authorization_code", client_id: input.clientId, code: input.code, redirect_uri: input.redirectUri });
    if (input.codeVerifier) body.set("code_verifier", input.codeVerifier);
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
    if (input.clientSecret) { headers.authorization = `Basic ${btoa(`${input.clientId}:${input.clientSecret}`)}`; body.delete("client_id"); }
    const response = await this.fetchImpl(`${this.oauthBaseUrl}/oauth2/token`, { method: "POST", headers, body });
    const result = await jsonBody(response);
    if (!response.ok || !result.access_token) throw new ProvisioningError("OAUTH_TOKEN_EXCHANGE_FAILED", "Cloudflare authorization failed", 502);
    return { accessToken: String(result.access_token), expiresIn: result.expires_in ? Number(result.expires_in) : undefined };
  }

  async revokeToken(accessToken: string, clientId: string, clientSecret?: string): Promise<void> {
    const body = new URLSearchParams({ token: accessToken, client_id: clientId });
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
    if (clientSecret) { headers.authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`; body.delete("client_id"); }
    const response = await this.fetchImpl(`${this.oauthBaseUrl}/oauth2/revoke`, { method: "POST", headers, body });
    if (!response.ok) throw new ProvisioningError("OAUTH_REVOKE_FAILED", "Cloudflare authorization cleanup failed", 502);
  }

  async listAccounts(accessToken: string) { return (await this.api("/accounts?per_page=100", accessToken)).map((row: any) => ({ id: String(row.id), name: row.name ? String(row.name) : undefined })); }
  async listD1Databases(accessToken: string, accountId: string) { return (await this.api(`/accounts/${encodeURIComponent(accountId)}/d1/database`, accessToken)).map((row: any) => ({ id: String(row.uuid || row.database_id || row.id), name: String(row.name) })); }
  async createD1Database(accessToken: string, accountId: string, name: string) {
    const row = await this.api(`/accounts/${encodeURIComponent(accountId)}/d1/database`, accessToken, { method: "POST", body: JSON.stringify({ name }), headers: { "content-type": "application/json" } });
    return { id: String(row.uuid || row.database_id || row.id), name: String(row.name || name) };
  }
  async listR2Buckets(accessToken: string, accountId: string) { return (await this.api(`/accounts/${encodeURIComponent(accountId)}/r2/buckets`, accessToken)).map((row: any) => String(row.name || row)); }
  async createR2Bucket(accessToken: string, accountId: string, name: string): Promise<void> { await this.api(`/accounts/${encodeURIComponent(accountId)}/r2/buckets`, accessToken, { method: "POST", body: JSON.stringify({ name }), headers: { "content-type": "application/json" } }); }
  async listWorkerNames(accessToken: string, accountId: string) { return (await this.api(`/accounts/${encodeURIComponent(accountId)}/workers/scripts`, accessToken)).map((row: any) => String(row.id || row.name || row)); }

  async ensureWorkersDevSubdomain(accessToken: string, accountId: string, desiredSubdomain: string): Promise<string> {
    try {
      const result = await this.api(`/accounts/${encodeURIComponent(accountId)}/workers/subdomain`, accessToken);
      if (result?.subdomain) return String(result.subdomain);
    } catch (error) {
      if (!(error instanceof ProvisioningError) || error.status !== 404) throw error;
    }
    const result = await this.api(`/accounts/${encodeURIComponent(accountId)}/workers/subdomain`, accessToken, { method: "PUT", body: JSON.stringify({ subdomain: desiredSubdomain }), headers: { "content-type": "application/json" } });
    if (!result?.subdomain) throw new ProvisioningError("WORKERS_SUBDOMAIN_FAILED", "Cloudflare workers.dev subdomain is unavailable", 502);
    return String(result.subdomain);
  }

  async enableWorkerSubdomain(accessToken: string, accountId: string, workerName: string): Promise<void> {
    await this.api(`/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/subdomain`, accessToken, { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } });
  }

  async uploadWorker(input: { accessToken: string; accountId: string; workerName: string; module: string; d1DatabaseId: string; r2BucketName: string; bootstrapSecret: string; publicBaseUrl: string }): Promise<void> {
    const metadata = {
      main_module: "index.js",
      compatibility_date: "2026-09-15",
      bindings: [
        { name: "DB", type: "d1", id: input.d1DatabaseId },
        { name: "CONTENTS", type: "r2_bucket", bucket_name: input.r2BucketName },
        { name: "BOOTSTRAP_SECRET", type: "secret_text", text: input.bootstrapSecret },
        { name: "PUBLIC_BASE_URL", type: "plain_text", text: input.publicBaseUrl },
      ],
    };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
    form.append("index.js", new Blob([input.module], { type: "application/javascript" }), "index.js");
    await this.api(`/accounts/${encodeURIComponent(input.accountId)}/workers/scripts/${encodeURIComponent(input.workerName)}`, input.accessToken, { method: "PUT", body: form });
  }

  async runD1Statement(accessToken: string, accountId: string, databaseId: string, sql: string): Promise<void> {
    await this.api(`/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`, accessToken, { method: "POST", body: JSON.stringify({ sql, params: [] }), headers: { "content-type": "application/json" } });
  }
  async deleteWorker(accessToken: string, accountId: string, workerName: string): Promise<void> { await this.api(`/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}`, accessToken, { method: "DELETE" }); }
  async deleteWorkerSecret(accessToken: string, accountId: string, workerName: string, secretName: string): Promise<void> { await this.api(`/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/secrets/${encodeURIComponent(secretName)}`, accessToken, { method: "DELETE" }); }
  async deleteD1Database(accessToken: string, accountId: string, databaseId: string): Promise<void> { await this.api(`/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}`, accessToken, { method: "DELETE" }); }
  async deleteR2Bucket(accessToken: string, accountId: string, name: string): Promise<void> { await this.api(`/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(name)}`, accessToken, { method: "DELETE" }); }

  private async api(path: string, accessToken: string, init: RequestInit = {}): Promise<any> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, { ...init, headers: { authorization: `Bearer ${accessToken}`, ...(init.headers || {}) } });
    const body = await jsonBody(response);
    if (!response.ok || body.success === false) throw new ProvisioningError(`CLOUDFLARE_${response.status}`, "Cloudflare resource operation failed", response.status >= 400 && response.status < 600 ? response.status : 502);
    return body.result;
  }
}

async function jsonBody(response: Response): Promise<any> {
  try { return await response.json(); } catch { return {}; }
}

export function splitSqlStatements(sql: string): string[] {
  const withoutComments = sql.replace(/^\s*--.*$/gm, "");
  const statements: string[] = [];
  let start = 0;
  let quote = "";
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];
    if (quote) { if (character === quote && withoutComments[index - 1] !== "\\") quote = ""; continue; }
    if (character === "'" || character === '"' || character === "`") { quote = character; continue; }
    if (character === ";") { const statement = withoutComments.slice(start, index).trim(); if (statement) statements.push(statement); start = index + 1; }
  }
  const tail = withoutComments.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}
