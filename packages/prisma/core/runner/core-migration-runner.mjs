import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const coreRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = resolve(coreRoot, "migrations");
const manifest = JSON.parse(
  await readFile(resolve(migrationsRoot, "manifest.json"), "utf8"),
);
const legacy = JSON.parse(
  await readFile(resolve(migrationsRoot, "legacy-heads.json"), "utf8"),
);
const databaseUrl = process.env.DATABASE_URL?.trim();
let pgliteMigrationTail = Promise.resolve();

class CoreMigrationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function relationExists(client, relation) {
  const result = await client.query("SELECT to_regclass($1) AS relation", [
    `public.${relation}`,
  ]);
  return Boolean(result.rows[0]?.relation);
}

async function userRelationCount(client) {
  const result = await client.query(`
    SELECT count(*)::int AS count
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_trainingload_core_migrations'
  `);
  return Number(result.rows[0]?.count ?? 0);
}

async function createLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_trainingload_core_migrations" (
      "id" text PRIMARY KEY,
      "sha256" text NOT NULL,
      "applied_at" timestamptz NOT NULL DEFAULT now(),
      "source" text NOT NULL CHECK ("source" IN ('baseline', 'legacy-bridge'))
    )
  `);
}

async function verifyManifest() {
  const migrations = [];
  for (const entry of manifest.migrations ?? []) {
    const sql = await readFile(resolve(migrationsRoot, entry.file));
    const actual = sha256(sql);
    if (actual !== entry.sha256) {
      throw new CoreMigrationError(
        "CORE_MIGRATION_MANIFEST_MISMATCH",
        `Checksum mismatch for ${entry.id}`,
        { migrationId: entry.id, expected: entry.sha256, actual },
      );
    }
    migrations.push({ ...entry, sql: sql.toString("utf8") });
  }
  return migrations;
}

async function detectLegacyHead(client) {
  if (!(await relationExists(client, "_prisma_migrations"))) return null;
  const result = await client.query(`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at DESC, migration_name DESC
    LIMIT 1
  `);
  return result.rows[0]?.migration_name ?? null;
}

async function verifyLegacyStructure(client) {
  const missing = [];
  for (const relation of legacy.requiredRelations ?? []) {
    if (!(await relationExists(client, relation))) missing.push(relation);
  }
  if (missing.length) {
    throw new CoreMigrationError(
      "CORE_MIGRATION_LEGACY_STRUCTURE_MISMATCH",
      "Legacy database is missing required Core relations",
      { missing },
    );
  }
}

async function applyMigrations(client, migrations) {
  const appliedResult = await client.query(
    'SELECT "id", "sha256" FROM "_trainingload_core_migrations" ORDER BY "id"',
  );
  const applied = new Map(appliedResult.rows.map((row) => [row.id, row.sha256]));
  for (const [id, checksum] of applied) {
    const expected = migrations.find((entry) => entry.id === id)?.sha256;
    if (!expected) {
      throw new CoreMigrationError(
        "CORE_MIGRATION_UNKNOWN_APPLIED",
        `Database contains an unknown Core migration: ${id}`,
        { migrationId: id },
      );
    }
    if (expected !== checksum) {
      throw new CoreMigrationError(
        "CORE_MIGRATION_CHECKSUM_MISMATCH",
        `Applied Core migration checksum differs: ${id}`,
        { migrationId: id, expected, actual: checksum },
      );
    }
  }
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO "_trainingload_core_migrations" ("id", "sha256", "source") VALUES ($1, $2, $3)',
        [migration.id, migration.sha256, "baseline"],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
}

async function runCoreMigrationsUnlocked(options = {}) {
  const connectionString = options.databaseUrl ?? databaseUrl;
  const dialect = options.dialect === "pglite" ? "pglite" : "postgresql";
  if (!connectionString) {
    throw new CoreMigrationError(
      "CORE_MIGRATION_DATABASE_URL_MISSING",
      "DATABASE_URL is required",
    );
  }
  const migrations = await verifyManifest();
  const client = new Client({ connectionString });
  await client.connect();
  let lockAcquired = false;
  try {
    if (dialect === "postgresql") {
      await client.query("SELECT pg_advisory_lock($1, $2)", [1414677842, 1]);
      lockAcquired = true;
    }
    const existingRelations = await userRelationCount(client);
    const coreLedger = await relationExists(client, '_trainingload_core_migrations');
    if (await relationExists(client, '_prisma_migrations') || (!coreLedger && existingRelations > 0)) {
      throw new CoreMigrationError('CORE_MIGRATION_UNKNOWN_LEGACY_LINEAGE',
        'Public migrations require an empty database or their own Core lineage');
    }
    await createLedger(client);
    const ledger = await client.query(
      'SELECT count(*)::int AS count FROM "_trainingload_core_migrations"',
    );
    if (Number(ledger.rows[0]?.count ?? 0) === 0 && existingRelations > 0) {
      const legacyHead = await detectLegacyHead(client);
      if (!legacyHead || !(legacy.acceptedHeads ?? []).includes(legacyHead)) {
        throw new CoreMigrationError(
          "CORE_MIGRATION_UNKNOWN_LEGACY_LINEAGE",
          "Database is neither empty nor at an accepted legacy head",
          { legacyHead },
        );
      }
      await verifyLegacyStructure(client);
      const baseline = migrations[0];
      await client.query(
        'INSERT INTO "_trainingload_core_migrations" ("id", "sha256", "source") VALUES ($1, $2, $3)',
        [baseline.id, baseline.sha256, "legacy-bridge"],
      );
    }
    await applyMigrations(client, migrations);
    return { ok: true, applied: migrations.map((entry) => entry.id), dialect };
  } finally {
    if (lockAcquired) {
      await client
        .query("SELECT pg_advisory_unlock($1, $2)", [1414677842, 1])
        .catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}

export function runCoreMigrations(options = {}) {
  const requestedDialect =
    options.dialect ??
    (process.env.CORE_MIGRATION_DIALECT === "pglite" ? "pglite" : "postgresql");
  const normalizedOptions = { ...options, dialect: requestedDialect };
  if (requestedDialect !== "pglite") {
    return runCoreMigrationsUnlocked(normalizedOptions);
  }

  // PGlite does not implement PostgreSQL advisory locks. Serialize migration
  // attempts inside the desktop process so two local startup paths cannot race.
  const run = pgliteMigrationTail.then(
    () => runCoreMigrationsUnlocked(normalizedOptions),
    () => runCoreMigrationsUnlocked(normalizedOptions),
  );
  pgliteMigrationTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runCoreMigrations();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const payload = {
      ok: false,
      error: {
        code: error?.code ?? "CORE_MIGRATION_FAILED",
        message: error instanceof Error ? error.message : String(error),
        details: error?.details ?? {},
      },
    };
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = 1;
  }
}
