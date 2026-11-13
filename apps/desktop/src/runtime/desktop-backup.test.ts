import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { initializeDataRoot } from "./data-root.js";
import {
  createDesktopBackupBundle,
  restoreDesktopBackupBundle,
} from "./desktop-backup.js";

test("backs up and restores database plus uploads without credentials", async () => {
  const workspace = await mkdtemp(
    join(tmpdir(), "trainingload-desktop-backup-"),
  );
  try {
    const source = await initializeDataRoot(join(workspace, "source"));
    const target = await initializeDataRoot(join(workspace, "target"));
    const bundle = join(workspace, "snapshot.trainingload-backup");
    await mkdir(join(source.uploads, "activities"), { recursive: true });
    await writeFile(
      join(source.uploads, "activities", "sample.fit"),
      "fit-data",
    );
    await createDesktopBackupBundle({
      source,
      destination: bundle,
      backupDatabase: (destination) => writeFile(destination, "database-data"),
    });
    await restoreDesktopBackupBundle({
      source: bundle,
      target,
      restoreDatabase: async (backup, database) => {
        await mkdir(database, { recursive: true });
        await writeFile(join(database, "restored"), await readFile(backup));
      },
    });
    assert.equal(
      await readFile(join(target.database, "restored"), "utf8"),
      "database-data",
    );
    assert.equal(
      await readFile(join(target.uploads, "activities", "sample.fit"), "utf8"),
      "fit-data",
    );
    const manifest = await readFile(join(bundle, "manifest.json"), "utf8");
    assert.match(manifest, /re-enter-external-api-keys/);
    assert.doesNotMatch(manifest, /credential-vault|secret-value|sk-[a-z0-9]/i);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("validates the complete bundle before changing the restore target", async () => {
  const workspace = await mkdtemp(
    join(tmpdir(), "trainingload-desktop-tamper-"),
  );
  try {
    const source = await initializeDataRoot(join(workspace, "source"));
    const target = await initializeDataRoot(join(workspace, "target"));
    const bundle = join(workspace, "snapshot.trainingload-backup");
    await writeFile(join(source.uploads, "sample.fit"), "original");
    await createDesktopBackupBundle({
      source,
      destination: bundle,
      backupDatabase: (destination) => writeFile(destination, "database-data"),
    });
    await writeFile(join(bundle, "uploads", "sample.fit"), "tampered");
    await assert.rejects(
      restoreDesktopBackupBundle({
        source: bundle,
        target,
        restoreDatabase: async () => {
          throw new Error("must not be called");
        },
      }),
      (error: { code?: string }) =>
        error.code === "DESKTOP_BACKUP_CHECKSUM_MISMATCH",
    );
    assert.equal(
      await readFile(join(bundle, "database.pglite.gz"), "utf8"),
      "database-data",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
