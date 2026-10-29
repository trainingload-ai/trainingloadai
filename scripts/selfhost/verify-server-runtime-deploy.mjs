import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "");
const sourceManifestPath = resolve(process.argv[3] ?? "");
if (!root || !existsSync(resolve(root, "package.json"))) {
  throw new Error("runtime deploy directory is missing");
}
if (!process.argv[3] || !existsSync(sourceManifestPath)) {
  throw new Error("source Server package metadata is missing");
}

const requireFromRuntime = createRequire(resolve(root, "package.json"));
function resolveInsideRuntime(dependency) {
  try {
    const resolved = requireFromRuntime.resolve(dependency);
    const pathFromRoot = relative(root, resolved);
    return pathFromRoot &&
      pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
      ? resolved
      : null;
  } catch {
    return null;
  }
}

for (const dependency of ["@prisma/client", "sharp", "better-auth"]) {
  if (!resolveInsideRuntime(dependency)) {
    throw new Error(`runtime deploy is missing dependency ${dependency}`);
  }
}

const prismaClientPackage = resolveInsideRuntime("@prisma/client/package.json");
if (!prismaClientPackage) {
  throw new Error("runtime deploy is missing @prisma/client package metadata");
}
const generatedClient = resolve(
  dirname(prismaClientPackage),
  "../..",
  ".prisma/client/index.js",
);
if (!existsSync(generatedClient)) {
  throw new Error("runtime deploy is missing the generated Prisma Client");
}
const prismaRuntime = resolve(dirname(prismaClientPackage), "runtime/library.js");
if (!existsSync(prismaRuntime)) {
  throw new Error("runtime deploy is missing the Prisma Node library runtime");
}
const generatedClientDirectory = dirname(generatedClient);
if (
  !readdirSync(generatedClientDirectory).some(
    (entry) =>
      entry.startsWith("libquery_engine-") && entry.endsWith(".so.node"),
  )
) {
  throw new Error("runtime deploy is missing the Prisma native library engine");
}

for (const dependency of [
  "prisma",
  "ts-node",
  "typescript",
  "next",
  "playwright",
  "@aws-sdk/client-s3",
  "@langfuse/otel",
  "@modelcontextprotocol/server",
]) {
  if (resolveInsideRuntime(dependency)) {
    throw new Error(`runtime deploy contains forbidden dependency ${dependency}`);
  }
}

const virtualStore = resolve(root, "node_modules/.pnpm");
for (const entry of readdirSync(virtualStore)) {
  if (
    entry.startsWith("typescript@") ||
    entry.startsWith("parquet-wasm@") ||
    /^@img\+sharp-(?:libvips-)?linuxmusl-/.test(entry)
  ) {
    throw new Error(`runtime deploy contains build-only package ${entry}`);
  }
}

function containsNonRuntimeArtifact(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      const nestedArtifact = containsNonRuntimeArtifact(path);
      if (nestedArtifact) return nestedArtifact;
      continue;
    }
    if (
      entry.name.endsWith(".map") ||
      entry.name.endsWith(".d.ts") ||
      entry.name.endsWith(".d.mts") ||
      entry.name.endsWith(".d.cts")
    ) {
      return path;
    }
  }
  return null;
}

const nonRuntimeArtifact = containsNonRuntimeArtifact(resolve(root, "node_modules"));
if (nonRuntimeArtifact) {
  throw new Error(
    `runtime deploy contains non-runtime artifact ${relative(root, nonRuntimeArtifact)}`,
  );
}

const manifest = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, "utf8"));
if (!new Set(["UNLICENSED", "AGPL-3.0-only"]).has(sourceManifest.license)) {
  throw new Error(`unsupported source Server license ${sourceManifest.license}`);
}
if (manifest.license !== sourceManifest.license) {
  throw new Error(
    `runtime Server license ${manifest.license} does not match source ${sourceManifest.license}`,
  );
}
if (manifest.devDependencies || manifest.scripts) {
  throw new Error("runtime package metadata contains build-only fields");
}

process.stdout.write("Self-host Server runtime deploy: PASS\n");
