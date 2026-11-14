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
        { id: "0014_better_auth_oauth_provider_17", source: "baseline" },
        { id: "0015_fit_strength_sets", source: "baseline" },
        { id: "0016_chronological_fitness_replay", source: "baseline" },
        { id: "0017_activity_data_migration", source: "baseline" },
        { id: "0018_activity_sport_catalog", source: "baseline" },
        { id: "0019_workout_step_annotations", source: "baseline" },
        { id: "0020_saved_routes", source: "baseline" },
        { id: "0021_health_observations", source: "baseline" },
        { id: "0022_personal_integrations", source: "baseline" },
        {
          id: "0023_external_provider_connection_region",
          source: "baseline",
        },
        { id: "0024_activity_analysis_segments", source: "baseline" },
        { id: "0025_vdot_forecast_snapshot", source: "baseline" },
        { id: "0026_athlete_state_updates", source: "baseline" },
        { id: "0027_scope_fitness_setting_evidence", source: "baseline" },
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
      const oauthResourceRelation = await query(
        databaseUrl,
        "SELECT to_regclass('public.t_oauth_resource')::text AS relation",
      );
      assert.equal(oauthResourceRelation.rows[0]?.relation, "t_oauth_resource");
    });
  },
);

async function seedFitnessFixture(databaseUrl) {
  await query(
    databaseUrl,
    `
    INSERT INTO t_user(id, name, email, email_verified, created_at, updated_at)
    VALUES ('fixture', 'Fixture', 'fixture@example.invalid', true, now(), now());
    INSERT INTO t_activity(id, hash_id, user_id, updated_at)
    VALUES (1, 'fixture-activity', 'fixture', now());
  `,
  );
}

async function fitnessRevision(databaseUrl) {
  const result = await query(
    databaseUrl,
    "SELECT revision::text FROM t_fitness_evidence_revision WHERE user_id = 'fixture'",
  );
  return BigInt(result.rows[0].revision);
}

postgresTest(
  "PostgreSQL excludes preferences from fitness invalidation and the analysis lock",
  async () => {
    await withPostgresDatabase(async (databaseUrl) => {
      await runCoreMigrations({ databaseUrl, dialect: "postgresql" });
      await seedFitnessFixture(databaseUrl);
      const before = await fitnessRevision(databaseUrl);
      await query(
        databaseUrl,
        `
      INSERT INTO t_user_setting(id, updated_at, user_id, category, value)
      VALUES ('preference', now(), 'fixture', 'THEME', 'light');
      INSERT INTO t_user_setting(id, updated_at, user_id, category, value)
      VALUES ('preference-retry', now(), 'fixture', 'THEME', 'light')
      ON CONFLICT(user_id, category) DO UPDATE SET value = EXCLUDED.value;
      UPDATE t_user_setting SET value = 'dark' WHERE id = 'preference';
      DELETE FROM t_user_setting WHERE id = 'preference';
    `,
      );
      assert.equal(await fitnessRevision(databaseUrl), before);

      // Extensions may add settings, but that does not make them training input.
      await query(
        databaseUrl,
        "ALTER TYPE enum_setting_category ADD VALUE 'ACCESS_FIXTURE'",
      );
      const access = new Client({ connectionString: databaseUrl });
      const analysis = new Client({ connectionString: databaseUrl });
      await Promise.all([access.connect(), analysis.connect()]);
      try {
        await access.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await access.query("SET LOCAL statement_timeout = '5s'");
        await access.query(
          "SELECT id FROM t_user WHERE id = 'fixture' FOR UPDATE",
        );
        await analysis.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await analysis.query("SET LOCAL statement_timeout = '5s'");
        await analysis.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('fitness:fixture', 0))",
        );

        const accessWrite = async () => {
          try {
            await access.query(`INSERT INTO t_user_setting(id, updated_at, user_id, category, value)
            VALUES ('access', now(), 'fixture', 'ACCESS_FIXTURE', 'unchanged')
            ON CONFLICT(user_id, category) DO UPDATE SET value = EXCLUDED.value`);
            await access.query("COMMIT");
          } catch (error) {
            await access.query("ROLLBACK");
            throw error;
          }
        };
        const analysisWrite = async () => {
          try {
            await analysis.query(`INSERT INTO t_activity_fitness_metrics_snapshot
            (id, updated_at, activity_id, user_id, sport, recorded_at)
            VALUES ('snapshot', now(), 1, 'fixture', 'RUN', now())`);
            await analysis.query("COMMIT");
          } catch (error) {
            await analysis.query("ROLLBACK");
            throw error;
          }
        };
        const results = await Promise.allSettled([
          accessWrite(),
          analysisWrite(),
        ]);
        for (const result of results)
          assert.equal(result.status, "fulfilled", result.reason?.message);
        assert.equal(await fitnessRevision(databaseUrl), before);
        assert.equal(
          (
            await query(
              databaseUrl,
              "SELECT count(*)::int AS count FROM t_activity_fitness_metrics_snapshot",
            )
          ).rows[0].count,
          1,
        );
      } finally {
        await Promise.all([access.end(), analysis.end()]);
      }
    });
  },
);

postgresTest(
  "PostgreSQL preserves consent cleanup and genuine fitness invalidation",
  async () => {
    await withPostgresDatabase(async (databaseUrl) => {
      await runCoreMigrations({ databaseUrl, dialect: "postgresql" });
      await seedFitnessFixture(databaseUrl);
      const before = await fitnessRevision(databaseUrl);
      await query(
        databaseUrl,
        `INSERT INTO t_user_setting(id, updated_at, user_id, category, value)
      VALUES ('consent', now(), 'fixture', 'AI_DATA_CONSENT', 'granted')`,
      );
      const granted = await fitnessRevision(databaseUrl);
      assert.ok(granted > before);
      await query(
        databaseUrl,
        `
      INSERT INTO t_fitness_assessment_task(id, user_id, session_id, request, facts, tracking, updated_at)
      VALUES ('assessment', 'fixture', 'fixture-session', '{}', '{"fixture": true}', true, now());
      INSERT INTO t_fitness_calculation
      (id, user_id, task_id, task_revision, method_id, method_version, policy_version,
       input, input_hash, selection_hash, baseline_hash, post_process_state)
      VALUES
      ('completed', 'fixture', 'assessment', 1, 'fixture', '1', '1', '{"fixture": true}', 'input', 'selection', 'baseline', 'DONE'),
      ('pending', 'fixture', 'assessment', 1, 'fixture', '1', '1', '{"fixture": true}', 'input', 'selection', 'baseline', 'PENDING');
      UPDATE t_user_setting SET value = 'revoked' WHERE id = 'consent';
    `,
      );
      const revoked = await fitnessRevision(databaseUrl);
      assert.ok(revoked > granted);
      const calculations = await query(
        databaseUrl,
        "SELECT id, input FROM t_fitness_calculation ORDER BY id",
      );
      assert.deepEqual(calculations.rows, [{ id: "pending", input: {} }]);
      const task = await query(
        databaseUrl,
        "SELECT tracking, stage, facts FROM t_fitness_assessment_task WHERE id = 'assessment'",
      );
      assert.deepEqual(task.rows[0], {
        tracking: false,
        stage: "CLOSED",
        facts: {},
      });
      await query(
        databaseUrl,
        "DELETE FROM t_user_setting WHERE id = 'consent'",
      );
      const deleted = await fitnessRevision(databaseUrl);
      assert.ok(deleted > revoked);
      await query(
        databaseUrl,
        `INSERT INTO t_user_fitness_metric(id, user_id, type, value)
      VALUES ('metric', 'fixture', 'MAX_HR', 180)`,
      );
      assert.ok((await fitnessRevision(databaseUrl)) > deleted);
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
