import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import v1Contract from "../../docker/selfhost/v1-contract.json" with { type: "json" };
import {
  validateAtomicWriteCleanupSource,
  validateBackupCleanupSource,
  validateDiagnosticsCleanupSource,
  validateInstallerAuthenticationSource,
  validateManagementDataDeletionSource,
  validateManagementEnvironmentSource,
  validateManagementFinalizationSource,
  validateManagementProfileSource,
  validateManagementMutationSource,
  validatePathCleanupSource,
  validatePrivateHandleCleanupSource,
  validateStreamRunnerCleanupSource,
  verifySelfHostV1Contract,
} from "./verify-v1-contract.mjs";
import { repositoryRoot } from "./verify-image-contract.mjs";

test("repository self-host v1 contract is frozen across its source contracts", async () => {
  assert.equal(await verifySelfHostV1Contract(), v1Contract);
});

test("rejects a widened upgrade window", async () => {
  const changed = structuredClone(v1Contract);
  changed.upgrade.compatibilityWindowMinorVersions = 3;
  await assert.rejects(
    verifySelfHostV1Contract(changed),
    /upgrade compatibility disagrees/,
  );
});

test("rejects widened backup or history scan limits", async () => {
  const changed = structuredClone(v1Contract);
  changed.limits.maximumBackupUploadFiles += 1;
  await assert.rejects(
    verifySelfHostV1Contract(changed),
    /bounded release, artifact, or history limits disagree/,
  );
});

test("rejects widened release bundle byte limits", async () => {
  const changed = structuredClone(v1Contract);
  changed.limits.maximumReleaseBundleBytes += 1;
  await assert.rejects(
    verifySelfHostV1Contract(changed),
    /bounded release, artifact, or history limits disagree/,
  );
});

test("rejects widened release bundle runtime entry limits", async () => {
  const changed = structuredClone(v1Contract);
  changed.limits.maximumReleaseBundleRuntimeEntries += 1;
  await assert.rejects(
    verifySelfHostV1Contract(changed),
    /bounded release, artifact, or history limits disagree/,
  );
});

test("rejects mutable image semantics", async () => {
  const changed = structuredClone(v1Contract);
  changed.images.immutableDigestRequired = false;
  await assert.rejects(
    verifySelfHostV1Contract(changed),
    /image evidence contract disagrees/,
  );
});

test("rejects a lexical-only data-root boundary policy", async () => {
  const changed = structuredClone(v1Contract);
  changed.security.dataRootBoundary = "lexical-path-only";
  await assert.rejects(
    verifySelfHostV1Contract(changed),
    /security baseline disagrees/,
  );
});

test("rejects host environment precedence over instance configuration", async () => {
  const changed = structuredClone(v1Contract);
  changed.security.composeEnvironmentIsolation = "host-overrides-instance";
  await assert.rejects(
    verifySelfHostV1Contract(changed),
    /security baseline disagrees/,
  );
});

test("rejects a host platform matrix outside the acceptance contract", async () => {
  const changed = structuredClone(v1Contract);
  changed.hostPlatforms = changed.hostPlatforms.filter(
    (platform) => platform !== "win32/amd64",
  );
  await assert.rejects(
    verifySelfHostV1Contract(changed),
    /host platforms disagree/,
  );
});

test("rejects an unversioned additive field", async () => {
  const changed = structuredClone(v1Contract);
  changed.security.allowRoot = true;
  await assert.rejects(
    verifySelfHostV1Contract(changed),
    /security shape changed/,
  );
});

test("rejects removing the safe uninstall lifecycle", async () => {
  const changed = structuredClone(v1Contract);
  changed.management.commands = changed.management.commands.filter(
    (command) => command !== "uninstall",
  );
  await assert.rejects(
    verifySelfHostV1Contract(changed),
    /management command or destructive-action contract disagrees/,
  );
});

test("rejects weakening instance mutation serialization", async () => {
  const changed = structuredClone(v1Contract);
  changed.management.serializedMutationCommands =
    changed.management.serializedMutationCommands.filter(
      (command) => command !== "backup",
    );
  await assert.rejects(
    verifySelfHostV1Contract(changed),
    /management command or destructive-action contract disagrees/,
  );

  const widened = structuredClone(v1Contract);
  widened.management.operationReclaimTimeoutSeconds += 1;
  await assert.rejects(
    verifySelfHostV1Contract(widened),
    /management command or destructive-action contract disagrees/,
  );
});

test("rejects removing a serialized mutation from the management core", async () => {
  const source = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/management-core.mjs"),
    "utf8",
  );
  const mutationCommandsStart = source.indexOf(
    "const SERIALIZED_MUTATION_COMMANDS",
  );
  assert.notEqual(mutationCommandsStart, -1);
  const changed = `${source.slice(0, mutationCommandsStart)}${source
    .slice(mutationCommandsStart)
    .replace('  "backup",\n', "")}`;
  assert.equal(
    validateManagementMutationSource(
      source,
      v1Contract.management.serializedMutationCommands,
    ),
    true,
  );
  assert.equal(
    validateManagementMutationSource(
      changed,
      v1Contract.management.serializedMutationCommands,
    ),
    false,
  );
  assert.equal(
    validateManagementMutationSource(
      source.replace(
        "await fs.link(lock.path, released)",
        "await fs.rename(lock.path, released)",
      ),
      v1Contract.management.serializedMutationCommands,
    ),
    false,
  );
  assert.equal(
    validateManagementMutationSource(
      source.replace(
        "await atomicWrite(reclaimPath, reclaimPayload, 0o600)",
        "await fs.rename(path, reclaimPath)",
      ),
      v1Contract.management.serializedMutationCommands,
    ),
    false,
  );
  assert.equal(
    validateManagementMutationSource(
      source.replace(
        "operationLock = await acquireOperationLock(context);",
        "operationLock = null;",
      ),
      v1Contract.management.serializedMutationCommands,
    ),
    false,
  );
});

test("rejects hidden profile activation or missing readiness checks", async () => {
  const source = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/management-core.mjs"),
    "utf8",
  );
  assert.equal(validateManagementProfileSource(source), true);
  for (const changed of [
    source.replace('name.startsWith("COMPOSE_")', "false"),
    `${source}\nargs.push("--profile", "docs");`,
    source.replace(
      "evaluateComposeState(rows, requiredOptionalServices)",
      "evaluateComposeState(rows)",
    ),
  ]) {
    assert.equal(validateManagementProfileSource(changed), false);
  }
});

test("rejects weakening instance environment parsing or isolation", async () => {
  const source = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/management-core.mjs"),
    "utf8",
  );
  assert.equal(validateManagementEnvironmentSource(source), true);
  for (const changed of [
    source.replace("function parseEnvironmentValue(", "function parseValue("),
    source.replace(
      '"variable interpolation is not allowed; single-quote a literal $ value"',
      '"variable interpolation is allowed"',
    ),
    source.replace(
      "await removeComposeInputSnapshot(context);",
      "context.composeInputSnapshot = null;",
    ),
    source.replace(
      "composeInput.environmentPath",
      'resolve(instanceDirectory, ".env.selfhost")',
    ),
    source.replace(
      "await replaceComposeEnvironmentSnapshot(context, targetConfigText);",
      "context.composeInputSnapshot = null;",
    ),
    source.replace("requireAuthenticatedBundleContents(context, name", "readUnauthenticatedContents(context, name"),
    `${source}\nasync function readGatewayDefinition() {}`,
    source.replace(
      "authenticatedBundle: dependencies.authenticatedBundle ?? null",
      "authenticatedBundle: null",
    ),
  ]) {
    assert.equal(validateManagementEnvironmentSource(changed), false);
  }
});

test("rejects path-only uninstall data deletion", async () => {
  const source = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/management-core.mjs"),
    "utf8",
  );
  assert.equal(validateManagementDataDeletionSource(source), true);
  for (const changed of [
    source.replace("confirmedStat.ino !== initialStat.ino", "false"),
    source.replace(
      "await context.renameDataRoot(confirmed.path, quarantine)",
      "await context.renameDataRoot(confirmed.path, confirmed.path)",
    ),
    source.replace(
      "context.removeTree(quarantined.quarantine",
      "context.removeTree(dataRoot",
    ),
    source.replace(
      "renameDataRoot: dependencies.renameDataRoot ?? fs.rename",
      "renameDataRoot: fs.rename",
    ),
  ]) {
    assert.equal(validateManagementDataDeletionSource(changed), false);
  }
});

test("rejects hidden secondary finalization failures", async () => {
  const source = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/management-core.mjs"),
    "utf8",
  );
  assert.equal(validateManagementFinalizationSource(source), true);
  for (const changed of [
    source.replace(
      "function appendSecondaryFailure(",
      "function discardSecondaryFailure(",
    ),
    source.replace(
      "outcome = appendSecondaryFailure(",
      "outcome = outcome; appendSecondaryFailure(",
    ),
    source.replace(
      '"Operation lock release also failed; run doctor before retrying"',
      '"Primary command failed"',
    ),
    source.replace(
      "? { ...result.details, commandFailure }",
      "? result.details",
    ),
    source.replace(
      '"Restore failure containment could not stop all services"',
      '"Restore failed"',
    ),
    source.replace(
      '"Upgrade failure containment could not stop application services"',
      '"Upgrade failed"',
    ),
    source.replace(
      '"Rollback failure containment could not stop application services"',
      '"Rollback failed"',
    ),
    source.replace(
      "`${report.command} also failed before its required failure report could be persisted`",
      '"Failure report write failed"',
    ),
  ]) {
    assert.equal(validateManagementFinalizationSource(changed), false);
  }
});

test("rejects fail-open backup cleanup", async () => {
  const source = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/management-core.mjs"),
    "utf8",
  );
  assert.equal(validateBackupCleanupSource(source), true);
  for (const changed of [
    source.replace("!published && stagingCreated", "!published"),
    source.replace(
      "publicationMoved ? paths.destination : paths.staging",
      "paths.staging",
    ),
    source.replace("publicationMoved = true", "publicationMoved = false"),
    source.replace(
      "await context.backupPublishSync(paths.backupsDirectory)",
      "await Promise.resolve()",
    ),
    source.replace(
      "backupPublishSync: dependencies.backupPublishSync ?? syncDirectory",
      "backupPublishSync: async () => undefined",
    ),
    source.replace(
      "await context.backupCleanupSync(paths.backupsDirectory)",
      "return",
    ),
    source.replace(
      "backup operation lock changed ownership",
      "backup operation lock accepted",
    ),
    source.replace(
      "backup operation lock changed before removal",
      "backup operation lock removed",
    ),
    source.replace(
      "context.secondaryFailures.push({",
      "context.secondaryFailures = []; ({",
    ),
    source.replace(
      '"SELF_HOST_BACKUP_CLEANUP_FAILED"',
      '"SELF_HOST_BACKUP_VERIFICATION_FAILED"',
    ),
  ]) {
    assert.equal(validateBackupCleanupSource(changed), false);
  }
});

test("rejects fail-open diagnostics cleanup", async () => {
  const source = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/management-core.mjs"),
    "utf8",
  );
  assert.equal(validateDiagnosticsCleanupSource(source), true);
  for (const changed of [
    source.replace(
      "current.ino !== publishedIdentity.ino",
      "current.ino === publishedIdentity.ino",
    ),
    source.replace(
      "await context.removeDiagnosticsArtifact(destination)",
      "return",
    ),
    source.replace(
      "await context.diagnosticsCleanupSync(dirname(destination))",
      "return",
    ),
    source.replace(
      '"SELF_HOST_DIAGNOSTICS_CLEANUP_FAILED"',
      '"SELF_HOST_DIAGNOSTICS_VERIFY_FAILED"',
    ),
  ]) {
    assert.equal(validateDiagnosticsCleanupSource(changed), false);
  }
});

test("rejects hidden atomic write cleanup failures", async () => {
  const [managementSource, artifactSource, privatePathSource] =
    await Promise.all(
      ["management-core.mjs", "backup-artifact.mjs", "private-path.mjs"].map(
        (name) =>
          readFile(resolve(repositoryRoot, "scripts/selfhost", name), "utf8"),
      ),
    );
  assert.equal(
    validateAtomicWriteCleanupSource(
      managementSource,
      artifactSource,
      privatePathSource,
    ),
    true,
  );
  for (const [management, artifact, privatePath] of [
    [
      managementSource,
      artifactSource,
      privatePathSource.replace(
        "[originalError, ...cleanupErrors]",
        "[...cleanupErrors]",
      ),
    ],
    [
      managementSource,
      artifactSource,
      privatePathSource.replace("await fs.unlink(temporaryPath);", "return;"),
    ],
    [
      managementSource,
      artifactSource.replace(
        "await rethrowAfterPrivateTemporaryCleanup(error, handle, temporary)",
        "throw error",
      ),
      privatePathSource,
    ],
    [
      managementSource.replace(
        "await rethrowAfterPrivateTemporaryCleanup(error, handle, temporaryPath)",
        "throw error",
      ),
      artifactSource,
      privatePathSource,
    ],
  ]) {
    assert.equal(
      validateAtomicWriteCleanupSource(management, artifact, privatePath),
      false,
    );
  }
});

test("rejects hidden stream handle cleanup failures", async () => {
  const [managementSource, privatePathSource] = await Promise.all(
    ["management-core.mjs", "private-path.mjs"].map((name) =>
      readFile(resolve(repositoryRoot, "scripts/selfhost", name), "utf8"),
    ),
  );
  assert.equal(
    validateStreamRunnerCleanupSource(managementSource, privatePathSource),
    true,
  );
  for (const [management, privatePath] of [
    [
      managementSource,
      privatePathSource.replace("errors.push(error)", "return"),
    ],
    [
      managementSource.replace("result.error = failure", "return result"),
      privatePathSource,
    ],
    [
      managementSource.replace(
        "operationError ?? streamResultFailure(result)",
        "null",
      ),
      privatePathSource,
    ],
    [
      managementSource.replace("[inputHandle, outputHandle]", "[inputHandle]"),
      privatePathSource,
    ],
  ]) {
    assert.equal(
      validateStreamRunnerCleanupSource(management, privatePath),
      false,
    );
  }
});

test("rejects hidden private handle cleanup failures", async () => {
  const names = {
    privatePath: "private-path.mjs",
    artifact: "backup-artifact.mjs",
    management: "management-core.mjs",
    releaseBundle: "release-bundle.mjs",
  };
  const sources = Object.fromEntries(
    await Promise.all(
      Object.entries(names).map(async ([key, name]) => [
        key,
        await readFile(
          resolve(repositoryRoot, "scripts/selfhost", name),
          "utf8",
        ),
      ]),
    ),
  );
  assert.equal(validatePrivateHandleCleanupSource(sources), true);
  for (const changed of [
    {
      ...sources,
      privatePath: sources.privatePath.replace(
        "...(originalError ? [originalError] : [])",
        "...[]",
      ),
    },
    {
      ...sources,
      artifact: sources.artifact.replace(
        "await rethrowAfterPrivateHandleCleanup(",
        "await Promise.resolve(",
      ),
    },
    {
      ...sources,
      management: sources.management.replace(
        "await rethrowAfterPrivateHandleCleanup(",
        "await Promise.resolve(",
      ),
    },
    {
      ...sources,
      releaseBundle: sources.releaseBundle.replace(
        "await rethrowAfterPrivateHandleCleanup(",
        "await Promise.resolve(",
      ),
    },
  ]) {
    assert.equal(validatePrivateHandleCleanupSource(changed), false);
  }
});

test("rejects hidden release path cleanup failures", async () => {
  const names = {
    artifact: "backup-artifact.mjs",
    finalAcceptance: "finalize-acceptance.mjs",
    releaseBundle: "release-bundle.mjs",
    releaseArtifact: "release-artifact.mjs",
    prepareAcceptance: "prepare-acceptance-release.mjs",
    finalCandidate: "finalize-release-candidate.mjs",
    verifyCandidate: "verify-release-candidate.mjs",
  };
  const sources = Object.fromEntries(
    await Promise.all(
      Object.entries(names).map(async ([key, name]) => [
        key,
        await readFile(
          resolve(repositoryRoot, "scripts/selfhost", name),
          "utf8",
        ),
      ]),
    ),
  );
  assert.equal(validatePathCleanupSource(sources), true);
  for (const changed of [
    {
      ...sources,
      artifact: sources.artifact.replace(
        "...(originalError ? [originalError] : [])",
        "...[]",
      ),
    },
    {
      ...sources,
      finalAcceptance: sources.finalAcceptance.replace(
        "await rethrowAfterPathCleanup(error",
        "throw error; await rethrowAfterPathCleanup(null",
      ),
    },
    {
      ...sources,
      releaseArtifact: sources.releaseArtifact.replace(
        "await rethrowAfterPathCleanup(operationError",
        "await rethrowAfterPathCleanup(null",
      ),
    },
    {
      ...sources,
      releaseBundle: sources.releaseBundle.replace(
        "path: published ? output : staging",
        "path: staging",
      ),
    },
    {
      ...sources,
      releaseBundle: sources.releaseBundle.replace(
        "published = true",
        "published = false",
      ),
    },
    {
      ...sources,
      finalCandidate: sources.finalCandidate.replaceAll(
        "await rethrowAfterPathCleanup(",
        "await Promise.resolve(",
      ),
    },
  ]) {
    assert.equal(validatePathCleanupSource(changed), false);
  }
});

test("rejects weakening installer authentication binding", async () => {
  const [installerSource, releaseBundleSource] = await Promise.all([
    readFile(
      resolve(repositoryRoot, "scripts/selfhost/install-core.mjs"),
      "utf8",
    ),
    readFile(
      resolve(repositoryRoot, "scripts/selfhost/release-bundle.mjs"),
      "utf8",
    ),
  ]);
  assert.equal(
    validateInstallerAuthenticationSource(installerSource, releaseBundleSource),
    true,
  );
  for (const [changedInstaller, changedReleaseBundle] of [
    [
      installerSource.replace(
        "verified?.signatureVerified !== true",
        "verified?.signatureVerified === false",
      ),
      releaseBundleSource,
    ],
    [
      installerSource.replace(
        "checksums: new Map(verified.checksums)",
        "checksums: new Map()",
      ),
      releaseBundleSource,
    ],
    [
      installerSource.replace(
        "suppressOperationRecord: true",
        "suppressOperationRecord: false",
      ),
      releaseBundleSource,
    ],
    [
      installerSource,
      releaseBundleSource.replace(
        "checksums: new Map(verified.checksums)",
        "checksums: new Map()",
      ),
    ],
  ]) {
    assert.equal(
      validateInstallerAuthenticationSource(
        changedInstaller,
        changedReleaseBundle,
      ),
      false,
    );
  }
});
