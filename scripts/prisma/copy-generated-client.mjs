import { cpSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const [sourceRoot, targetRoot, edition = 'core'] = process.argv.slice(2);
if (!sourceRoot || !targetRoot) {
  throw new Error(
    "usage: copy-generated-client.mjs <generated-package-root> <runtime-package-root>",
  );
}

function generatedClientDirectory(root) {
  const requireFromRoot = createRequire(resolve(root, "package.json"));
  const packageDirectory = dirname(
    requireFromRoot.resolve("@prisma/client/package.json"),
  );
  return resolve(packageDirectory, "../..", ".prisma", "client");
}

if (!['core', 'managed'].includes(edition)) throw new Error('Unknown Prisma edition');
const source = resolve(sourceRoot, 'generated', edition);
const target = generatedClientDirectory(targetRoot);
if (!existsSync(resolve(source, "index.js"))) {
  throw new Error(`generated Prisma Client is missing: ${source}`);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, { recursive: true, force: true });

if (!existsSync(resolve(target, "index.js"))) {
  throw new Error(`failed to copy generated Prisma Client: ${target}`);
}

// Native Clients generated on the host must never leak into another target.
const nativeEngine = {
  'linux-x64': 'libquery_engine-debian-openssl-3.0.x.so.node',
  'linux-arm64': 'libquery_engine-linux-arm64-openssl-3.0.x.so.node',
  'darwin-x64': 'libquery_engine-darwin.dylib.node',
  'darwin-arm64': 'libquery_engine-darwin-arm64.dylib.node',
  'win32-x64': 'query_engine-windows.dll.node',
}[`${process.platform}-${process.arch}`];
if (!nativeEngine || !existsSync(resolve(target, nativeEngine))) throw new Error('Generated Prisma Client lacks the target native engine');
for (const file of readdirSync(target)) {
  if (/^(?:libquery_engine-|query_engine-)/.test(file) && file !== nativeEngine) rmSync(resolve(target,file));
}
