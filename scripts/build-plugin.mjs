import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const pluginPath = new URL("../plugin/main.js", import.meta.url);
const workerPath = new URL("../dist/target-worker/index.js", import.meta.url);
const migrationPath = new URL("../dist/target-worker/0001_initial.sql", import.meta.url);

await run(process.execPath, [fileURLToPath(new URL("./build-target-worker.mjs", import.meta.url))]);

let plugin = await readFile(pluginPath, "utf8");
const worker = await readFile(workerPath, "utf8");
const migration = await readFile(migrationPath, "utf8");
const manifest = JSON.parse(await readFile(new URL("../plugin/manifest.json", import.meta.url), "utf8"));
const embeddedOAuthClientId = plugin.match(/const CLOUDFLARE_OAUTH_CLIENT_ID = "([^"]+)";/)?.[1];
const oauthClientId = process.env.PUBLISH_NOTE_CF_OAUTH_CLIENT_ID || embeddedOAuthClientId || "REPLACE_WITH_CLOUDFLARE_OAUTH_CLIENT_ID";
const artifactHash = createHash("sha256").update(worker).update("\0").update(migration).digest("hex").slice(0, 16);

const artifactHashLine = `const EMBEDDED_TARGET_ARTIFACT_HASH = ${JSON.stringify(artifactHash)};`;
const workerLine = `const EMBEDDED_TARGET_WORKER_MODULE = ${JSON.stringify(worker)};`;
const migrationLine = `const EMBEDDED_TARGET_MIGRATION_SQL = ${JSON.stringify(migration)};`;
const oauthClientLine = `const CLOUDFLARE_OAUTH_CLIENT_ID = ${JSON.stringify(oauthClientId)};`;
if (!/const EMBEDDED_TARGET_ARTIFACT_HASH = .*;/.test(plugin) || !/const EMBEDDED_TARGET_WORKER_MODULE = .*;/.test(plugin) || !/const EMBEDDED_TARGET_MIGRATION_SQL = .*;/.test(plugin) || !/const CLOUDFLARE_OAUTH_CLIENT_ID = .*;/.test(plugin)) {
  throw new Error("Plugin artifact markers are missing");
}
// Use function replacements so `$` sequences inside the generated Worker module
// are copied literally instead of being interpreted as String.replace tokens.
plugin = plugin.replace(/const EMBEDDED_TARGET_ARTIFACT_HASH = .*;/, () => artifactHashLine);
plugin = plugin.replace(/const CLOUDFLARE_OAUTH_CLIENT_ID = .*;/, () => oauthClientLine);
plugin = plugin.replace(/const EMBEDDED_TARGET_PLUGIN_VERSION = .*;/, () => `const EMBEDDED_TARGET_PLUGIN_VERSION = ${JSON.stringify(manifest.version)};`);
plugin = plugin.replace(/const EMBEDDED_TARGET_WORKER_MODULE = .*;/, () => workerLine);
plugin = plugin.replace(/const EMBEDDED_TARGET_MIGRATION_SQL = .*;/, () => migrationLine);
await writeFile(pluginPath, plugin);
console.log(`Embedded target Worker (${worker.length} chars), migration (${migration.length} chars), artifact ${artifactHash}, and ${oauthClientId === "REPLACE_WITH_CLOUDFLARE_OAUTH_CLIENT_ID" ? "placeholder" : "public OAuth client ID"} into plugin/main.js`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}
