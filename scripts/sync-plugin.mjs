import { copyFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vaultPath = process.env.OBSIDIAN_VAULT_PATH || "/Users/jinhefeng/Library/Mobile Documents/iCloud~md~obsidian/Documents/Home";
const sourceDirectory = join(projectRoot, "plugin");
const targetDirectory = join(vaultPath, ".obsidian", "plugins", "publish-note");
const runtimeFiles = ["manifest.json", "main.js"];

await mkdir(targetDirectory, { recursive: true });
for (const fileName of runtimeFiles) {
  await copyFile(join(sourceDirectory, fileName), join(targetDirectory, fileName));
}

const manifest = JSON.parse(await readFile(join(sourceDirectory, "manifest.json"), "utf8"));
console.log(`Synced ${manifest.name} ${manifest.version} to ${targetDirectory}`);
