import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, createUpgradePlan } from "./upgrade-plan.mjs";

const baseMigrations = [
  {
    id: "20260101000000_baseline",
    checksum: "a".repeat(64),
    phase: "baseline",
    releaseVersion: "1.1.0",
  },
];

function target(overrides = {}) {
  return {
    releaseVersion: "1.3.0",
    configSchemaVersion: 1,
    composeSchemaVersion: 1,
    images: {
      migrate: { reference: `example/migrate@sha256:${"4".repeat(64)}` },
      server: { reference: `example/server@sha256:${"1".repeat(64)}` },
      client: { reference: `example/client@sha256:${"2".repeat(64)}` },
      docs: { reference: `example/docs@sha256:${"3".repeat(64)}` },
    },
    upgrade: {
      supportedSourceVersions: ["1.1.0", "1.2.0"],
      applicationRollbackTo: ["1.1.0", "1.2.0"],
      backupRequired: true,
    },
    database: {
      schemaEpoch: 1,
      migrations: [
        ...baseMigrations,
        {
          id: "20260201000000_expand",
          checksum: "b".repeat(64),
          phase: "expand",
          releaseVersion: "1.3.0",
        },
      ],
    },
    ...overrides,
  };
}

function current(releaseVersion) {
  return {
    releaseVersion,
    configSchemaVersion: 1,
    composeSchemaVersion: 1,
    schemaEpoch: 1,
  };
}

test("plans forward upgrades from each of the two declared prior minors", () => {
  for (const version of ["1.1.0", "1.2.0"]) {
    const plan = createUpgradePlan({
      current: current(version),
      target: target(),
      appliedMigrations: baseMigrations,
    });
    assert.equal(plan.sourceVersion, version);
    assert.equal(plan.targetVersion, "1.3.0");
    assert.equal(plan.applicationRollbackAllowed, true);
    assert.deepEqual(plan.migrationPhases, ["expand"]);
  }
});

test("rejects downgrade, undeclared source, schema epoch, and migration drift", () => {
  assert.throws(() =>
    createUpgradePlan({
      current: current("1.4.0"),
      target: target(),
      appliedMigrations: baseMigrations,
    }),
  );
  assert.throws(() =>
    createUpgradePlan({
      current: current("1.0.0"),
      target: target(),
      appliedMigrations: baseMigrations,
    }),
  );
  assert.throws(() =>
    createUpgradePlan({
      current: current("1.2.0"),
      target: target({
        database: { schemaEpoch: 2, migrations: baseMigrations },
      }),
      appliedMigrations: baseMigrations,
    }),
  );
  assert.throws(() =>
    createUpgradePlan({
      current: current("1.2.0"),
      target: target(),
      appliedMigrations: [{ ...baseMigrations[0], checksum: "0".repeat(64) }],
    }),
  );
  assert.throws(() =>
    createUpgradePlan({
      current: current("1.2.0"),
      target: target(),
      appliedMigrations: [target().database.migrations[1]],
    }),
  );
});

test("contract migrations require explicit no-rollback acceptance", () => {
  const contractTarget = target({
    upgrade: {
      supportedSourceVersions: ["1.2.0"],
      applicationRollbackTo: [],
      backupRequired: true,
    },
    database: {
      schemaEpoch: 1,
      migrations: [
        ...baseMigrations,
        {
          id: "20260301000000_contract",
          checksum: "c".repeat(64),
          phase: "contract",
          releaseVersion: "1.3.0",
        },
      ],
    },
  });
  assert.throws(
    () =>
      createUpgradePlan({
        current: current("1.2.0"),
        target: contractTarget,
        appliedMigrations: baseMigrations,
      }),
    /no safe application rollback/,
  );
  const accepted = createUpgradePlan({
    current: current("1.2.0"),
    target: contractTarget,
    appliedMigrations: baseMigrations,
    acceptNoApplicationRollback: true,
  });
  assert.equal(accepted.applicationRollbackAllowed, false);
  assert.equal(accepted.requiresExplicitNoRollbackAcceptance, true);
});

test("mutable installed images cannot become a rollback source", () => {
  assert.throws(
    () =>
      createUpgradePlan({
        current: current("1.2.0"),
        target: target(),
        appliedMigrations: baseMigrations,
        sourceImagesImmutable: false,
      }),
    /no safe application rollback/,
  );
  const accepted = createUpgradePlan({
    current: current("1.2.0"),
    target: target(),
    appliedMigrations: baseMigrations,
    sourceImagesImmutable: false,
    acceptNoApplicationRollback: true,
  });
  assert.equal(accepted.applicationRollbackAllowed, false);
});

test("a manifest cannot claim application rollback across contract migration", () => {
  const value = target();
  value.database.migrations.push({
    id: "20260301000000_contract",
    checksum: "c".repeat(64),
    phase: "contract",
    releaseVersion: "1.3.0",
  });
  assert.throws(
    () =>
      createUpgradePlan({
        current: current("1.2.0"),
        target: value,
        appliedMigrations: baseMigrations,
      }),
    /declares application rollback across a contract migration/,
  );
});

test("semantic versions compare numerically", () => {
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("1.2.0-rc.1", "1.2.0"), -1);
  assert.equal(compareVersions("1.2.0-rc.10", "1.2.0-rc.2"), 1);
  assert.equal(compareVersions("1.2.0-alpha", "1.2.0-alpha.1"), -1);
  assert.equal(compareVersions("1.2.0", "1.2.0"), 0);
  assert.throws(() => compareVersions("01.2.0", "1.2.0"));
});
