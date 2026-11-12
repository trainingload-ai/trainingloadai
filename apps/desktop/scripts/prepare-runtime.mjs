import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { core, coreRelease, validateCoreSource } from "./core-path.mjs";
import { assertCoreResources } from "../src/runtime/core-source.mjs";
import {
  collectRuntimePackages,
  directoryBytes,
  isRuntimeFile,
  packageManifest,
  pruneRuntimePackages,
} from "./runtime-packages.mjs";
import {
  deduplicateNativeAssets,
  pruneStandaloneBuildTools,
  thinMacNativeLibraries,
} from "./optimize-runtime.mjs";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(desktop, "build");
const destination = join(build, "app");
const shellManifest = join(desktop, "package.json");
const serverManifest = join(core, "apps/server/package.json");
const serverDist = join(core, "apps/server/dist-selfhost");
const standalone = join(core, "apps/client/.next/standalone");
const clientRelative = existsSync(join(standalone, "apps/client/server.js"))
  ? "apps/client"
  : ".";
const versions = [
  shellManifest,
  join(core, "package.json"),
  serverManifest,
  join(core, "apps/client/package.json"),
  join(standalone, clientRelative, "package.json"),
].map((path) => ({
  path,
  version: JSON.parse(readFileSync(path, "utf8")).version,
}));
if (versions.some((item) => item.version !== coreRelease.version))
  throw new Error(`Desktop/Core version mismatch: ${JSON.stringify(versions)}`);
const source = validateCoreSource(true);
const { commit } = source;
assertCoreResources(source, join(desktop, "dist/core-source.json"));
for (const path of [
  join(desktop, "dist/main.js"),
  join(serverDist, "apps/server/src/main.self-host.js"),
  join(standalone, clientRelative, "server.js"),
  join(core, "apps/client/.next/static"),
]) {
  if (!existsSync(path))
    throw new Error(`Build the public Core and desktop first; missing ${path}`);
}

function copy(source, target) {
  cpSync(source, target, {
    recursive: true,
    verbatimSymlinks: true,
    filter: isRuntimeFile,
  });
}
function verifyLinks(root, directory = root) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (!existsSync(path))
        throw new Error(`Broken runtime symlink: ${relative(root, path)}`);
      // realpath catches links that escape through a chain of other links.
      const target = realpathSync(path);
      const local = relative(root, target);
      if (local === ".." || local.startsWith("../") || local.startsWith("..\\"))
        throw new Error(`External runtime symlink: ${relative(root, path)}`);
    } else if (entry.isDirectory()) verifyLinks(root, path);
  }
}

function removeUntracedLinks(directory) {
  // Next's file tracer leaves links to build-only packages whose files were
  // deliberately omitted. Remove those dangling links in the copied client.
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() && !existsSync(path)) rmSync(path);
    else if (entry.isDirectory()) removeUntracedLinks(path);
  }
}

mkdirSync(build, { recursive: true });
const staging = mkdtempSync(join(build, ".runtime-"));
try {
  const shell = JSON.parse(readFileSync(shellManifest, "utf8"));
  const metadata = {
    name: shell.name,
    productName: shell.productName,
    version: shell.version,
    description: shell.description,
    license: shell.license,
    type: "module",
    main: "dist/main.js",
  };
  // All modules are already materialized. Keep the builder from resolving a
  // second dependency graph or accidentally copying the source workspace.
  writeFileSync(
    join(staging, "package.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  copy(join(desktop, "dist"), join(staging, "dist"));
  // Development's source path is machine-specific; the app uses only bundled entries.
  rmSync(join(staging, "dist/core-source.json"));
  copy(join(desktop, "assets"), join(staging, "assets"));
  const server = join(staging, "runtime/server");
  mkdirSync(server, { recursive: true });
  const serverMetadata = JSON.parse(readFileSync(serverManifest, "utf8"));
  writeFileSync(
    join(server, "package.json"),
    `${JSON.stringify({ name: serverMetadata.name, version: serverMetadata.version, license: serverMetadata.license, type: "commonjs" })}\n`,
  );
  copy(join(core, "LICENSE"), join(server, "LICENSE"));
  copy(serverDist, join(server, "dist"));
  copy(join(core, "packages/messages/server"), join(server, "messages"));
  const client = join(staging, "runtime/client");
  copy(standalone, client);
  removeUntracedLinks(client);
  copy(
    join(core, "apps/client/.next/static"),
    join(client, clientRelative, ".next/static"),
  );
  copy(
    join(core, "apps/client/.next/selfhost-public"),
    join(client, clientRelative, "public"),
  );
  const standalonePruning = pruneStandaloneBuildTools(client);
  removeUntracedLinks(client);

  const dependencies = collectRuntimePackages(staging, {
    "@trainingloadai/database": join(core, "packages/prisma/package.json"),
  });
  dependencies.addDependencies(shellManifest, join(staging, "node_modules"));
  dependencies.addPackage(
    join(core, "packages/prisma/package.json"),
    join(staging, "node_modules"),
  );
  dependencies.addDependencies(serverManifest, join(server, "node_modules"));
  dependencies.linkOptionalPeers();
  // Copy the generated Core client beside the exact server @prisma/client.
  execFileSync(
    process.execPath,
    [
      join(core, "scripts/prisma/copy-generated-client.mjs"),
      join(core, "packages/prisma"),
      server,
    ],
    { stdio: "inherit" },
  );
  const prisma = dirname(
    packageManifest(join(server, "package.json"), "@prisma/client"),
  );
  const generated = resolve(prisma, "../../.prisma/client");
  // Apply the proven Core Prisma runtime pruning policy to the shared store.
  const beforePrune = directoryBytes(staging);
  execFileSync(
    process.execPath,
    [join(core, "scripts/selfhost/prune-server-runtime-deploy.mjs"), staging],
    { stdio: "inherit" },
  );
  writeFileSync(
    join(staging, "package.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  // Do not silently prune a dataset which a later Core build starts using.
  function checkGeoImports(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) checkGeoImports(path);
      else if (
        entry.name.endsWith(".js") &&
        /['"]geo-tz\/(?:all|now|dist\/find-)/.test(readFileSync(path, "utf8"))
      )
        throw new Error(
          "Core uses a non-default geo-tz dataset; review pruning policy",
        );
    }
  }
  checkGeoImports(join(server, "dist"));
  pruneRuntimePackages(staging);
  const nativeThinning = thinMacNativeLibraries(staging);
  const sharedNativeAssets = deduplicateNativeAssets(staging);
  verifyLinks(staging);
  const bytes = directoryBytes(staging);
  const baselineBytes =
    directoryBytes(standalone) +
    directoryBytes(join(core, "apps/client/.next/static")) +
    directoryBytes(serverDist) +
    dependencies.sourceBytes;
  // A hard budget makes future dependency growth visible before packaging.
  const maxBytes = 280 * 1024 * 1024;
  if (bytes > maxBytes)
    throw new Error(`Desktop runtime exceeds ${maxBytes} bytes: ${bytes}`);
  const report = {
    schemaVersion: 1,
    platform: process.platform,
    arch: process.arch,
    version: shell.version,
    core: {
      version: coreRelease.version,
      commit,
      fingerprint: source.fingerprint,
    },
    baselineBytes,
    bytes,
    savedBytes: baselineBytes - bytes,
    prunedBytes: beforePrune - bytes,
    maxBytes,
    generatedPrismaClient: relative(staging, generated),
    optimizations: { standalonePruning, nativeThinning, sharedNativeAssets },
  };
  writeFileSync(
    join(staging, "runtime-size.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  // Only replace an output previously created by this script.
  if (
    existsSync(destination) &&
    !existsSync(join(destination, "runtime-size.json"))
  )
    throw new Error("Refusing to replace an unknown desktop build directory");
  rmSync(destination, { recursive: true, force: true });
  renameSync(staging, destination);
  writeFileSync(
    join(build, "runtime-size.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify({ ok: true, directory: destination, ...report }));
} finally {
  rmSync(staging, { recursive: true, force: true });
}
