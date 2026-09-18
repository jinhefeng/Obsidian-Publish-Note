import { access, copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(projectRoot, "plugin");
const releaseDirectory = join(projectRoot, "dist", "obsidian-release");
const requiredFiles = ["manifest.json", "main.js"];
const optionalFiles = ["styles.css"];

await rm(releaseDirectory, { recursive: true, force: true });
await mkdir(releaseDirectory, { recursive: true });

for (const fileName of requiredFiles) {
  await copyFile(join(sourceDirectory, fileName), join(projectRoot, fileName));
  await copyFile(join(sourceDirectory, fileName), join(releaseDirectory, fileName));
}

for (const fileName of optionalFiles) {
  const sourcePath = join(sourceDirectory, fileName);
  const rootPath = join(projectRoot, fileName);
  const releasePath = join(releaseDirectory, fileName);
  if (await exists(sourcePath)) {
    await copyFile(sourcePath, rootPath);
    await copyFile(sourcePath, releasePath);
  } else {
    await rm(rootPath, { force: true });
    await rm(releasePath, { force: true });
  }
}

const manifest = JSON.parse(await readFile(join(sourceDirectory, "manifest.json"), "utf8"));
const releaseFiles = (await readdir(releaseDirectory)).sort();
const expectedFiles = [...requiredFiles, ...optionalFiles.filter((fileName) => releaseFiles.includes(fileName))].sort();
if (releaseFiles.join("\0") !== expectedFiles.join("\0")) {
  throw new Error(`Unexpected files in ${releaseDirectory}: ${releaseFiles.join(", ")}`);
}

console.log(`Packaged ${manifest.name} ${manifest.version} into root mirrors and ${releaseDirectory}`);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
