import { randomId } from "../../core/crypto.ts";
import { ServiceError } from "../../core/errors.ts";
import type { AccountRecord, CommitUploadInput, DeviceAuthorizationRecord, PublishedObjectRecord, RecoveryCodeRecord, SessionRecord, SiteRecord, StorageUsage, TokenRecord, UploadChunkRecord, UploadObjectRecord, UploadRecord, ViewerObject } from "../../core/models.ts";
import type { PublishStorage } from "../../core/storage.ts";

export interface D1Result<T = Record<string, unknown>> { results?: T[]; success?: boolean; meta?: Record<string, unknown>; }
export interface D1Statement { bind(...values: unknown[]): D1Statement; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<D1Result<T>>; run(): Promise<D1Result>; }
export interface D1DatabaseLike { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<D1Result[]>; exec(sql: string): Promise<unknown>; }
export interface R2ObjectLike { arrayBuffer(): Promise<ArrayBuffer>; body?: ReadableStream<Uint8Array>; httpMetadata?: { contentType?: string }; }
export interface R2BucketLike { put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>; get(key: string): Promise<R2ObjectLike | null>; delete(keys: string | string[]): Promise<void>; list?(options?: { prefix?: string; cursor?: string }): Promise<{ objects: Array<{ key: string }>; truncated?: boolean; cursor?: string }>; }

// D1 limits an individual BLOB to 2 MB. The plugin uploads 1 MB chunks, and
// this cap keeps a viewer request below the 50-query Workers Free limit.
export const D1_ONLY_MAX_OBJECT_BYTES = 20_000_000;

export class CloudflareD1R2Storage implements PublishStorage {
  readonly db: D1DatabaseLike;
  readonly bucket?: R2BucketLike;
  readonly tenantId: string;
  constructor(db: D1DatabaseLike, bucket?: R2BucketLike, tenantId = "default") { this.db = db; this.bucket = bucket; this.tenantId = tenantId; }

  async getAccountByEmail(email: string) { return this.account(await this.db.prepare("SELECT * FROM accounts WHERE email = ?1").bind(email).first()); }
  async getAccount(accountId: string) { return this.account(await this.db.prepare("SELECT * FROM accounts WHERE id = ?1").bind(accountId).first()); }
  async findProvisioningAccount() { return this.account(await this.db.prepare("SELECT * FROM accounts WHERE email LIKE ?1 ORDER BY created_at ASC LIMIT 1").bind("%@selfhosted.publish-note.invalid").first()); }
  async createAccount(account: AccountRecord, recoveryCode: RecoveryCodeRecord) { await this.db.batch([
    this.db.prepare("INSERT INTO accounts(id,email,password_hash,created_at) VALUES (?1,?2,?3,?4)").bind(account.id, account.email, account.passwordHash, account.createdAt),
    this.db.prepare("INSERT INTO recovery_codes(id,account_id,code_hash,created_at) VALUES (?1,?2,?3,?4)").bind(recoveryCode.id, recoveryCode.accountId, recoveryCode.codeHash, recoveryCode.createdAt),
  ]); }
  async deleteAccount(accountId: string) { await this.db.prepare("DELETE FROM accounts WHERE id = ?1").bind(accountId).run(); }
  async updateAccountPassword(accountId: string, passwordHash: string) { await this.db.prepare("UPDATE accounts SET password_hash = ?1 WHERE id = ?2").bind(passwordHash, accountId).run(); }

  async getRecoveryCode(accountId: string) { return this.recovery(await this.db.prepare("SELECT * FROM recovery_codes WHERE account_id = ?1").bind(accountId).first()); }
  async consumeRecoveryCode(accountId: string, codeHash: string, usedAt: string) { const result = await this.db.prepare("UPDATE recovery_codes SET used_at = ?1 WHERE account_id = ?2 AND code_hash = ?3 AND used_at IS NULL").bind(usedAt, accountId, codeHash).run(); return Number(result.meta?.changes || 0) === 1; }

  async createSession(session: SessionRecord) { await this.db.prepare("INSERT INTO sessions(id,account_id,created_at,expires_at) VALUES (?1,?2,?3,?4)").bind(session.id, session.accountId, session.createdAt, session.expiresAt).run(); }
  async getSession(sessionId: string) { return this.session(await this.db.prepare("SELECT * FROM sessions WHERE id = ?1").bind(sessionId).first()); }
  async deleteSession(sessionId: string) { await this.db.prepare("DELETE FROM sessions WHERE id = ?1").bind(sessionId).run(); }
  async revokeAccountSessions(accountId: string) { await this.db.prepare("DELETE FROM sessions WHERE account_id = ?1").bind(accountId).run(); }

  async createToken(token: TokenRecord) { await this.db.prepare("INSERT INTO tokens(id,account_id,name,token_hash,scope,created_at,last_used_at,expires_at,revoked_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(token.id, token.accountId, token.name, token.tokenHash, token.scope, token.createdAt, token.lastUsedAt || null, token.expiresAt || null, token.revokedAt || null).run(); }
  async getTokenByHash(tokenHash: string) { return this.token(await this.db.prepare("SELECT * FROM tokens WHERE token_hash = ?1").bind(tokenHash).first()); }
  async listTokens(accountId: string) { const result = await this.db.prepare("SELECT * FROM tokens WHERE account_id = ?1 ORDER BY created_at DESC").bind(accountId).all<Record<string, unknown>>(); return (result.results || []).map((row) => this.token(row)!); }
  async revokeToken(accountId: string, tokenId: string, revokedAt: string) { const result = await this.db.prepare("UPDATE tokens SET revoked_at = COALESCE(revoked_at, ?1) WHERE id = ?2 AND account_id = ?3").bind(revokedAt, tokenId, accountId).run(); return Number(result.meta?.changes || 0) === 1; }
  async touchToken(tokenId: string, usedAt: string) { await this.db.prepare("UPDATE tokens SET last_used_at = ?1 WHERE id = ?2").bind(usedAt, tokenId).run(); }
  async revokeAccountTokens(accountId: string, revokedAt: string) { await this.db.prepare("UPDATE tokens SET revoked_at = COALESCE(revoked_at, ?1) WHERE account_id = ?2").bind(revokedAt, accountId).run(); }

  async getSite(accountId: string, siteId: string) { return this.site(await this.db.prepare("SELECT * FROM sites WHERE account_id = ?1 AND site_id = ?2").bind(accountId, siteId).first()); }
  async listSites(accountId: string) { const result = await this.db.prepare("SELECT * FROM sites WHERE account_id = ?1 ORDER BY updated_at DESC").bind(accountId).all<Record<string, unknown>>(); return (result.results || []).map((row) => this.site(row)!); }
  async getUsage(accountId: string): Promise<StorageUsage> { const row = await this.db.prepare("SELECT COALESCE(SUM(byte_size),0) AS bytes, COUNT(*) AS site_count FROM sites WHERE account_id = ?1").bind(accountId).first<Record<string, unknown>>(); return { bytes: Number(row?.bytes || 0), siteCount: Number(row?.site_count || 0) }; }
  async deleteSite(accountId: string, siteId: string) {
    const site = await this.getSite(accountId, siteId);
    if (!site) return false;
    const keys = await this.db.prepare("SELECT r2_key FROM object_chunks WHERE site_id = ?1").bind(siteId).all<{ r2_key: string }>();
    const uploadKeys = await this.db.prepare("SELECT uc.r2_key FROM upload_chunks uc JOIN uploads u ON u.upload_id = uc.upload_id WHERE u.account_id = ?1 AND u.site_id = ?2").bind(accountId, siteId).all<{ r2_key: string }>();
    await this.db.batch([
      this.db.prepare("DELETE FROM object_chunks WHERE site_id = ?1").bind(siteId),
      this.db.prepare("DELETE FROM objects WHERE site_id = ?1").bind(siteId),
      this.db.prepare("DELETE FROM revisions WHERE site_id = ?1").bind(siteId),
      this.db.prepare("DELETE FROM uploads WHERE account_id = ?1 AND site_id = ?2").bind(accountId, siteId),
      this.db.prepare("DELETE FROM sites WHERE account_id = ?1 AND site_id = ?2").bind(accountId, siteId),
    ]);
    await this.deleteKeys([...(keys.results || []), ...(uploadKeys.results || [])].map((row) => row.r2_key));
    return true;
  }

  async findUpload(accountId: string, idempotencyKey: string) { return this.upload(await this.db.prepare("SELECT * FROM uploads WHERE account_id = ?1 AND idempotency_key = ?2").bind(accountId, idempotencyKey).first()); }
  async createUpload(upload: UploadRecord) { await this.db.prepare("INSERT INTO uploads(upload_id,account_id,site_id,revision,source_path,title,idempotency_key,format_version,chunk_protocol_version,expected_chunk_count,expected_object_count,declared_bytes,status,created_at,expires_at,result_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)").bind(upload.uploadId, upload.accountId, upload.siteId, upload.revision, upload.sourcePath, upload.title, upload.idempotencyKey, upload.formatVersion, upload.chunkProtocolVersion, upload.expectedChunkCount, upload.expectedObjectCount, upload.declaredBytes, upload.status, upload.createdAt, upload.expiresAt, null).run(); }
  async getUpload(uploadId: string) { return this.upload(await this.db.prepare("SELECT * FROM uploads WHERE upload_id = ?1").bind(uploadId).first()); }
  async putUploadChunk(input: { upload: UploadRecord; object: Omit<UploadObjectRecord, "uploadId" | "objectId" | "byteSize">; chunkIndex: number; byteLength: number; bytes: Uint8Array }) {
    let object = this.uploadObject(await this.db.prepare("SELECT * FROM upload_objects WHERE upload_id = ?1 AND path = ?2").bind(input.upload.uploadId, input.object.path).first());
    if (object && (object.kind !== input.object.kind || object.contentType !== input.object.contentType || object.encoding !== input.object.encoding || object.chunkCount !== input.object.chunkCount)) throw new ServiceError(409, "CONFLICT", "Upload object metadata conflict");
    if (!object) {
      object = { uploadId: input.upload.uploadId, objectId: randomId(16), ...input.object, byteSize: 0 };
      await this.db.prepare("INSERT INTO upload_objects(upload_id,object_id,kind,path,content_type,encoding,chunk_count,byte_size) VALUES (?1,?2,?3,?4,?5,?6,?7,0)").bind(object.uploadId, object.objectId, object.kind, object.path, object.contentType, object.encoding, object.chunkCount).run();
    }
    const existing = await this.db.prepare("SELECT * FROM upload_chunks WHERE upload_id = ?1 AND object_id = ?2 AND chunk_index = ?3").bind(input.upload.uploadId, object.objectId, input.chunkIndex).first<Record<string, unknown>>();
    const key = existing?.r2_key ? String(existing.r2_key) : this.r2Key(input.upload, object.objectId, input.chunkIndex);
    if (existing) {
      const current = this.bucket
        ? await this.readR2Chunk(key, "Stored upload object is missing")
        : this.d1ChunkBytes(existing, "Stored upload object is missing");
      if (!bytesEqual(current, input.bytes)) throw new ServiceError(409, "CONFLICT", "Upload chunk conflict");
    } else {
      if (!this.bucket && object.byteSize + input.byteLength > D1_ONLY_MAX_OBJECT_BYTES) {
        throw new ServiceError(413, "OBJECT_TOO_LARGE", `Individual files must be ${D1_ONLY_MAX_OBJECT_BYTES / 1_000_000} MB or smaller for D1-only deployment`);
      }
      try {
        if (this.bucket) await this.bucket.put(key, input.bytes);
        const chunkStatement = this.bucket
          ? this.db.prepare("INSERT INTO upload_chunks(upload_id,object_id,chunk_index,r2_key,byte_length) VALUES (?1,?2,?3,?4,?5)").bind(input.upload.uploadId, object.objectId, input.chunkIndex, key, input.byteLength)
          : this.db.prepare("INSERT INTO upload_chunks(upload_id,object_id,chunk_index,r2_key,byte_length,data) VALUES (?1,?2,?3,?4,?5,?6)").bind(input.upload.uploadId, object.objectId, input.chunkIndex, key, input.byteLength, input.bytes.slice());
        await this.db.batch([
          chunkStatement,
          this.db.prepare("UPDATE upload_objects SET byte_size = byte_size + ?1 WHERE upload_id = ?2 AND object_id = ?3").bind(input.byteLength, input.upload.uploadId, object.objectId),
        ]);
      } catch (error) {
        await this.bucket?.delete(key).catch(() => undefined);
        throw error;
      }
      object.byteSize += input.byteLength;
    }
    const count = await this.db.prepare("SELECT COUNT(*) AS count FROM upload_chunks WHERE upload_id = ?1 AND object_id = ?2").bind(input.upload.uploadId, object.objectId).first<Record<string, unknown>>();
    return { object, chunk: { uploadId: input.upload.uploadId, objectId: object.objectId, chunkIndex: input.chunkIndex, byteLength: input.byteLength, bytes: input.bytes.slice() }, receivedChunks: Number(count?.count || 0) };
  }
  async listUploadObjects(uploadId: string) { const result = await this.db.prepare("SELECT * FROM upload_objects WHERE upload_id = ?1 ORDER BY path").bind(uploadId).all<Record<string, unknown>>(); return (result.results || []).map((row) => this.uploadObject(row)!); }
  async listUploadChunks(uploadId: string, objectId: string) {
    const result = await this.db.prepare("SELECT * FROM upload_chunks WHERE upload_id = ?1 AND object_id = ?2 ORDER BY chunk_index").bind(uploadId, objectId).all<Record<string, unknown>>();
    const chunks: UploadChunkRecord[] = [];
    for (const row of result.results || []) {
      const bytes = this.bucket
        ? await this.readR2Chunk(String(row.r2_key), "Stored upload object is missing")
        : this.d1ChunkBytes(row, "Stored upload object is missing");
      chunks.push({ uploadId, objectId, chunkIndex: Number(row.chunk_index), byteLength: Number(row.byte_length), bytes });
    }
    return chunks;
  }
  async commitUpload(uploadId: string, input: CommitUploadInput) {
    const upload = await this.getUpload(uploadId);
    if (!upload) throw new ServiceError(404, "NOT_FOUND", "Upload not found");
    const previous = await this.db.prepare("SELECT * FROM sites WHERE site_id = ?1").bind(upload.siteId).first<Record<string, unknown>>();
    const oldKeys = previous ? await this.db.prepare("SELECT r2_key FROM object_chunks WHERE site_id = ?1").bind(upload.siteId).all<{ r2_key: string }>() : { results: [] };
    const paths = (await this.listUploadObjects(uploadId)).map((object) => object.path).sort();
    const resultJson = JSON.stringify({ siteId: upload.siteId, revision: upload.revision, uploadedPaths: paths });
    const statements = [
      this.db.prepare("INSERT INTO sites(site_id,account_id,title,source_path,current_revision,byte_size,object_count,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(site_id) DO UPDATE SET title=excluded.title,source_path=excluded.source_path,current_revision=excluded.current_revision,byte_size=excluded.byte_size,object_count=excluded.object_count,updated_at=excluded.updated_at").bind(upload.siteId, upload.accountId, upload.title, upload.sourcePath, upload.revision, input.byteSize, input.objectCount, input.now, input.now),
      this.db.prepare("INSERT OR IGNORE INTO revisions(site_id,revision,created_at) VALUES (?1,?2,?3)").bind(upload.siteId, upload.revision, input.now),
      this.db.prepare("INSERT OR IGNORE INTO objects(site_id,revision,object_id,kind,path,content_type,encoding,chunk_count,byte_size) SELECT ?1,?2,object_id,kind,path,content_type,encoding,chunk_count,byte_size FROM upload_objects WHERE upload_id = ?3").bind(upload.siteId, upload.revision, uploadId),
      (this.bucket
        ? this.db.prepare("INSERT OR IGNORE INTO object_chunks(site_id,revision,object_id,chunk_index,r2_key,byte_length) SELECT ?1,?2,object_id,chunk_index,r2_key,byte_length FROM upload_chunks WHERE upload_id = ?3")
        : this.db.prepare("INSERT OR IGNORE INTO object_chunks(site_id,revision,object_id,chunk_index,r2_key,byte_length,data) SELECT ?1,?2,object_id,chunk_index,r2_key,byte_length,data FROM upload_chunks WHERE upload_id = ?3")).bind(upload.siteId, upload.revision, uploadId),
      this.db.prepare("DELETE FROM object_chunks WHERE site_id = ?1 AND revision <> ?2").bind(upload.siteId, upload.revision),
      this.db.prepare("DELETE FROM objects WHERE site_id = ?1 AND revision <> ?2").bind(upload.siteId, upload.revision),
      this.db.prepare("DELETE FROM revisions WHERE site_id = ?1 AND revision <> ?2").bind(upload.siteId, upload.revision),
      this.db.prepare("UPDATE uploads SET status='committed', result_json=?1 WHERE upload_id=?2 AND status='open'").bind(resultJson, uploadId),
      this.db.prepare("DELETE FROM upload_chunks WHERE upload_id = ?1").bind(uploadId),
      this.db.prepare("DELETE FROM upload_objects WHERE upload_id = ?1").bind(uploadId),
    ];
    await this.db.batch(statements);
    await this.deleteKeys((oldKeys.results || []).map((row) => row.r2_key));
    return (await this.getSite(upload.accountId, upload.siteId))!;
  }
  async expireUploads(now: string) {
    const rows = await this.db.prepare("SELECT upload_id FROM uploads WHERE status='open' AND expires_at <= ?1").bind(now).all<{ upload_id: string }>();
    if ((rows.results || []).length === 0) return 0;
    const ids = (rows.results || []).map((row) => row.upload_id);
    const keys = await this.db.prepare(`SELECT r2_key FROM upload_chunks WHERE upload_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<{ r2_key: string }>();
    await this.db.batch(ids.map((id) => this.db.prepare("DELETE FROM uploads WHERE upload_id = ?1 AND status='open'").bind(id)));
    await this.deleteKeys((keys.results || []).map((row) => row.r2_key));
    return ids.length;
  }
  async getViewerObject(siteId: string, path: string): Promise<ViewerObject | undefined> {
    const site = this.site(await this.db.prepare("SELECT * FROM sites WHERE site_id = ?1").bind(siteId).first());
    if (!site) return undefined;
    const object = this.publishedObject(await this.db.prepare("SELECT * FROM objects WHERE site_id = ?1 AND revision = ?2 AND path = ?3").bind(siteId, site.currentRevision, path).first(), siteId, site.currentRevision);
    if (!object) return undefined;
    const rows = await this.db.prepare("SELECT * FROM object_chunks WHERE site_id = ?1 AND revision = ?2 AND object_id = ?3 ORDER BY chunk_index").bind(siteId, site.currentRevision, object.objectId).all<Record<string, unknown>>();
    const bucket = this.bucket;
    const chunkRows = rows.results || [];
    const chunks = (async function* () {
      for (const row of chunkRows) {
        if (!bucket) {
          yield d1BlobBytes(row.data, "Stored published object is missing");
          continue;
        }
        const stored = await bucket.get(String(row.r2_key));
        if (!stored) throw new ServiceError(500, "INTERNAL_ERROR", "Stored published object is missing");
        if (stored.body) {
          const reader = stored.body.getReader();
          while (true) { const next = await reader.read(); if (next.done) break; if (next.value) yield next.value; }
        } else {
          yield new Uint8Array(await stored.arrayBuffer());
        }
      }
    })();
    return { site, object: { ...object, siteId, revision: site.currentRevision }, chunks };
  }
  async cleanupOrphanedObjects(_now: string) {
    const old = await this.db.prepare("SELECT oc.r2_key FROM object_chunks oc JOIN sites s ON s.site_id = oc.site_id WHERE oc.revision <> s.current_revision").all<{ r2_key: string }>();
    const expired = await this.db.prepare("SELECT uc.r2_key FROM upload_chunks uc JOIN uploads u ON u.upload_id = uc.upload_id WHERE u.status='expired'").all<{ r2_key: string }>();
    const keys = [...(old.results || []), ...(expired.results || [])].map((row) => row.r2_key);
    const listed = this.bucket?.list ? await this.bucket.list({ prefix: "tenants/" }) : undefined;
    if (listed) {
      const active = await this.db.prepare("SELECT r2_key FROM object_chunks UNION SELECT uc.r2_key FROM upload_chunks uc JOIN uploads u ON u.upload_id=uc.upload_id WHERE u.status='open'").all<{ r2_key: string }>();
      const activeKeys = new Set((active.results || []).map((row) => row.r2_key));
      for (const object of listed.objects || []) if (!activeKeys.has(object.key)) keys.push(object.key);
    }
    await this.db.batch([
      this.db.prepare("DELETE FROM object_chunks WHERE EXISTS (SELECT 1 FROM sites s WHERE s.site_id=object_chunks.site_id AND object_chunks.revision <> s.current_revision)"),
      this.db.prepare("DELETE FROM upload_chunks WHERE upload_id IN (SELECT upload_id FROM uploads WHERE status='expired')"),
      this.db.prepare("DELETE FROM upload_objects WHERE upload_id IN (SELECT upload_id FROM uploads WHERE status='expired')"),
      this.db.prepare("DELETE FROM uploads WHERE status='expired'"),
    ]);
    const uniqueKeys = [...new Set(keys)];
    await this.deleteKeys(uniqueKeys);
    return uniqueKeys.length;
  }

  async createDeviceAuthorization(record: DeviceAuthorizationRecord) { await this.db.prepare("INSERT INTO device_authorizations(id,device_code_hash,status,created_at,expires_at,token_name) VALUES (?1,?2,?3,?4,?5,?6)").bind(record.id, record.deviceCodeHash, record.status, record.createdAt, record.expiresAt, record.tokenName || null).run(); }
  async getDeviceAuthorization(deviceCodeHash: string) { return this.device(await this.db.prepare("SELECT * FROM device_authorizations WHERE device_code_hash = ?1").bind(deviceCodeHash).first()); }
  async approveDeviceAuthorization(deviceCodeHash: string, accountId: string, _tokenId: string, tokenName: string, now = new Date().toISOString()) { const result = await this.db.prepare("UPDATE device_authorizations SET account_id=?1,status='approved',token_name=?2 WHERE device_code_hash=?3 AND status='pending' AND expires_at > ?4").bind(accountId, tokenName, deviceCodeHash, now).run(); return Number(result.meta?.changes || 0) === 1; }
  async consumeApprovedDeviceAuthorization(deviceCodeHash: string) {
    const now = new Date().toISOString();
    const result = await this.db.prepare("UPDATE device_authorizations SET consumed_at=?1 WHERE device_code_hash=?2 AND status='approved' AND consumed_at IS NULL").bind(now, deviceCodeHash).run();
    if (Number(result.meta?.changes || 0) !== 1) return undefined;
    return this.device(await this.db.prepare("SELECT * FROM device_authorizations WHERE device_code_hash = ?1").bind(deviceCodeHash).first());
  }

  async isBootstrapConsumed() { const row = await this.db.prepare("SELECT consumed_at FROM bootstrap_state WHERE id=1").first<Record<string, unknown>>(); return Boolean(row?.consumed_at); }
  async consumeBootstrap(now: string) { const result = await this.db.prepare("UPDATE bootstrap_state SET consumed_at=?1 WHERE id=1 AND consumed_at IS NULL").bind(now).run(); return Number(result.meta?.changes || 0) === 1; }

  private async deleteKeys(keys: string[]) { if (keys.length > 0 && this.bucket) await this.bucket.delete(keys); }
  private async readR2Chunk(key: string, message: string) {
    const stored = await this.bucket!.get(key);
    if (!stored) throw new ServiceError(500, "INTERNAL_ERROR", message);
    return new Uint8Array(await stored.arrayBuffer());
  }
  private d1ChunkBytes(row: Record<string, unknown>, message: string) { return d1BlobBytes(row.data, message); }
  private r2Key(upload: UploadRecord, objectId: string, chunkIndex: number) { return `tenants/${upload.accountId || this.tenantId}/sites/${upload.siteId}/revisions/${upload.revision}/objects/${objectId}/chunks/${chunkIndex}`; }
  private account(row: Record<string, unknown> | null | undefined): AccountRecord | undefined { return row ? { id: String(row.id), email: String(row.email), passwordHash: String(row.password_hash), createdAt: String(row.created_at) } : undefined; }
  private recovery(row: Record<string, unknown> | null | undefined): RecoveryCodeRecord | undefined { return row ? { id: String(row.id), accountId: String(row.account_id), codeHash: String(row.code_hash), createdAt: String(row.created_at), usedAt: row.used_at ? String(row.used_at) : undefined } : undefined; }
  private session(row: Record<string, unknown> | null | undefined): SessionRecord | undefined { return row ? { id: String(row.id), accountId: String(row.account_id), createdAt: String(row.created_at), expiresAt: String(row.expires_at) } : undefined; }
  private token(row: Record<string, unknown> | null | undefined): TokenRecord | undefined { return row ? { id: String(row.id), accountId: String(row.account_id), name: String(row.name), tokenHash: String(row.token_hash), scope: String(row.scope) as "publish:write", createdAt: String(row.created_at), lastUsedAt: row.last_used_at ? String(row.last_used_at) : undefined, expiresAt: row.expires_at ? String(row.expires_at) : undefined, revokedAt: row.revoked_at ? String(row.revoked_at) : undefined } : undefined; }
  private site(row: Record<string, unknown> | null | undefined): SiteRecord | undefined { return row ? { siteId: String(row.site_id), accountId: String(row.account_id), title: String(row.title), sourcePath: String(row.source_path), currentRevision: Number(row.current_revision), byteSize: Number(row.byte_size), objectCount: Number(row.object_count), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } : undefined; }
  private upload(row: Record<string, unknown> | null | undefined): UploadRecord | undefined { if (!row) return undefined; return { uploadId: String(row.upload_id), accountId: String(row.account_id), siteId: String(row.site_id), revision: Number(row.revision), sourcePath: String(row.source_path), title: String(row.title), idempotencyKey: String(row.idempotency_key), formatVersion: 1, chunkProtocolVersion: 2, expectedChunkCount: Number(row.expected_chunk_count), expectedObjectCount: Number(row.expected_object_count), declaredBytes: Number(row.declared_bytes), status: String(row.status) as UploadRecord["status"], createdAt: String(row.created_at), expiresAt: String(row.expires_at), result: row.result_json ? JSON.parse(String(row.result_json)) as PublishResultRecord : undefined }; }
  private uploadObject(row: Record<string, unknown> | null | undefined): UploadObjectRecord | undefined { return row ? { uploadId: String(row.upload_id), objectId: String(row.object_id), kind: String(row.kind) as "page" | "asset", path: String(row.path), contentType: String(row.content_type), encoding: String(row.encoding) as "utf8" | "base64", chunkCount: Number(row.chunk_count), byteSize: Number(row.byte_size) } : undefined; }
  private publishedObject(row: Record<string, unknown> | null | undefined, siteId: string, revision: number): PublishedObjectRecord | undefined { return row ? { siteId, revision, uploadId: "", objectId: String(row.object_id), kind: String(row.kind) as "page" | "asset", path: String(row.path), contentType: String(row.content_type), encoding: String(row.encoding) as "utf8" | "base64", chunkCount: Number(row.chunk_count), byteSize: Number(row.byte_size) } : undefined; }
  private device(row: Record<string, unknown> | null | undefined): DeviceAuthorizationRecord | undefined { return row ? { id: String(row.id), deviceCodeHash: String(row.device_code_hash), accountId: row.account_id ? String(row.account_id) : undefined, status: String(row.status) as DeviceAuthorizationRecord["status"], createdAt: String(row.created_at), expiresAt: String(row.expires_at), consumedAt: row.consumed_at ? String(row.consumed_at) : undefined, tokenName: row.token_name ? String(row.token_name) : undefined } : undefined; }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean { return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]); }
function d1BlobBytes(value: unknown, message: string): Uint8Array {
  // D1's Workers binding returns BLOBs as number[], not ArrayBuffer views.
  // Validate before conversion: Uint8Array.from would silently coerce bad data.
  if (Array.isArray(value)) {
    for (const byte of value) {
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new ServiceError(500, "INTERNAL_ERROR", message);
    }
    return Uint8Array.from(value);
  }
  if (value instanceof Uint8Array) return value.slice();
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  throw new ServiceError(500, "INTERNAL_ERROR", message);
}
