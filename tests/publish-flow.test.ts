import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { createLocalPublishServer } from "../scripts/local-publish-server.ts";
import { compileNote, compileShare } from "../src/compiler/site-compiler.ts";
import { InMemoryPublisher } from "../src/publish/in-memory-publisher.ts";
import { serveLocalSite } from "../src/publish/local-viewer.ts";
import { normalizeLinkedPageDepth, shouldFollowLinkedPage } from "../src/shared/link-depth.ts";
import { createUploadChunks } from "../src/shared/upload-queue.ts";

test("publishes a note and serves it through the site URL", () => {
  const bundle = compileShare({
    root: {
      sourcePath: "Guides/Getting Started.md",
      title: "Getting Started",
      markdown: "# Welcome\n\nThis is **published** from Obsidian.\n\nSee [[Architecture]].",
    },
    relatedNotes: [{
      sourcePath: "Reference/Architecture.md",
      markdown: "# Architecture",
    }],
  });
  const publisher = new InMemoryPublisher();

  const result = publisher.publish({ idempotencyKey: "first-publish", bundle });
  const response = serveLocalSite(publisher, result.siteId, `/s/${result.siteId}/`);
  const relatedResponse = serveLocalSite(publisher, result.siteId, `/s/${result.siteId}/page-1.html`);

  assert.match(result.siteId, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(result.revision, 1);
  assert.equal(result.url, `https://share.example.com/s/${result.siteId}`);
  assert.deepEqual(result.uploadedPaths, ["index.html", "page-1.html"]);
  assert.equal(response.status, 200);
  assert.equal(relatedResponse.status, 200);
  assert.match(response.body, /<h1>Welcome<\/h1>/);
  assert.match(response.body, /<details class="heading-section heading-level-1" open><summary><h1>Welcome<\/h1><\/summary>/);
  assert.match(response.body, /<header class="page-title"><h1>Getting Started<\/h1><\/header>/);
  assert.match(response.body, /<strong>published<\/strong>/);
  assert.match(response.body, /href="\.\/page-1\.html"/);
});

test("plugin exposes direct desktop Cloudflare deployment while keeping official connection out of settings", () => {
  const source = readFileSync(new URL("../plugin/main.js", import.meta.url), "utf8");
  assert.match(source, /Deploy to my Cloudflare/);
  assert.match(source, /部署到我的 Cloudflare/);
  assert.match(source, /cloudflareMode/);
  assert.match(source, /Authorization Code/);
  assert.match(source, /CLOUDFLARE_OAUTH_REDIRECT_URI/);
  assert.match(source, /127\.0\.0\.1/);
  assert.match(source, /desktopDeploymentOnly/);
  assert.match(source, /provisionPersonalCloudflare/);
  assert.match(source, /async disconnectCloudflare\(\)/);
  assert.match(source, /copy\.disconnectCloudflare/);
  assert.match(source, /deploymentWorkerUrl: ""/);
  assert.match(source, /if \(hasPersonal\) cloudflareSetting\.addButton/);
  assert.doesNotMatch(source, /\.setName\(copy\.connectOfficialCloudflare\)/);
  assert.match(source, /if \(this\.plugin\.settings\.debugMode && deploymentLogs\.length\)/);
  assert.match(source, /if \(this\.plugin\.settings\.debugMode\) \{/);
  assert.ok(source.indexOf(".setName(copy.debugMode)") > source.indexOf(".setName(copy.nativeRenderer)"));
  assert.ok(source.indexOf(".setName(copy.debugMode)") < source.indexOf(".setName(copy.repository)"));
  assert.match(source, /deploymentManaged/);
  assert.doesNotMatch(source, /\/v1\/cloudflare\/provision\//);
  assert.doesNotMatch(source, /\.setName\(copy\.serviceUrl\)/);
  assert.doesNotMatch(source, /\.setName\(copy\.accessToken\)/);
  assert.doesNotMatch(source, /CF_API_TOKEN|CF_OAUTH_CLIENT_SECRET|clientSecret/);
});

test("retries are idempotent and updates keep the same site URL", () => {
  const publisher = new InMemoryPublisher();
  const firstBundle = compileNote({ sourcePath: "Notes/Release.md", markdown: "# Version 1" });
  const firstRequest = { idempotencyKey: "release-1", bundle: firstBundle };
  const first = publisher.publish(firstRequest);
  const retry = publisher.publish(firstRequest);

  assert.deepEqual(retry, first);
  assert.equal(publisher.getSite(first.siteId)?.currentRevision, 1);
  assert.match(first.siteId, /^[A-Za-z0-9_-]{22}$/);

  const updatedBundle = compileNote({ sourcePath: "Notes/Release.md", markdown: "# Version 2" });
  const updated = publisher.publish({ siteId: first.siteId, idempotencyKey: "release-2", bundle: updatedBundle });
  const response = serveLocalSite(publisher, first.siteId);

  assert.equal(updated.siteId, first.siteId);
  assert.equal(updated.url, first.url);
  assert.equal(updated.revision, 2);
  assert.equal(publisher.getSite(first.siteId)?.currentRevision, 2);
  assert.match(response.body, /<h1>Version 2<\/h1>/);
  assert.match(response.body, /<h1>Release<\/h1>/);
});

test("rejects unsafe resource paths and unknown sites cleanly", () => {
  const publisher = new InMemoryPublisher();
  const bundle = compileNote({ sourcePath: "Notes/Safe.md", markdown: "Safe" });
  bundle.pages[0].path = "../escape.html";

  assert.throws(
    () => publisher.publish({ idempotencyKey: "unsafe", bundle }),
    /Invalid relative path/,
  );

  const response = serveLocalSite(publisher, "missing-site");
  assert.equal(response.status, 404);
});

test("reports oversized HTTP publish requests with a 413 response", async () => {
  const { server } = createLocalPublishServer({ maxBodyBytes: 64 });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/sites`, {
      method: "POST",
      headers: { authorization: "Bearer dev-token", "content-type": "application/json" },
      body: "x".repeat(128),
    });
    const payload = await response.json();

    assert.equal(response.status, 413);
    assert.match(payload.error, /Request body too large/);
    assert.match(payload.error, /64 bytes/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("uploads pages and assets as queued chunks before atomically committing", () => {
  const bundle = compileNote({
    sourcePath: "Notes/Queued.md",
    markdown: "# Queued\n\n" + "内容 😀 ".repeat(8),
    assets: [{
      sourcePath: "assets/large.bin",
      path: "assets/large.bin",
      contentType: "application/octet-stream",
      body: "MTIzNDU2Nzg5MA==",
      encoding: "base64",
    }],
  });
  const chunks = createUploadChunks(bundle, 7);
  const publisher = new InMemoryPublisher();
  const upload = publisher.startUpload({
    idempotencyKey: "queued-upload",
    formatVersion: 1,
    sourcePath: bundle.sourcePath,
    title: bundle.title,
    chunkCount: chunks.length,
    chunkProtocolVersion: 2,
    objectCount: bundle.pages.length + bundle.assets.length,
    totalBytes: chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
  });

  for (const [index, chunk] of chunks.entries()) {
    const uploaded = publisher.uploadChunk({ uploadId: upload.uploadId, ...chunk });
    assert.equal(uploaded.receivedChunks, chunk.chunkIndex + 1);
    assert.deepEqual(publisher.uploadChunk({ uploadId: upload.uploadId, ...chunk }), uploaded);
  }
  const result = publisher.commitUpload({ uploadId: upload.uploadId });
  const retry = publisher.commitUpload({ uploadId: upload.uploadId });

  assert.deepEqual(retry, result);
  assert.deepEqual(result.uploadedPaths, ["assets/large.bin", "index.html"]);
  assert.match(serveLocalSite(publisher, result.siteId).body, /Queued/);
  assert.equal(publisher.getCurrentObject(result.siteId, "assets/large.bin")?.body, "MTIzNDU2Nzg5MA==");
});

test("exposes the queued upload lifecycle through the local HTTP API", async () => {
  const { server } = createLocalPublishServer({ maxBodyBytes: 1_000_000 });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const bundle = compileNote({ sourcePath: "Notes/HttpQueued.md", markdown: "# HTTP queued" });
  const chunks = createUploadChunks(bundle, 9);
  const request = async (path, method, payload) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { authorization: "Bearer dev-token", "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { response, payload: await response.json() };
  };

  try {
    const started = await request("/v1/sites/uploads", "POST", {
      idempotencyKey: "http-queued-upload",
      formatVersion: 1,
      sourcePath: bundle.sourcePath,
      title: bundle.title,
      chunkCount: chunks.length,
      chunkProtocolVersion: 2,
      objectCount: bundle.pages.length + bundle.assets.length,
      totalBytes: chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
    });
    assert.equal(started.response.status, 200);
    for (const chunk of chunks) {
      const uploaded = await request(`/v1/uploads/${started.payload.uploadId}/chunks`, "POST", {
        uploadId: started.payload.uploadId,
        ...chunk,
      });
      assert.equal(uploaded.response.status, 200);
    }
    const committed = await request(`/v1/uploads/${started.payload.uploadId}/commit`, "POST", { uploadId: started.payload.uploadId });
    assert.equal(committed.response.status, 200);
    const page = await fetch(`${baseUrl}/s/${committed.payload.siteId}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /HTTP queued/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("keeps the previous revision when a queued upload is incomplete", () => {
  const publisher = new InMemoryPublisher();
  const first = publisher.publish({ idempotencyKey: "atomic-first", bundle: compileNote({ sourcePath: "Notes/Atomic.md", markdown: "# First" }) });
  const updateBundle = compileNote({ sourcePath: "Notes/Atomic.md", markdown: "# Second" });
  const chunks = createUploadChunks(updateBundle, 3);
  const upload = publisher.startUpload({
    siteId: first.siteId,
    idempotencyKey: "atomic-update",
    formatVersion: 1,
    sourcePath: updateBundle.sourcePath,
    title: updateBundle.title,
    chunkCount: chunks.length,
    chunkProtocolVersion: 2,
    objectCount: updateBundle.pages.length + updateBundle.assets.length,
    totalBytes: chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
  });

  publisher.uploadChunk({ uploadId: upload.uploadId, ...chunks[0] });
  assert.throws(() => publisher.commitUpload({ uploadId: upload.uploadId }), /incomplete/);
  assert.match(serveLocalSite(publisher, first.siteId).body, /First/);
  assert.equal(publisher.getSite(first.siteId)?.currentRevision, 1);
});

test("normalizes linked-page depth with direct-link semantics", () => {
  assert.equal(normalizeLinkedPageDepth(undefined), 1);
  assert.equal(normalizeLinkedPageDepth("0"), 0);
  assert.equal(normalizeLinkedPageDepth("3"), 3);
  assert.equal(normalizeLinkedPageDepth("invalid"), 1);
  assert.equal(normalizeLinkedPageDepth(""), 1);
  assert.equal(shouldFollowLinkedPage(0, 1), true);
  assert.equal(shouldFollowLinkedPage(1, 1), false);
  assert.equal(shouldFollowLinkedPage(2, 3), true);
  assert.equal(shouldFollowLinkedPage(0, 0), false);
});

test("traverses linked notes only through the configured depth and ignores external Markdown URLs", async () => {
  const pluginModule = { exports: {} };
  const obsidian = {
    Plugin: class { constructor(app) { this.app = app; } },
    Notice: class {},
    PluginSettingTab: class {},
    Setting: class {},
    requestUrl: async () => ({ status: 200, json: {} }),
    openExternal: () => {},
    MarkdownRenderer: {},
    Component: class {},
  };
  const pluginSource = readFileSync(new URL("../plugin/main.js", import.meta.url), "utf8");
  vm.runInNewContext(`(function(require, module, exports) {\n${pluginSource}\n})(require, module, module.exports);`, {
    require: (request) => {
      if (request === "obsidian") return obsidian;
      throw new Error(`Unexpected plugin dependency: ${request}`);
    },
    module: pluginModule,
    console,
  });
  const PluginClass = pluginModule.exports;

  const markdown = {
    "Notes/A.md": "[[B]] [external](https://example.com/C.md)",
    "Notes/B.md": "[[C]] [[A]]",
    "Notes/C.md": "[[D]]",
    "Notes/D.md": "",
  };
  const files = new Map(Object.keys(markdown).map((filePath) => {
    const basename = filePath.split("/").pop().replace(/\.md$/i, "");
    return [filePath, { path: filePath, basename, extension: "md", parent: { path: "Notes" } }];
  }));
  const resolve = (reference) => {
    const clean = reference.replace(/\.md$/i, "");
    return files.get(`Notes/${clean}.md`) || [...files.values()].find((file) => file.basename.toLowerCase() === clean.toLowerCase()) || null;
  };
  const app = {
    metadataCache: {
      getFileCache: () => ({ links: [] }),
      getFirstLinkpathDest: (reference) => resolve(reference),
    },
    vault: {
      read: async (file) => markdown[file.path],
      getAbstractFileByPath: (filePath) => files.get(filePath) || null,
    },
  };
  const plugin = new PluginClass(app, {});
  const root = files.get("Notes/A.md");

  const loadSettings = async (stored) => {
    const instance = new PluginClass(app, {});
    instance.loadData = async () => stored;
    await instance.loadSettings();
    return instance.settings;
  };
  assert.equal((await loadSettings({})).cloudflareMode, "self");
  assert.equal((await loadSettings({})).apiBaseUrl, "");
  assert.equal((await loadSettings({})).publishToken, "");
  assert.equal((await loadSettings({})).linkedPageDepth, 1);
  assert.equal((await loadSettings({ includeLinkedPages: false })).linkedPageDepth, 0);
  assert.equal((await loadSettings({ includeLinkedPages: true })).linkedPageDepth, 1);
  assert.equal((await loadSettings({ linkedPageDepth: 3 })).linkedPageDepth, 3);

  let savedAfterDisconnect;
  plugin.settings = { language: "en" };
  plugin.loadData = async () => ({
    cloudflareMode: "self",
    deploymentManaged: true,
    apiBaseUrl: "https://publish.example.workers.dev",
    serviceUrl: "https://publish.example.workers.dev",
    publishToken: "pn_legacy-token",
    selfPublishToken: "pn_saved-token",
    deploymentWorkerUrl: "https://publish.example.workers.dev",
    lastPublishedUrl: "https://publish.example.workers.dev/s/site-id/",
  });
  plugin.saveData = async (value) => { savedAfterDisconnect = value; };
  await plugin.disconnectCloudflare();
  assert.equal(savedAfterDisconnect.deploymentWorkerUrl, "");
  assert.equal(savedAfterDisconnect.selfPublishToken, "");
  assert.equal(savedAfterDisconnect.publishToken, "");
  assert.equal(savedAfterDisconnect.lastPublishedUrl, "https://publish.example.workers.dev/s/site-id/");
  assert.equal(JSON.parse(savedAfterDisconnect.connectionProfiles).self, null);

  for (const [depth, expected] of [[0, ["A"]], [1, ["A", "B"]], [2, ["A", "B", "C"]], [3, ["A", "B", "C", "D"]]]) {
    plugin.settings = { linkedPageDepth: depth };
    const notes = await plugin.collectShareNotes(root, markdown[root.path]);
    assert.equal(notes.map((note) => note.title).join("|"), expected.join("|"));
    assert.equal(new Set(notes.map((note) => note.sourcePath)).size, notes.length);
  }
});

test("preserves external links, anchors, and external assets in the published HTML", () => {
  const bundle = compileShare({
    root: {
      sourcePath: "Notes/External.md",
      markdown: [
        "[Guide](https://example.com/guide.md)",
        "[Mail](mailto:hello@example.com)",
        "[Section](#details)",
        "![Logo](https://cdn.example.com/logo.png)",
      ].join("\n\n"),
    },
  });
  const html = bundle.pages[0].body;

  assert.equal(bundle.pages.length, 1);
  assert.match(html, /href="https:\/\/example\.com\/guide\.md"/);
  assert.match(html, /href="mailto:hello@example\.com"/);
  assert.match(html, /href="#details"/);
  assert.match(html, /src="https:\/\/cdn\.example\.com\/logo\.png"/);
  assert.doesNotMatch(html, /internal-link-unpublished/);
});

test("renders Obsidian callouts, tables, tasks, embeds, and local assets", () => {
  const bundle = compileNote({
    sourcePath: "Guides/Rendering.md",
    markdown: [
      "> [!NOTE] Important",
      "> This is a callout.",
      "",
      "| Name | Status |",
      "| --- | :---: |",
      "| Site | **ready** |",
      "",
      "- [x] Publish",
      "- [ ] Verify",
      "",
      "```js",
      "console.log(\"copy me\");",
      "```",
      "",
      "![[diagram.png]]",
      "",
      "See [[Architecture|the architecture]].",
    ].join("\n"),
    assets: [{
      sourcePath: "diagram.png",
      path: "assets/diagram.png",
      contentType: "image/png",
      body: "aGVsbG8=",
      encoding: "base64",
    }],
  });
  const html = bundle.pages[0].body;

  assert.match(html, /class="callout callout-note"/);
  assert.match(html, /<table>/);
  assert.match(html, /<strong>ready<\/strong>/);
  assert.match(html, /type="checkbox" disabled checked/);
  assert.match(html, /class="copy-code-button"/);
  assert.match(html, /navigator\.clipboard\.writeText/);
  assert.match(html, /src="\.\/assets\/diagram\.png"/);
  assert.match(html, /class="internal-link-unpublished"/);
  assert.doesNotMatch(html, /href="\.\/architecture\.html"/);
  assert.deepEqual(bundle.assets.map((asset) => asset.path), ["assets/diagram.png"]);
});

test("deduplicates shared references and assigns sorted site-local page routes", () => {
  const bundle = compileShare({
    root: { sourcePath: "Docs/A.md", markdown: "See [[Shared]]." },
    relatedNotes: [
      { sourcePath: "Docs/Shared.md", markdown: "See [[A]]." },
      { sourcePath: "Docs/C.md", markdown: "See [[Shared]]." },
      { sourcePath: "Docs/Shared.md", markdown: "duplicate content" },
    ],
  });

  assert.deepEqual(bundle.pages.map((page) => page.path), ["index.html", "page-1.html", "page-2.html"]);
  assert.match(bundle.pages[0].body, /href="\.\/page-2\.html"/);
  assert.match(bundle.pages[1].body, /href="\.\/page-2\.html"/);
  assert.match(bundle.pages[2].body, /href="\.\/index\.html"/);
  assert.equal(bundle.pages.filter((page) => page.body.includes("duplicate content")).length, 0);
  assert.match(bundle.pages[2].body, /<h1>Shared<\/h1>/);
});

test("compiles one root page and related pages directly under the site directory", () => {
  const bundle = compileShare({
    root: { sourcePath: "Docs/Overview.md", markdown: "# Overview\n\nSee [[Guides/Setup]]." },
    relatedNotes: [{
      sourcePath: "Docs/Guides/Setup.md",
      markdown: "# Setup\n\nSee [[Overview]].\n\n![[diagram.png]]",
      assets: [{
        sourcePath: "Docs/Guides/diagram.png",
        contentType: "image/png",
        body: "aGVsbG8=",
        encoding: "base64",
      }],
    }],
  });

  assert.deepEqual(bundle.pages.map((page) => page.path), ["index.html", "page-1.html"]);
  assert.match(bundle.pages[0].body, /href="\.\/page-1\.html"/);
  assert.match(bundle.pages[1].body, /href="\.\/index\.html"/);
  assert.match(bundle.pages[1].body, /src="\.\/assets\/diagram\.png"/);
  assert.match(bundle.pages[1].body, /<h1>Setup<\/h1>/);
});

test("keeps page routes independent between separately published sites", () => {
  const firstPublisher = new InMemoryPublisher();
  const secondPublisher = new InMemoryPublisher();
  const shared = { sourcePath: "Docs/Shared.md", markdown: "# Shared" };
  const first = firstPublisher.publish({
    idempotencyKey: "site-a",
    bundle: compileShare({ root: { sourcePath: "Docs/A.md", markdown: "See [[Shared]]." }, relatedNotes: [shared] }),
  });
  const second = secondPublisher.publish({
    idempotencyKey: "site-c",
    bundle: compileShare({ root: { sourcePath: "Docs/C.md", markdown: "See [[Shared]]." }, relatedNotes: [shared] }),
  });

  assert.notEqual(first.siteId, second.siteId);
  assert.notEqual(first.url, second.url);
  assert.deepEqual(first.uploadedPaths, ["index.html", "page-1.html"]);
  assert.deepEqual(second.uploadedPaths, ["index.html", "page-1.html"]);
});

test("resolves relative Markdown links from the current note after a target moves", () => {
  const beforeMove = compileShare({
    root: { sourcePath: "Docs/Guides/Intro.md", markdown: "See [reference](../Reference%20Guide.md)." },
    relatedNotes: [{ sourcePath: "Docs/Reference Guide.md", markdown: "# Reference" }],
  });
  const beforePage = beforeMove.pages[0];

  const afterMove = compileShare({
    root: { sourcePath: "Docs/Guides/Intro.md", markdown: "See [[New/Reference]]." },
    relatedNotes: [{ sourcePath: "Docs/New/Reference.md", markdown: "# Reference" }],
  });
  const afterPage = afterMove.pages[0];

  assert.ok(beforePage);
  assert.ok(afterPage);
  assert.match(beforePage.body, /href="\.\/page-1\.html"/);
  assert.match(afterPage.body, /href="\.\/page-1\.html"/);
});

test("preserves original Unicode and space-containing file names in related page paths", () => {
  const bundle = compileShare({
    root: { sourcePath: "Docs/入口.md", title: "入口", markdown: "See [[会议 纪要]]." },
    relatedNotes: [{ sourcePath: "Docs/会议 纪要.md", markdown: "# 内容" }],
  });
  const publisher = new InMemoryPublisher();
  const result = publisher.publish({ idempotencyKey: "unicode-path", bundle });
  const response = serveLocalSite(publisher, result.siteId, `/s/${result.siteId}/page-1.html`);

  assert.deepEqual(bundle.pages.map((page) => page.path), ["index.html", "page-1.html"]);
  assert.match(bundle.pages[0].body, /href="\.\/page-1\.html"/);
  assert.equal(response.status, 200);
  assert.match(response.body, /<h1>会议 纪要<\/h1>/);
});

test("keeps published pages scrollable and nests heading sections for collapse", () => {
  const bundle = compileNote({
    sourcePath: "Guides/Collapsible.md",
    markdown: [
      "# Overview",
      "intro",
      "## First section",
      "first content",
      "### Nested section",
      "nested content",
      "## Second section",
      "second content",
    ].join("\n\n"),
  });
  const html = bundle.pages[0].body;

  assert.match(html, /body\.share-publisher-page\{[^}]*overflow:visible!important/);
  assert.match(html, /summary::before\{content:"";[^}]*opacity:0/);
  assert.match(html, /summary:hover::before[^}]*opacity:1/);
  assert.match(html, /<details class="heading-section heading-level-1" open><summary><h1>Overview<\/h1><\/summary>/);
  assert.match(html, /<details class="heading-section heading-level-2" open><summary><h2>First section<\/h2><\/summary>/);
  assert.match(html, /<details class="heading-section heading-level-3" open><summary><h3>Nested section<\/h3><\/summary>/);
  assert.ok(html.indexOf("Nested section") < html.indexOf("Second section"));
});
