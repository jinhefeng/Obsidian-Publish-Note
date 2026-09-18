export interface AccountRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface RecoveryCodeRecord {
  id: string;
  accountId: string;
  codeHash: string;
  createdAt: string;
  usedAt?: string;
}

export interface SessionRecord {
  id: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
}

export interface TokenRecord {
  id: string;
  accountId: string;
  name: string;
  tokenHash: string;
  scope: "publish:write";
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

export interface SiteRecord {
  siteId: string;
  accountId: string;
  title: string;
  sourcePath: string;
  currentRevision: number;
  byteSize: number;
  objectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UploadRecord {
  uploadId: string;
  accountId: string;
  siteId: string;
  revision: number;
  sourcePath: string;
  title: string;
  idempotencyKey: string;
  formatVersion: 1;
  chunkProtocolVersion: 2;
  expectedChunkCount: number;
  expectedObjectCount: number;
  declaredBytes: number;
  status: "open" | "committed" | "expired";
  createdAt: string;
  expiresAt: string;
  result?: PublishResultRecord;
}

export interface UploadObjectRecord {
  uploadId: string;
  objectId: string;
  kind: "page" | "asset";
  path: string;
  contentType: string;
  encoding: "utf8" | "base64";
  chunkCount: number;
  byteSize: number;
}

export interface UploadChunkRecord {
  uploadId: string;
  objectId: string;
  chunkIndex: number;
  byteLength: number;
  bytes: Uint8Array;
}

export interface PublishedObjectRecord extends UploadObjectRecord {
  siteId: string;
  revision: number;
}

export interface ViewerObject {
  site: SiteRecord;
  object: PublishedObjectRecord;
  chunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>;
}

export interface DeviceAuthorizationRecord {
  id: string;
  deviceCodeHash: string;
  accountId?: string;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  tokenId?: string;
  tokenName?: string;
}

export interface PublishResultRecord {
  siteId: string;
  revision: number;
  uploadedPaths: string[];
}

export interface CommitUploadInput {
  byteSize: number;
  objectCount: number;
  now: string;
  publicBaseUrl: string;
}

export interface StorageUsage {
  bytes: number;
  siteCount: number;
}
