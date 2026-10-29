import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import pg from "pg";
import { runCoreMigrations } from "./core-migration-runner.mjs";

const { Client } = pg;

async function withPglite(run) {
  const root = await mkdtemp(join(tmpdir(), "trainingload-core-migration-"));
  const db = await PGlite.create(`file://${root}`);
  const socket = new PGLiteSocketServer({
    db,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 4,
  });
  await socket.start();
  try {
    await run(`postgresql://postgres@${socket.getServerConn()}/postgres`);
  } finally {
    await socket.stop();
    await db.close();
    await rm(root, { recursive: true, force: true });
  }
}

async function query(databaseUrl, sql, params = []) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function createLegacyMigrationHead(
  databaseUrl,
  {
    complete = true,
    head = "20261021090000_add_subscription_access_grant_type",
  } = {},
) {
  assert.match(head, /^\d{14}_[a-z0-9_]+$/);
  await query(
    databaseUrl,
    `
      CREATE TABLE "_prisma_migrations" (
        "migration_name" text PRIMARY KEY,
        "finished_at" timestamptz,
        "rolled_back_at" timestamptz
      );
      INSERT INTO "_prisma_migrations" ("migration_name", "finished_at")
      VALUES ('${head}', now());
      CREATE TABLE "t_user" ("id" text PRIMARY KEY);
    `,
  );
  if (!complete) return;
  await query(
    databaseUrl,
    `
      CREATE TABLE "t_activity" ("id" integer PRIMARY KEY);
      CREATE TABLE "t_plan" ("id" text PRIMARY KEY);
      CREATE TABLE "t_self_host_instance" (
        "id" text PRIMARY KEY,
        "ai_provider" text,
        "ai_base_url" text,
        "ai_flash_model" text,
        "ai_pro_model" text,
        "ai_api_key_encrypted" text,
        "ai_config_updated_at" timestamp(3)
      );
      CREATE TYPE "enum_ai_usage_kind" AS ENUM ('COACH_CHAT', 'OTHER');
      CREATE TYPE "enum_ai_model_tier" AS ENUM ('FLASH', 'PRO');
      CREATE TABLE "t_ai_usage_event" (
        "id" text PRIMARY KEY,
        "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "user_id" text,
        "action_id" text,
        "kind" "enum_ai_usage_kind" NOT NULL,
        "model_tier" "enum_ai_model_tier"
      );
      INSERT INTO "t_user" ("id") VALUES ('legacy-user');
      INSERT INTO "t_self_host_instance" (
        "id", "ai_provider", "ai_base_url", "ai_flash_model", "ai_pro_model"
      ) VALUES (
        '1', 'openai-compatible', 'https://ai.invalid/v1', 'legacy-default', 'legacy-reasoning'
      );
      INSERT INTO "t_ai_usage_event" (
        "id", "user_id", "action_id", "kind", "model_tier"
      ) VALUES (
        'legacy-usage', 'legacy-user', 'legacy-action', 'COACH_CHAT', 'PRO'
      );
    `,
  );
}

test("PGlite applies the Core baseline exactly once and serializes concurrent startup", async () => {
  await withPglite(async (databaseUrl) => {
    const [first, second] = await Promise.all([
      runCoreMigrations({ databaseUrl, dialect: "pglite" }),
      runCoreMigrations({ databaseUrl, dialect: "pglite" }),
    ]);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    const ledger = await query(
      databaseUrl,
      'SELECT "id", "source" FROM "_trainingload_core_migrations" ORDER BY "id"',
    );
    assert.deepEqual(ledger.rows, [
      { id: "0001_core_baseline", source: "baseline" },
      { id: "0002_neutral_ai_operations", source: "baseline" },
      { id: "0003_self_host_ai_configuration", source: "baseline" },
      { id: "0004_core_ai_usage_compatibility", source: "baseline" },
      { id: "0005_self_host_ai_model_metadata", source: "baseline" },
      {
        id: "0006_self_host_operation_analytics_consent",
        source: "baseline",
      },
      { id: "0007_single_owner", source: "baseline" },
      { id: "0008_core_domain_invariants", source: "baseline" },
      { id: "0009_core_preference_defaults", source: "baseline" },
      { id: "0010_background_coach_runs", source: "baseline" },
      { id: "0011_background_coach_task_kinds", source: "baseline" },
      { id: "0012_today_suggestion_action_loop", source: "baseline" },
      { id: "0013_better_auth_jwks_metadata", source: "baseline" },
      { id: "0014_better_auth_oauth_provider_17", source: "baseline" },
    ]);
    const relation = await query(
      databaseUrl,
      "SELECT to_regclass('public.t_user')::text AS relation",
    );
    assert.equal(relation.rows[0]?.relation, "t_user");
    assert.equal(
      (await query(databaseUrl, 'SELECT COUNT(*)::int AS count FROM "t_enum"'))
        .rows[0].count,
      9,
    );
    const operationRelation = await query(
      databaseUrl,
      "SELECT to_regclass('public.t_ai_operation')::text AS relation",
    );
    assert.equal(operationRelation.rows[0]?.relation, "t_ai_operation");
    const jwksColumns = await query(
      databaseUrl,
      `SELECT "column_name" FROM information_schema.columns WHERE "table_schema" = 'public' AND "table_name" = 't_jwks' ORDER BY "column_name"`,
    );
    assert.deepEqual(
      jwksColumns.rows.map((row) => row.column_name),
      [
        "alg",
        "created_at",
        "crv",
        "expires_at",
        "id",
        "private_key",
        "public_key",
      ],
    );
    const oauthResourceRelation = await query(
      databaseUrl,
      "SELECT to_regclass('public.t_oauth_resource')::text AS relation",
    );
    assert.equal(oauthResourceRelation.rows[0]?.relation, "t_oauth_resource");
  });
});

test("PGlite rejects an unknown non-empty lineage with a stable error code", async () => {
  await withPglite(async (databaseUrl) => {
    await query(
      databaseUrl,
      'CREATE TABLE "unexpected_legacy_table" ("id" text PRIMARY KEY)',
    );
    await assert.rejects(
      runCoreMigrations({ databaseUrl, dialect: "pglite" }),
      (error) => error?.code === "CORE_MIGRATION_UNKNOWN_LEGACY_LINEAGE",
    );
  });
});

test("PGlite rejects a changed applied checksum with a stable error code", async () => {
  await withPglite(async (databaseUrl) => {
    await runCoreMigrations({ databaseUrl, dialect: "pglite" });
    await query(
      databaseUrl,
      'UPDATE "_trainingload_core_migrations" SET "sha256" = $1 WHERE "id" = $2',
      ["invalid", "0001_core_baseline"],
    );
    await assert.rejects(
      runCoreMigrations({ databaseUrl, dialect: "pglite" }),
      (error) => error?.code === "CORE_MIGRATION_CHECKSUM_MISMATCH",
    );
  });
});

test("PGlite refuses the former self-host AI configuration production head", async () => {
  await withPglite(async (databaseUrl) => {
    await createLegacyMigrationHead(databaseUrl, {
      head: "20261019090000_self_host_ai_configuration",
    });
    await assert.rejects(
      runCoreMigrations({ databaseUrl, dialect: "pglite" }),
      (error) => error.code === "CORE_MIGRATION_UNKNOWN_LEGACY_LINEAGE",
    );
  });
});

test("PGlite refuses a Managed migration head without mutating its data", async () => {
  await withPglite(async (databaseUrl) => {
    await createLegacyMigrationHead(databaseUrl);
    await assert.rejects(
      runCoreMigrations({ databaseUrl, dialect: "pglite" }),
      (error) => error.code === "CORE_MIGRATION_UNKNOWN_LEGACY_LINEAGE",
    );
    const usage = await query(
      databaseUrl,
      'SELECT "id" FROM "t_ai_usage_event" WHERE "id" = $1',
      ["legacy-usage"],
    );
    assert.equal(usage.rows.length, 1);
    const ledger = await query(
      databaseUrl,
      "SELECT to_regclass('public._trainingload_core_migrations') AS ledger",
    );
    assert.equal(ledger.rows[0].ledger, null);
  });
});

test("PGlite rejects a partial Managed structure", async () => {
  await withPglite(async (databaseUrl) => {
    await createLegacyMigrationHead(databaseUrl, { complete: false });
    await assert.rejects(
      runCoreMigrations({ databaseUrl, dialect: "pglite" }),
      (error) => error?.code === "CORE_MIGRATION_UNKNOWN_LEGACY_LINEAGE",
    );
  });
});

test("PGlite rejects a second user at the database boundary", async () => {
  await withPglite(async (databaseUrl) => {
    await runCoreMigrations({ databaseUrl, dialect: "pglite" });
    const insert = `INSERT INTO "t_user" ("id", "name", "email", "email_verified", "created_at", "updated_at") VALUES ($1, 'Owner', $2, true, now(), now())`;
    await query(databaseUrl, insert, ["owner-1", "one@self-host.invalid"]);
    await assert.rejects(
      query(databaseUrl, insert, ["owner-2", "two@self-host.invalid"]),
      (error) =>
        error.code === "23505" &&
        error.constraint === "t_user_single_owner_key",
    );
    assert.equal(
      (await query(databaseUrl, 'SELECT count(*)::int AS count FROM "t_user"'))
        .rows[0].count,
      1,
    );
  });
});

test("Core empty install contains sports, import mappings and live fitness revision triggers", async () => {
  await withPglite(async (databaseUrl) => {
    await runCoreMigrations({ databaseUrl, dialect: "pglite" });
    assert.equal(
      (
        await query(
          databaseUrl,
          "SELECT count(*)::int AS n FROM t_sport_definition",
        )
      ).rows[0].n,
      19,
    );
    const mapping = await query(
      databaseUrl,
      "SELECT count(*)::int AS n FROM t_provider_sport_mapping WHERE provider='upload'",
    );
    assert.ok(mapping.rows[0].n > 0);
    await query(
      databaseUrl,
      `INSERT INTO t_user (id,name,email,email_verified,created_at,updated_at) VALUES ('owner','Owner','owner@self-host.invalid',true,now(),now());
      INSERT INTO t_activity (updated_at,hash_id,user_id,activity_name) VALUES (now(),'training-fixture','owner','Training');`,
    );
    const before = (
      await query(
        databaseUrl,
        "SELECT revision FROM t_fitness_evidence_revision WHERE user_id='owner'",
      )
    ).rows[0].revision;
    await query(
      databaseUrl,
      "UPDATE t_activity SET activity_name='Updated' WHERE hash_id='training-fixture'",
    );
    const after = (
      await query(
        databaseUrl,
        "SELECT revision FROM t_fitness_evidence_revision WHERE user_id='owner'",
      )
    ).rows[0].revision;
    assert.equal(BigInt(after), BigInt(before) + 1n);
    await assert.rejects(
      query(
        databaseUrl,
        `INSERT INTO t_self_host_instance (id,state,bootstrap_token_hash,bootstrap_token_expires_at,updated_at)
      VALUES (2,'PENDING','test-hash',now(),now())`,
      ),
      (error) => error.code === "23514",
    );
  });
});
