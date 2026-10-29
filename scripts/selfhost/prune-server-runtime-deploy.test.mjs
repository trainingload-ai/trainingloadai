import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const script = resolve(import.meta.dirname, "prune-server-runtime-deploy.mjs");

function write(path, content = "fixture") {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

test("prunes build-only artifacts while retaining the Node Prisma runtime", () => {
  const root = mkdtempSync(resolve(tmpdir(), "trainingload-runtime-prune-"));
  write(
    resolve(root, "package.json"),
    JSON.stringify({
      name: "server",
      version: "1.0.0",
      private: true,
      license: "UNLICENSED",
      scripts: { build: "nest build" },
      dependencies: { "@prisma/client": "1.0.0" },
      devDependencies: { typescript: "1.0.0" },
    }),
  );

  const store = resolve(root, "node_modules/.pnpm");
  write(resolve(store, "typescript@1.0.0/node_modules/typescript/index.js"));
  write(
    resolve(
      store,
      "@img+sharp-linuxmusl-arm64@1.0.0/node_modules/@img/sharp-linuxmusl-arm64/index.js",
    ),
  );
  const prismaClient = resolve(
    store,
    "@prisma+client@1.0.0/node_modules/@prisma/client",
  );
  write(resolve(prismaClient, "runtime/library.js"));
  write(resolve(prismaClient, "runtime/library.js.map"));
  write(resolve(prismaClient, "runtime/library.d.mts"));
  write(resolve(prismaClient, "runtime/library.d.mts.map"));
  write(
    resolve(prismaClient, "runtime/query_engine_bg.postgresql.wasm-base64.js"),
  );
  write(resolve(prismaClient, "index.d.ts"));
  write(resolve(prismaClient, "generator-build/index.js"));
  write(
    resolve(
      store,
      "@prisma+client@1.0.0/node_modules/.prisma/client/libquery_engine-linux-arm64-openssl-3.0.x.so.node",
    ),
  );
  write(
    resolve(
      store,
      "@prisma+client@1.0.0/node_modules/.prisma/client/query_engine_bg.wasm",
    ),
  );

  execFileSync(process.execPath, [script, root]);

  assert.equal(
    readFileSync(resolve(prismaClient, "runtime/library.js"), "utf8"),
    "fixture",
  );
  assert.equal(
    readFileSync(
      resolve(
        store,
        "@prisma+client@1.0.0/node_modules/.prisma/client/libquery_engine-linux-arm64-openssl-3.0.x.so.node",
      ),
      "utf8",
    ),
    "fixture",
  );
  assert.throws(() => readFileSync(resolve(prismaClient, "index.d.ts")));
  assert.throws(() =>
    readFileSync(resolve(prismaClient, "runtime/library.d.mts")),
  );
  assert.throws(() =>
    readFileSync(resolve(prismaClient, "runtime/library.d.mts.map")),
  );
  assert.throws(() =>
    readFileSync(
      resolve(
        prismaClient,
        "runtime/query_engine_bg.postgresql.wasm-base64.js",
      ),
    ),
  );
  assert.throws(() =>
    readFileSync(
      resolve(
        store,
        "@img+sharp-linuxmusl-arm64@1.0.0/node_modules/@img/sharp-linuxmusl-arm64/index.js",
      ),
    ),
  );

  const manifest = JSON.parse(readFileSync(resolve(root, "package.json")));
  assert.deepEqual(manifest.dependencies, { "@prisma/client": "1.0.0" });
  assert.equal(manifest.devDependencies, undefined);
  assert.equal(manifest.scripts, undefined);
});
