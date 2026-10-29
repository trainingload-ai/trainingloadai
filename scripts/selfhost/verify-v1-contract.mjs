import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import acceptanceContract from "../../docker/selfhost/acceptance-contract.json" with { type: "json" };
import bundleContract from "../../docker/selfhost/release-bundle-contract.json" with { type: "json" };
import composeContract from "../../docker/selfhost/compose-contract.json" with { type: "json" };
import imageContract from "../../docker/selfhost/image-contract.json" with { type: "json" };
import releasePolicy from "../../docker/selfhost/release-policy.json" with { type: "json" };
import supplyChainContract from "../../docker/selfhost/supply-chain-contract.json" with { type: "json" };
import v1Contract from "../../docker/selfhost/v1-contract.json" with { type: "json" };
import { BACKUP_ARTIFACT_LIMITS } from "./backup-artifact.mjs";
import {
  isSupportedHostPlatform,
  SELF_HOST_HISTORY_LIMITS,
} from "./management-core.mjs";
import { SELF_HOST_RELEASE_BUNDLE_LIMITS } from "./release-bundle.mjs";
import { repositoryRoot } from "./verify-image-contract.mjs";

const EXACT_KEYS = Object.freeze({
  root: [
    "schemaVersion",
    "kind",
    "status",
    "initialReleaseVersion",
    "modes",
    "schemas",
    "platforms",
    "hostPlatforms",
    "runtimeIdentity",
    "limits",
    "data",
    "images",
    "upgrade",
    "management",
    "security",
  ],
  schemas: [
    "config",
    "instanceConfig",
    "compose",
    "releaseBundle",
    "releaseManifest",
    "backup",
    "restoreReport",
    "upgradeReport",
    "doctorReport",
    "diagnosticsBundle",
    "cliResult",
    "operationRecord",
  ],
  data: [
    "hostRootDefault",
    "containerRoot",
    "authoritative",
    "operatorManaged",
    "sensitiveTransient",
    "derived",
    "lifecycleState",
    "backupRestoreMode",
  ],
  limits: [
    "maximumBackupUploadFiles",
    "maximumBackupTreeFiles",
    "maximumBackupTreeDirectories",
    "maximumBackupTreeDepth",
    "maximumBackupJsonMetadataBytes",
    "maximumBackupChecksumBytes",
    "maximumReleaseBundleFileBytes",
    "maximumReleaseBundleBytes",
    "maximumReleaseBundleRuntimeEntries",
    "maximumDoctorBackupEntries",
    "maximumDoctorBackupBytes",
    "maximumDoctorRestoreEntries",
    "maximumDoctorRestoreBytes",
    "maximumOperationEntries",
    "maximumOperationBytes",
    "maximumUpgradeReportEntries",
    "maximumUpgradeReportBytes",
  ],
  images: [
    "roles",
    "immutableDigestRequired",
    "sbom",
    "provenance",
    "signature",
    "vulnerabilityPolicy",
  ],
  upgrade: [
    "migrationPolicy",
    "compatibilityWindowMinorVersions",
    "backupRequired",
    "databaseRollback",
    "applicationRollback",
  ],
  management: [
    "commands",
    "serializedMutationCommands",
    "operationLock",
    "operationLockReclaim",
    "staleOperationLockGraceSeconds",
    "operationReclaimTimeoutSeconds",
    "stateChangesRequireDryRun",
    "uninstallRetainsDataByDefault",
    "dataDeletionConfirmation",
  ],
  security: [
    "databaseHostPortForbidden",
    "defaultBind",
    "defaultTelemetry",
    "composeEnvironmentIsolation",
    "dataRootBoundary",
    "ownerBootstrap",
    "secretsExcludedFromBackupAndDiagnostics",
  ],
});

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

function exactArray(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function validateManagementMutationSource(source, expectedCommands) {
  const block = source.match(
    /const SERIALIZED_MUTATION_COMMANDS = new Set\(\[([\s\S]*?)\]\);/,
  )?.[1];
  const commands = block
    ? [...block.matchAll(/"([a-z-]+)"/g)].map((match) => match[1])
    : [];
  const acquireIndex = source.indexOf(
    "operationLock = await acquireOperationLock(context);",
  );
  const releaseStateIndex = source.indexOf(
    "context.releaseVersion = await readReleaseVersion(instanceDirectory);",
  );
  const releaseIndex = source.indexOf(
    "await releaseOperationLock(context, operationLock);",
  );
  return (
    exactArray(commands, expectedCommands) &&
    source.includes(
      "!context.dryRun && SERIALIZED_MUTATION_COMMANDS.has(context.command)",
    ) &&
    acquireIndex >= 0 &&
    acquireIndex < releaseStateIndex &&
    releaseIndex > releaseStateIndex &&
    source.includes("await atomicWrite(reclaimPath, reclaimPayload, 0o600)") &&
    source.includes("readOperationReclaim") &&
    source.includes("OPERATION_RECLAIM_KIND") &&
    source.includes("OPERATION_RECLAIM_TIMEOUT_MS") &&
    source.includes("await atomicReplace(path, payload, 0o600)") &&
    source.includes("await fs.link(lock.path, released)") &&
    source.includes("await fs.unlink(lock.path)") &&
    !source.includes("await fs.rename(lock.path, released)") &&
    source.includes("OPERATION_LOCK_STALE_GRACE_MS")
  );
}

export function validateManagementProfileSource(source) {
  return (
    source.includes('name.startsWith("COMPOSE_")') &&
    !source.includes('args.push("--profile", "docs")') &&
    source.includes("evaluateComposeState(rows, requiredOptionalServices)")
  );
}

export function validateManagementEnvironmentSource(source) {
  const interpolationGuard =
    '"variable interpolation is not allowed; single-quote a literal $ value"';
  const composeArgumentsBlock = source.match(
    /function composeArguments\([\s\S]*?\n}\n\nasync function readComposeDefinitions/,
  )?.[0];
  return Boolean(
    source.includes("function parseQuotedEnvironmentValue(") &&
    source.includes("function parseEnvironmentValue(") &&
    source.split(interpolationGuard).length - 1 === 2 &&
    source.includes("async function ensureComposeInputSnapshot(") &&
    !source.includes("async function readGatewayDefinition(") &&
    source.includes("requireAuthenticatedBundleContents(context, name") &&
    source.includes(
      "authenticatedBundle: dependencies.authenticatedBundle ?? null",
    ) &&
    source.includes("async function replaceComposeEnvironmentSnapshot(") &&
    source.includes("async function removeComposeInputSnapshot(") &&
    source.split("prepareComposeInvocation(context, config)").length - 1 ===
      3 &&
    source.includes("await removeComposeInputSnapshot(context);") &&
    source.includes(
      "await replaceComposeEnvironmentSnapshot(context, targetConfigText);",
    ) &&
    source.includes(
      "await replaceComposeEnvironmentSnapshot(context, rollbackConfigText);",
    ) &&
    composeArgumentsBlock?.includes('"--env-file"') &&
    composeArgumentsBlock.includes("composeInput.environmentPath") &&
    composeArgumentsBlock.includes("composeInput.composePath") &&
    !composeArgumentsBlock.includes(
      'resolve(instanceDirectory, ".env.selfhost")',
    ) &&
    !composeArgumentsBlock.includes(
      'resolve(instanceDirectory, "compose.yml")',
    ),
  );
}

export function validateManagementDataDeletionSource(source) {
  const deletionBlock = source.match(
    /async function confirmedUninstallDataRoot\([\s\S]*?\nasync function uninstall\(/,
  )?.[0];
  const uninstallBlock = source.match(
    /async function uninstall\([\s\S]*?\n}\n\nfunction restoreMarkerPath/,
  )?.[0];
  return Boolean(
    deletionBlock?.includes("fs.lstat(dataRoot, { bigint: true })") &&
    deletionBlock.includes("confirmedStat.dev !== initialStat.dev") &&
    deletionBlock.includes("confirmedStat.ino !== initialStat.ino") &&
    deletionBlock.includes("async function quarantineConfirmedDataRoot(") &&
    deletionBlock.includes(
      "await context.renameDataRoot(confirmed.path, quarantine)",
    ) &&
    deletionBlock.includes("sameDirectoryIdentity(quarantinedStat") &&
    deletionBlock.includes("restoreChangedUninstallRoot") &&
    uninstallBlock?.includes("await quarantineConfirmedDataRoot(") &&
    uninstallBlock.includes("context.removeTree(quarantined.quarantine") &&
    !uninstallBlock.includes("context.removeTree(dataRoot") &&
    source.includes("renameDataRoot: dependencies.renameDataRoot ?? fs.rename"),
  );
}

export function validateManagementFinalizationSource(source) {
  const restoreBlock = source.match(
    /async function restore\(context\)[\s\S]*?\n}\n\nfunction releaseImagesFromConfig/,
  )?.[0];
  const upgradeBlock = source.match(
    /async function upgrade\(context\)[\s\S]*?\n}\n\nfunction isRollbackSourceReport/,
  )?.[0];
  const rollbackBlock = source.match(
    /async function rollback\(context\)[\s\S]*?\n}\n\nfunction operationRecord/,
  )?.[0];
  return (
    source.includes("function appendSecondaryFailure(") &&
    source.includes("function queueSecondaryFailure(") &&
    source.includes("secondaryFailures: [") &&
    source.split("outcome = appendSecondaryFailure(").length - 1 === 3 &&
    source.includes("for (const secondary of context.secondaryFailures)") &&
    source.includes(
      '"Private Compose input snapshot cleanup also failed; inspect .selfhost before retrying"',
    ) &&
    source.includes(
      '"Operation lock release also failed; run doctor before retrying"',
    ) &&
    source.includes("details: commandFailure") &&
    source.includes("? { ...result.details, commandFailure }") &&
    source.includes(
      '"Command also failed before its required operation record could be persisted"',
    ) &&
    restoreBlock?.includes('"SELF_HOST_STOP_FAILED"') &&
    restoreBlock.includes(
      '"Restore failure containment could not stop all services"',
    ) &&
    restoreBlock.includes(
      '"Restore also failed before its required failure report could be persisted"',
    ) &&
    upgradeBlock?.includes('"SELF_HOST_STOP_FAILED"') &&
    upgradeBlock.includes(
      '"Upgrade failure containment could not stop application services"',
    ) &&
    rollbackBlock?.includes('"SELF_HOST_STOP_FAILED"') &&
    rollbackBlock.includes(
      '"Rollback failure containment could not stop application services"',
    ) &&
    source.includes(
      "`${report.command} also failed before its required failure report could be persisted`",
    )
  );
}

export function validateBackupCleanupSource(source) {
  const cleanupBlock = source.match(
    /async function cleanupBackupOperation\([\s\S]*?\n}\n\nasync function backup\(/,
  )?.[0];
  const backupBlock = source.match(
    /async function backup\(context\)[\s\S]*?\n}\n\nfunction migrationsEqual/,
  )?.[0];
  const publishIndex = backupBlock?.search(
    /await\s+fs\.rename\(paths\.staging,\s*paths\.destination\)/,
  );
  const movedIndex = backupBlock?.indexOf("publicationMoved = true");
  const durabilityIndex = backupBlock?.indexOf(
    "await context.backupPublishSync(paths.backupsDirectory)",
  );
  const publishedIndex = backupBlock?.indexOf("published = true");
  return Boolean(
    cleanupBlock?.includes("!published && stagingCreated") &&
    cleanupBlock.includes(
      "publicationMoved ? paths.destination : paths.staging",
    ) &&
    cleanupBlock.includes("backup operation lock changed identity") &&
    cleanupBlock.includes("backup operation lock changed ownership") &&
    cleanupBlock.includes("backup operation lock changed before removal") &&
    cleanupBlock.includes("await fs.unlink(paths.lock)") &&
    cleanupBlock.includes(
      "await context.backupCleanupSync(paths.backupsDirectory)",
    ) &&
    cleanupBlock.includes('"SELF_HOST_BACKUP_CLEANUP_FAILED"') &&
    source.includes("context.secondaryFailures.push({") &&
    source.includes("let stagingCreated = false") &&
    source.includes("stagingCreated = true") &&
    backupBlock?.includes("let publicationMoved = false") &&
    typeof publishIndex === "number" &&
    publishIndex >= 0 &&
    typeof movedIndex === "number" &&
    movedIndex > publishIndex &&
    typeof durabilityIndex === "number" &&
    durabilityIndex > movedIndex &&
    typeof publishedIndex === "number" &&
    publishedIndex > durabilityIndex &&
    source.includes(
      "backupPublishSync: dependencies.backupPublishSync ?? syncDirectory",
    ) &&
    source.includes(
      "backupCleanupSync: dependencies.backupCleanupSync ?? syncDirectory",
    ) &&
    !source.includes("await fs.unlink(paths.lock).catch(() => undefined)"),
  );
}

export function validateDiagnosticsCleanupSource(source) {
  const diagnosticsBlock = source.match(
    /async function diagnostics\(context\)[\s\S]*?\n}\n\nasync function logs/,
  )?.[0];
  const cleanupBlock = source.match(
    /async function removePublishedDiagnosticsArtifact\([\s\S]*?\n}\n\nasync function diagnostics/,
  )?.[0];
  return Boolean(
    cleanupBlock?.includes("current.dev !== publishedIdentity.dev") &&
    cleanupBlock.includes("current.ino !== publishedIdentity.ino") &&
    cleanupBlock.includes(
      "await context.removeDiagnosticsArtifact(destination)",
    ) &&
    cleanupBlock.includes(
      "await context.diagnosticsCleanupSync(dirname(destination))",
    ) &&
    diagnosticsBlock?.includes("await removePublishedDiagnosticsArtifact(") &&
    diagnosticsBlock.includes('"SELF_HOST_DIAGNOSTICS_CLEANUP_FAILED"') &&
    source.includes("diagnosticsCleanupSync:") &&
    source.includes("dependencies.diagnosticsCleanupSync ?? syncDirectory") &&
    source.includes("dependencies.removeDiagnosticsArtifact ?? fs.unlink") &&
    !diagnosticsBlock.includes(
      "await fs.unlink(destination).catch(() => undefined)",
    ),
  );
}

export function validateAtomicWriteCleanupSource(
  managementSource,
  artifactSource,
  privatePathSource,
) {
  const cleanupBlock = privatePathSource.match(
    /export async function rethrowAfterPrivateTemporaryCleanup\([\s\S]*?\n}\n\nfunction assertKind/,
  )?.[0];
  const writeBlock = managementSource.match(
    /async function atomicWrite\([\s\S]*?\n}\n\nasync function atomicReplace/,
  )?.[0];
  const replaceBlock = managementSource.match(
    /async function atomicReplace\([\s\S]*?\n}\n\nfunction operationLockPath/,
  )?.[0];
  const stageArtifactBlock = artifactSource.match(
    /async function stageRegularFile\([\s\S]*?\n}\n\nfunction isSamePublishedFile/,
  )?.[0];
  const replaceArtifactBlock = artifactSource.match(
    /export async function replaceRegularFileAtomically\([\s\S]*?\n}\n\nexport class DirectoryEntryLimitError/,
  )?.[0];
  return Boolean(
    cleanupBlock?.includes('error?.code !== "ENOENT"') &&
    cleanupBlock.includes("new AggregateError(") &&
    cleanupBlock.includes("[originalError, ...cleanupErrors]") &&
    cleanupBlock.includes("failure.code =") &&
    cleanupBlock.includes("isFilesystemErrorCode(error?.code)") &&
    /await fs\.unlink\(temporaryPath\)/.test(cleanupBlock) &&
    writeBlock?.includes("await rethrowAfterPrivateTemporaryCleanup(") &&
    replaceBlock?.includes("await rethrowAfterPrivateTemporaryCleanup(") &&
    stageArtifactBlock?.includes(
      "await rethrowAfterPrivateTemporaryCleanup(error, handle, temporary)",
    ) &&
    replaceArtifactBlock?.includes(
      "await rethrowAfterPrivateTemporaryCleanup(",
    ) &&
    managementSource.includes("isFilesystemErrorCode(error?.code)") &&
    !writeBlock.includes("handle?.close().catch(() => undefined)") &&
    !replaceBlock.includes("handle?.close().catch(() => undefined)") &&
    !stageArtifactBlock.includes("handle?.close().catch(() => undefined)") &&
    !/fs\.unlink\(staged\.temporary\)\.catch\(\(\) => undefined\)/.test(
      replaceArtifactBlock,
    ),
  );
}

export function validateStreamRunnerCleanupSource(
  managementSource,
  privatePathSource,
) {
  const collectorBlock = privatePathSource.match(
    /export async function collectPrivateHandleCloseErrors\([\s\S]*?\n}\n\nexport async function rethrowAfterPrivateHandleCleanup/,
  )?.[0];
  const failureBlock = managementSource.match(
    /function streamCleanupFailure\([\s\S]*?\n}\n\nexport async function defaultStreamRunner/,
  )?.[0];
  const runnerBlock = managementSource.match(
    /export async function defaultStreamRunner\([\s\S]*?\n}\n\nfunction action/,
  )?.[0];
  return Boolean(
    collectorBlock?.includes("for (const handle of handles)") &&
    collectorBlock.includes("errors.push(error)") &&
    failureBlock?.includes("new AggregateError(") &&
    failureBlock.includes("[originalError]") &&
    failureBlock.includes("...cleanupErrors") &&
    failureBlock.includes("failure.code =") &&
    failureBlock.includes("isFilesystemErrorCode(error?.code)") &&
    runnerBlock?.includes("[inputHandle, outputHandle]") &&
    runnerBlock.includes("operationError ?? streamResultFailure(result)") &&
    runnerBlock.includes("if (operationError) throw failure") &&
    runnerBlock.includes("result.error = failure") &&
    runnerBlock.includes("if (operationError) throw operationError") &&
    !runnerBlock.includes("close().catch(() => undefined)"),
  );
}

export function validatePrivateHandleCleanupSource(sources) {
  const helperBlock = sources.privatePath.match(
    /export async function rethrowAfterPrivateHandleCleanup\([\s\S]*?\n}\n\nexport async function rethrowAfterPrivateTemporaryCleanup/,
  )?.[0];
  const artifactCalls =
    sources.artifact.match(/await rethrowAfterPrivateHandleCleanup\(/g) ?? [];
  const managementCalls =
    sources.management.match(/await rethrowAfterPrivateHandleCleanup\(/g) ?? [];
  const releaseBundleCalls =
    sources.releaseBundle.match(/await rethrowAfterPrivateHandleCleanup\(/g) ??
    [];
  return Boolean(
    helperBlock?.includes("collectPrivateHandleCloseErrors(") &&
    helperBlock.includes("new AggregateError(") &&
    helperBlock.includes("[originalError]") &&
    helperBlock.includes("...cleanupErrors") &&
    helperBlock.includes("failure.code =") &&
    helperBlock.includes("isFilesystemErrorCode(error?.code)") &&
    helperBlock.includes("if (originalError) throw originalError") &&
    artifactCalls.length === 6 &&
    managementCalls.length === 1 &&
    releaseBundleCalls.length === 1 &&
    !sources.artifact.includes("Promise.allSettled(") &&
    !sources.management.includes("await handle.close();\n  }") &&
    !sources.releaseBundle.includes("await handle.close();\n  }"),
  );
}

export function validatePathCleanupSource(sources) {
  const cleanupBlock = sources.artifact.match(
    /export async function rethrowAfterPathCleanup\([\s\S]*?\n}\n\nfunction hasExactKeys/,
  )?.[0];
  const finalCandidateCalls =
    sources.finalCandidate.match(/await rethrowAfterPathCleanup\(/g) ?? [];
  const finalCandidatePublishIndex = sources.finalCandidate.search(
    /await fs\.rename\(staging, output\)/,
  );
  const releaseBundlePublishIndex = sources.releaseBundle.search(
    /await\s+fs\.rename\(staging,\s*output\)/,
  );
  const releaseBundlePublishedIndex =
    sources.releaseBundle.indexOf("published = true");
  const releaseBundleDurabilityIndex =
    sources.releaseBundle.indexOf("await sync(parent)");
  return Boolean(
    cleanupBlock?.includes("for (const cleanup of cleanups)") &&
    /await fs\.rm\(cleanup\.path, cleanup\.options\)/.test(cleanupBlock) &&
    cleanupBlock.includes("new AggregateError(") &&
    cleanupBlock.includes("[originalError]") &&
    cleanupBlock.includes("...cleanupErrors") &&
    cleanupBlock.includes("failure.code =") &&
    cleanupBlock.includes("isFilesystemErrorCode(error?.code)") &&
    cleanupBlock.includes("if (originalError) throw originalError") &&
    sources.finalAcceptance.includes("await rethrowAfterPathCleanup(error") &&
    /await rethrowAfterPathCleanup\(\s*error/.test(sources.releaseBundle) &&
    sources.releaseBundle.includes("let published = false") &&
    sources.releaseBundle.includes("path: published ? output : staging") &&
    releaseBundlePublishIndex >= 0 &&
    releaseBundlePublishedIndex > releaseBundlePublishIndex &&
    releaseBundleDurabilityIndex > releaseBundlePublishedIndex &&
    sources.releaseArtifact.includes(
      "await rethrowAfterPathCleanup(operationError",
    ) &&
    sources.prepareAcceptance.includes(
      "await rethrowAfterPathCleanup(operationError",
    ) &&
    sources.verifyCandidate.includes(
      "await rethrowAfterPathCleanup(operationError",
    ) &&
    finalCandidateCalls.length === 3 &&
    sources.finalCandidate.includes("if (operationError) {") &&
    sources.finalCandidate.includes("let workCleaned = false") &&
    sources.finalCandidate.includes("workCleaned = true") &&
    sources.finalCandidate.includes("if (!workCleaned) {") &&
    sources.finalCandidate.includes("path: staging,") &&
    sources.finalCandidate.includes("path: work,") &&
    finalCandidatePublishIndex >= 0 &&
    sources.finalCandidate.indexOf("workCleaned = true") <
      finalCandidatePublishIndex,
  );
}

export function validateInstallerAuthenticationSource(
  installerSource,
  releaseBundleSource,
) {
  const verificationIndex = installerSource.indexOf(
    "const verified = await verifyBundle(root",
  );
  const authenticatedContextIndex = installerSource.indexOf(
    "const authenticatedBundle = {",
  );
  const initPlanIndex = installerSource.indexOf(
    'managementOptions("init", root, true)',
  );
  const actualInitIndex = installerSource.indexOf(
    'managementOptions("init", root)',
  );
  return (
    verificationIndex >= 0 &&
    authenticatedContextIndex > verificationIndex &&
    initPlanIndex > authenticatedContextIndex &&
    actualInitIndex > authenticatedContextIndex &&
    installerSource.includes("verified?.signatureVerified !== true") &&
    installerSource.includes("!(verified.checksums instanceof Map)") &&
    installerSource.includes("checksums: new Map(verified.checksums)") &&
    installerSource.includes("authenticatedBundle,") &&
    installerSource.includes("suppressOperationRecord: true") &&
    installerSource.split("managementDependencies,").length - 1 >= 3 &&
    releaseBundleSource.includes("checksums: new Map(verified.checksums)")
  );
}

function invariant(condition, message) {
  if (!condition) throw new Error(`self-host v1 contract drift: ${message}`);
}

async function readJson(relativePath) {
  return JSON.parse(
    await fs.readFile(`${repositoryRoot}/${relativePath}`, "utf8"),
  );
}

function schemaVersion(schema, kind) {
  if (kind === "config" || kind === "instanceConfig") {
    return Number(schema.$id?.match(/config-v(\d+)\.json$/)?.[1]);
  }
  return schema.properties?.schemaVersion?.const;
}

export async function verifySelfHostV1Contract(contract = v1Contract) {
  invariant(exactKeys(contract, EXACT_KEYS.root), "unexpected root shape");
  invariant(contract.schemaVersion === 1, "schemaVersion must remain 1");
  invariant(
    contract.kind === "trainingload-selfhost-v1-contract" &&
      contract.status === "frozen",
    "contract identity is not frozen v1",
  );
  const packageManifest = await readJson("package.json");
  invariant(
    contract.initialReleaseVersion ===
        releasePolicy.database.baselineReleaseVersion &&
      releasePolicy.releaseVersion === packageManifest.version,
    "initial release differs from the database baseline or current release differs from the package",
  );
  invariant(
    exactArray(contract.modes, ["core-local", "connected", "extended"]),
    "runtime modes changed",
  );
  invariant(
    exactKeys(contract.schemas, EXACT_KEYS.schemas),
    "schema map changed",
  );
  invariant(
    contract.schemas.config === imageContract.configSchemaVersion &&
      contract.schemas.compose === composeContract.composeSchemaVersion &&
      contract.schemas.releaseBundle === bundleContract.bundleSchemaVersion &&
      contract.schemas.releaseManifest === 1,
    "primary schema versions disagree",
  );

  const schemaFiles = {
    config: "schemas/self-host-config.schema.json",
    instanceConfig: "schemas/self-host-instance-config.schema.json",
    backup: "schemas/self-host-backup-manifest.schema.json",
    restoreReport: "schemas/self-host-restore-report.schema.json",
    upgradeReport: "schemas/self-host-upgrade-report.schema.json",
    doctorReport: "schemas/self-host-doctor-report.schema.json",
    diagnosticsBundle: "schemas/self-host-diagnostics-bundle.schema.json",
    cliResult: "schemas/self-host-cli-result.schema.json",
    operationRecord: "schemas/self-host-operation-record.schema.json",
  };
  for (const [name, path] of Object.entries(schemaFiles)) {
    const schema = await readJson(path);
    invariant(
      schemaVersion(schema, name) === contract.schemas[name],
      `${name} schema version disagrees`,
    );
  }

  invariant(
    exactArray(contract.platforms, imageContract.platforms) &&
      exactArray(contract.platforms, supplyChainContract.platforms),
    "image platforms disagree",
  );
  const acceptanceHostPlatforms = acceptanceContract.platforms.map(
    ({ nodePlatform, architecture }) => `${nodePlatform}/${architecture}`,
  );
  const acceptanceContainerPlatforms = [
    ...new Set(
      acceptanceContract.platforms.map(({ containerPlatform }) =>
        containerPlatform.toLowerCase(),
      ),
    ),
  ];
  invariant(
    exactArray(contract.hostPlatforms, acceptanceHostPlatforms) &&
      exactArray(contract.platforms, acceptanceContainerPlatforms) &&
      acceptanceContract.platforms.every(({ nodePlatform, architecture }) =>
        isSupportedHostPlatform(nodePlatform, architecture),
      ),
    "host platforms disagree",
  );
  invariant(
    JSON.stringify(contract.runtimeIdentity) ===
      JSON.stringify(imageContract.runtimeIdentity),
    "runtime identity disagrees",
  );
  invariant(
    exactKeys(contract.limits, EXACT_KEYS.limits),
    "limits shape changed",
  );
  invariant(
    contract.limits.maximumBackupUploadFiles ===
      BACKUP_ARTIFACT_LIMITS.maximumUploadFiles &&
      contract.limits.maximumBackupTreeFiles ===
        BACKUP_ARTIFACT_LIMITS.maximumTreeFiles &&
      contract.limits.maximumBackupTreeDirectories ===
        BACKUP_ARTIFACT_LIMITS.maximumTreeDirectories &&
      contract.limits.maximumBackupTreeDepth ===
        BACKUP_ARTIFACT_LIMITS.maximumTreeDepth &&
      contract.limits.maximumBackupJsonMetadataBytes ===
        BACKUP_ARTIFACT_LIMITS.maximumJsonMetadataBytes &&
      contract.limits.maximumBackupChecksumBytes ===
        BACKUP_ARTIFACT_LIMITS.maximumChecksumBytes &&
      contract.limits.maximumReleaseBundleFileBytes ===
        SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes &&
      contract.limits.maximumReleaseBundleBytes ===
        SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumBundleBytes &&
      contract.limits.maximumReleaseBundleRuntimeEntries ===
        SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumRuntimeTopLevelEntries &&
      contract.limits.maximumDoctorBackupEntries ===
        SELF_HOST_HISTORY_LIMITS.maximumBackupEntries &&
      contract.limits.maximumDoctorBackupBytes ===
        SELF_HOST_HISTORY_LIMITS.maximumBackupBytes &&
      contract.limits.maximumDoctorRestoreEntries ===
        SELF_HOST_HISTORY_LIMITS.maximumRestoreEntries &&
      contract.limits.maximumDoctorRestoreBytes ===
        SELF_HOST_HISTORY_LIMITS.maximumRestoreBytes &&
      contract.limits.maximumOperationEntries ===
        SELF_HOST_HISTORY_LIMITS.maximumOperationEntries &&
      contract.limits.maximumOperationBytes ===
        SELF_HOST_HISTORY_LIMITS.maximumOperationBytes &&
      contract.limits.maximumUpgradeReportEntries ===
        SELF_HOST_HISTORY_LIMITS.maximumUpgradeReportEntries &&
      contract.limits.maximumUpgradeReportBytes ===
        SELF_HOST_HISTORY_LIMITS.maximumUpgradeReportBytes,
    "bounded release, artifact, or history limits disagree",
  );

  invariant(
    exactKeys(contract.data, EXACT_KEYS.data),
    "data contract shape changed",
  );
  invariant(
    contract.data.hostRootDefault === "./data" &&
      contract.data.containerRoot === "/data" &&
      exactArray(contract.data.authoritative, ["postgres", "uploads"]) &&
      exactArray(contract.data.operatorManaged, [
        "backups",
        "elevation",
      ]) &&
      exactArray(contract.data.sensitiveTransient, ["operations"]) &&
      exactArray(contract.data.derived, [
        "cache",
        "diagnostics",
      ]) &&
      contract.data.lifecycleState === ".selfhost" &&
      contract.data.backupRestoreMode === "exact-release",
    "data roots or restore mode changed",
  );
  invariant(
    composeContract.persistentMounts.postgres.startsWith(
      "${SELF_HOST_DATA_ROOT:-./data}/postgres:",
    ) &&
      composeContract.persistentMounts.serverUploads ===
        "${SELF_HOST_DATA_ROOT:-./data}/uploads:/data/uploads" &&
      composeContract.persistentMounts.serverOperations ===
        "${SELF_HOST_DATA_ROOT:-./data}/operations:/data/operations" &&
      composeContract.persistentMounts.clientCache ===
        "${SELF_HOST_DATA_ROOT:-./data}/cache/client:/app/apps/client/.next/cache",
    "persistent data mounts disagree",
  );

  invariant(
    exactKeys(contract.images, EXACT_KEYS.images),
    "image contract shape changed",
  );
  invariant(
    exactArray(contract.images.roles, ["migrate", "server", "client"]) &&
      contract.images.immutableDigestRequired === true &&
      contract.images.sbom === supplyChainContract.attestations.sbom &&
      contract.images.provenance ===
        supplyChainContract.attestations.provenance &&
      contract.images.signature === "cosign-keyless" &&
      contract.images.vulnerabilityPolicy === "zero-fixable-critical-high" &&
      exactArray(supplyChainContract.vulnerabilityScan.platforms, [
        "linux/amd64",
        "linux/arm64",
      ]) &&
      exactArray(supplyChainContract.vulnerabilityScan.severities, [
        "critical",
        "high",
      ]) &&
      supplyChainContract.vulnerabilityScan.onlyFixed === true &&
      supplyChainContract.vulnerabilityScan.failOnFinding === true &&
      supplyChainContract.vulnerabilityScan.maximumFindings === 0 &&
      supplyChainContract.vulnerabilityScan.evidenceFormat === "sarif-2.1.0" &&
      supplyChainContract.vulnerabilityScan.maximumEvidenceBytes === 33_554_432,
    "image evidence contract disagrees",
  );

  invariant(
    exactKeys(contract.upgrade, EXACT_KEYS.upgrade),
    "upgrade shape changed",
  );
  invariant(
    contract.upgrade.migrationPolicy ===
      releasePolicy.database.migrationPolicy &&
      contract.upgrade.compatibilityWindowMinorVersions ===
        releasePolicy.database.compatibilityWindowMinorVersions &&
      contract.upgrade.backupRequired ===
        releasePolicy.upgrade.backupRequired &&
      contract.upgrade.databaseRollback ===
        releasePolicy.database.databaseRollback &&
      contract.upgrade.applicationRollback === "declared-release-only",
    "upgrade compatibility disagrees",
  );

  invariant(
    exactKeys(contract.security, EXACT_KEYS.security),
    "security shape changed",
  );
  invariant(
    contract.security.databaseHostPortForbidden ===
      acceptanceContract.security.databaseHostPortForbidden &&
      contract.security.defaultBind === "127.0.0.1" &&
      contract.security.defaultTelemetry === false &&
      contract.security.composeEnvironmentIsolation ===
        "validated-private-runtime-snapshot-only" &&
      contract.security.dataRootBoundary ===
        "physical-path-outside-signed-subtrees" &&
      contract.security.ownerBootstrap === "single-use" &&
      contract.security.secretsExcludedFromBackupAndDiagnostics === true,
    "security baseline disagrees",
  );

  invariant(
    exactKeys(contract.management, EXACT_KEYS.management),
    "management shape changed",
  );
  const managementCommands = [
    "init",
    "doctor",
    "diagnostics",
    "start",
    "status",
    "logs",
    "backup",
    "restore",
    "upgrade",
    "rollback",
    "stop",
    "owner-bootstrap",
    "owner-recovery",
    "uninstall",
  ];
  const serializedMutationCommands = [
    "init",
    "start",
    "backup",
    "restore",
    "upgrade",
    "rollback",
    "stop",
    "owner-bootstrap",
    "owner-recovery",
    "uninstall",
  ];
  const [cliResultSchema, operationRecordSchema] = await Promise.all([
    readJson("schemas/self-host-cli-result.schema.json"),
    readJson("schemas/self-host-operation-record.schema.json"),
  ]);
  invariant(
    exactArray(contract.management.commands, managementCommands) &&
      exactArray(
        cliResultSchema.properties.command.enum.filter(
          (command) => command !== "unknown",
        ),
        managementCommands,
      ) &&
      exactArray(
        operationRecordSchema.properties.command.enum,
        managementCommands,
      ) &&
      exactArray(
        contract.management.serializedMutationCommands,
        serializedMutationCommands,
      ) &&
      contract.management.operationLock === ".selfhost/operation.lock.json" &&
      contract.management.operationLockReclaim ===
        ".selfhost/operation.lock.reclaim" &&
      contract.management.staleOperationLockGraceSeconds === 7200 &&
      contract.management.operationReclaimTimeoutSeconds === 900 &&
      contract.management.stateChangesRequireDryRun === true &&
      contract.management.uninstallRetainsDataByDefault === true &&
      contract.management.dataDeletionConfirmation ===
        "exact-absolute-data-root-inode-quarantine",
    "management command or destructive-action contract disagrees",
  );
  const [managementSource, artifactSource, privatePathSource] =
    await Promise.all([
      fs.readFile(
        `${repositoryRoot}/scripts/selfhost/management-core.mjs`,
        "utf8",
      ),
      fs.readFile(
        `${repositoryRoot}/scripts/selfhost/backup-artifact.mjs`,
        "utf8",
      ),
      fs.readFile(
        `${repositoryRoot}/scripts/selfhost/private-path.mjs`,
        "utf8",
      ),
    ]);
  invariant(
    validateManagementMutationSource(
      managementSource,
      serializedMutationCommands,
    ),
    "management mutation serialization changed",
  );
  invariant(
    validateManagementProfileSource(managementSource),
    "optional profile ownership or readiness changed",
  );
  invariant(
    validateManagementEnvironmentSource(managementSource),
    "instance environment parsing or Compose isolation changed",
  );
  invariant(
    validateManagementDataDeletionSource(managementSource),
    "management data deletion binding changed",
  );
  invariant(
    validateManagementFinalizationSource(managementSource),
    "management finalization visibility changed",
  );
  invariant(
    validateBackupCleanupSource(managementSource),
    "backup cleanup binding changed",
  );
  invariant(
    validateDiagnosticsCleanupSource(managementSource),
    "diagnostics cleanup binding changed",
  );
  invariant(
    validateAtomicWriteCleanupSource(
      managementSource,
      artifactSource,
      privatePathSource,
    ),
    "atomic write cleanup binding changed",
  );
  invariant(
    validateStreamRunnerCleanupSource(managementSource, privatePathSource),
    "stream runner cleanup binding changed",
  );
  const [
    installerSource,
    releaseBundleSource,
    finalAcceptanceSource,
    releaseArtifactSource,
    prepareAcceptanceSource,
    finalCandidateSource,
    verifyCandidateSource,
  ] = await Promise.all([
    fs.readFile(`${repositoryRoot}/scripts/selfhost/install-core.mjs`, "utf8"),
    fs.readFile(
      `${repositoryRoot}/scripts/selfhost/release-bundle.mjs`,
      "utf8",
    ),
    fs.readFile(
      `${repositoryRoot}/scripts/selfhost/finalize-acceptance.mjs`,
      "utf8",
    ),
    fs.readFile(
      `${repositoryRoot}/scripts/selfhost/release-artifact.mjs`,
      "utf8",
    ),
    fs.readFile(
      `${repositoryRoot}/scripts/selfhost/prepare-acceptance-release.mjs`,
      "utf8",
    ),
    fs.readFile(
      `${repositoryRoot}/scripts/selfhost/finalize-release-candidate.mjs`,
      "utf8",
    ),
    fs.readFile(
      `${repositoryRoot}/scripts/selfhost/verify-release-candidate.mjs`,
      "utf8",
    ),
  ]);
  invariant(
    validateInstallerAuthenticationSource(installerSource, releaseBundleSource),
    "installer authentication binding changed",
  );
  invariant(
    validatePathCleanupSource({
      artifact: artifactSource,
      finalAcceptance: finalAcceptanceSource,
      releaseBundle: releaseBundleSource,
      releaseArtifact: releaseArtifactSource,
      prepareAcceptance: prepareAcceptanceSource,
      finalCandidate: finalCandidateSource,
      verifyCandidate: verifyCandidateSource,
    }),
    "release path cleanup binding changed",
  );
  invariant(
    validatePrivateHandleCleanupSource({
      privatePath: privatePathSource,
      artifact: artifactSource,
      management: managementSource,
      releaseBundle: releaseBundleSource,
    }),
    "private handle cleanup binding changed",
  );
  invariant(
    !managementSource.includes("fs.readFile(config.configPath") &&
      (
        managementSource.match(/replaceEnvironmentSettings\(config\.text/g) ??
        []
      ).length === 2,
    "upgrade and rollback must mutate the validated config snapshot",
  );

  const environment = await fs.readFile(
    `${repositoryRoot}/.env.example`,
    "utf8",
  );
  invariant(
    /^# SELF_HOST_DATA_ROOT=\.\/data$/m.test(environment) &&
      /^SELF_HOST_HTTP_BIND=127\.0\.0\.1$/m.test(environment) &&
      !/^SELF_HOST_DOCS_/m.test(environment) &&
      /^TELEMETRY_ENABLED=false$/m.test(environment),
    "environment defaults disagree",
  );
  const compose = YAML.parse(
    await fs.readFile(`${repositoryRoot}/compose.yml`, "utf8"),
  );
  invariant(
    !compose.services.postgres.ports &&
      compose.services.server.read_only === true &&
      compose.services.client.read_only === true &&
      !compose.services.gateway && !compose.services.docs,
    "runtime security defaults disagree",
  );
  return contract;
}

async function main() {
  const contract = await verifySelfHostV1Contract();
  process.stdout.write(
    `self-host v1 contract: PASS (${contract.platforms.join(", ")}; hosts ${contract.hostPlatforms.join(", ")}; schema v${contract.schemaVersion})\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

export { EXACT_KEYS };
