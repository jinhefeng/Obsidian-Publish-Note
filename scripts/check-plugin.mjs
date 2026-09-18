import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const sourceDirectory = new URL("../plugin/", import.meta.url);
const manifestUrl = new URL("manifest.json", sourceDirectory);
const mainUrl = new URL("main.js", sourceDirectory);
const manifestText = await readFile(manifestUrl, "utf8");
const manifest = JSON.parse(manifestText);
const main = await readFile(mainUrl, "utf8");
const compiler = await readFile(new URL("compiler.js", sourceDirectory), "utf8");
const rootDirectory = new URL("../", import.meta.url);
const rootManifestText = await readFile(new URL("manifest.json", rootDirectory), "utf8");
const rootMain = await readFile(new URL("main.js", rootDirectory), "utf8");
const releaseDirectory = new URL("../dist/obsidian-release/", import.meta.url);
const releaseFiles = (await readdir(releaseDirectory)).sort();
const releaseManifestText = await readFile(new URL("manifest.json", releaseDirectory), "utf8");
const releaseMain = await readFile(new URL("main.js", releaseDirectory), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const sourceFiles = await readdir(sourceDirectory);
const rootFiles = await readdir(rootDirectory);
const hasStyles = sourceFiles.includes("styles.css");
const expectedReleaseFiles = ["main.js", "manifest.json", ...(hasStyles ? ["styles.css"] : [])].sort();

if (rootManifestText !== manifestText || releaseManifestText !== manifestText) {
  throw new Error("Generated manifest mirrors are stale; run npm run package:plugin");
}
if (rootMain !== main || releaseMain !== main) {
  throw new Error("Generated main.js mirrors are stale; run npm run package:plugin");
}
if (packageJson.version !== manifest.version) {
  throw new Error("package.json version does not match plugin/manifest.json");
}
if (rootFiles.includes("styles.css") !== hasStyles) {
  throw new Error("Root styles.css mirror does not match plugin/styles.css");
}
if (hasStyles) {
  const sourceStyles = await readFile(new URL("styles.css", sourceDirectory), "utf8");
  const rootStyles = await readFile(new URL("styles.css", rootDirectory), "utf8");
  const releaseStyles = await readFile(new URL("styles.css", releaseDirectory), "utf8");
  if (sourceStyles !== rootStyles || sourceStyles !== releaseStyles) {
    throw new Error("Generated styles.css mirrors are stale; run npm run package:plugin");
  }
}
if (releaseFiles.join("\0") !== expectedReleaseFiles.join("\0")) {
  throw new Error(`Release staging must contain only ${expectedReleaseFiles.join(", ")}`);
}

if (!manifest.id || !manifest.name || !manifest.version || !manifest.minAppVersion) {
  throw new Error("Plugin manifest is missing a required field");
}
if ((!main.includes("module.exports = SharePublisherPlugin") && !main.includes("module.exports = { default:")) || !main.includes("require(\"obsidian\")")) {
  throw new Error("Plugin main.js must expose a default Obsidian Plugin class");
}
if (main.includes('require("./compiler.js")')) {
  throw new Error("Plugin main.js must be self-contained");
}
if (!main.includes("provisionPersonalCloudflare") || !main.includes("CLOUDFLARE_OAUTH_REDIRECT_URI") || !main.includes("code_challenge_method")) {
  throw new Error("Plugin main.js is missing the direct Cloudflare OAuth/PKCE deployment flow");
}
if (main.includes("/v1/cloudflare/provision/") || main.includes("clientSecret")) {
  throw new Error("Plugin main.js must not depend on the legacy provisioning control plane or a client secret");
}
if (main.includes("__PUBLISH_NOTE_TARGET_WORKER_MODULE__") || main.includes("__PUBLISH_NOTE_TARGET_MIGRATION_SQL__")) {
  throw new Error("Plugin main.js is missing the embedded target Worker artifact");
}
const artifactHashMatch = main.match(/const EMBEDDED_TARGET_ARTIFACT_HASH = "([0-9a-f]+)";/);
const workerMatch = main.match(/const EMBEDDED_TARGET_WORKER_MODULE = ("(?:\\.|[^"\\])*");/);
const migrationMatch = main.match(/const EMBEDDED_TARGET_MIGRATION_SQL = ("(?:\\.|[^"\\])*");/);
if (!artifactHashMatch || !workerMatch || !migrationMatch) {
  throw new Error("Plugin main.js is missing the target Worker artifact consistency marker");
}
const artifactHash = createHash("sha256")
  .update(JSON.parse(workerMatch[1]))
  .update("\0")
  .update(JSON.parse(migrationMatch[1]))
  .digest("hex")
  .slice(0, 16);
if (artifactHash !== artifactHashMatch[1]) {
  throw new Error(`Embedded target Worker artifact hash mismatch: expected ${artifactHash}, found ${artifactHashMatch[1]}`);
}
if (main.match(/const EMBEDDED_TARGET_PLUGIN_VERSION = "([^"]+)";/)?.[1] !== manifest.version) {
  throw new Error("Embedded Worker build version does not match the plugin manifest; run npm run build:plugin");
}
const migrationDir = new URL("../server/storage/migrations/", import.meta.url);
const migrationNames = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
const migrationSql = (await Promise.all(migrationNames.map(async (name) => `-- ${name}\n${await readFile(new URL(name, migrationDir), "utf8")}`))).join("\n\n");
if (JSON.parse(migrationMatch[1]) !== migrationSql) throw new Error("Embedded migration is stale; run npm run build:plugin");
if (!compiler.includes("module.exports") || !compiler.includes("compileNote") || !compiler.includes("compileShare")) {
  throw new Error("Plugin compiler.js is missing the note/share compiler exports");
}

console.log(`Plugin artifact looks installable: ${manifest.name} ${manifest.version}`);
