import { promises as fs } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scopeIndex = process.argv.indexOf("--scope");
const scope = process.argv[scopeIndex + 1]
  ?.replace(/^\.\//, "")
  .replace(/\/$/, "");

if (!scope || !["apps/client", "apps/server"].includes(scope)) {
  throw new Error("Usage: prune-public-build.mjs --scope apps/client|apps/server");
}

const manifestPath = resolve(
  repositoryRoot,
  "scripts/open-source/generated-public-excludes.json",
);
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const removed = [];

for (const repositoryPath of manifest.excludes ?? []) {
  if (
    repositoryPath !== scope &&
    !repositoryPath.startsWith(`${scope}/`)
  ) {
    continue;
  }
  const target = resolve(repositoryRoot, repositoryPath);
  const targetRelative = relative(repositoryRoot, target);
  if (targetRelative.startsWith("..") || targetRelative === "") {
    throw new Error(`Refusing to prune path outside repository: ${repositoryPath}`);
  }
  const exists = await fs
    .lstat(target)
    .then(() => true)
    .catch(() => false);
  if (!exists) continue;
  await fs.rm(target, { recursive: true, force: true });
  removed.push(repositoryPath);
}

process.stdout.write(
  `Public build pruning: PASS (${scope}, ${removed.length} managed paths removed)\n`,
);
