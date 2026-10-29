import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import acceptanceContract from "../../docker/selfhost/acceptance-contract.json" with { type: "json" };
import supplyChainContract from "../../docker/selfhost/supply-chain-contract.json" with { type: "json" };
import {
  validateAcceptanceContract,
  validateAcceptanceReleasePreparer,
  validateAcceptanceRepository,
  validateAcceptanceRunner,
  validateAcceptanceWorkflow,
} from "./verify-acceptance-workflow.mjs";
import { repositoryRoot } from "./verify-image-contract.mjs";

const source = await readFile(
  resolve(repositoryRoot, acceptanceContract.workflow),
  "utf8",
);

test("repository acceptance matrix is complete and fail-closed", async () => {
  assert.deepEqual(validateAcceptanceContract(acceptanceContract), []);
  assert.deepEqual(await validateAcceptanceRepository(), []);
});

test("acceptance runner executes every declared scenario without deleting volumes", async () => {
  const runner = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/run-acceptance.mjs"),
    "utf8",
  );
  assert.deepEqual(validateAcceptanceRunner(runner, acceptanceContract), []);
  assert.equal(runner.includes('"--volumes"'), false);
});

test("acceptance runner controls are insensitive to formatter line breaks", async () => {
  const runner = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/run-acceptance.mjs"),
    "utf8",
  );
  const compactDatabaseStop = runner.replace(
    /["']stop["']\s*,\s*["']--timeout["']\s*,\s*["']30["']\s*,\s*["']postgres["']/,
    '"stop", "--timeout", "30", "postgres"',
  );
  assert.deepEqual(
    validateAcceptanceRunner(compactDatabaseStop, acceptanceContract),
    [],
  );

  const missingDatabaseStop = compactDatabaseStop.replace(
    '"stop", "--timeout", "30", "postgres"',
    '"stop", "postgres"',
  );
  assert.ok(
    validateAcceptanceRunner(missingDatabaseStop, acceptanceContract).some(
      ({ code }) => code === "RUNNER_CONTROL",
    ),
  );

  const bypassedJourney = `${runner}\nINSERT INTO "t_activity" VALUES (...);\n`;
  assert.ok(
    validateAcceptanceRunner(bypassedJourney, acceptanceContract).some(
      ({ code }) => code === "FIXTURE_BYPASS",
    ),
  );

  const bypassedUpload = `${runner}\nwriteFileSync("/data/uploads/acceptance/activity.gpx", data);\n`;
  assert.ok(
    validateAcceptanceRunner(bypassedUpload, acceptanceContract).some(
      ({ code }) => code === "FIXTURE_BYPASS",
    ),
  );

  const missingOwnerBootstrapDryRun = runner.replace(
    /\[\s*\.\.\.ownerBootstrapArguments\s*,\s*["']--dry-run["']\s*\]/,
    "ownerBootstrapArguments",
  );
  assert.ok(
    validateAcceptanceRunner(
      missingOwnerBootstrapDryRun,
      acceptanceContract,
    ).some(({ code }) => code === "RUNNER_CONTROL"),
  );

  const ownerBootstrapDryRunCall = runner.match(
    /runManagement\(\s*instance\.root\s*,\s*\[\s*\.\.\.ownerBootstrapArguments\s*,\s*["']--dry-run["']\s*\]\s*\)/,
  )?.[0];
  const ownerBootstrapActualCall = runner.match(
    /runManagement\(\s*instance\.root\s*,\s*ownerBootstrapArguments\s*,\s*\{\s*input:[\s\S]*?\}\s*\)/,
  )?.[0];
  assert.ok(ownerBootstrapDryRunCall);
  assert.ok(ownerBootstrapActualCall);
  const reorderedOwnerBootstrap = runner
    .replace(ownerBootstrapDryRunCall, "OWNER_BOOTSTRAP_DRY_RUN_PLACEHOLDER")
    .replace(ownerBootstrapActualCall, ownerBootstrapDryRunCall)
    .replace("OWNER_BOOTSTRAP_DRY_RUN_PLACEHOLDER", ownerBootstrapActualCall);
  assert.ok(
    validateAcceptanceRunner(reorderedOwnerBootstrap, acceptanceContract).some(
      ({ code }) => code === "RUNNER_CONTROL",
    ),
  );

  for (const weakened of [
    runner.replace(
      'runInstallerAfterDryRun(instance.root, ["--no-start"], "installer")',
      'runInstallerAfterDryRun(instance.root, [], "installer")',
    ),
    runner.replace(
      /runInstallerAfterDryRun\(\s*restored\.root,\s*\["--no-start"\],\s*"restore installer",\s*\)/,
      'runInstallerAfterDryRun(restored.root, [], "restore installer")',
    ),
    runner.replace(
      'runInstaller(root, [...args, "--dry-run"])',
      'runInstaller(root, ["--dry-run"])',
    ),
  ]) {
    assert.ok(
      validateAcceptanceRunner(weakened, acceptanceContract).some(
        ({ code }) => code === "RUNNER_CONTROL",
      ),
    );
  }

  const unboundedReleaseCopy = runner.replace(
    "copyRegularTreeBounded(source, destination, {",
    "fs.cp(source, destination, {",
  );
  assert.ok(
    validateAcceptanceRunner(unboundedReleaseCopy, acceptanceContract).some(
      ({ code }) => code === "RUNNER_COPY",
    ),
  );
});

test("rejects weakened scenario coverage or required evidence", () => {
  const weakened = structuredClone(acceptanceContract);
  const journey = weakened.scenarios.find(
    ({ id }) => id === "core-user-journey",
  );
  journey.priority = "P2";
  journey.modes = ["connected"];
  assert.ok(
    validateAcceptanceContract(weakened).some(
      ({ code, message }) =>
        code === "SCENARIO" && message.includes("core-user-journey"),
    ),
  );

  const weakenedEvidence = structuredClone(acceptanceContract);
  weakenedEvidence.scenarioEvidence[
    "owner-bootstrap-and-sign-in"
  ].sameArgumentDryRun = false;
  assert.ok(
    validateAcceptanceContract(weakenedEvidence).some(
      ({ code, message }) =>
        code === "SCENARIO_EVIDENCE" &&
        message.includes("owner-bootstrap-and-sign-in"),
    ),
  );

  const weakenedSecurity = structuredClone(acceptanceContract);
  delete weakenedSecurity.security.runtimeEvidence["runtime-cap-drop-all"];
  assert.ok(
    validateAcceptanceContract(weakenedSecurity).some(
      ({ code }) => code === "SECURITY",
    ),
  );
});

test("requires cataloged doctor and verified diagnostics fault evidence", async () => {
  const runner = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/run-acceptance.mjs"),
    "utf8",
  );
  for (const marker of [
    '"diagnostics"',
    "validateDiagnosticsBundle",
    "isCatalogedSelfHostError",
    "SELF_HOST_DOCTOR_DATABASE_FAILED",
  ]) {
    const weakened = runner.replaceAll(marker, "removed-diagnostics-marker");
    assert.ok(
      validateAcceptanceRunner(weakened, acceptanceContract).some(
        ({ code }) => code === "RUNNER_CONTROL",
      ),
      marker,
    );
  }
});

test("requires atomic acceptance evidence publication", async () => {
  const runner = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/run-acceptance.mjs"),
    "utf8",
  );
  const weakened = runner
    .replaceAll("publishRegularFileExclusive", "writeFile")
    .replaceAll("replaceRegularFileAtomically", "writeFile");
  assert.ok(
    validateAcceptanceRunner(weakened, acceptanceContract).some(
      ({ code }) => code === "RUNNER_CONTROL",
    ),
  );
});

test("requires fail-closed acceptance finalization", async () => {
  const runner = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/run-acceptance.mjs"),
    "utf8",
  );
  for (const marker of [
    "acceptanceCleanupFailure",
    "acceptance failed and its failure report could not be persisted",
    "acceptance cleanup failed",
  ]) {
    const weakened = runner.replaceAll(marker, "ignored-finalization-failure");
    assert.ok(
      validateAcceptanceRunner(weakened, acceptanceContract).some(
        ({ code }) => code === "RUNNER_CONTROL",
      ),
      marker,
    );
  }
  for (const weakened of [
    runner.replace(
      "await writeReport(evidenceDirectory, report);",
      "await writeReport(evidenceDirectory, report).catch(() => undefined);",
    ),
    runner.replace(
      "await tileFixture?.stop();",
      "await tileFixture?.stop().catch(() => undefined);",
    ),
  ]) {
    assert.ok(
      validateAcceptanceRunner(weakened, acceptanceContract).some(
        ({ code }) => code === "RUNNER_CLEANUP",
      ),
    );
  }
});

test("requires fail-closed fault injection recovery", async () => {
  const runner = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/run-acceptance.mjs"),
    "utf8",
  );
  for (const weakened of [
    runner.replace("[operationError, recoveryError]", "[recoveryError]"),
    runner.replace(
      "await withRequiredAcceptanceRecovery(",
      "await Promise.resolve(",
    ),
    runner.replace(
      'runManagement(instance.root, ["start"]),\n        "database recovery start",',
      'runManagement(instance.root, ["status"]),\n        "database recovery start",',
    ),
    runner.replace("Promise.allSettled(", "Promise.all("),
  ]) {
    assert.ok(
      validateAcceptanceRunner(weakened, acceptanceContract).some(
        ({ code }) => code === "RUNNER_RECOVERY",
      ),
    );
  }
});

test("requires archive identity checks around release extraction", async () => {
  const preparer = await readFile(
    resolve(repositoryRoot, "scripts/selfhost/prepare-acceptance-release.mjs"),
    "utf8",
  );
  assert.deepEqual(validateAcceptanceReleasePreparer(preparer), []);
  const weakened = preparer.replace(
    'throw new Error("release archive changed during extraction");',
    "// extraction digest mismatch ignored",
  );
  assert.ok(
    validateAcceptanceReleasePreparer(weakened).some(
      ({ code }) => code === "RELEASE_ARCHIVE_BINDING",
    ),
  );
});

test("rejects automatic execution and a skipped platform-mode cell", () => {
  const invalid = source
    .replace("  workflow_dispatch:", "  push:\n  workflow_dispatch:")
    .replace("id: linux-arm64-connected", "id: removed-connected-cell");
  const errors = validateAcceptanceWorkflow(
    invalid,
    acceptanceContract,
    supplyChainContract,
  );
  assert.ok(errors.some(({ code }) => code === "TRIGGER"));
  assert.ok(errors.some(({ code }) => code === "MATRIX"));
});

test("rejects fail-open acceptance and mutable actions", () => {
  const invalid = source
    .replace(
      "fail-fast: false",
      "fail-fast: false\n      continue-on-error: true",
    )
    .replace(supplyChainContract.actions["actions/checkout"].sha, "main");
  const errors = validateAcceptanceWorkflow(
    invalid,
    acceptanceContract,
    supplyChainContract,
  );
  assert.ok(errors.some(({ code }) => code === "FAIL_OPEN"));
  assert.ok(errors.some(({ code }) => code === "ACTION"));
});

test("rejects release checkout before trusted artifact authentication", () => {
  const invalid = source
    .replace(
      "- name: Check out the authenticated release revision",
      "- name: Check out the authenticated release revision\n        # moved before trust establishment",
    )
    .replace(
      "- name: Authenticate artifacts before executing release code",
      "- name: Authenticate artifacts after executing release code",
    );
  const errors = validateAcceptanceWorkflow(
    invalid,
    acceptanceContract,
    supplyChainContract,
  );
  assert.ok(errors.some(({ code }) => code === "TRUST_ORDER"));
});

test("rejects filesystem extraction before release checkout", () => {
  const invalid = source.replace(
    '["-xOzf", archive, bundle + "/release-manifest.json"]',
    '["-xzf", archive]',
  );
  const errors = validateAcceptanceWorkflow(
    invalid,
    acceptanceContract,
    supplyChainContract,
  );
  assert.ok(errors.some(({ code }) => code === "TRUST_ORDER"));
});

test("rejects mutable or invalid pre-checkout authentication", () => {
  const mutable = source
    .replace(
      "const checksumContents = readStable(checksum);",
      "const checksumContents = fs.readFileSync(checksum);",
    )
    .replace(
      "release archive changed while inspecting it",
      "release archive accepted without a final digest",
    );
  assert.ok(
    validateAcceptanceWorkflow(
      mutable,
      acceptanceContract,
      supplyChainContract,
    ).some(({ code }) => code === "WORKFLOW"),
  );

  const invalid = source.replace("const semver =", "const semver ==");
  assert.ok(
    validateAcceptanceWorkflow(
      invalid,
      acceptanceContract,
      supplyChainContract,
    ).some(({ code }) => code === "BOOTSTRAP"),
  );
});

test("rejects an unsigned or reordered aggregate matrix gate", () => {
  const invalid = source
    .replace("cosign sign-blob --yes", "cosign version")
    .replace(
      "- name: Verify the aggregate acceptance signature",
      "- name: Check aggregate acceptance signature",
    );
  const errors = validateAcceptanceWorkflow(
    invalid,
    acceptanceContract,
    supplyChainContract,
  );
  assert.ok(errors.some(({ code }) => code === "WORKFLOW"));
  assert.ok(errors.some(({ code }) => code === "GATE_ORDER"));
});
