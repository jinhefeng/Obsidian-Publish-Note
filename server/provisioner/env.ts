import { CloudflareRestApi } from "./cloudflare-api.ts";
import { D1ProvisioningStorage } from "./d1-storage.ts";
import { ProvisioningService } from "./service.ts";

export interface ProvisioningEnv {
  DB: ConstructorParameters<typeof D1ProvisioningStorage>[0];
  CF_OAUTH_CLIENT_ID: string;
  CF_OAUTH_CLIENT_SECRET?: string;
  CF_OAUTH_REDIRECT_URI: string;
  PROVISIONER_PUBLIC_URL: string;
  PROVISIONER_ENCRYPTION_KEY: string;
  TARGET_WORKER_MODULE?: string;
  TARGET_WORKER_BUNDLE_URL?: string;
  TARGET_MIGRATION_SQL?: string;
  TARGET_MIGRATION_URL?: string;
  PROVISIONER_RESOURCE_PREFIX?: string;
  CF_OAUTH_SCOPE?: string;
}

export function createProvisioningService(env: ProvisioningEnv): ProvisioningService {
  return new ProvisioningService({
    storage: new D1ProvisioningStorage(env.DB),
    cloudflare: new CloudflareRestApi(),
    clientId: String(env.CF_OAUTH_CLIENT_ID || ""),
    clientSecret: String(env.CF_OAUTH_CLIENT_SECRET || ""),
    redirectUri: String(env.CF_OAUTH_REDIRECT_URI || `${env.PROVISIONER_PUBLIC_URL}/oauth/cloudflare/callback`),
    publicBaseUrl: String(env.PROVISIONER_PUBLIC_URL || "").replace(/\/$/, ""),
    encryptionKey: String(env.PROVISIONER_ENCRYPTION_KEY || ""),
    targetWorkerModule: env.TARGET_WORKER_MODULE,
    targetWorkerBundleUrl: env.TARGET_WORKER_BUNDLE_URL,
    targetMigrationSql: env.TARGET_MIGRATION_SQL,
    targetMigrationUrl: env.TARGET_MIGRATION_URL,
    resourcePrefix: env.PROVISIONER_RESOURCE_PREFIX,
    oauthScope: env.CF_OAUTH_SCOPE,
  });
}
