import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  readCoreSource,
  assertCoreResources,
  selectCoreSource,
} from "../src/runtime/core-source.mjs";
import { resolveDesktopRuntimeEntries } from "../dist/runtime/runtime-entry.js";

function fixture() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "desktop Public 同一来源-")),
  );
  const desktop = join(root, "apps/desktop");
  const file = (path, content = "") => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  for (const path of [
    "package.json",
    "apps/client/package.json",
    "apps/server/package.json",
    "packages/prisma/package.json",
    "apps/desktop/package.json",
  ])
    file(path, JSON.stringify({ version: "1.1.22" }));
  file(
    "packages/prisma/package.json",
    JSON.stringify({
      version: "1.1.22",
      exports: { "./core-migration-runner": { import: "./core/runner.mjs" } },
    }),
  );
  file("packages/prisma/core/runner.mjs");
  file("apps/server/src/main.self-host.ts", "server source");
  file("apps/client/src/page.tsx", "client source");
  file("packages/prisma/core/schema.prisma", "schema source");
  file("packages/messages/client-core/en.json", "{}");
  file("apps/server/dist-selfhost/apps/server/src/main.self-host.js");
  file("apps/client/.next/standalone/apps/client/server.js");
  file(
    "apps/client/.next/standalone/apps/client/package.json",
    JSON.stringify({ version: "1.1.22" }),
  );
  const built = readCoreSource(desktop);
  file(
    "apps/desktop/build/core-build.json",
    JSON.stringify({
      ...built,
      platform: process.platform,
      arch: process.arch,
    }),
  );
  file("apps/desktop/dist/core-source.json", JSON.stringify(built));
  return {
    root,
    desktop,
    file,
    built,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("development resolves the server, client and import-only migration export from the owning Public checkout", async () => {
  const f = fixture();
  try {
    assert.equal(selectCoreSource(f.desktop).directory, f.root);
    const entries = await resolveDesktopRuntimeEntries(f.desktop);
    assert.deepEqual(entries, {
      server: join(
        f.root,
        "apps/server/dist-selfhost/apps/server/src/main.self-host.js",
      ),
      client: join(
        f.root,
        "apps/client/.next/standalone/apps/client/server.js",
      ),
      databaseRunner: join(f.root, "packages/prisma/core/runner.mjs"),
    });
    // No .git is required when the public source archive is used.
    assert.equal(f.built.commit, null);
  } finally {
    f.cleanup();
  }
});

test("independent Core or per-service overrides are rejected before startup", () => {
  const f = fixture();
  try {
    for (const key of [
      "TRAININGLOAD_DESKTOP_CORE_DIRECTORY",
      "TRAININGLOAD_DESKTOP_SERVER_ENTRY",
      "TRAININGLOAD_DESKTOP_CLIENT_ENTRY",
    ])
      assert.throws(
        () =>
          readCoreSource(f.desktop, {
            environment: { [key]: "/some/other/checkout" },
          }),
        { code: "DESKTOP_CORE_SPLIT_OVERRIDE" },
      );
  } finally {
    f.cleanup();
  }
});

test("changing any business layer invalidates the built Core and generated desktop resources", () => {
  for (const path of [
    "apps/client/src/page.tsx",
    "apps/server/src/main.self-host.ts",
    "packages/prisma/core/schema.prisma",
    "packages/messages/client-core/en.json",
  ]) {
    const f = fixture();
    try {
      f.file(path, readFileSync(join(f.root, path), "utf8") + "\nchanged");
      assert.throws(() => readCoreSource(f.desktop, { requireBuild: true }), {
        code: "DESKTOP_CORE_BUILD_MISSING",
      });
      assert.throws(
        () =>
          assertCoreResources(
            readCoreSource(f.desktop),
            join(f.desktop, "dist/core-source.json"),
          ),
        { code: "DESKTOP_CORE_RESOURCES_MISMATCH" },
      );
    } finally {
      f.cleanup();
    }
  }
});

test("native-only and generated output changes do not force business recompilation", () => {
  const f = fixture();
  try {
    f.file("apps/desktop/src/main.ts", "native-only change");
    f.file("apps/client/.next/cache/entry", "generated cache");
    f.file("packages/prisma/generated/core/index.js", "generated client");
    assert.equal(
      readCoreSource(f.desktop, { requireBuild: true }).fingerprint,
      f.built.fingerprint,
    );
  } finally {
    f.cleanup();
  }
});

test("stale standalone versions and cross-checkout desktop assets cannot be started", async () => {
  const f = fixture();
  try {
    f.file(
      "apps/client/.next/standalone/apps/client/package.json",
      JSON.stringify({ version: "1.1.21" }),
    );
    await assert.rejects(resolveDesktopRuntimeEntries(f.desktop), {
      code: "DESKTOP_CORE_BUILD_MISMATCH",
    });
    assert.throws(
      () =>
        assertCoreResources(
          { ...f.built, directory: resolve(f.root, "../other") },
          join(f.desktop, "dist/core-source.json"),
        ),
      { code: "DESKTOP_CORE_RESOURCES_MISMATCH" },
    );
    f.file("apps/desktop/package.json", JSON.stringify({ version: "1.1.21" }));
    assert.throws(() => readCoreSource(f.desktop), {
      code: "DESKTOP_CORE_VERSION_MISMATCH",
    });
  } finally {
    f.cleanup();
  }
});
