import type {
  AccountRecord,
  CommitUploadInput,
  DeviceAuthorizationRecord,
  PublishedObjectRecord,
  RecoveryCodeRecord,
  SessionRecord,
  SiteRecord,
  StorageUsage,
  TokenRecord,
  UploadChunkRecord,
  UploadObjectRecord,
  UploadRecord,
  ViewerObject,
} from "./models.ts";

export interface PublishStorage {
  getAccountByEmail(email: string): Promise<AccountRecord | undefined>;
  getAccount(accountId: string): Promise<AccountRecord | undefined>;
  findProvisioningAccount(): Promise<AccountRecord | undefined>;
  createAccount(account: AccountRecord, recoveryCode: RecoveryCodeRecord): Promise<void>;
  deleteAccount(accountId: string): Promise<void>;
  updateAccountPassword(accountId: string, passwordHash: string): Promise<void>;

  getRecoveryCode(accountId: string): Promise<RecoveryCodeRecord | undefined>;
  consumeRecoveryCode(accountId: string, codeHash: string, usedAt: string): Promise<boolean>;

  createSession(session: SessionRecord): Promise<void>;
  getSession(sessionId: string): Promise<SessionRecord | undefined>;
  deleteSession(sessionId: string): Promise<void>;
  revokeAccountSessions(accountId: string): Promise<void>;

  createToken(token: TokenRecord): Promise<void>;
  getTokenByHash(tokenHash: string): Promise<TokenRecord | undefined>;
  listTokens(accountId: string): Promise<TokenRecord[]>;
  revokeToken(accountId: string, tokenId: string, revokedAt: string): Promise<boolean>;
  touchToken(tokenId: string, usedAt: string): Promise<void>;
  revokeAccountTokens(accountId: string, revokedAt: string): Promise<void>;

  getSite(accountId: string, siteId: string): Promise<SiteRecord | undefined>;
  listSites(accountId: string): Promise<SiteRecord[]>;
  getUsage(accountId: string): Promise<StorageUsage>;
  deleteSite(accountId: string, siteId: string): Promise<boolean>;

  findUpload(accountId: string, idempotencyKey: string): Promise<UploadRecord | undefined>;
  createUpload(upload: UploadRecord): Promise<void>;
  getUpload(uploadId: string): Promise<UploadRecord | undefined>;
  putUploadChunk(input: {
    upload: UploadRecord;
    object: Omit<UploadObjectRecord, "uploadId" | "objectId" | "byteSize">;
    chunkIndex: number;
    byteLength: number;
    bytes: Uint8Array;
  }): Promise<{ object: UploadObjectRecord; chunk: UploadChunkRecord; receivedChunks: number }>;
  listUploadObjects(uploadId: string): Promise<UploadObjectRecord[]>;
  listUploadChunks(uploadId: string, objectId: string): Promise<UploadChunkRecord[]>;
  commitUpload(uploadId: string, input: CommitUploadInput): Promise<SiteRecord>;
  expireUploads(now: string): Promise<number>;

  getViewerObject(siteId: string, path: string): Promise<ViewerObject | undefined>;
  cleanupOrphanedObjects(now: string): Promise<number>;

  createDeviceAuthorization(record: DeviceAuthorizationRecord): Promise<void>;
  getDeviceAuthorization(deviceCodeHash: string): Promise<DeviceAuthorizationRecord | undefined>;
  approveDeviceAuthorization(deviceCodeHash: string, accountId: string, tokenId: string, tokenName: string, now?: string): Promise<boolean>;
  consumeApprovedDeviceAuthorization(deviceCodeHash: string): Promise<DeviceAuthorizationRecord | undefined>;

  isBootstrapConsumed(): Promise<boolean>;
  consumeBootstrap(now: string): Promise<boolean>;
}
