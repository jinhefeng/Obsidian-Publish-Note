export type ProvisionJobState = "pending" | "authorizing" | "provisioning" | "ready" | "failed" | "acked";

export interface ProvisionJob {
  id: string;
  pollSecretHash: string;
  oauthStateHash: string;
  oauthVerifierCiphertext?: string;
  createdAt: string;
  expiresAt: string;
  state: ProvisionJobState;
  accountId?: string;
  accessTokenCiphertext?: string;
  resultCiphertext?: string;
  installationId?: string;
  errorCode?: string;
  errorMessage?: string;
  ackedAt?: string;
}

export interface CloudflareInstallation {
  id: string;
  accountId: string;
  workerName: string;
  d1DatabaseId: string;
  d1DatabaseName: string;
  r2BucketName: string;
  serviceUrl: string;
  createdAt: string;
  updatedAt: string;
  status: "provisioning" | "ready" | "failed";
}

export interface ProvisionResult {
  serviceUrl: string;
  publishToken: string;
}
