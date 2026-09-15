export type PublishEncoding = "utf8" | "base64";

export interface PublishPage {
  path: string;
  contentType: "text/html";
  body: string;
  encoding: "utf8";
}

export interface PublishAsset {
  path: string;
  contentType: string;
  body: string;
  encoding: PublishEncoding;
}

export interface PublishBundle {
  formatVersion: 1;
  sourcePath: string;
  title: string;
  pages: PublishPage[];
  assets: PublishAsset[];
}

export interface PublishRequest {
  siteId?: string;
  idempotencyKey: string;
  bundle: PublishBundle;
}

export interface PublishUploadStartRequest {
  siteId?: string;
  idempotencyKey: string;
  formatVersion: 1;
  sourcePath: string;
  title: string;
  chunkCount: number;
}

export interface PublishUploadStartResult {
  uploadId: string;
  siteId: string;
  revision: number;
}

export interface PublishUploadChunk {
  kind: "page" | "asset";
  path: string;
  contentType: string;
  encoding: PublishEncoding;
  chunkIndex: number;
  chunkCount: number;
  body: string;
}

export interface PublishUploadChunkRequest extends PublishUploadChunk {
  uploadId: string;
}

export interface PublishUploadChunkResult {
  uploadId: string;
  path: string;
  chunkIndex: number;
  receivedChunks: number;
}

export interface PublishUploadCommitRequest {
  uploadId: string;
}

export interface PublishResult {
  siteId: string;
  url: string;
  revision: number;
  uploadedPaths: string[];
}

export interface SiteRecord {
  siteId: string;
  title: string;
  sourcePath: string;
  currentRevision: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublishedObject {
  path: string;
  contentType: string;
  body: string;
  encoding: PublishEncoding;
}

export interface PublishedResponse {
  status: number;
  contentType: string;
  body: string;
}
