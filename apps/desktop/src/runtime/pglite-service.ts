import { readFile, writeFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

import { assertEmptyDatabaseDirectory } from "./data-root.js";

export class DesktopPgliteService {
  private database?: PGlite;
  private socket?: PGLiteSocketServer;

  async start(
    databaseDirectory: string,
    migrationRunner: string,
  ): Promise<string> {
    // Resolve from the same Core as the server and client, before opening data.
    const { runCoreMigrations } = await import(
      pathToFileURL(migrationRunner).href
    );
    this.database = await PGlite.create(databaseDirectory);
    this.socket = new PGLiteSocketServer({
      db: this.database,
      host: "127.0.0.1",
      port: 0,
      maxConnections: 8,
    });
    await this.socket.start();
    // PGlite multiplexes clients over one backend session. Keep Prisma on one
    // connection and discard prepared statements when a client is reused.
    const databaseUrl = `postgresql://postgres@${this.socket.getServerConn()}/postgres?connection_limit=1&statement_cache_size=0&pgbouncer=true`;
    await runCoreMigrations({ databaseUrl, dialect: "pglite" });
    return databaseUrl;
  }

  async backup(destination: string): Promise<void> {
    if (!this.database) throw new Error("PGlite is not running");
    const archive = await this.database.dumpDataDir("gzip");
    await writeFile(destination, new Uint8Array(await archive.arrayBuffer()), {
      mode: 0o600,
    });
  }

  async authKeyProbe(): Promise<string | null> {
    if (!this.database) throw new Error("PGlite is not running");
    const result = await this.database.query<{ private_key: string }>(
      "SELECT private_key FROM t_jwks ORDER BY created_at DESC LIMIT 1",
    );
    return result.rows[0]?.private_key ?? null;
  }

  async stop(): Promise<void> {
    await this.socket?.stop();
    // pglite-socket schedules socket-close cleanup with setImmediate, after
    // its stop() promise resolves. Drain that cleanup while the DB is alive.
    await setImmediate();
    await this.database?.close();
    this.socket = undefined;
    this.database = undefined;
  }
}

export async function restorePgliteBackup(
  backupPath: string,
  databaseDirectory: string,
): Promise<void> {
  await assertEmptyDatabaseDirectory(databaseDirectory);
  const bytes = await readFile(backupPath);
  const archive = new Uint8Array(bytes.byteLength);
  archive.set(bytes);
  const database = await PGlite.create(databaseDirectory, {
    loadDataDir: new Blob([archive]),
  });
  await database.close();
}
