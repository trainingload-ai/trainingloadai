import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { once } from "node:events";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import { initializeDataRoot } from "./data-root.js";
import {
  DesktopPgliteService,
  restorePgliteBackup,
  readDesktopCredentialState,
} from "./pglite-service.js";
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
    assert.deepEqual(await service.credentialState(), {
      initialized: false,
      encryptedAuthKey: null,
    });
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

test("an existing instance or data record without a JWT key is never treated as a fresh database", async () => {
  // In-memory schema-only sentinels: no Core Owner or bootstrap operation.
  const database = await PGlite.create();
  try {
    await database.exec(`
      CREATE TABLE t_self_host_instance (id integer);
      CREATE TABLE t_user (id text);
      CREATE TABLE t_jwks (private_key text, created_at timestamp);
    `);
    assert.deepEqual(await readDesktopCredentialState(database), {
      initialized: false,
      encryptedAuthKey: null,
    });
    for (const statement of [
      "INSERT INTO t_self_host_instance VALUES (1)",
      "DELETE FROM t_self_host_instance; INSERT INTO t_user VALUES ('synthetic-row')",
    ]) {
      await database.exec(statement);
      assert.deepEqual(await readDesktopCredentialState(database), {
        initialized: true,
        encryptedAuthKey: null,
      });
    }
    await database.exec(
      "INSERT INTO t_jwks VALUES ('synthetic-encrypted-probe', now())",
    );
    assert.deepEqual(await readDesktopCredentialState(database), {
      initialized: true,
      encryptedAuthKey: "synthetic-encrypted-probe",
    });
  } finally {
    await database.close();
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
