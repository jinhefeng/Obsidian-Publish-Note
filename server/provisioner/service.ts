import { hmacSha256, sha256, constantTimeEqual } from "./crypto.ts";
import { randomSecret } from "../core/crypto.ts";
import { ProvisioningError } from "./errors.ts";
import type { CloudflareApi } from "./cloudflare-api.ts";
import { splitSqlStatements } from "./cloudflare-api.ts";
import type { CloudflareInstallation, ProvisionJob, ProvisionResult } from "./models.ts";
import type { ProvisioningStorage } from "./storage.ts";
import { decryptSecret, encryptSecret, safeJobId } from "./crypto.ts";

const JOB_TTL_MS = 10 * 60 * 1000;
const BOOTSTRAP_TTL_MS = 5 * 60 * 1000;

export interface ProvisioningConfig {
  storage: ProvisioningStorage;
  cloudflare: CloudflareApi;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  publicBaseUrl: string;
  encryptionKey: string;
  targetWorkerModule?: string;
  targetWorkerBundleUrl?: string;
  targetMigrationSql?: string;
  targetMigrationUrl?: string;
  resourcePrefix?: string;
  oauthScope?: string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

export class ProvisioningService {
  private readonly now: () => Date;
  private readonly fetchImpl: typeof fetch;
  private readonly resourcePrefix: string;
  private readonly oauthScope: string;
  private readonly config: ProvisioningConfig;
  constructor(config: ProvisioningConfig) {
    this.config = config;
    this.now = config.now || (() => new Date());
    this.fetchImpl = config.fetchImpl || fetch;
    this.resourcePrefix = String(config.resourcePrefix || "publish-note").replace(/[^A-Za-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "publish-note";
    // Cloudflare OAuth scope IDs follow the permission IDs (not display names).
    // Keep this configurable because the account's `/oauth/scopes` catalog is authoritative.
    this.oauthScope = config.oauthScope || "account-settings.read workers-scripts.write d1.write workers-r2.write";
  }

  async start(): Promise<{ jobId: string; pollSecret: string; authorizationUrl: string; expiresIn: number; interval: number }> {
    const id = safeJobId();
    const pollSecret = randomSecret("", 32);
    const state = randomSecret("", 32);
    const codeVerifier = randomSecret("", 32);
    const createdAt = this.now();
    const job: ProvisionJob = { id, pollSecretHash: await sha256(pollSecret), oauthStateHash: await sha256(state), oauthVerifierCiphertext: await encryptSecret(codeVerifier, this.config.encryptionKey), createdAt: createdAt.toISOString(), expiresAt: new Date(createdAt.getTime() + JOB_TTL_MS).toISOString(), state: "pending" };
    await this.config.storage.createJob(job);
    const authorization = new URL("https://dash.cloudflare.com/oauth2/auth");
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("client_id", this.config.clientId);
    authorization.searchParams.set("redirect_uri", this.config.redirectUri);
    authorization.searchParams.set("scope", this.oauthScope);
    authorization.searchParams.set("state", state);
    authorization.searchParams.set("code_challenge", await sha256(codeVerifier));
    authorization.searchParams.set("code_challenge_method", "S256");
    return { jobId: id, pollSecret, authorizationUrl: authorization.toString(), expiresIn: JOB_TTL_MS / 1000, interval: 2 };
  }

  async poll(jobId: string, pollSecret: string): Promise<Record<string, unknown>> {
    const job = await this.authorizeJob(jobId, pollSecret);
    if (Date.parse(job.expiresAt) <= this.now().getTime() && !["ready", "acked"].includes(job.state)) {
      await this.config.storage.updateJob(job.id, { state: "failed", errorCode: "JOB_EXPIRED", errorMessage: "Provisioning authorization expired" });
      return { status: "failed", code: "JOB_EXPIRED", message: "Provisioning authorization expired" };
    }
    if (job.state === "ready" && job.resultCiphertext) {
      const result = JSON.parse(await decryptSecret(job.resultCiphertext, this.config.encryptionKey)) as ProvisionResult;
      return { status: "ready", serviceUrl: result.serviceUrl, publishToken: result.publishToken };
    }
    if (job.state === "failed") return { status: "failed", code: job.errorCode || "PROVISIONING_FAILED", message: job.errorMessage || "Provisioning failed" };
    return { status: job.state };
  }

  async ack(jobId: string, pollSecret: string): Promise<{ ok: true }> {
    const job = await this.authorizeJob(jobId, pollSecret);
    if (job.state !== "ready" || !job.resultCiphertext) throw new ProvisioningError("RESULT_UNAVAILABLE", "Provisioning result is unavailable", 409);
    await this.config.storage.updateJob(job.id, { state: "acked", resultCiphertext: undefined, ackedAt: this.now().toISOString() });
    return { ok: true };
  }

  async rejectAuthorization(state: string): Promise<void> {
    const job = await this.config.storage.getJobByOAuthStateHash(await sha256(String(state || "")));
    if (job && (job.state === "pending" || job.state === "authorizing")) await this.config.storage.updateJob(job.id, { state: "failed", errorCode: "OAUTH_DENIED", errorMessage: "Cloudflare authorization was denied" });
  }

  async cleanupExpired(): Promise<number> {
    const jobs = await this.config.storage.listExpiredJobs(this.now().toISOString());
    for (const job of jobs) {
      if (job.accessTokenCiphertext) {
        try {
          const accessToken = await decryptSecret(job.accessTokenCiphertext, this.config.encryptionKey);
          await this.config.cloudflare.revokeToken(accessToken, this.config.clientId, this.config.clientSecret);
        } catch { /* the token is still removed from storage below */ }
      }
      await this.config.storage.updateJob(job.id, { state: "failed", errorCode: "JOB_EXPIRED", errorMessage: "Provisioning authorization expired", accessTokenCiphertext: undefined, oauthVerifierCiphertext: undefined });
    }
    return jobs.length;
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const fallback = await this.config.storage.getJobByOAuthStateHash(await sha256(state));
    if (!fallback || !constantTimeEqual(fallback.oauthStateHash, await sha256(state))) throw new ProvisioningError("INVALID_OAUTH_STATE", "Authorization could not be verified", 400);
    if (Date.parse(fallback.expiresAt) <= this.now().getTime()) {
      await this.config.storage.updateJob(fallback.id, { state: "failed", errorCode: "JOB_EXPIRED", errorMessage: "Provisioning authorization expired" });
      throw new ProvisioningError("JOB_EXPIRED", "Provisioning authorization expired", 410);
    }
    if (!(await this.config.storage.claimJobForCallback(fallback.id, this.now().toISOString()))) return;
    let accessToken = "";
    try {
      const exchanged = await this.config.cloudflare.exchangeCode({ code: String(code || ""), clientId: this.config.clientId, clientSecret: this.config.clientSecret, redirectUri: this.config.redirectUri, codeVerifier: fallback.oauthVerifierCiphertext ? await decryptSecret(fallback.oauthVerifierCiphertext, this.config.encryptionKey) : undefined });
      accessToken = exchanged.accessToken;
      await this.config.storage.updateJob(fallback.id, { state: "provisioning", accessTokenCiphertext: await encryptSecret(accessToken, this.config.encryptionKey) });
      await this.provision(fallback.id, accessToken);
    } catch (error) {
      const safe = error instanceof ProvisioningError ? error : new ProvisioningError("PROVISIONING_FAILED", "Cloudflare provisioning failed", 502);
      await this.config.storage.updateJob(fallback.id, { state: "failed", errorCode: safe.code, errorMessage: safe.message });
      throw safe;
    } finally {
      if (accessToken) {
        try { await this.config.cloudflare.revokeToken(accessToken, this.config.clientId, this.config.clientSecret); } catch { /* cleanup is retried by operator, never expose the token */ }
        await this.config.storage.updateJob(fallback.id, { accessTokenCiphertext: undefined, oauthVerifierCiphertext: undefined });
      }
    }
  }

  private async provision(jobId: string, accessToken: string): Promise<void> {
    const job = await this.config.storage.getJob(jobId);
    if (!job) throw new ProvisioningError("JOB_NOT_FOUND", "Provisioning job not found", 404);
    const accounts = await this.config.cloudflare.listAccounts(accessToken);
    if (accounts.length === 0) throw new ProvisioningError("NO_ACCOUNT_ACCESS", "No Cloudflare account is available for this authorization", 403);
    if (accounts.length > 1) throw new ProvisioningError("MULTIPLE_ACCOUNTS", "Authorize one Cloudflare account at a time", 409);
    const account = accounts[0];
    const existing = await this.config.storage.getInstallation(account.id);
    if (existing?.status === "ready") throw new ProvisioningError("ALREADY_PROVISIONED", "This Cloudflare account already has a Publish Note Worker", 409);

    const [d1Databases, r2Buckets, workerNames] = await Promise.all([
      this.config.cloudflare.listD1Databases(accessToken, account.id),
      this.config.cloudflare.listR2Buckets(accessToken, account.id),
      this.config.cloudflare.listWorkerNames(accessToken, account.id),
    ]);
    const names = chooseNames(this.resourcePrefix, account.id, d1Databases.map((value) => value.name), r2Buckets, workerNames);
    let createdD1: { id: string; name: string } | undefined;
    let createdR2 = false;
    let createdWorker = false;
    try {
      let d1 = d1Databases.find((value) => value.name === names.d1);
      if (!d1) { d1 = await this.config.cloudflare.createD1Database(accessToken, account.id, names.d1); createdD1 = d1; }
      if (!r2Buckets.includes(names.r2)) { await this.config.cloudflare.createR2Bucket(accessToken, account.id, names.r2); createdR2 = true; }
      const subdomain = await this.config.cloudflare.ensureWorkersDevSubdomain(accessToken, account.id, `${this.resourcePrefix}-${account.id.slice(0, 8).toLowerCase()}`);
      const serviceUrl = `https://${names.worker}.${subdomain}.workers.dev`;
      const bootstrapSecret = randomSecret("", 32);
      const expiresAt = new Date(this.now().getTime() + BOOTSTRAP_TTL_MS).toISOString();
      const signature = await hmacSha256(bootstrapSecret, `${job.id}\n${expiresAt}`);
      await this.config.cloudflare.uploadWorker({ accessToken, accountId: account.id, workerName: names.worker, module: await this.loadConfiguredText(this.config.targetWorkerModule, this.config.targetWorkerBundleUrl, "TARGET_WORKER_BUNDLE"), d1DatabaseId: d1.id, r2BucketName: names.r2, bootstrapSecret, publicBaseUrl: serviceUrl });
      createdWorker = true;
      await this.config.cloudflare.enableWorkerSubdomain(accessToken, account.id, names.worker);
      for (const statement of splitSqlStatements(await this.loadConfiguredText(this.config.targetMigrationSql, this.config.targetMigrationUrl, "TARGET_MIGRATION_SQL"))) await this.config.cloudflare.runD1Statement(accessToken, account.id, d1.id, statement);
      const initialized = await this.initializeTarget(serviceUrl, job.id, bootstrapSecret, expiresAt, signature);
      await this.config.cloudflare.deleteWorkerSecret(accessToken, account.id, names.worker, "BOOTSTRAP_SECRET");
      const installation: CloudflareInstallation = { id: safeJobId(), accountId: account.id, workerName: names.worker, d1DatabaseId: d1.id, d1DatabaseName: names.d1, r2BucketName: names.r2, serviceUrl, status: "ready", createdAt: this.now().toISOString(), updatedAt: this.now().toISOString() };
      await this.config.storage.createInstallation(installation);
      const result: ProvisionResult = { serviceUrl, publishToken: initialized.publishToken };
      await this.config.storage.updateJob(job.id, { state: "ready", accountId: account.id, installationId: installation.id, resultCiphertext: await encryptSecret(JSON.stringify(result), this.config.encryptionKey), accessTokenCiphertext: undefined });
    } catch (error) {
      if (createdWorker) await this.config.cloudflare.deleteWorker(accessToken, account.id, names.worker).catch(() => undefined);
      if (createdR2) await this.config.cloudflare.deleteR2Bucket(accessToken, account.id, names.r2).catch(() => undefined);
      if (createdD1) await this.config.cloudflare.deleteD1Database(accessToken, account.id, createdD1.id).catch(() => undefined);
      throw error;
    }
  }

  private async initializeTarget(serviceUrl: string, ownerKey: string, secret: string, expiresAt: string, signature: string): Promise<{ accountId: string; publishToken: string }> {
    const response = await this.fetchImpl(`${serviceUrl}/__internal/provision/initialize`, { method: "POST", headers: { "content-type": "application/json", "x-publish-note-bootstrap-secret": secret }, body: JSON.stringify({ ownerKey, expiresAt, signature, tokenName: "Obsidian plugin" }) });
    let payload: any = {};
    try { payload = await response.json(); } catch { /* normalized below */ }
    if (!response.ok || !payload.publishToken) throw new ProvisioningError("TARGET_INITIALIZATION_FAILED", "Publish Note Worker initialization failed", 502);
    return { accountId: String(payload.accountId || ""), publishToken: String(payload.publishToken) };
  }

  private async loadConfiguredText(value: string | undefined, url: string | undefined, label: string): Promise<string> {
    if (value && !value.startsWith("REPLACE_WITH_")) return value;
    if (!url) throw new ProvisioningError("PROVISIONER_MISCONFIGURED", `${label} is not configured`, 500);
    const response = await this.fetchImpl(url, { headers: { accept: "text/plain,application/javascript" } });
    if (!response.ok) throw new ProvisioningError("PROVISIONER_MISCONFIGURED", `${label} could not be loaded`, 500);
    const text = await response.text();
    if (!text.trim() || text.length > 10 * 1024 * 1024) throw new ProvisioningError("PROVISIONER_MISCONFIGURED", `${label} is invalid`, 500);
    return text;
  }

  private async authorizeJob(jobId: string, pollSecret: string): Promise<ProvisionJob> {
    const job = await this.config.storage.getJob(String(jobId || ""));
    if (!job || !constantTimeEqual(job.pollSecretHash, await sha256(String(pollSecret || "")))) throw new ProvisioningError("UNAUTHORIZED", "Provisioning job is unavailable", 401);
    return job;
  }

}

export function chooseNames(prefix: string, accountId: string, d1Names: string[], r2Names: string[], workerNames: string[]) {
  return {
    // These are separate Cloudflare namespaces. An occupied D1 name should
    // not force a different Worker hostname.
    worker: chooseResourceName(prefix, accountId, workerNames),
    d1: chooseResourceName(prefix, accountId, d1Names),
    r2: chooseResourceName(`${prefix}-content`, accountId, r2Names),
  };
}

function chooseResourceName(prefix: string, accountId: string, occupiedNames: string[]) {
  const occupied = new Set(occupiedNames);
  const accountSuffix = String(accountId || "account").replace(/[^A-Za-z0-9-]/g, "").slice(0, 8).replace(/^-+|-+$/g, "").toLowerCase() || "account";
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${accountSuffix}${index === 1 ? "" : `-${index}`}`;
    const name = `${prefix}${suffix}`;
    if (!occupied.has(name)) return name;
  }
  throw new ProvisioningError("RESOURCE_NAME_UNAVAILABLE", "Could not find an available Cloudflare resource name", 409);
}
