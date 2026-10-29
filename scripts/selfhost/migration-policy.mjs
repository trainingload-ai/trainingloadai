import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { sha256File } from "./backup-artifact.mjs";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MIGRATION_ID = /^(?:\d{4}|\d{14})_[a-z0-9_]+$/;

function hasExactKeys(value, expected) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expected].sort().join(",")
  );
}

function parseVersion(value, label) {
  const match = String(value ?? "").match(SEMVER);
  if (!match) throw new Error(`${label} must be a stable semantic version`);
  return match.slice(1).map(Number);
}

function minorDistance(from, to) {
  const [fromMajor, fromMinor] = parseVersion(from, "expandedInRelease");
  const [toMajor, toMinor] = parseVersion(to, "releaseVersion");
  if (fromMajor !== toMajor || toMinor < fromMinor) return null;
  return toMinor - fromMinor;
}

function compareStableVersions(left, right) {
  const a = parseVersion(left, "version");
  const b = parseVersion(right, "version");
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function isStrictlyIncreasing(versions) {
  return versions.every(
    (version, index) =>
      index === 0 || compareStableVersions(versions[index - 1], version) < 0,
  );
}

export function validateReleasePolicy(policy) {
  if (
    !hasExactKeys(policy, [
      "schemaVersion",
      "releaseVersion",
      "releaseKind",
      "upgrade",
      "database",
    ]) ||
    policy.schemaVersion !== 1 ||
    typeof policy.releaseKind !== "string" ||
    !policy.releaseKind ||
    !hasExactKeys(policy.upgrade, [
      "supportedSourceVersions",
      "applicationRollbackTo",
      "backupRequired",
    ]) ||
    !Array.isArray(policy.upgrade.supportedSourceVersions) ||
    !Array.isArray(policy.upgrade.applicationRollbackTo) ||
    policy.upgrade.backupRequired !== true ||
    !hasExactKeys(policy.database, [
      "schemaEpoch",
      "migrationPolicy",
      "baselineMigration",
      "baselineReleaseVersion",
      "compatibilityWindowMinorVersions",
      "databaseRollback",
      "postBaselineMigrations",
    ]) ||
    !Number.isInteger(policy.database.schemaEpoch) ||
    policy.database.schemaEpoch < 1 ||
    policy.database.migrationPolicy !== "expand-contract" ||
    !MIGRATION_ID.test(policy.database.baselineMigration ?? "") ||
    !Number.isInteger(policy.database.compatibilityWindowMinorVersions) ||
    policy.database.compatibilityWindowMinorVersions < 2 ||
    policy.database.databaseRollback !== "unsupported" ||
    typeof policy.database.postBaselineMigrations !== "object" ||
    policy.database.postBaselineMigrations === null ||
    Array.isArray(policy.database.postBaselineMigrations)
  ) {
    throw new Error("self-host release policy is invalid");
  }
  parseVersion(policy.releaseVersion, "releaseVersion");
  parseVersion(
    policy.database.baselineReleaseVersion,
    "baselineReleaseVersion",
  );
  if (
    compareStableVersions(
      policy.database.baselineReleaseVersion,
      policy.releaseVersion,
    ) > 0
  ) {
    throw new Error("baseline release cannot be newer than the release");
  }
  for (const name of [
    ...policy.upgrade.supportedSourceVersions,
    ...policy.upgrade.applicationRollbackTo,
  ]) {
    parseVersion(name, "compatible release version");
    const distance = minorDistance(name, policy.releaseVersion);
    if (
      compareStableVersions(name, policy.releaseVersion) >= 0 ||
      distance === null ||
      distance > policy.database.compatibilityWindowMinorVersions
    ) {
      throw new Error("compatible release falls outside the support window");
    }
  }
  if (
    new Set(policy.upgrade.supportedSourceVersions).size !==
      policy.upgrade.supportedSourceVersions.length ||
    new Set(policy.upgrade.applicationRollbackTo).size !==
      policy.upgrade.applicationRollbackTo.length ||
    !isStrictlyIncreasing(policy.upgrade.supportedSourceVersions) ||
    !isStrictlyIncreasing(policy.upgrade.applicationRollbackTo) ||
    policy.upgrade.applicationRollbackTo.some(
      (version) => !policy.upgrade.supportedSourceVersions.includes(version),
    )
  ) {
    throw new Error("release compatibility lists are invalid");
  }
  for (const [id, entry] of Object.entries(
    policy.database.postBaselineMigrations,
  )) {
    if (!MIGRATION_ID.test(id)) {
      throw new Error(`invalid migration policy id: ${id}`);
    }
    const expectedKeys =
      entry?.phase === "contract"
        ? ["phase", "releaseVersion", "expandedInRelease"]
        : ["phase", "releaseVersion"];
    if (
      !hasExactKeys(entry, expectedKeys) ||
      !["expand", "backfill", "contract"].includes(entry.phase)
    ) {
      throw new Error(`invalid migration policy entry: ${id}`);
    }
    parseVersion(entry.releaseVersion, `${id} releaseVersion`);
    if (
      compareStableVersions(
        entry.releaseVersion,
        policy.database.baselineReleaseVersion,
      ) < 0 ||
      compareStableVersions(entry.releaseVersion, policy.releaseVersion) > 0
    ) {
      throw new Error(`migration policy entry ${id} has an invalid release`);
    }
    if (entry.phase === "contract") {
      const distance = minorDistance(
        entry.expandedInRelease,
        entry.releaseVersion,
      );
      if (
        distance === null ||
        distance < policy.database.compatibilityWindowMinorVersions ||
        compareStableVersions(
          entry.expandedInRelease,
          policy.database.baselineReleaseVersion,
        ) < 0
      ) {
        throw new Error(
          `contract migration ${id} violates the compatibility window`,
        );
      }
    }
  }
  return policy;
}

export async function buildMigrationInventory(migrationsRoot, rawPolicy) {
  const policy = validateReleasePolicy(rawPolicy);
  const root = resolve(migrationsRoot);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const ids = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (ids.some((id) => !MIGRATION_ID.test(id))) {
    throw new Error("migration directory names must use the frozen id format");
  }
  const baselineIndex = ids.indexOf(policy.database.baselineMigration);
  if (baselineIndex < 0) {
    throw new Error("release policy baseline migration does not exist");
  }
  const postBaselineIds = ids.slice(baselineIndex + 1);
  const policyIds = Object.keys(policy.database.postBaselineMigrations).sort();
  if (JSON.stringify(postBaselineIds) !== JSON.stringify(policyIds)) {
    throw new Error(
      "every post-baseline migration must have exactly one release policy entry",
    );
  }

  const migrations = [];
  let previousReleaseVersion = policy.database.baselineReleaseVersion;
  for (const [index, id] of ids.entries()) {
    const directory = resolve(root, id);
    const stat = await fs.lstat(directory);
    const sqlPath = resolve(directory, "migration.sql");
    const sqlStat = await fs.lstat(sqlPath);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      !sqlStat.isFile() ||
      sqlStat.isSymbolicLink()
    ) {
      throw new Error(`migration ${id} is not a regular migration artifact`);
    }
    const declared = policy.database.postBaselineMigrations[id];
    const releaseVersion =
      index <= baselineIndex
        ? policy.database.baselineReleaseVersion
        : declared.releaseVersion;
    if (compareStableVersions(releaseVersion, previousReleaseVersion) < 0) {
      throw new Error(`migration ${id} predates an earlier migration release`);
    }
    migrations.push({
      id,
      checksum: await sha256File(sqlPath),
      phase: index <= baselineIndex ? "baseline" : declared.phase,
      releaseVersion,
    });
    previousReleaseVersion = releaseVersion;
  }
  const canonical = JSON.stringify(migrations);
  return {
    schemaEpoch: policy.database.schemaEpoch,
    migrationPolicy: policy.database.migrationPolicy,
    migrationHead: migrations.at(-1)?.id ?? null,
    migrationInventorySha256: createHash("sha256")
      .update(canonical)
      .digest("hex"),
    compatibilityWindowMinorVersions:
      policy.database.compatibilityWindowMinorVersions,
    databaseRollback: policy.database.databaseRollback,
    migrations,
  };
}
