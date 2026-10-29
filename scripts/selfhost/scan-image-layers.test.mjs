import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  findCredentialMarkers,
  findForbiddenPaths,
  scanSavedImage,
  withImageScanWorkspace,
} from "./scan-image-layers.mjs";

test("image scan workspace cleanup fails closed and preserves the scan failure", async () => {
  const primary = Object.assign(new Error("scan failed"), { code: "EINVAL" });
  const cleanup = Object.assign(new Error("cleanup failed"), {
    code: "EACCES",
  });
  const calls = [];

  await assert.rejects(
    withImageScanWorkspace(
      async (directory) => {
        assert.equal(directory, "/private/image-scan");
        throw primary;
      },
      {
        createWorkspace: async () => "/private/image-scan",
        removePath: async (path, options) => {
          calls.push({ path, options });
          throw cleanup;
        },
      },
    ),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.equal(error.code, "EACCES");
      assert.deepEqual(error.errors, [primary, cleanup]);
      return true;
    },
  );
  assert.deepEqual(calls, [
    {
      path: "/private/image-scan",
      options: { recursive: true, force: true },
    },
  ]);

  await assert.rejects(
    withImageScanWorkspace(async () => "complete", {
      createWorkspace: async () => "/private/image-scan-cleanup-failure",
      removePath: async () => {
        throw cleanup;
      },
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.equal(error.code, "EACCES");
      assert.deepEqual(error.errors, [cleanup]);
      return true;
    },
  );

  assert.equal(
    await withImageScanWorkspace(async () => "complete", {
      createWorkspace: async () => "/private/image-scan-success",
      removePath: async () => undefined,
    }),
    "complete",
  );
});

test("finds sensitive runtime paths but permits empty data directories", () => {
  const findings = findForbiddenPaths([
    "app/server.js",
    "data/",
    "data/uploads/",
    "data/uploads/private.fit",
    "app/apps/server/node_modules/openai/resources/uploads/index.js",
    "workspace/.env.production",
    "root/.ssh/id_ed25519",
  ]);
  assert.deepEqual(
    findings.map(({ kind, path }) => [kind, path]),
    [
      ["operator upload", "data/uploads/private.fit"],
      ["environment file", "workspace/.env.production"],
      ["SSH material", "root/.ssh/id_ed25519"],
      ["private key", "root/.ssh/id_ed25519"],
    ],
  );
});

test("finds high-confidence credential markers and an explicit canary", () => {
  const awsAccessKey = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");
  const awsSecretKey = [
    "ABCDEFGHIJ",
    "KLMNOPQRST",
    "UVWXYZabcd",
    "efghijklmn",
  ].join("");
  const markers = findCredentialMarkers(
    [
      `prefix ${awsAccessKey} middle release-leak-canary-123 suffix`,
      "-----BEGIN PRIVATE KEY-----",
      awsSecretKey,
      "-----END PRIVATE KEY-----",
    ].join("\n"),
    ["release-leak-canary-123"],
  );
  assert.deepEqual(markers, [
    "PEM private key",
    "AWS access key",
    "explicit canary",
  ]);
});

test("ignores credential-shaped substrings embedded in compiled assets", () => {
  assert.deepEqual(
    findCredentialMarkers(
      [
        "QCA",
        "KIA1JDQACQCATIAFGDQAg -----BEGIN PRIVATE KEY----- help text",
      ].join(""),
    ),
    [],
  );
});

test("ignores secret variable names without embedded values", () => {
  assert.deepEqual(
    findCredentialMarkers(
      "BETTER_AUTH_SECRET DATABASE_URL MAPBOX_ACCESS_TOKEN",
    ),
    [],
  );
});

test("bounds and validates the saved image layer inventory", async (t) => {
  const directory = await fs.mkdtemp(join(tmpdir(), "image-layer-scan-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const manifestPath = resolve(directory, "manifest.json");
  await fs.writeFile(
    manifestPath,
    JSON.stringify([
      {
        Config: "config.json",
        Layers: Array.from({ length: 1025 }, (_, index) => `${index}.tar`),
      },
    ]),
  );
  await assert.rejects(scanSavedImage(directory), /invalid layer inventory/);

  if (process.platform !== "win32") {
    const outside = resolve(directory, "outside.json");
    await fs.rename(manifestPath, outside);
    await fs.symlink(outside, manifestPath);
    await assert.rejects(scanSavedImage(directory), /bounded regular file/);

    await fs.unlink(manifestPath);
    await fs.writeFile(
      manifestPath,
      JSON.stringify([{ Config: "config.json", Layers: [] }]),
    );
    const outsideConfig = resolve(directory, "outside-config.json");
    const configPath = resolve(directory, "config.json");
    await fs.writeFile(outsideConfig, "release-leak-canary-123");
    await fs.symlink(outsideConfig, configPath);
    await assert.rejects(scanSavedImage(directory), /bounded regular file/);
  }
});
