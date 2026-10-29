import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import pg from "pg";

import { runCoreMigrations } from "./core-migration-runner.mjs";

const { Client } = pg;
const adminUrl = process.env.CORE_MIGRATION_TEST_POSTGRES_URL?.trim();
const postgresTest = adminUrl ? test : test.skip;

function quotedIdentifier(value) {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe database name");
  return `"${value}"`;
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

async function withPostgresDatabase(run) {
  const databaseName = `trainingload_core_test_${process.pid}_${randomBytes(5).toString("hex")}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  try {
    await admin.query(`CREATE DATABASE ${quotedIdentifier(databaseName)}`);
    await run(databaseUrl.toString());
  } finally {
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    await admin.query(
      `DROP DATABASE IF EXISTS ${quotedIdentifier(databaseName)}`,
    );
    await admin.end();
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

postgresTest(
  "PostgreSQL initializes once and advisory-locks concurrent startup",
  async () => {
    await withPostgresDatabase(async (databaseUrl) => {
      await Promise.all([
        runCoreMigrations({ databaseUrl, dialect: "postgresql" }),
        runCoreMigrations({ databaseUrl, dialect: "postgresql" }),
      ]);
      await runCoreMigrations({ databaseUrl, dialect: "postgresql" });
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
      ]);
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
    });
  },
);

postgresTest("PostgreSQL rejects unknown lineage", async () => {
  await withPostgresDatabase(async (databaseUrl) => {
    await query(
      databaseUrl,
      'CREATE TABLE "unexpected_legacy_table" ("id" text PRIMARY KEY)',
    );
    await assert.rejects(
      runCoreMigrations({ databaseUrl, dialect: "postgresql" }),
      (error) => error?.code === "CORE_MIGRATION_UNKNOWN_LEGACY_LINEAGE",
    );
  });
});

postgresTest("PostgreSQL rejects a changed applied checksum", async () => {
  await withPostgresDatabase(async (databaseUrl) => {
    await runCoreMigrations({ databaseUrl, dialect: "postgresql" });
    await query(
      databaseUrl,
      'UPDATE "_trainingload_core_migrations" SET "sha256" = $1 WHERE "id" = $2',
      ["invalid", "0001_core_baseline"],
    );
    await assert.rejects(
      runCoreMigrations({ databaseUrl, dialect: "postgresql" }),
      (error) => error?.code === "CORE_MIGRATION_CHECKSUM_MISMATCH",
    );
  });
});

postgresTest("PostgreSQL refuses both former Managed heads", async () => {
  for (const head of [
    "20261019090000_self_host_ai_configuration",
    "20261021090000_add_subscription_access_grant_type",
  ]) {
    await withPostgresDatabase(async (databaseUrl) => {
      await createLegacyMigrationHead(databaseUrl, { head });
      await assert.rejects(
        runCoreMigrations({ databaseUrl, dialect: "postgresql" }),
        (error) => error.code === "CORE_MIGRATION_UNKNOWN_LEGACY_LINEAGE",
      );
    });
  }
});

postgresTest(
  "PostgreSQL rejects a partial accepted legacy structure",
  async () => {
    await withPostgresDatabase(async (databaseUrl) => {
      await createLegacyMigrationHead(databaseUrl, { complete: false });
      await assert.rejects(
        runCoreMigrations({ databaseUrl, dialect: "postgresql" }),
        (error) => error?.code === "CORE_MIGRATION_UNKNOWN_LEGACY_LINEAGE",
      );
    });
  },
);
