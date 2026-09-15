import { readFile } from "node:fs/promises";

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
if (!compiler.includes("module.exports") || !compiler.includes("compileNote") || !compiler.includes("compileShare")) {
  throw new Error("Plugin compiler.js is missing the note/share compiler exports");
}

console.log(`Plugin artifact looks installable: ${manifest.name} ${manifest.version}`);
