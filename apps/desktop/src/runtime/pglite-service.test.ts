import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { once } from "node:events";
import test from "node:test";

import { initializeDataRoot } from "./data-root.js";
import { DesktopPgliteService, restorePgliteBackup } from "./pglite-service.js";
import { resolveDesktopRuntimeEntries } from "./runtime-entry.js";

const { databaseRunner } = await resolveDesktopRuntimeEntries(
  resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
);

test("backs up and restores PGlite in paths with spaces and Unicode only into an empty database directory", async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "trainingload desktop 源-"));
  const targetRoot = await mkdtemp(
    join(tmpdir(), "trainingload desktop 目标-"),
  );
  const service = new DesktopPgliteService();
  try {
    const source = await initializeDataRoot(sourceRoot);
    const target = await initializeDataRoot(targetRoot);
    await service.start(source.database, databaseRunner);
    const backup = join(source.backups, "database.tgz");
    await service.backup(backup);
    await service.stop();
    await restorePgliteBackup(backup, target.database);
    await assert.rejects(
      restorePgliteBackup(backup, target.database),
      (error: { code?: string }) =>
        error.code === "DESKTOP_RESTORE_TARGET_NOT_EMPTY",
    );
  } finally {
    await service.stop();
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("shutdown drains pending socket-close handlers before closing PGlite", async () => {
  const root = await mkdtemp(join(tmpdir(), "trainingload-desktop-shutdown-"));
  const service = new DesktopPgliteService();
  try {
    const url = new URL(
      await service.start(join(root, "database"), databaseRunner),
    );
    const socket = createConnection({
      host: url.hostname,
      port: Number(url.port),
    });
    await once(socket, "connect");
    socket.destroy();
    await once(socket, "close");
    await service.stop();
  } finally {
    await service.stop();
    await rm(root, { recursive: true, force: true });
  }
});
