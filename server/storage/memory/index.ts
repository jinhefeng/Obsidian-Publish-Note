import { randomId } from "../../core/crypto.ts";
import { ServiceError } from "../../core/errors.ts";
import type { AccountRecord, CommitUploadInput, DeviceAuthorizationRecord, PublishedObjectRecord, RecoveryCodeRecord, SessionRecord, SiteRecord, StorageUsage, TokenRecord, UploadChunkRecord, UploadObjectRecord, UploadRecord, ViewerObject } from "../../core/models.ts";
import type { PublishStorage } from "../../core/storage.ts";

interface StoredSite {
  site: SiteRecord;
  objects: Map<string, { object: PublishedObjectRecord; chunks: Uint8Array[] }>;
}

export class MemoryStorage implements PublishStorage {
  private readonly accounts = new Map<string, AccountRecord>();
  private readonly accountByEmail = new Map<string, string>();
  private readonly recovery = new Map<string, RecoveryCodeRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly tokens = new Map<string, TokenRecord>();
  private readonly tokenByHash = new Map<string, string>();
  private readonly sites = new Map<string, StoredSite>();
  private readonly uploads = new Map<string, UploadRecord>();
  private readonly uploadByKey = new Map<string, string>();
  private readonly uploadObjects = new Map<string, Map<string, UploadObjectRecord>>();
  private readonly uploadChunks = new Map<string, Map<string, Map<number, UploadChunkRecord>>>();
  private readonly devices = new Map<string, DeviceAuthorizationRecord>();
  private bootstrapConsumed = false;

  async getAccountByEmail(email: string): Promise<AccountRecord | undefined> { const id = this.accountByEmail.get(email); return id ? this.getAccount(id) : undefined; }
  async getAccount(accountId: string): Promise<AccountRecord | undefined> { const value = this.accounts.get(accountId); return value ? { ...value } : undefined; }
  async createAccount(account: AccountRecord, recoveryCode: RecoveryCodeRecord): Promise<void> {
    if (this.accountByEmail.has(account.email)) throw new ServiceError(409, "CONFLICT", "An account with this email already exists");
    this.accounts.set(account.id, { ...account });
    this.accountByEmail.set(account.email, account.id);
    this.recovery.set(account.id, { ...recoveryCode });
  }
  async deleteAccount(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account) return;
    this.accounts.delete(accountId);
    this.accountByEmail.delete(account.email);
    this.recovery.delete(accountId);
    await this.revokeAccountSessions(accountId);
    for (const token of await this.listTokens(accountId)) { this.tokens.delete(token.id); this.tokenByHash.delete(token.tokenHash); }
  }
  async updateAccountPassword(accountId: string, passwordHash: string): Promise<void> { const account = this.accounts.get(accountId); if (account) account.passwordHash = passwordHash; }

  async getRecoveryCode(accountId: string): Promise<RecoveryCodeRecord | undefined> { const value = this.recovery.get(accountId); return value ? { ...value } : undefined; }
  async consumeRecoveryCode(accountId: string, codeHash: string, usedAt: string): Promise<boolean> {
    const record = this.recovery.get(accountId);
    if (!record || record.usedAt || record.codeHash !== codeHash) return false;
    record.usedAt = usedAt;
    return true;
  }

  async createSession(session: SessionRecord): Promise<void> { this.sessions.set(session.id, { ...session }); }
  async getSession(sessionId: string): Promise<SessionRecord | undefined> { const value = this.sessions.get(sessionId); return value ? { ...value } : undefined; }
  async deleteSession(sessionId: string): Promise<void> { this.sessions.delete(sessionId); }
  async revokeAccountSessions(accountId: string): Promise<void> { for (const [id, session] of this.sessions) if (session.accountId === accountId) this.sessions.delete(id); }

  async createToken(token: TokenRecord): Promise<void> { this.tokens.set(token.id, { ...token }); this.tokenByHash.set(token.tokenHash, token.id); }
  async getTokenByHash(tokenHash: string): Promise<TokenRecord | undefined> { const id = this.tokenByHash.get(tokenHash); const token = id ? this.tokens.get(id) : undefined; return token ? { ...token } : undefined; }
  async listTokens(accountId: string): Promise<TokenRecord[]> { return [...this.tokens.values()].filter((token) => token.accountId === accountId).map((token) => ({ ...token })); }
  async revokeToken(accountId: string, tokenId: string, revokedAt: string): Promise<boolean> { const token = this.tokens.get(tokenId); if (!token || token.accountId !== accountId) return false; token.revokedAt = token.revokedAt || revokedAt; return true; }
  async touchToken(tokenId: string, usedAt: string): Promise<void> { const token = this.tokens.get(tokenId); if (token) token.lastUsedAt = usedAt; }
  async revokeAccountTokens(accountId: string, revokedAt: string): Promise<void> { for (const token of this.tokens.values()) if (token.accountId === accountId && !token.revokedAt) token.revokedAt = revokedAt; }

  async getSite(accountId: string, siteId: string): Promise<SiteRecord | undefined> { const stored = this.sites.get(this.siteKey(accountId, siteId)); return stored ? { ...stored.site } : undefined; }
  async listSites(accountId: string): Promise<SiteRecord[]> { return [...this.sites.values()].filter(({ site }) => site.accountId === accountId).map(({ site }) => ({ ...site })); }
  async getUsage(accountId: string): Promise<StorageUsage> {
    const sites = await this.listSites(accountId);
    return { bytes: sites.reduce((total, site) => total + site.byteSize, 0), siteCount: sites.length };
  }
  async deleteSite(accountId: string, siteId: string): Promise<boolean> {
    const deleted = this.sites.delete(this.siteKey(accountId, siteId));
    for (const [uploadId, upload] of this.uploads) {
      if (upload.accountId !== accountId || upload.siteId !== siteId) continue;
      this.uploads.delete(uploadId);
      this.uploadByKey.delete(this.uploadKey(accountId, upload.idempotencyKey));
      this.uploadObjects.delete(uploadId);
      this.uploadChunks.delete(uploadId);
    }
    return deleted;
  }

  async findUpload(accountId: string, idempotencyKey: string): Promise<UploadRecord | undefined> { const id = this.uploadByKey.get(this.uploadKey(accountId, idempotencyKey)); const upload = id ? this.uploads.get(id) : undefined; return upload ? cloneUpload(upload) : undefined; }
  async createUpload(upload: UploadRecord): Promise<void> { this.uploads.set(upload.uploadId, cloneUpload(upload)); this.uploadByKey.set(this.uploadKey(upload.accountId, upload.idempotencyKey), upload.uploadId); }
  async getUpload(uploadId: string): Promise<UploadRecord | undefined> { const upload = this.uploads.get(uploadId); return upload ? cloneUpload(upload) : undefined; }
  async putUploadChunk(input: { upload: UploadRecord; object: Omit<UploadObjectRecord, "uploadId" | "objectId" | "byteSize">; chunkIndex: number; byteLength: number; bytes: Uint8Array }): Promise<{ object: UploadObjectRecord; chunk: UploadChunkRecord; receivedChunks: number }> {
    const objects = this.uploadObjects.get(input.upload.uploadId) || new Map<string, UploadObjectRecord>();
    this.uploadObjects.set(input.upload.uploadId, objects);
    let object = objects.get(input.object.path);
    if (object && (object.kind !== input.object.kind || object.contentType !== input.object.contentType || object.encoding !== input.object.encoding || object.chunkCount !== input.object.chunkCount)) throw new ServiceError(409, "CONFLICT", "Upload object metadata conflict");
    if (!object) {
      object = { uploadId: input.upload.uploadId, objectId: randomId(16), ...input.object, byteSize: 0 };
      objects.set(object.path, object);
    }
    const byObject = this.uploadChunks.get(input.upload.uploadId) || new Map<string, Map<number, UploadChunkRecord>>();
    this.uploadChunks.set(input.upload.uploadId, byObject);
    const chunks = byObject.get(object.objectId) || new Map<number, UploadChunkRecord>();
    byObject.set(object.objectId, chunks);
    const existing = chunks.get(input.chunkIndex);
    if (existing && !bytesEqual(existing.bytes, input.bytes)) throw new ServiceError(409, "CONFLICT", "Upload chunk conflict");
    if (!existing) {
      const chunk = { uploadId: input.upload.uploadId, objectId: object.objectId, chunkIndex: input.chunkIndex, byteLength: input.byteLength, bytes: input.bytes.slice() };
      chunks.set(input.chunkIndex, chunk);
      object.byteSize += input.byteLength;
    }
    const chunk = chunks.get(input.chunkIndex)!;
    return { object: { ...object }, chunk: { ...chunk, bytes: chunk.bytes.slice() }, receivedChunks: chunks.size };
  }
  async listUploadObjects(uploadId: string): Promise<UploadObjectRecord[]> { return [...(this.uploadObjects.get(uploadId)?.values() || [])].map((object) => ({ ...object })); }
  async listUploadChunks(uploadId: string, objectId: string): Promise<UploadChunkRecord[]> { return [...(this.uploadChunks.get(uploadId)?.get(objectId)?.values() || [])].sort((a, b) => a.chunkIndex - b.chunkIndex).map((chunk) => ({ ...chunk, bytes: chunk.bytes.slice() })); }
  async commitUpload(uploadId: string, input: CommitUploadInput): Promise<SiteRecord> {
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new ServiceError(404, "NOT_FOUND", "Upload not found");
    if (upload.result) { const existing = this.sites.get(this.siteKey(upload.accountId, upload.siteId)); if (existing) return { ...existing.site }; }
    const siteKey = this.siteKey(upload.accountId, upload.siteId);
    const previous = this.sites.get(siteKey);
    const site: SiteRecord = previous
      ? { ...previous.site, title: upload.title, sourcePath: upload.sourcePath, currentRevision: upload.revision, byteSize: input.byteSize, objectCount: input.objectCount, updatedAt: input.now }
      : { siteId: upload.siteId, accountId: upload.accountId, title: upload.title, sourcePath: upload.sourcePath, currentRevision: upload.revision, byteSize: input.byteSize, objectCount: input.objectCount, createdAt: input.now, updatedAt: input.now };
    const objects = new Map<string, { object: PublishedObjectRecord; chunks: Uint8Array[] }>();
    for (const object of await this.listUploadObjects(uploadId)) {
      const chunks = await this.listUploadChunks(uploadId, object.objectId);
      objects.set(object.path, { object: { ...object, siteId: upload.siteId, revision: upload.revision }, chunks: chunks.map((chunk) => chunk.bytes.slice()) });
    }
    this.sites.set(siteKey, { site, objects });
    upload.status = "committed";
    upload.result = { siteId: site.siteId, revision: site.currentRevision, uploadedPaths: [...objects.keys()].sort() };
    return { ...site };
  }
  async expireUploads(now: string): Promise<number> { let count = 0; for (const upload of this.uploads.values()) if (upload.status === "open" && Date.parse(upload.expiresAt) <= Date.parse(now)) { upload.status = "expired"; count += 1; } return count; }
  async getViewerObject(siteId: string, path: string): Promise<ViewerObject | undefined> {
    const stored = [...this.sites.values()].find(({ site }) => site.siteId === siteId);
    const value = stored?.objects.get(path);
    return value ? { site: { ...stored.site }, object: { ...value.object }, chunks: value.chunks.map((chunk) => chunk.slice()) } : undefined;
  }
  async cleanupOrphanedObjects(_now: string): Promise<number> { return 0; }

  async createDeviceAuthorization(record: DeviceAuthorizationRecord): Promise<void> { this.devices.set(record.deviceCodeHash, { ...record }); }
  async getDeviceAuthorization(deviceCodeHash: string): Promise<DeviceAuthorizationRecord | undefined> { const value = this.devices.get(deviceCodeHash); return value ? { ...value } : undefined; }
  async approveDeviceAuthorization(deviceCodeHash: string, accountId: string, _tokenId: string, tokenName: string, now = new Date().toISOString()): Promise<boolean> { const record = this.devices.get(deviceCodeHash); if (!record || record.status !== "pending" || Date.parse(record.expiresAt) <= Date.parse(now)) return false; record.accountId = accountId; record.tokenName = tokenName; record.status = "approved"; return true; }
  async consumeApprovedDeviceAuthorization(deviceCodeHash: string): Promise<DeviceAuthorizationRecord | undefined> { const record = this.devices.get(deviceCodeHash); if (!record || record.status !== "approved" || record.consumedAt) return undefined; record.consumedAt = new Date().toISOString(); return { ...record }; }

  async isBootstrapConsumed(): Promise<boolean> { return this.bootstrapConsumed; }
  async consumeBootstrap(_now: string): Promise<boolean> { if (this.bootstrapConsumed) return false; this.bootstrapConsumed = true; return true; }

  private siteKey(accountId: string, siteId: string): string { return `${accountId}:${siteId}`; }
  private uploadKey(accountId: string, key: string): string { return `${accountId}:${key}`; }
}

function cloneUpload(upload: UploadRecord): UploadRecord { return { ...upload, result: upload.result ? { ...upload.result, uploadedPaths: [...upload.result.uploadedPaths] } : undefined }; }
function bytesEqual(left: Uint8Array, right: Uint8Array): boolean { return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]); }
