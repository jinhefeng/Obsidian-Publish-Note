import type { CloudflareInstallation, ProvisionJob } from "./models.ts";
import type { ProvisioningStorage } from "./storage.ts";

export class MemoryProvisioningStorage implements ProvisioningStorage {
  readonly jobs = new Map<string, ProvisionJob>();
  readonly installations = new Map<string, CloudflareInstallation>();

  async createJob(job: ProvisionJob): Promise<void> { this.jobs.set(job.id, { ...job }); }
  async getJob(id: string): Promise<ProvisionJob | undefined> { const job = this.jobs.get(id); return job ? { ...job } : undefined; }
  async getJobByOAuthStateHash(hash: string): Promise<ProvisionJob | undefined> { for (const job of this.jobs.values()) if (job.oauthStateHash === hash) return { ...job }; return undefined; }
  async claimJobForCallback(id: string, now: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job || job.state !== "pending" || Date.parse(job.expiresAt) <= Date.parse(now)) return false;
    job.state = "authorizing";
    return true;
  }
  async listExpiredJobs(now: string): Promise<ProvisionJob[]> { return [...this.jobs.values()].filter((job) => ["pending", "authorizing", "provisioning"].includes(job.state) && Date.parse(job.expiresAt) <= Date.parse(now)).map((job) => ({ ...job })); }
  async updateJob(id: string, patch: Partial<ProvisionJob>): Promise<void> { const job = this.jobs.get(id); if (job) this.jobs.set(id, { ...job, ...patch }); }
  async createInstallation(installation: CloudflareInstallation): Promise<void> { this.installations.set(installation.accountId, { ...installation }); }
  async getInstallation(accountId: string): Promise<CloudflareInstallation | undefined> { const value = this.installations.get(accountId); return value ? { ...value } : undefined; }
  async updateInstallation(id: string, patch: Partial<CloudflareInstallation>): Promise<void> {
    for (const [accountId, installation] of this.installations) if (installation.id === id) this.installations.set(accountId, { ...installation, ...patch });
  }
}
