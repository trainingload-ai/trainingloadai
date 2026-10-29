const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/;

function parseVersion(value) {
  const match = String(value ?? "").match(SEMVER);
  if (!match) throw new Error(`invalid semantic version: ${value}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? null,
  };
}

function comparePrerelease(left, right) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    const leftNumeric = /^\d+$/.test(left[index]);
    const rightNumeric = /^\d+$/.test(right[index]);
    if (leftNumeric && rightNumeric) {
      if (left[index].length !== right[index].length) {
        return left[index].length < right[index].length ? -1 : 1;
      }
      return left[index] < right[index] ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

function migrationMap(migrations) {
  const result = new Map();
  for (const migration of migrations) {
    if (
      !migration ||
      typeof migration.id !== "string" ||
      !/^(?:\d{4}|\d{14})_[a-z0-9_]+$/.test(migration.id) ||
      !/^[a-f0-9]{64}$/.test(migration.checksum ?? "") ||
      result.has(migration.id)
    ) {
      throw new Error("database migration inventory is invalid");
    }
    result.set(migration.id, migration);
  }
  return result;
}

export function createUpgradePlan({
  current,
  target,
  appliedMigrations,
  acceptNoApplicationRollback = false,
  sourceImagesImmutable = true,
}) {
  if (compareVersions(target.releaseVersion, current.releaseVersion) <= 0) {
    throw new Error("target release must be newer than the installed release");
  }
  if (
    !target.upgrade.supportedSourceVersions.includes(current.releaseVersion)
  ) {
    throw new Error("installed release is not a supported upgrade source");
  }
  if (
    target.configSchemaVersion !== current.configSchemaVersion ||
    target.composeSchemaVersion !== current.composeSchemaVersion ||
    target.database.schemaEpoch !== current.schemaEpoch
  ) {
    throw new Error(
      "target release crosses a config, Compose, or database schema epoch boundary",
    );
  }

  migrationMap(target.database.migrations);
  migrationMap(appliedMigrations);
  if (appliedMigrations.length > target.database.migrations.length) {
    throw new Error("installed migration inventory is not a target prefix");
  }
  for (const [index, migration] of appliedMigrations.entries()) {
    const targetMigration = target.database.migrations[index];
    if (
      targetMigration?.id !== migration.id ||
      targetMigration.checksum !== migration.checksum
    ) {
      throw new Error(
        `installed migration ${migration.id} is not an exact target prefix`,
      );
    }
  }
  const pendingMigrations = target.database.migrations.slice(
    appliedMigrations.length,
  );
  const containsContractMigration = pendingMigrations.some(
    (migration) => migration.phase === "contract",
  );
  const declaredRollback = target.upgrade.applicationRollbackTo.includes(
    current.releaseVersion,
  );
  if (declaredRollback && containsContractMigration) {
    throw new Error(
      "target release declares application rollback across a contract migration",
    );
  }
  const applicationRollbackAllowed =
    declaredRollback && !containsContractMigration && sourceImagesImmutable;
  if (!applicationRollbackAllowed && !acceptNoApplicationRollback) {
    throw new Error(
      "target release has no safe application rollback to the installed version",
    );
  }
  return {
    sourceVersion: current.releaseVersion,
    targetVersion: target.releaseVersion,
    pendingMigrations,
    migrationPhases: [...new Set(pendingMigrations.map((item) => item.phase))],
    applicationRollbackAllowed,
    databaseRollback: "unsupported",
    requiresExplicitNoRollbackAcceptance: !applicationRollbackAllowed,
    targetImages: {
      SELF_HOST_MIGRATE_IMAGE: target.images.migrate.reference,
      SELF_HOST_SERVER_IMAGE: target.images.server.reference,
      SELF_HOST_CLIENT_IMAGE: target.images.client.reference,
    },
  };
}
