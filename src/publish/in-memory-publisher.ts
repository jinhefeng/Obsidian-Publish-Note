import { randomBytes } from "node:crypto";
import type {
  PublishBundle,
  PublishRequest,
  PublishResult,
  PublishedObject,
  PublishUploadChunkRequest,
  PublishUploadChunkResult,
  PublishUploadCommitRequest,
  PublishUploadStartRequest,
  PublishUploadStartResult,
  SiteRecord,
} from "../shared/contracts.ts";
import { normalizeRelativePath, siteUrl } from "../shared/paths.ts";

interface StoredSite {
  record: SiteRecord;
  revisions: Map<number, Map<string, PublishedObject>>;
}

interface UploadObject {
  kind: "page" | "asset";
  path: string;
  contentType: string;
  encoding: "utf8" | "base64";
  chunkCount: number;
  chunks: Map<number, string>;
}

interface UploadSession {
  uploadId: string;
  siteId: string;
  revision: number;
  sourcePath: string;
  title: string;
  formatVersion: 1;
  objects: Map<string, UploadObject>;
  result?: PublishResult;
}

export class InMemoryPublisher {
  private readonly baseUrl: string;
  private readonly sites = new Map<string, StoredSite>();
  private readonly idempotentResults = new Map<string, PublishResult>();
  private readonly uploadStarts = new Map<string, PublishUploadStartResult>();
  private readonly uploads = new Map<string, UploadSession>();

  constructor(baseUrl = "https://share.example.com") {
    this.baseUrl = baseUrl;
  }

  publish(request: PublishRequest): PublishResult {
    const existingResult = this.idempotentResults.get(request.idempotencyKey);
    if (existingResult) {
      return { ...existingResult, uploadedPaths: [...existingResult.uploadedPaths] };
    }

    validateBundle(request.bundle);
    const result = this.commitBundle(request.siteId, request.bundle);
    this.idempotentResults.set(request.idempotencyKey, result);
    return { ...result, uploadedPaths: [...result.uploadedPaths] };
  }

  startUpload(request: PublishUploadStartRequest): PublishUploadStartResult {
    const existing = this.uploadStarts.get(request.idempotencyKey);
    if (existing) return { ...existing };
    validateUploadStart(request);

    const siteId = request.siteId || this.allocateSiteId();
    const current = this.sites.get(siteId)?.record;
    const result = {
      uploadId: this.allocateUploadId(),
      siteId,
      revision: current ? current.currentRevision + 1 : 1,
    };
    this.uploadStarts.set(request.idempotencyKey, result);
    this.uploads.set(result.uploadId, {
      ...result,
      sourcePath: request.sourcePath,
      title: request.title,
      formatVersion: request.formatVersion,
      objects: new Map(),
    });
    return { ...result };
  }

  uploadChunk(request: PublishUploadChunkRequest): PublishUploadChunkResult {
    const session = this.uploads.get(request.uploadId);
    if (!session) throw new Error("Unknown upload session");
    if (request.kind !== "page" && request.kind !== "asset") {
      throw new Error("Upload chunk kind must be page or asset");
    }
    if (!Number.isInteger(request.chunkIndex) || request.chunkIndex < 0) {
      throw new Error("Upload chunk index must be a non-negative integer");
    }
    if (!Number.isInteger(request.chunkCount) || request.chunkCount < 1) {
      throw new Error("Upload chunk count must be a positive integer");
    }

    const path = normalizeRelativePath(request.path);
    const existing = session.objects.get(path);
    if (existing) {
      if (existing.kind !== request.kind || existing.contentType !== request.contentType || existing.encoding !== request.encoding || existing.chunkCount !== request.chunkCount) {
        throw new Error(`Upload object metadata conflict: ${path}`);
      }
    } else {
      session.objects.set(path, {
        kind: request.kind,
        path,
        contentType: request.contentType,
        encoding: request.encoding,
        chunkCount: request.chunkCount,
        chunks: new Map(),
      });
    }

    const object = session.objects.get(path)!;
    if (request.chunkIndex >= object.chunkCount) {
      throw new Error(`Upload chunk index out of range: ${request.chunkIndex}`);
    }
    const previous = object.chunks.get(request.chunkIndex);
    if (previous !== undefined && previous !== request.body) {
      throw new Error(`Upload chunk conflict: ${path}#${request.chunkIndex}`);
    }
    object.chunks.set(request.chunkIndex, request.body);
    return {
      uploadId: session.uploadId,
      path,
      chunkIndex: request.chunkIndex,
      receivedChunks: object.chunks.size,
    };
  }

  commitUpload(request: PublishUploadCommitRequest): PublishResult {
    const session = this.uploads.get(request.uploadId);
    if (!session) throw new Error("Unknown upload session");
    if (session.result) return { ...session.result, uploadedPaths: [...session.result.uploadedPaths] };

    const pages = [];
    const assets = [];
    for (const object of session.objects.values()) {
      if (object.chunks.size !== object.chunkCount || [...Array(object.chunkCount).keys()].some((index) => !object.chunks.has(index))) {
        throw new Error(`Upload object is incomplete: ${object.path}`);
      }
      const body = [...Array(object.chunkCount).keys()].map((index) => object.chunks.get(index)).join("");
      const value = {
        path: object.path,
        contentType: object.contentType,
        body,
        encoding: object.encoding,
      };
      if (object.kind === "page") pages.push(value);
      else assets.push(value);
    }

    const result = this.commitBundle(session.siteId, {
      formatVersion: session.formatVersion,
      sourcePath: session.sourcePath,
      title: session.title,
      pages,
      assets,
    });
    session.result = result;
    return { ...result, uploadedPaths: [...result.uploadedPaths] };
  }

  private commitBundle(siteId: string | undefined, bundle: PublishBundle): PublishResult {
    validateBundle(bundle);
    const resolvedSiteId = siteId || this.allocateSiteId();
    const now = new Date().toISOString();
    const existing = this.sites.get(resolvedSiteId);
    const revision = existing ? existing.record.currentRevision + 1 : 1;
    const objects = new Map<string, PublishedObject>();

    for (const page of bundle.pages) {
      objects.set(normalizeRelativePath(page.path), {
        path: normalizeRelativePath(page.path),
        contentType: page.contentType,
        body: page.body,
        encoding: page.encoding,
      });
    }
    for (const asset of bundle.assets) {
      objects.set(normalizeRelativePath(asset.path), {
        path: normalizeRelativePath(asset.path),
        contentType: asset.contentType,
        body: asset.body,
        encoding: asset.encoding,
      });
    }

    const record: SiteRecord = existing
      ? { ...existing.record, title: bundle.title, sourcePath: bundle.sourcePath, currentRevision: revision, updatedAt: now }
      : {
          siteId: resolvedSiteId,
          title: bundle.title,
          sourcePath: bundle.sourcePath,
          currentRevision: revision,
          createdAt: now,
          updatedAt: now,
        };

    const stored: StoredSite = existing || { record, revisions: new Map() };
    stored.record = record;
    stored.revisions.set(revision, objects);
    this.sites.set(resolvedSiteId, stored);

    const result: PublishResult = {
      siteId: resolvedSiteId,
      url: siteUrl(resolvedSiteId, this.baseUrl),
      revision,
      uploadedPaths: [...objects.keys()].sort(),
    };
    return result;
  }

  getCurrentObject(siteId: string, path: string): PublishedObject | undefined {
    const site = this.sites.get(siteId);
    if (!site) return undefined;
    const revision = site.revisions.get(site.record.currentRevision);
    return revision?.get(normalizeRelativePath(path));
  }

  getSite(siteId: string): SiteRecord | undefined {
    const record = this.sites.get(siteId)?.record;
    return record ? { ...record } : undefined;
  }

  private allocateSiteId(): string {
    let siteId = "";
    do {
      siteId = randomBytes(16).toString("base64url");
    } while (this.sites.has(siteId));
    return siteId;
  }

  private allocateUploadId(): string {
    let uploadId = "";
    do {
      uploadId = randomBytes(12).toString("base64url");
    } while (this.uploads.has(uploadId));
    return uploadId;
  }
}

function validateBundle(bundle: PublishBundle): void {
  if (!bundle || bundle.formatVersion !== 1) {
    throw new Error("Unsupported PublishBundle formatVersion");
  }
  if (!String(bundle.sourcePath || "").trim() || !String(bundle.title || "").trim()) {
    throw new Error("PublishBundle sourcePath and title are required");
  }
  if (!Array.isArray(bundle.pages) || !Array.isArray(bundle.assets)) {
    throw new Error("PublishBundle pages and assets are required");
  }
  if (bundle.pages.length === 0) {
    throw new Error("PublishBundle must contain at least one page");
  }
}

function validateUploadStart(request: PublishUploadStartRequest): void {
  if (request.formatVersion !== 1) throw new Error("Unsupported PublishBundle formatVersion");
  if (!String(request.sourcePath || "").trim() || !String(request.title || "").trim()) {
    throw new Error("Publish upload sourcePath and title are required");
  }
  if (!Number.isInteger(request.chunkCount) || request.chunkCount < 1) {
    throw new Error("Publish upload must contain at least one chunk");
  }
  if (!String(request.idempotencyKey || "").trim()) {
    throw new Error("Publish upload idempotencyKey is required");
  }
}
