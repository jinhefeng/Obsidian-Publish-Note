import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const manifest = JSON.parse(await readFile(new URL("../plugin/manifest.json", import.meta.url), "utf8"));
const main = await readFile(new URL("../plugin/main.js", import.meta.url), "utf8");
const compiler = await readFile(new URL("../plugin/compiler.js", import.meta.url), "utf8");

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
