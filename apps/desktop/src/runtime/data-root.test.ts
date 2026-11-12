import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertEmptyDatabaseDirectory,
  initializeDataRoot,
  resolveDefaultDataRoot,
} from "./data-root.js";

test("initializes and reopens an owned desktop data root", async () => {
  const root = await mkdtemp(join(tmpdir(), "trainingload-desktop-root-"));
  try {
    const initialized = await initializeDataRoot(root);
    assert.equal(
      (await initializeDataRoot(root)).database,
      initialized.database,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("defaults to user/data and migrates an owned legacy directory intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "trainingload-desktop-default-"));
  try {
    const expected = join(root, "user", "data");
    assert.equal(await resolveDefaultDataRoot(root), expected);
    const legacy = await initializeDataRoot(join(root, "data"));
    await writeFile(join(legacy.uploads, "sample.fit"), "existing activity");
    assert.equal(await resolveDefaultDataRoot(root), expected);
    assert.equal(
      await readFile(join(expected, "uploads", "sample.fit"), "utf8"),
      "existing activity",
    );
    await assert.rejects(access(legacy.root), { code: "ENOENT" });
    assert.equal(await resolveDefaultDataRoot(root), expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses unknown legacy data or conflicting targets without changing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "trainingload-desktop-conflict-"));
  try {
    const legacy = join(root, "data");
    await mkdir(legacy);
    await writeFile(join(legacy, "unknown.txt"), "keep legacy");
    await assert.rejects(resolveDefaultDataRoot(root), {
      code: "DESKTOP_LEGACY_DATA_ROOT_INVALID",
    });
    await assert.rejects(access(join(root, "user")), { code: "ENOENT" });
    await rm(join(legacy, "unknown.txt"));
    await initializeDataRoot(legacy);
    const target = join(root, "user", "data");
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "unknown.txt"), "keep target");
    await assert.rejects(resolveDefaultDataRoot(root), {
      code: "DESKTOP_DATA_ROOT_CONFLICT",
    });
    await access(join(legacy, ".trainingload-desktop.json"));
    assert.equal(
      await readFile(join(target, "unknown.txt"), "utf8"),
      "keep target",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unknown non-empty data roots and non-empty restore targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "trainingload-desktop-unknown-"));
  try {
    await writeFile(join(root, "unknown.txt"), "data");
    await assert.rejects(
      initializeDataRoot(root),
      (error: { code?: string }) =>
        error.code === "DESKTOP_DATA_ROOT_NOT_EMPTY",
    );
    const database = join(root, "database");
    await mkdir(database);
    await writeFile(join(database, "existing"), "data");
    await assert.rejects(
      assertEmptyDatabaseDirectory(database),
      (error: { code?: string }) =>
        error.code === "DESKTOP_RESTORE_TARGET_NOT_EMPTY",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
