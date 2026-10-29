import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  buildMigrationInventory,
  validateReleasePolicy,
} from "./migration-policy.mjs";
import { repositoryRoot } from "./verify-compose-contract.mjs";

const workspaces = [];

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((path) => fs.rm(path, { recursive: true, force: true })),
  );
});

function policy(overrides = {}) {
  return {
    schemaVersion: 1,
    releaseVersion: "1.3.0",
    releaseKind: "test",
    upgrade: {
      supportedSourceVersions: ["1.1.0", "1.2.0"],
      applicationRollbackTo: ["1.2.0"],
      backupRequired: true,
    },
    database: {
      schemaEpoch: 1,
      migrationPolicy: "expand-contract",
      baselineMigration: "20260101000000_baseline",
      baselineReleaseVersion: "1.0.0",
      compatibilityWindowMinorVersions: 2,
      databaseRollback: "unsupported",
      postBaselineMigrations: {},
      ...overrides,
    },
  };
}

async function migrations(files) {
  const root = await fs.mkdtemp(join(tmpdir(), "selfhost-migrations-"));
  workspaces.push(root);
  for (const [id, sql] of Object.entries(files)) {
    await fs.mkdir(resolve(root, id));
    await fs.writeFile(resolve(root, id, "migration.sql"), sql);
  }
  return root;
}

test("repository migrations are frozen behind the self-host v1 baseline", async () => {
  const rootPackage = JSON.parse(
    await fs.readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  );
  const releasePolicy = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "docker/selfhost/release-policy.json"),
      "utf8",
    ),
  );
  const policySchema = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "schemas/self-host-release-policy.schema.json"),
      "utf8",
    ),
  );
  const validatePolicy = new Ajv2020({
    strict: false,
    validateFormats: false,
  }).compile(policySchema);
  assert.equal(
    validatePolicy(releasePolicy),
    true,
    JSON.stringify(validatePolicy.errors),
  );
  assert.equal(releasePolicy.releaseVersion, rootPackage.version);
  const inventory = await buildMigrationInventory(
    resolve(repositoryRoot, "packages/prisma/core/migrations"),
    releasePolicy,
  );
  assert.equal(inventory.schemaEpoch, 1);
  const coreManifest = JSON.parse(await fs.readFile(resolve(repositoryRoot, "packages/prisma/core/migrations/manifest.json"), "utf8"));
  assert.equal(inventory.migrationHead, coreManifest.migrations.at(-1).id);
  assert.equal(inventory.migrations.length, coreManifest.migrations.length);
  assert.match(inventory.migrationInventorySha256, /^[a-f0-9]{64}$/);
  assert.equal(inventory.migrations[0].phase, "baseline");
  assert.deepEqual(inventory.migrations.map(item => ({ id: item.id, sha256: item.checksum })), coreManifest.migrations.map(({ id, sha256 }) => ({ id, sha256 })));
  assert.ok(inventory.migrations.slice(1).every(item => item.phase === "expand" && item.releaseVersion === releasePolicy.releaseVersion));
});

test("post-baseline migrations require complete expand-contract metadata", async () => {
  const root = await migrations({
    "20260101000000_baseline": "SELECT 1;\n",
    "20260201000000_expand": "ALTER TABLE example ADD COLUMN value TEXT;\n",
  });
  await assert.rejects(
    () => buildMigrationInventory(root, policy()),
    /every post-baseline migration/,
  );
  const inventory = await buildMigrationInventory(
    root,
    policy({
      postBaselineMigrations: {
        "20260201000000_expand": {
          phase: "expand",
          releaseVersion: "1.3.0",
        },
      },
    }),
  );
  assert.equal(inventory.migrations.at(-1).phase, "expand");
});

test("contract migrations cannot violate the two-minor compatibility window", () => {
  assert.throws(
    () =>
      validateReleasePolicy(
        policy({
          postBaselineMigrations: {
            "20260201000000_contract": {
              phase: "contract",
              releaseVersion: "1.3.0",
              expandedInRelease: "1.2.0",
            },
          },
        }),
      ),
    /violates the compatibility window/,
  );
  assert.doesNotThrow(() =>
    validateReleasePolicy(
      policy({
        postBaselineMigrations: {
          "20260201000000_contract": {
            phase: "contract",
            releaseVersion: "1.3.0",
            expandedInRelease: "1.1.0",
          },
        },
      }),
    ),
  );
});

test("application rollback targets must also be supported upgrade sources", () => {
  const value = policy();
  value.upgrade.applicationRollbackTo = ["1.1.1"];
  assert.throws(
    () => validateReleasePolicy(value),
    /compatibility lists are invalid/,
  );
});
