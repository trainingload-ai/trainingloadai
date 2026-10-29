import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Script } from "node:vm";
import acceptanceContract from "../../docker/selfhost/acceptance-contract.json" with { type: "json" };
import supplyChainContract from "../../docker/selfhost/supply-chain-contract.json" with { type: "json" };
import { repositoryRoot } from "./verify-image-contract.mjs";

const REQUIRED_SCENARIOS = Object.freeze({
  "signed-release-integrity": ["P0", ["core-local", "connected"]],
  "fresh-install": ["P0", ["core-local", "connected"]],
  "owner-bootstrap-and-sign-in": ["P0", ["core-local", "connected"]],
  "core-user-journey": ["P0", ["core-local", "connected"]],
  "restart-persistence": ["P0", ["core-local", "connected"]],
  "recreate-persistence": ["P0", ["core-local", "connected"]],
  "backup-clean-restore": ["P0", ["core-local", "connected"]],
  "signed-upgrade": ["P0", ["core-local", "connected"]],
  "declared-application-rollback": ["P0", ["core-local", "connected"]],
  "database-unavailable-recovery": ["P1", ["core-local", "connected"]],
  "network-disconnect-recovery": ["P1", ["core-local", "connected"]],
  "disk-insufficient-fail-closed": ["P1", ["core-local", "connected"]],
  "permission-error-fail-closed": ["P1", ["core-local", "connected"]],
  "provider-timeout-degrades": ["P1", ["connected"]],
  "default-security-audit": ["P0", ["core-local", "connected"]],
  "resource-baseline": ["P1", ["core-local", "connected"]],
  "safe-uninstall-reinstall": ["P1", ["core-local", "connected"]],
});

const REQUIRED_SCENARIO_EVIDENCE = Object.freeze({
  "signed-release-integrity": Object.freeze({
    outerSignatureVerified: true,
    innerSignatureVerified: true,
  }),
  "fresh-install": Object.freeze({
    ready: true,
    installerSameArgumentDryRun: true,
  }),
  "owner-bootstrap-and-sign-in": Object.freeze({
    ownerState: "READY",
    managementCli: true,
    sameArgumentDryRun: true,
    bootstrapReplayRejected: true,
  }),
  "core-user-journey": Object.freeze({
    activityImported: true,
    routeVisible: true,
    localThumbnailAvailable: true,
    rawElevationExported: true,
    sourceFileStored: true,
    commercialCredentialsRequired: false,
  }),
  "restart-persistence": Object.freeze({ persisted: true }),
  "recreate-persistence": Object.freeze({ persisted: true }),
  "backup-clean-restore": Object.freeze({
    verified: true,
    ready: true,
    installerSameArgumentDryRun: true,
  }),
  "signed-upgrade": Object.freeze({ backupVerified: true }),
  "declared-application-rollback": Object.freeze({
    databaseRollback: "unsupported",
  }),
  "database-unavailable-recovery": Object.freeze({
    degraded: true,
    recovered: true,
    doctorOverall: "fail",
    doctorErrorCode: "SELF_HOST_DOCTOR_FAILED",
    databaseErrorCode: "SELF_HOST_DOCTOR_DATABASE_FAILED",
    diagnosticsSecretScan: "pass",
    diagnosticsOperatorReviewRequired: true,
  }),
  "network-disconnect-recovery": Object.freeze({
    degraded: true,
    recovered: true,
  }),
  "disk-insufficient-fail-closed": Object.freeze({
    errorCode: "SELF_HOST_BACKUP_DISK_SPACE_INSUFFICIENT",
  }),
  "permission-error-fail-closed": Object.freeze({
    writeRejected: true,
    permissionsRestored: true,
  }),
  "provider-timeout-degrades": Object.freeze({
    coreReady: true,
    providerStatus: "warning",
  }),
  "default-security-audit": Object.freeze({ checks: 6 }),
  "resource-baseline": Object.freeze({
    measuredServices: Object.freeze([
      "postgres",
      "server",
      "client",
    ]),
  }),
  "safe-uninstall-reinstall": Object.freeze({
    composeResourcesRemoved: true,
    dataRetained: true,
    reinstallVerified: true,
  }),
});

const REQUIRED_SECURITY_POLICY = Object.freeze({
  databaseHostPortForbidden: true,
  applicationRootReadOnly: Object.freeze([
    "migrate",
    "server",
    "client",
  ]),
  capDropAll: Object.freeze([
    "permissions",
    "migrate",
    "server",
    "client",
  ]),
  noNewPrivileges: Object.freeze([
    "permissions",
    "postgres",
    "migrate",
    "server",
    "client",
  ]),
  nonRoot: Object.freeze(["migrate", "server", "client"]),
  runtimeEvidence: Object.freeze({
    "runtime-non-root": Object.freeze({
      services: Object.freeze(["migrate", "server", "client"]),
    }),
    "runtime-read-only-root": Object.freeze({
      services: Object.freeze(["migrate", "server", "client"]),
    }),
    "runtime-cap-drop-all": Object.freeze({
      services: Object.freeze([
        "permissions",
        "migrate",
        "server",
        "client",
      ]),
    }),
    "runtime-no-new-privileges": Object.freeze({
      services: Object.freeze([
        "permissions",
        "postgres",
        "migrate",
        "server",
        "client",
      ]),
    }),
    "database-not-published": Object.freeze({
      publishedPorts: Object.freeze([]),
    }),
    "permissions-cap-allowlist": Object.freeze({
      capabilities: Object.freeze(["CHOWN", "DAC_OVERRIDE", "FOWNER"]),
    }),
  }),
});

function issue(code, message) {
  return { code, message };
}

function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",")
  );
}

export function validateAcceptanceContract(contract) {
  const errors = [];
  if (
    !exactKeys(contract, [
      "schemaVersion",
      "workflow",
      "sourceWorkflow",
      "manualOnly",
      "nodeVersion",
      "artifact",
      "platforms",
      "modes",
      "scenarios",
      "scenarioEvidence",
      "thresholds",
      "resources",
      "security",
      "gate",
    ]) ||
    contract.schemaVersion !== 2 ||
    contract.manualOnly !== true
  ) {
    errors.push(issue("CONTRACT", "acceptance contract shape is invalid"));
  }
  const platformIds = new Set();
  for (const platform of contract.platforms ?? []) {
    if (
      !/^[a-z0-9-]+$/.test(platform.id ?? "") ||
      platformIds.has(platform.id) ||
      !["linux", "darwin", "win32"].includes(platform.nodePlatform) ||
      !["amd64", "arm64"].includes(platform.architecture) ||
      !["linux/amd64", "linux/arm64"].includes(platform.containerPlatform) ||
      !Number.isSafeInteger(platform.minimumFreeDiskBytes) ||
      platform.minimumFreeDiskBytes < 8 * 1024 ** 3 ||
      !Array.isArray(platform.runner) ||
      !platform.runner.length
    ) {
      errors.push(
        issue("PLATFORM", "acceptance platform is invalid or duplicated"),
      );
    }
    platformIds.add(platform.id);
  }
  for (const id of [
    "ubuntu-amd64",
    "linux-arm64",
    "macos-apple-silicon",
    "windows-11-wsl2",
  ]) {
    if (!platformIds.has(id)) errors.push(issue("PLATFORM", `missing ${id}`));
  }
  if (
    JSON.stringify(contract.modes) !==
    JSON.stringify(["core-local", "connected"])
  ) {
    errors.push(issue("MODE", "core-local and connected modes are mandatory"));
  }
  const scenarioIds = new Set();
  for (const scenario of contract.scenarios ?? []) {
    if (
      !/^[a-z0-9-]+$/.test(scenario.id ?? "") ||
      scenarioIds.has(scenario.id) ||
      !["P0", "P1", "P2"].includes(scenario.priority) ||
      !scenario.modes?.every((mode) => contract.modes.includes(mode))
    ) {
      errors.push(
        issue("SCENARIO", "acceptance scenario is invalid or duplicated"),
      );
    }
    scenarioIds.add(scenario.id);
  }
  for (const [id, [priority, modes]] of Object.entries(REQUIRED_SCENARIOS)) {
    const actual = contract.scenarios?.find((scenario) => scenario.id === id);
    if (
      !actual ||
      actual.priority !== priority ||
      JSON.stringify(actual.modes) !== JSON.stringify(modes)
    ) {
      errors.push(issue("SCENARIO", `${id} priority or mode coverage changed`));
    }
  }
  if (
    !exactKeys(
      contract.scenarioEvidence,
      Object.keys(REQUIRED_SCENARIO_EVIDENCE),
    )
  ) {
    errors.push(
      issue("SCENARIO_EVIDENCE", "scenario evidence coverage is invalid"),
    );
  }
  for (const [scenarioId, requiredDetails] of Object.entries(
    REQUIRED_SCENARIO_EVIDENCE,
  )) {
    const actual = contract.scenarioEvidence?.[scenarioId];
    if (
      !scenarioIds.has(scenarioId) ||
      !exactKeys(actual, Object.keys(requiredDetails)) ||
      Object.entries(requiredDetails).some(
        ([field, value]) =>
          JSON.stringify(actual?.[field]) !== JSON.stringify(value),
      )
    ) {
      errors.push(
        issue(
          "SCENARIO_EVIDENCE",
          `${scenarioId} evidence requirements changed`,
        ),
      );
    }
  }
  if (
    !exactKeys(contract.thresholds, [
      "memoryTotalBytes",
      "dataAfterInstallBytes",
      "fixtureDiskGrowthBytes",
      "restoreDiskVarianceBytes",
      "freshInstallMs",
      "restartMs",
      "recreateMs",
      "restoreMs",
      "upgradeMs",
      "healthLatencyP95Ms",
      "healthLatencySamples",
      "providerTimeoutMinimumMs",
    ]) ||
    !Object.entries(contract.thresholds).every(
      ([, value]) => Number.isSafeInteger(value) && value > 0,
    ) ||
    contract.thresholds.providerTimeoutMinimumMs !== 7_000
  ) {
    errors.push(issue("THRESHOLD", "acceptance thresholds are incomplete"));
  }
  if (
    !exactKeys(contract.resources, ["measuredServices"]) ||
    JSON.stringify(contract.resources.measuredServices) !==
      JSON.stringify(["postgres", "server", "client"])
  ) {
    errors.push(issue("RESOURCE", "resource measurement coverage is invalid"));
  }
  if (
    !exactKeys(contract.security, Object.keys(REQUIRED_SECURITY_POLICY)) ||
    JSON.stringify(contract.security) !==
      JSON.stringify(REQUIRED_SECURITY_POLICY)
  ) {
    errors.push(issue("SECURITY", "acceptance security policy is invalid"));
  }
  if (
    contract.gate?.requiredPriorSignedRelease !== true ||
    contract.gate?.allowSkippedP0P1 !== false ||
    contract.gate?.allowContinueOnError !== false ||
    contract.gate?.workflowRevisionMustMatchRelease !== true ||
    contract.gate?.aggregateArtifact !==
      "selfhost-acceptance-gate-<revision>" ||
    contract.gate?.manifest !== "acceptance-manifest.json" ||
    contract.gate?.checksums !== "acceptance-checksums.txt" ||
    contract.gate?.signatureBundle !== "acceptance-checksums.bundle.json" ||
    contract.gate?.evidenceRetentionDays !== 90
  ) {
    errors.push(issue("GATE", "P0/P1 gates must fail closed"));
  }
  return errors;
}

export function validateAcceptanceWorkflow(source, contract, supplyChain) {
  const errors = [];
  if (!/^on:\s*\n  workflow_dispatch:\s*$/m.test(source)) {
    errors.push(issue("TRIGGER", "workflow must be manual-only"));
  }
  for (const trigger of [
    "push",
    "pull_request",
    "pull_request_target",
    "schedule",
    "release",
  ]) {
    if (new RegExp(`^  ${trigger}:`, "m").test(source)) {
      errors.push(issue("TRIGGER", `workflow must not run on ${trigger}`));
    }
  }
  if (/continue-on-error:\s*true/.test(source)) {
    errors.push(
      issue("FAIL_OPEN", "acceptance jobs must not continue on error"),
    );
  }
  for (const input of [
    "release_run_id",
    "release_revision",
    "release_version",
    "previous_release_run_id",
    "previous_release_revision",
    "previous_release_version",
  ]) {
    if (
      !new RegExp(
        `^      ${input}:\\s*$[\\s\\S]*?^        required: true$`,
        "m",
      ).test(source)
    ) {
      errors.push(issue("INPUT", `${input} must be required`));
    }
  }
  const actionMatches = [
    ...source.matchAll(/^\s*uses:\s*([^@\s]+)@([^\s#]+).*$/gm),
  ];
  for (const [, action, reference] of actionMatches) {
    const expected = supplyChain.actions[action];
    if (!expected || reference !== expected.sha) {
      errors.push(issue("ACTION", `${action} is absent or not pinned`));
    }
  }
  const checkoutCount = (source.match(/uses: actions\/checkout@/g) ?? [])
    .length;
  const safeCheckoutCount = (source.match(/persist-credentials: false/g) ?? [])
    .length;
  if (checkoutCount !== safeCheckoutCount) {
    errors.push(
      issue("CHECKOUT", "every checkout must disable persisted credentials"),
    );
  }
  const requiredSnippets = [
    "permissions:\n  contents: read\n  actions: read",
    "Require the exact release tag and revision",
    'test "$GITHUB_SHA" = "$RELEASE_REVISION"',
    'test "$GITHUB_REF" = "refs/tags/v$RELEASE_VERSION"',
    "ref: ${{ inputs.release_revision }}",
    "run-id: ${{ inputs.release_run_id }}",
    "run-id: ${{ inputs.previous_release_run_id }}",
    "github-token: ${{ secrets.GITHUB_TOKEN }}",
    "Authenticate artifacts before executing release code",
    "archive signature verification failed",
    "const maxMetadata = 16 * 1024 * 1024",
    "sameFile(before, opened)",
    "const checksumContents = readStable(checksum)",
    "archive checksum changed during signature verification",
    "release archive changed while inspecting it",
    '["-tvzf", archive]',
    "release archive contains a link or special file",
    "Buffer.allocUnsafe(1024 * 1024)",
    "signed artifact does not bind the requested source revision",
    '["-xOzf", archive, bundle + "/release-manifest.json"]',
    'part === "." || part === ".."',
    "https://github.com/Buerber/trainingloadai/.github/workflows/selfhost-images.yml@refs/tags/v",
    "prepare-acceptance-release.mjs",
    "run-acceptance.mjs",
    "if: ${{ always() }}",
    "selfhost-acceptance-${{ matrix.id }}",
    "retention-days: 90",
    "fail-fast: false",
    "finalize-acceptance:",
    "needs: acceptance",
    "id-token: write",
    "pattern: selfhost-acceptance-*",
    "merge-multiple: false",
    "finalize-acceptance.mjs",
    "acceptance-checksums.bundle.json",
    "cosign sign-blob --yes",
    "cosign verify-blob --bundle",
    "https://github.com/${GITHUB_WORKFLOW_REF}",
    "selfhost-acceptance-gate-${{ inputs.release_revision }}",
  ];
  for (const snippet of requiredSnippets) {
    if (!source.includes(snippet))
      errors.push(issue("WORKFLOW", `missing ${snippet}`));
  }
  const authentication = source.indexOf(
    "- name: Authenticate artifacts before executing release code",
  );
  const authenticatedCheckout = source.indexOf(
    "- name: Check out the authenticated release revision",
  );
  const currentDownload = source.indexOf(
    "- name: Download the exact current signed release",
  );
  if (
    currentDownload < 0 ||
    authentication <= currentDownload ||
    authenticatedCheckout <= authentication
  ) {
    errors.push(
      issue(
        "TRUST_ORDER",
        "signed artifacts must be downloaded and authenticated before release checkout",
      ),
    );
  }
  const authenticationSource = source.slice(
    authentication,
    authenticatedCheckout,
  );
  const bootstrapSource = authenticationSource
    .match(/run: >-\n\s+node -e '\n([\s\S]*?)\n\s+'\s*$/)?.[1]
    ?.replace(/^ {10}/gm, "");
  if (!bootstrapSource) {
    errors.push(
      issue("BOOTSTRAP", "pre-checkout authentication bootstrap is missing"),
    );
  } else {
    try {
      new Script(bootstrapSource, {
        filename: "selfhost-acceptance-bootstrap.cjs",
      });
    } catch {
      errors.push(
        issue(
          "BOOTSTRAP",
          "pre-checkout authentication bootstrap has invalid JavaScript",
        ),
      );
    }
  }
  if (
    authenticationSource.includes('["-xzf"') ||
    authenticationSource.includes("fs.mkdirSync(trusted)")
  ) {
    errors.push(
      issue(
        "TRUST_ORDER",
        "pre-checkout authentication must not extract the release archive",
      ),
    );
  }
  const finalize = source.indexOf(
    "- name: Finalize the complete fail-closed matrix",
  );
  const sign = source.indexOf(
    "- name: Sign the aggregate acceptance checksums",
  );
  const verify = source.indexOf(
    "- name: Verify the aggregate acceptance signature",
  );
  const uploadGate = source.indexOf(
    "- name: Upload the signed aggregate acceptance gate",
  );
  if (
    finalize < 0 ||
    sign <= finalize ||
    verify <= sign ||
    uploadGate <= verify
  ) {
    errors.push(
      issue(
        "GATE_ORDER",
        "matrix evidence must be finalized, signed, verified, then uploaded",
      ),
    );
  }
  for (const platform of contract.platforms) {
    for (const mode of contract.modes) {
      if (!source.includes(`id: ${platform.id}-${mode}`)) {
        errors.push(issue("MATRIX", `missing ${platform.id}/${mode}`));
      }
    }
    for (const label of platform.runner) {
      if (!source.includes(`"${label}"`)) {
        errors.push(
          issue("RUNNER", `${platform.id} is missing runner label ${label}`),
        );
      }
    }
  }
  if (source.includes("exit 77") || /\bSKIP\b/.test(source)) {
    errors.push(
      issue("SKIP", "acceptance workflow must not silently skip a gate"),
    );
  }
  return errors;
}

export function validateAcceptanceRunner(source, contract) {
  const errors = [];
  for (const scenario of contract.scenarios) {
    const marker = new RegExp(`scenario\\(\\s*["']${scenario.id}["']`);
    if (!marker.test(source)) {
      errors.push(
        issue("RUNNER_SCENARIO", `runner does not execute ${scenario.id}`),
      );
    }
  }
  for (const required of [
    "outerSignatureVerified !== true",
    "innerSignatureVerified !== true",
    'runInstaller(current.root, ["--dry-run"])',
    '"/api/proxy/activities/upload"',
    "/api/proxy/api/runtime/capabilities",
    "convert/byId",
    "/layer",
    "createAcceptanceGpx",
    "assertCoreUserJourney",
    "SELF_HOST_BACKUP_DISK_SPACE_INSUFFICIENT",
    '"network", "disconnect"',
    '"chmod 0500 /state/uploads"',
    '"diagnostics"',
    "validateDiagnosticsBundle",
    "isCatalogedSelfHostError",
    "SELF_HOST_DOCTOR_DATABASE_FAILED",
    "SELF_HOST_DOCTOR_PROVIDER_UNREACHABLE",
    "SELF_HOST_DOCTOR_FAILED",
    "assertPassingAcceptanceReport(report)",
    "assertAcceptanceResourceBaseline",
    "source-controller upgrade compatibility dry-run",
    "target-controller upgrade dry-run",
    "minimumFreeDiskBytes",
    "isolateComposeEnvironment",
    '"owner-bootstrap"',
    "owner bootstrap dry-run",
    "runInstallerAfterDryRun",
    "validRuntimeVersion",
    "isSupportedComposeVersion",
    "isExpectedDockerOperatingSystem",
    "scanDiagnosticsText",
    "evidenceSecretValues",
    "readAcceptanceJson",
    "MAX_ACCEPTANCE_DIAGNOSTICS_BYTES",
    "copyRegularTreeBounded",
    "publishRegularFileExclusive",
    "replaceRegularFileAtomically",
    "acceptanceCleanupFailure",
    "acceptance failed and its failure report could not be persisted",
    "acceptance cleanup failed",
  ]) {
    if (!source.includes(required)) {
      errors.push(issue("RUNNER_CONTROL", `runner is missing ${required}`));
    }
  }
  const ownerBootstrapArgumentsIndex = source.search(
    /const\s+ownerBootstrapArguments\s*=\s*\[\s*["']owner-bootstrap["']/,
  );
  const ownerBootstrapDryRunIndex = source.search(
    /runManagement\(\s*instance\.root\s*,\s*\[\s*\.\.\.ownerBootstrapArguments\s*,\s*["']--dry-run["']\s*\]\s*\)/,
  );
  const ownerBootstrapActualIndex = source.search(
    /runManagement\(\s*instance\.root\s*,\s*ownerBootstrapArguments\s*,\s*\{\s*input:/,
  );
  if (
    ownerBootstrapArgumentsIndex < 0 ||
    ownerBootstrapDryRunIndex <= ownerBootstrapArgumentsIndex ||
    ownerBootstrapActualIndex <= ownerBootstrapDryRunIndex
  ) {
    errors.push(
      issue(
        "RUNNER_CONTROL",
        "owner bootstrap must execute the same-argument dry-run before stdin mutation",
      ),
    );
  }
  const installerMutationHelper =
    /function\s+runInstallerAfterDryRun\(\s*root\s*,\s*args\s*,\s*label\s*\)\s*\{[\s\S]*?runInstaller\(\s*root\s*,\s*\[\s*\.\.\.args\s*,\s*["']--dry-run["']\s*\]\s*\)[\s\S]*?planned\.status\s*!==\s*["']planned["'][\s\S]*?planned\.dryRun\s*!==\s*true[\s\S]*?runInstaller\(\s*root\s*,\s*args\s*\)[\s\S]*?\}/;
  for (const [label, call] of [
    [
      "fresh install",
      /runInstallerAfterDryRun\(\s*instance\.root\s*,\s*\[\s*["']--no-start["']\s*\]\s*,\s*["']installer["']\s*,?\s*\)/,
    ],
    [
      "restore install",
      /runInstallerAfterDryRun\(\s*restored\.root\s*,\s*\[\s*["']--no-start["']\s*\]\s*,\s*["']restore installer["']\s*,?\s*\)/,
    ],
  ]) {
    if (!installerMutationHelper.test(source) || !call.test(source)) {
      errors.push(
        issue(
          "RUNNER_CONTROL",
          `${label} must execute a verified same-argument dry-run before mutation`,
        ),
      );
    }
  }
  if (
    !/["']stop["']\s*,\s*["']--timeout["']\s*,\s*["']30["']\s*,\s*["']postgres["']/.test(
      source,
    )
  ) {
    errors.push(
      issue(
        "RUNNER_CONTROL",
        "runner is missing the bounded database stop control",
      ),
    );
  }
  if (
    source.includes('"--volumes"') ||
    /\bdown\s+-v\b/.test(source) ||
    source.includes("exit 77") ||
    /\bSKIP\b/.test(source)
  ) {
    errors.push(
      issue("RUNNER_DESTRUCTIVE", "runner skips a gate or deletes volumes"),
    );
  }
  if (
    source.includes('INSERT INTO "t_activity"') ||
    source.includes("/data/uploads/acceptance/")
  ) {
    errors.push(
      issue(
        "FIXTURE_BYPASS",
        "core user journey must not be replaced with SQL or direct file writes",
      ),
    );
  }
  if (source.includes("fs.cp(") || source.includes("fs.cpSync(")) {
    errors.push(
      issue(
        "RUNNER_COPY",
        "release copies must use the bounded regular-tree snapshot primitive",
      ),
    );
  }
  if (
    source.includes("writeReport(evidenceDirectory, report).catch") ||
    source.includes("tileFixture?.stop().catch")
  ) {
    errors.push(
      issue(
        "RUNNER_CLEANUP",
        "runner must preserve report and fixture cleanup failures",
      ),
    );
  }
  const recoveryHelper = source.match(
    /export async function withRequiredAcceptanceRecovery\([\s\S]*?\n}\n\nfunction readPreparation/,
  )?.[0];
  const recoveryCalls =
    source.match(/(?:await|return) withRequiredAcceptanceRecovery\(/g) ?? [];
  const portRecovery = source.match(
    /async function reservePorts\([\s\S]*?\n}\n\nasync function startTileFixture/,
  )?.[0];
  const permissionRecovery = source.match(
    /async function injectPermissionFailure\([\s\S]*?\n}\n\nfunction networkReconnectArguments/,
  )?.[0];
  const networkRecovery = source.match(
    /async function disconnectNetwork\([\s\S]*?\n}\n\nasync function stopDatabaseAndRecover/,
  )?.[0];
  const databaseRecovery = source.match(
    /async function stopDatabaseAndRecover\([\s\S]*?\n}\n\nasync function writeReport/,
  )?.[0];
  if (
    !recoveryHelper?.includes("[operationError, recoveryError]") ||
    !recoveryHelper.includes("if (operationError) throw operationError") ||
    recoveryCalls.length !== 4 ||
    !portRecovery?.includes("Promise.allSettled(") ||
    !portRecovery.includes("new AggregateError(") ||
    !permissionRecovery?.includes("acceptanceCleanupFailure(") ||
    !networkRecovery?.includes("acceptanceCleanupFailure(") ||
    !databaseRecovery?.includes('runManagement(instance.root, ["start"]') ||
    portRecovery.includes("finally") ||
    permissionRecovery.includes("finally") ||
    networkRecovery.includes("finally") ||
    databaseRecovery.includes("finally")
  ) {
    errors.push(
      issue(
        "RUNNER_RECOVERY",
        "fault injection must preserve primary errors and fail closed when required recovery fails",
      ),
    );
  }
  return errors;
}

export function validateAcceptanceReleasePreparer(source) {
  const archiveDigestReads =
    source.match(/sha256File\(snapshotArchivePath\)/g)?.length ?? 0;
  if (
    archiveDigestReads < 4 ||
    !source.includes("release archive changed while inspecting it") ||
    !source.includes("release archive changed during extraction")
  ) {
    return [
      issue(
        "RELEASE_ARCHIVE_BINDING",
        "release preparation must rehash the authenticated archive after inspection and extraction",
      ),
    ];
  }
  return [];
}

export async function validateAcceptanceRepository() {
  const [workflow, runner, preparer] = await Promise.all([
    readFile(resolve(repositoryRoot, acceptanceContract.workflow), "utf8"),
    readFile(
      resolve(repositoryRoot, "scripts/selfhost/run-acceptance.mjs"),
      "utf8",
    ),
    readFile(
      resolve(
        repositoryRoot,
        "scripts/selfhost/prepare-acceptance-release.mjs",
      ),
      "utf8",
    ),
  ]);
  return [
    ...validateAcceptanceContract(acceptanceContract),
    ...validateAcceptanceWorkflow(
      workflow,
      acceptanceContract,
      supplyChainContract,
    ),
    ...validateAcceptanceRunner(runner, acceptanceContract),
    ...validateAcceptanceReleasePreparer(preparer),
  ];
}

async function main() {
  const errors = await validateAcceptanceRepository();
  if (errors.length) {
    for (const error of errors)
      process.stderr.write(`${error.code}: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `self-host acceptance workflow: PASS (${acceptanceContract.platforms.length} platforms, ${acceptanceContract.modes.length} modes, ${acceptanceContract.scenarios.length} scenarios)\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
