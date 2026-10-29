import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? "");
const manifestPath = resolve(root, "package.json");
const virtualStore = resolve(root, "node_modules/.pnpm");

if (!root || !existsSync(manifestPath) || !existsSync(virtualStore)) {
  throw new Error("runtime deploy directory is missing");
}

const removed = [];

function remove(path) {
  if (!existsSync(path) && !lstatExists(path)) return;
  rmSync(path, { force: true, recursive: true });
  removed.push(path);
}

function lstatExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function walk(directory, visitor) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) walk(path, visitor);
    else if (stats.isFile()) visitor(path);
  }
}

for (const entry of readdirSync(virtualStore)) {
  if (
    entry.startsWith("typescript@") ||
    /^@img\+sharp-(?:libvips-)?linuxmusl-/.test(entry)
  ) {
    remove(resolve(virtualStore, entry));
  }
}

walk(resolve(root, "node_modules"), (path) => {
  if (
    path.endsWith(".map") ||
    path.endsWith(".d.ts") ||
    path.endsWith(".d.mts") ||
    path.endsWith(".d.cts")
  ) {
    remove(path);
  }
});

for (const entry of readdirSync(virtualStore)) {
  if (!entry.startsWith("@prisma+client@")) continue;
  const clientRoot = resolve(
    virtualStore,
    entry,
    "node_modules/@prisma/client",
  );
  remove(resolve(clientRoot, "generator-build"));
  remove(resolve(clientRoot, "scripts"));

  const runtimeRoot = resolve(clientRoot, "runtime");
  if (existsSync(runtimeRoot)) {
    for (const file of readdirSync(runtimeRoot)) {
      if (
        file.includes("wasm") ||
        file.includes("edge") ||
        file.includes("react-native") ||
        file.startsWith("query_compiler_bg.") ||
        file.startsWith("query_engine_bg.")
      ) {
        remove(resolve(runtimeRoot, file));
      }
    }
  }

  const generatedRoot = resolve(
    virtualStore,
    entry,
    "node_modules/.prisma/client",
  );
  for (const file of [
    "edge.js",
    "index-browser.js",
    "query_engine_bg.js",
    "query_engine_bg.wasm",
    "wasm.js",
    "wasm-edge-light-loader.mjs",
    "wasm-worker-loader.mjs",
  ]) {
    remove(resolve(generatedRoot, file));
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const runtimeManifest = {
  name: manifest.name,
  version: manifest.version,
  private: manifest.private,
  license: manifest.license,
  engines: manifest.engines,
  dependencies: manifest.dependencies,
};
writeFileSync(manifestPath, `${JSON.stringify(runtimeManifest, null, 2)}\n`);

process.stdout.write(
  `Self-host Server runtime prune: PASS (${removed.length} entries removed)\n`,
);
