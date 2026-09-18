import type { CloudflareInstallation, ProvisionJob } from "./models.ts";

export interface ProvisioningStorage {
  createJob(job: ProvisionJob): Promise<void>;
  getJob(id: string): Promise<ProvisionJob | undefined>;
  getJobByOAuthStateHash(hash: string): Promise<ProvisionJob | undefined>;
  claimJobForCallback(id: string, now: string): Promise<boolean>;
  listExpiredJobs(now: string): Promise<ProvisionJob[]>;
  updateJob(id: string, patch: Partial<ProvisionJob>): Promise<void>;
  createInstallation(installation: CloudflareInstallation): Promise<void>;
  getInstallation(accountId: string): Promise<CloudflareInstallation | undefined>;
  updateInstallation(id: string, patch: Partial<CloudflareInstallation>): Promise<void>;
}
