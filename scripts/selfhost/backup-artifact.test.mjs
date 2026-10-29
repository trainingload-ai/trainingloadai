import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { createChecksums } from "./create-checksums.mjs";
import {
  assertPortablePathInventory,
  BACKUP_ARTIFACT_LIMITS,
  CumulativeByteLimitError,
  consumeRegularFileBounded,
  copyRegularFileBounded,
  copyRegularTreeBounded,
  DirectoryEntryLimitError,
  consumeByteBudget,
  inspectRegularTree,
  normalizePrivateTree,
  publishRegularFileExclusive,
  publishRegularFilesExclusive,
  readDirectoryEntriesBounded,
  readRegularFileBounded,
  rethrowAfterPathCleanup,
  replaceRegularFileAtomically,
  sha256File,
  verifyBackupBundle,
} from "./backup-artifact.mjs";
import { repositoryRoot } from "./verify-compose-contract.mjs";

const workspaces = [];

test("path cleanup preserves the primary error and every cleanup failure", async () => {
  const primary = Object.assign(new Error("assembly failed"), {
    code: "EEXIST",
  });
  const accessFailure = Object.assign(new Error("cleanup denied"), {
    code: "EACCES",
  });
  const unknownFailure = new Error("cleanup interrupted");
  const calls = [];

  await assert.rejects(
    rethrowAfterPathCleanup(
      primary,
      [
        { path: "/private/staging", options: { recursive: true } },
        { path: "/private/work", options: { recursive: true } },
      ],
      {
        removePath: async (path, options) => {
          calls.push({ path, options });
          throw path.endsWith("staging") ? accessFailure : unknownFailure;
        },
      },
    ),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.equal(error.code, "EACCES");
      assert.deepEqual(error.errors, [primary, accessFailure, unknownFailure]);
      return true;
    },
  );
  assert.deepEqual(calls, [
    { path: "/private/staging", options: { recursive: true } },
    { path: "/private/work", options: { recursive: true } },
  ]);

  await assert.rejects(
    rethrowAfterPathCleanup(
      primary,
      [{ path: "/private/staging", options: { force: true } }],
      { removePath: async () => undefined },
    ),
    (error) => error === primary,
  );
});

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((path) => fs.rm(path, { recursive: true, force: true })),
  );
});

test("publishes evidence files exclusively without exposing partial writes", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "selfhost-publish-test-"));
  workspaces.push(directory);
  const output = resolve(directory, "evidence.json");

  await publishRegularFileExclusive(output, '{"status":"passed"}\n');

  assert.equal(await fs.readFile(output, "utf8"), '{"status":"passed"}\n');
  if (process.platform !== "win32") {
    assert.equal((await fs.stat(output)).mode & 0o777, 0o600);
  }
  await assert.rejects(
    publishRegularFileExclusive(output, '{"status":"replaced"}\n'),
    /already exists/,
  );
  assert.equal(await fs.readFile(output, "utf8"), '{"status":"passed"}\n');
  assert.deepEqual(
    (await fs.readdir(directory)).filter((name) => name.endsWith(".partial")),
    [],
  );
});

test("atomically replaces regular evidence but refuses a symlink target", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "selfhost-replace-test-"));
  workspaces.push(directory);
  const output = resolve(directory, "report.json");
  await fs.writeFile(output, '{"status":"running"}\n');

  await replaceRegularFileAtomically(output, '{"status":"passed"}\n');
  assert.equal(await fs.readFile(output, "utf8"), '{"status":"passed"}\n');

  if (process.platform !== "win32") {
    const target = resolve(directory, "outside.json");
    await fs.writeFile(target, "outside\n");
    await fs.rm(output);
    await fs.symlink(target, output);
    await assert.rejects(
      replaceRegularFileAtomically(output, '{"status":"failed"}\n'),
      /unsafe artifact/,
    );
    assert.equal(await fs.readFile(target, "utf8"), "outside\n");
    assert.equal((await fs.lstat(output)).isSymbolicLink(), true);
  }
  assert.deepEqual(
    (await fs.readdir(directory)).filter((name) => name.endsWith(".partial")),
    [],
  );
});

test("publishes a companion set only when every final path is free", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "selfhost-publish-set-"));
  workspaces.push(directory);
  const payload = resolve(directory, "payload.txt");
  const marker = resolve(directory, "manifest.json");
  await fs.writeFile(marker, "existing\n");

  await assert.rejects(
    publishRegularFilesExclusive([
      { path: payload, content: "payload\n" },
      { path: marker, content: "{}\n" },
    ]),
    /already exists/,
  );

  await assert.rejects(fs.lstat(payload), /ENOENT/);
  assert.equal(await fs.readFile(marker, "utf8"), "existing\n");
  await fs.rm(marker);
  await publishRegularFilesExclusive([
    { path: payload, content: "payload\n" },
    { path: marker, content: "{}\n" },
  ]);
  assert.equal(await fs.readFile(payload, "utf8"), "payload\n");
  assert.equal(await fs.readFile(marker, "utf8"), "{}\n");
  assert.deepEqual(
    (await fs.readdir(directory)).filter((name) => name.endsWith(".partial")),
    [],
  );
});

async function createBundle() {
  const directory = await fs.mkdtemp(join(tmpdir(), "selfhost-backup-test-"));
  workspaces.push(directory);
  await fs.mkdir(resolve(directory, "uploads/private"), { recursive: true });
  await fs.writeFile(resolve(directory, "database.dump"), "postgres-dump\n");
  await fs.writeFile(resolve(directory, "uploads/public.txt"), "public\n");
  await fs.writeFile(
    resolve(directory, "uploads/private/data.bin"),
    "private\n",
  );
  await fs.writeFile(
    resolve(directory, "configuration.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        settings: {
          SELF_HOST_MODE: "core-local",
          SELF_HOST_SITE_ADDRESS: "http://localhost:43210",
        },
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolve(directory, "secret-references.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        references: [
          { name: "SELF_HOST_AUTH_SECRET", present: true },
          { name: "SELF_HOST_DATABASE_PASSWORD", present: true },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const databasePath = resolve(directory, "database.dump");
  const uploadOne = await fs.stat(resolve(directory, "uploads/public.txt"));
  const uploadTwo = await fs.stat(
    resolve(directory, "uploads/private/data.bin"),
  );
  const manifest = {
    schemaVersion: 1,
    kind: "trainingload-selfhost-backup",
    backupId: "10000000-0000-4000-8000-000000000001",
    createdAt: "2026-10-17T05:00:00.000Z",
    release: {
      version: "1.1.13",
      configSchemaVersion: 1,
      sourceRevision: "a".repeat(40),
    },
    database: {
      engine: "postgresql",
      format: "pg_dump-custom",
      file: "database.dump",
      sizeBytes: (await fs.stat(databasePath)).size,
      logicalSizeBytes: 4096,
      sha256: await sha256File(databasePath),
      appliedMigrations: [{ id: "20261017090000_bootstrap", checksum: "abc" }],
      recordCounts: { selfHostInstance: 1, user: 1, activity: 2 },
    },
    uploads: {
      root: "uploads",
      fileCount: 2,
      sizeBytes: uploadOne.size + uploadTwo.size,
    },
    configuration: {
      snapshotFile: "configuration.json",
      secretReferencesFile: "secret-references.json",
    },
    integrity: { algorithm: "sha256", checksumsFile: "checksums.txt" },
    consistency: {
      method: "application-quiesce-plus-pg-dump",
      quiescedServices: ["client", "server"],
    },
    compatibility: {
      restoreMode: "exact-release",
      requiredReleaseVersion: "1.1.13",
    },
  };
  await fs.writeFile(
    resolve(directory, "backup-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await fs.writeFile(
    resolve(directory, "backup-result.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: "trainingload-selfhost-backup-result",
        backupId: manifest.backupId,
        status: "completed",
        verified: true,
      },
      null,
      2,
    )}\n`,
  );
  await createChecksums(directory);
  return { directory, manifest };
}

test("verifies a complete versioned backup bundle and its schema", async () => {
  const { directory, manifest } = await createBundle();
  const verified = await verifyBackupBundle(directory);
  assert.equal(verified.manifest.backupId, manifest.backupId);
  assert.equal(verified.manifest.uploads.fileCount, 2);
  assert.equal(verified.fileCount, 7);

  const schema = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "schemas/self-host-backup-manifest.schema.json"),
      "utf8",
    ),
  );
  const validate = new Ajv2020({
    strict: false,
    validateFormats: false,
  }).compile(schema);
  assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
});

test("detects content tampering and checksum inventory omissions", async () => {
  const { directory } = await createBundle();
  await fs.appendFile(resolve(directory, "uploads/public.txt"), "tampered\n");
  await assert.rejects(
    () => verifyBackupBundle(directory),
    /checksum mismatch/,
  );

  const second = await createBundle();
  await fs.writeFile(resolve(second.directory, "untracked.txt"), "extra\n");
  await assert.rejects(
    () => verifyBackupBundle(second.directory),
    /root entries are incomplete or unexpected/,
  );
});

test("rejects structurally downgraded bundles even after checksum regeneration", async () => {
  const first = await createBundle();
  const manifestPath = resolve(first.directory, "backup-manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.compatibility.requiredReleaseVersion = "1.1.12";
  manifest.unrecognizedPolicy = "ignore-me";
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await createChecksums(first.directory);
  await assert.rejects(
    () => verifyBackupBundle(first.directory),
    /manifest is invalid or incompatible/,
  );

  const second = await createBundle();
  await fs.rm(resolve(second.directory, "uploads"), {
    recursive: true,
    force: true,
  });
  const secondManifestPath = resolve(second.directory, "backup-manifest.json");
  const secondManifest = JSON.parse(
    await fs.readFile(secondManifestPath, "utf8"),
  );
  secondManifest.uploads.fileCount = 0;
  secondManifest.uploads.sizeBytes = 0;
  await fs.writeFile(
    secondManifestPath,
    `${JSON.stringify(secondManifest, null, 2)}\n`,
  );
  await createChecksums(second.directory);
  await assert.rejects(
    () => verifyBackupBundle(second.directory),
    /root entries are incomplete or unexpected/,
  );
});

test("rejects symlinks and secret values in portable backup metadata", async () => {
  assert.throws(
    () =>
      assertPortablePathInventory(
        [
          { path: "Uploads/first", kind: "file" },
          { path: "uploads/second", kind: "file" },
        ],
        "fixture",
      ),
    /path collision/,
  );
  assert.throws(
    () =>
      assertPortablePathInventory(
        [
          { path: "uploads", kind: "file" },
          { path: "uploads/second", kind: "file" },
        ],
        "fixture",
      ),
    /path collision/,
  );
  assert.throws(
    () =>
      assertPortablePathInventory(
        [
          { path: "caf\u00e9/first", kind: "file" },
          { path: "cafe\u0301/second", kind: "file" },
        ],
        "fixture",
      ),
    /path collision/,
  );
  const { directory } = await createBundle();
  await fs.symlink("public.txt", resolve(directory, "uploads/link"));
  await assert.rejects(() => verifyBackupBundle(directory), /symbolic link/);

  const second = await createBundle();
  await fs.writeFile(
    resolve(second.directory, "configuration.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      settings: { SELF_HOST_AUTH_SECRET: "must-not-appear" },
    })}\n`,
  );
  await createChecksums(second.directory);
  await assert.rejects(
    () => verifyBackupBundle(second.directory),
    /unsafe setting/,
  );

  const third = await createBundle();
  await fs.writeFile(resolve(third.directory, "uploads/CON"), "reserved\n");
  await assert.rejects(
    () => verifyBackupBundle(third.directory),
    /unsafe backup path/,
  );
});

test("normalizes backup directories and files to private permissions", async () => {
  const { directory } = await createBundle();
  await fs.chmod(directory, 0o755);
  await fs.chmod(resolve(directory, "uploads"), 0o755);
  await fs.chmod(resolve(directory, "uploads/public.txt"), 0o644);
  await normalizePrivateTree(directory);

  assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
  assert.equal(
    (await fs.stat(resolve(directory, "uploads"))).mode & 0o777,
    0o700,
  );
  assert.equal(
    (await fs.stat(resolve(directory, "uploads/public.txt"))).mode & 0o777,
    0o600,
  );
});

test("copies regular files through one bounded immutable snapshot primitive", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "selfhost-copy-bound-"));
  workspaces.push(directory);
  const source = resolve(directory, "source.bin");
  const destination = resolve(directory, "nested/destination.bin");
  await fs.writeFile(source, "bounded-copy\n");
  const sizeBytes = (await fs.stat(source)).size;

  const copied = await copyRegularFileBounded(source, destination, {
    minimumBytes: 1,
    maximumBytes: sizeBytes,
    expectedSizeBytes: sizeBytes,
    label: "fixture copy",
  });
  assert.equal(copied.sizeBytes, sizeBytes);
  assert.equal(await fs.readFile(destination, "utf8"), "bounded-copy\n");
  const read = await readRegularFileBounded(destination, {
    minimumBytes: 1,
    maximumBytes: sizeBytes,
    expectedSizeBytes: sizeBytes,
    label: "fixture read",
  });
  assert.equal(read.contents.toString("utf8"), "bounded-copy\n");
  assert.equal(read.stat.size, sizeBytes);
  const streamedChunks = [];
  const streamed = await consumeRegularFileBounded(
    destination,
    (chunk) => streamedChunks.push(Buffer.from(chunk)),
    {
      minimumBytes: 1,
      maximumBytes: sizeBytes,
      expectedSizeBytes: sizeBytes,
      chunkBytes: 4,
      label: "fixture stream",
    },
  );
  assert.equal(
    Buffer.concat(streamedChunks).toString("utf8"),
    "bounded-copy\n",
  );
  assert.equal(streamed.stat.size, sizeBytes);
  assert.equal(
    await sha256File(destination),
    "a44c1e963ea3d98fc087d76e01c486000d4c9fd5fd0601e53363bdf54269bdb7",
  );
  if (process.platform !== "win32") {
    assert.equal((await fs.stat(destination)).mode & 0o777, 0o600);
  }

  await assert.rejects(
    copyRegularFileBounded(source, resolve(directory, "oversized.bin"), {
      maximumBytes: sizeBytes - 1,
      label: "fixture copy",
    }),
    /not a bounded regular file/,
  );
  await assert.rejects(
    readRegularFileBounded(source, {
      maximumBytes: sizeBytes,
      expectedSizeBytes: sizeBytes - 1,
      label: "fixture read",
    }),
    /not a bounded regular file/,
  );
  await assert.rejects(
    copyRegularFileBounded(source, destination, {
      maximumBytes: sizeBytes,
      label: "fixture copy",
    }),
    /EEXIST/,
  );
  assert.equal(await fs.readFile(destination, "utf8"), "bounded-copy\n");

  if (process.platform !== "win32") {
    const symlink = resolve(directory, "source-link.bin");
    await fs.symlink(source, symlink);
    await assert.rejects(
      readRegularFileBounded(symlink, {
        maximumBytes: sizeBytes,
        label: "fixture read",
      }),
      /not a bounded regular file/,
    );
    await assert.rejects(sha256File(symlink), /not a bounded regular file/);
    await assert.rejects(
      consumeRegularFileBounded(symlink, () => undefined, {
        maximumBytes: sizeBytes,
        label: "fixture stream",
      }),
      /not a bounded regular file/,
    );
  }
});

test("bounds portable tree breadth, depth, and backup upload count", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "selfhost-tree-limit-"));
  workspaces.push(directory);
  await fs.writeFile(resolve(directory, "one"), "1");
  await fs.writeFile(resolve(directory, "two"), "2");

  await assert.rejects(
    () => readDirectoryEntriesBounded(directory, 1),
    DirectoryEntryLimitError,
  );
  await assert.rejects(
    () =>
      inspectRegularTree(directory, {
        maximumFiles: 1,
        maximumDirectories: 8,
        maximumDepth: 8,
      }),
    DirectoryEntryLimitError,
  );

  const deepRoot = await fs.mkdtemp(join(tmpdir(), "selfhost-depth-limit-"));
  workspaces.push(deepRoot);
  await fs.mkdir(resolve(deepRoot, "one/two/three"), { recursive: true });
  await assert.rejects(
    () =>
      inspectRegularTree(deepRoot, {
        maximumFiles: 8,
        maximumDirectories: 8,
        maximumDepth: 2,
      }),
    /maximum directory depth/,
  );

  const schema = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "schemas/self-host-backup-manifest.schema.json"),
      "utf8",
    ),
  );
  assert.equal(
    schema.properties.uploads.properties.fileCount.maximum,
    BACKUP_ARTIFACT_LIMITS.maximumUploadFiles,
  );

  const budget = { consumedBytes: 3, maximumBytes: 5 };
  assert.equal(consumeByteBudget(budget, 2), 5);
  assert.throws(() => consumeByteBudget(budget, 1), CumulativeByteLimitError);
});

test("copies regular trees within frozen per-file and aggregate bounds", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "selfhost-tree-copy-"));
  workspaces.push(directory);
  const source = resolve(directory, "source");
  const destination = resolve(directory, "destination");
  await fs.mkdir(resolve(source, "nested"), { recursive: true });
  await fs.writeFile(resolve(source, "plain.txt"), "plain\n", { mode: 0o644 });
  await fs.writeFile(resolve(source, "nested/tool"), "tool\n", {
    mode: 0o755,
  });
  const snapshot = await copyRegularTreeBounded(source, destination, {
    maximumBytes: 11,
    maximumFileBytes: 6,
    maximumFiles: 2,
    maximumDirectories: 1,
    maximumDepth: 1,
    fileMode: (file) => file.mode,
    label: "fixture tree copy",
  });
  assert.deepEqual(
    snapshot.files.map(({ relativePath, sizeBytes }) => ({
      relativePath,
      sizeBytes,
    })),
    [
      { relativePath: "nested/tool", sizeBytes: 5 },
      { relativePath: "plain.txt", sizeBytes: 6 },
    ],
  );
  assert.equal(
    await fs.readFile(resolve(destination, "nested/tool"), "utf8"),
    "tool\n",
  );
  if (process.platform !== "win32") {
    assert.equal(
      (await fs.stat(resolve(destination, "nested/tool"))).mode & 0o777,
      0o755,
    );
  }

  await assert.rejects(
    copyRegularTreeBounded(source, resolve(directory, "too-small"), {
      maximumBytes: 10,
      maximumFileBytes: 6,
      maximumFiles: 2,
      maximumDirectories: 1,
      maximumDepth: 1,
      label: "fixture tree copy",
    }),
    CumulativeByteLimitError,
  );
  await assert.rejects(fs.lstat(resolve(directory, "too-small")), /ENOENT/);

  const invalidModeDestination = resolve(directory, "invalid-mode");
  await assert.rejects(
    copyRegularTreeBounded(source, invalidModeDestination, {
      maximumBytes: 11,
      maximumFileBytes: 6,
      maximumFiles: 2,
      maximumDirectories: 1,
      maximumDepth: 1,
      fileMode: (file) => (file.relativePath === "plain.txt" ? 0o1000 : 0o600),
      label: "fixture tree copy",
    }),
    /selected an invalid mode/,
  );
  await assert.rejects(fs.lstat(invalidModeDestination), /ENOENT/);
});
