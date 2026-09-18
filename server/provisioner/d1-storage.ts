import type { D1DatabaseLike } from "../storage/cloudflare-d1-r2/index.ts";
import type { CloudflareInstallation, ProvisionJob } from "./models.ts";
import type { ProvisioningStorage } from "./storage.ts";

export class D1ProvisioningStorage implements ProvisioningStorage {
  readonly db: D1DatabaseLike;
  constructor(db: D1DatabaseLike) { this.db = db; }

  async createJob(job: ProvisionJob): Promise<void> {
    await this.db.prepare(`INSERT INTO provision_jobs(job_id,poll_secret_hash,oauth_state_hash,oauth_verifier_ciphertext,created_at,expires_at,state,account_id,access_token_ciphertext,result_ciphertext,installation_id,error_code,error_message,acked_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`).bind(job.id, job.pollSecretHash, job.oauthStateHash, job.oauthVerifierCiphertext || null, job.createdAt, job.expiresAt, job.state, job.accountId || null, job.accessTokenCiphertext || null, job.resultCiphertext || null, job.installationId || null, job.errorCode || null, job.errorMessage || null, job.ackedAt || null).run();
  }

  async getJob(id: string): Promise<ProvisionJob | undefined> {
    const row = await this.db.prepare("SELECT * FROM provision_jobs WHERE job_id = ?1").bind(id).first<Record<string, unknown>>();
    return row ? jobFromRow(row) : undefined;
  }

  async getJobByOAuthStateHash(hash: string): Promise<ProvisionJob | undefined> {
    const row = await this.db.prepare("SELECT * FROM provision_jobs WHERE oauth_state_hash = ?1").bind(hash).first<Record<string, unknown>>();
    return row ? jobFromRow(row) : undefined;
  }

  async claimJobForCallback(id: string, now: string): Promise<boolean> {
    const result = await this.db.prepare("UPDATE provision_jobs SET state='authorizing' WHERE job_id=?1 AND state='pending' AND expires_at > ?2").bind(id, now).run();
    return Number(result.meta?.changes || 0) === 1;
  }

  async listExpiredJobs(now: string): Promise<ProvisionJob[]> {
    const rows = await this.db.prepare("SELECT * FROM provision_jobs WHERE state IN ('pending','authorizing','provisioning') AND expires_at <= ?1").bind(now).all<Record<string, unknown>>();
    return (rows.results || []).map(jobFromRow);
  }

  async updateJob(id: string, patch: Partial<ProvisionJob>): Promise<void> {
    const current = await this.getJob(id);
    if (!current) return;
    const next = { ...current, ...patch };
    await this.db.prepare(`UPDATE provision_jobs SET poll_secret_hash=?1,oauth_state_hash=?2,oauth_verifier_ciphertext=?3,created_at=?4,expires_at=?5,state=?6,account_id=?7,access_token_ciphertext=?8,result_ciphertext=?9,installation_id=?10,error_code=?11,error_message=?12,acked_at=?13 WHERE job_id=?14`).bind(next.pollSecretHash, next.oauthStateHash, next.oauthVerifierCiphertext || null, next.createdAt, next.expiresAt, next.state, next.accountId || null, next.accessTokenCiphertext || null, next.resultCiphertext || null, next.installationId || null, next.errorCode || null, next.errorMessage || null, next.ackedAt || null, id).run();
  }

  async createInstallation(value: CloudflareInstallation): Promise<void> {
    await this.db.prepare(`INSERT INTO cloudflare_installations(id,account_id,worker_name,d1_database_id,d1_database_name,r2_bucket_name,service_url,status,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`).bind(value.id, value.accountId, value.workerName, value.d1DatabaseId, value.d1DatabaseName, value.r2BucketName, value.serviceUrl, value.status, value.createdAt, value.updatedAt).run();
  }

  async getInstallation(accountId: string): Promise<CloudflareInstallation | undefined> {
    const row = await this.db.prepare("SELECT * FROM cloudflare_installations WHERE account_id = ?1").bind(accountId).first<Record<string, unknown>>();
    return row ? installationFromRow(row) : undefined;
  }

  async updateInstallation(id: string, patch: Partial<CloudflareInstallation>): Promise<void> {
    const current = await this.db.prepare("SELECT * FROM cloudflare_installations WHERE id = ?1").bind(id).first<Record<string, unknown>>();
    if (!current) return;
    const next = { ...installationFromRow(current)!, ...patch };
    await this.db.prepare(`UPDATE cloudflare_installations SET account_id=?1,worker_name=?2,d1_database_id=?3,d1_database_name=?4,r2_bucket_name=?5,service_url=?6,status=?7,created_at=?8,updated_at=?9 WHERE id=?10`).bind(next.accountId, next.workerName, next.d1DatabaseId, next.d1DatabaseName, next.r2BucketName, next.serviceUrl, next.status, next.createdAt, next.updatedAt, id).run();
  }
}

function jobFromRow(row: Record<string, unknown>): ProvisionJob {
  return {
    id: String(row.job_id), pollSecretHash: String(row.poll_secret_hash), oauthStateHash: String(row.oauth_state_hash), createdAt: String(row.created_at), expiresAt: String(row.expires_at), state: String(row.state) as ProvisionJob["state"],
    accountId: row.account_id ? String(row.account_id) : undefined, oauthVerifierCiphertext: row.oauth_verifier_ciphertext ? String(row.oauth_verifier_ciphertext) : undefined, accessTokenCiphertext: row.access_token_ciphertext ? String(row.access_token_ciphertext) : undefined, resultCiphertext: row.result_ciphertext ? String(row.result_ciphertext) : undefined, installationId: row.installation_id ? String(row.installation_id) : undefined, errorCode: row.error_code ? String(row.error_code) : undefined, errorMessage: row.error_message ? String(row.error_message) : undefined, ackedAt: row.acked_at ? String(row.acked_at) : undefined,
  };
}

function installationFromRow(row: Record<string, unknown>): CloudflareInstallation {
  return {
    id: String(row.id), accountId: String(row.account_id), workerName: String(row.worker_name), d1DatabaseId: String(row.d1_database_id), d1DatabaseName: String(row.d1_database_name), r2BucketName: String(row.r2_bucket_name), serviceUrl: String(row.service_url), status: String(row.status) as CloudflareInstallation["status"], createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}
