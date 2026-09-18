import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const root = new URL("..", import.meta.url);
const outputDir = new URL("../dist/target-worker/", import.meta.url);
await mkdir(outputDir, { recursive: true });

const esbuildBinary = process.env.PUBLISH_NOTE_ESBUILD_BIN || "npx";
const esbuildArgs = esbuildBinary === "npx"
  ? ["--yes", "esbuild", "server/worker/index.ts", "--bundle", "--format=esm", "--platform=neutral", "--outfile=dist/target-worker/index.js"]
  : ["server/worker/index.ts", "--bundle", "--format=esm", "--platform=neutral", "--outfile=dist/target-worker/index.js"];
const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(esbuildBinary, esbuildArgs, { cwd: root, stdio: "inherit" });
  child.on("error", reject);
  child.on("exit", resolve);
});
if (exitCode !== 0) process.exit(exitCode || 1);
const migrationDirectory = new URL("../server/storage/migrations/", import.meta.url);
const migrationNames = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
const migrationSql = await Promise.all(migrationNames.map(async (name) => `-- ${name}\n${await readFile(new URL(name, migrationDirectory), "utf8")}`));
await writeFile(new URL("0001_initial.sql", outputDir), migrationSql.join("\n\n"));
