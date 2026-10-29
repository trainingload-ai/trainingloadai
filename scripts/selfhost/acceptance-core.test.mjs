import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  assertAcceptanceEnvironment,
  assertAcceptanceResourceBaseline,
  assertPassingAcceptanceReport,
  createAcceptanceReport,
  isExpectedDockerOperatingSystem,
  latencySummary,
  parseAcceptanceArguments,
  parseDockerByteSize,
  replaceEnvironmentSettings,
  scenariosForMode,
  SELF_HOST_ACCEPTANCE_CONTRACT,
} from "./acceptance-core.mjs";
import { repositoryRoot } from "./verify-image-contract.mjs";

const paths = {
  releaseDirectory: "/release/current",
  releasePreparation: "/release/current.json",
  previousReleaseDirectory: "/release/previous",
  previousReleasePreparation: "/release/previous.json",
  evidenceDirectory: "/evidence",
};

test("parses an exact contracted acceptance target", () => {
  const args = [
    "--run-id",
    "run-1-ubuntu",
    "--platform-id",
    "ubuntu-amd64",
    "--mode",
    "core-local",
    ...Object.entries(paths).flatMap(([key, value]) => [
      `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      value,
    ]),
  ];
  const result = parseAcceptanceArguments(args);
  assert.equal(result.platformId, "ubuntu-amd64");
  assert.equal(result.mode, "core-local");
  assert.equal(result.keepOnFailure, false);
});

test("edits only declared non-secret environment settings", () => {
  const source = "SECRET=keep\nPORT=80\nMODE=old\n";
  assert.equal(
    replaceEnvironmentSettings(source, { PORT: "8080", MODE: "new" }),
    "SECRET=keep\nPORT=8080\nMODE=new\n",
  );
  assert.throws(
    () => replaceEnvironmentSettings(source, { MISSING: "value" }),
    /missing environment settings/,
  );
  assert.equal(
    replaceEnvironmentSettings(
      source,
      { NEW_PORT: "8080" },
      { appendMissing: true },
    ),
    "SECRET=keep\nPORT=80\nMODE=old\nNEW_PORT=8080\n",
  );
});

test("normalizes Docker memory units and deterministic nearest-rank latency", () => {
  assert.equal(parseDockerByteSize("1.5MiB"), 1572864);
  assert.equal(parseDockerByteSize("2 GB"), 2_000_000_000);
  assert.deepEqual(latencySummary([5, 1, 3, 2, 4]), {
    samples: 5,
    p50: 3,
    p95: 5,
    max: 5,
  });
  assert.equal(isExpectedDockerOperatingSystem("Ubuntu 24.04", "linux"), true);
  assert.equal(
    isExpectedDockerOperatingSystem("Docker Desktop", "darwin"),
    true,
  );
  assert.equal(
    isExpectedDockerOperatingSystem("Windows Server", "win32"),
    false,
  );
  const platform = SELF_HOST_ACCEPTANCE_CONTRACT.platforms[0];
  const environment = {
    platformId: platform.id,
    hostPlatform: platform.nodePlatform,
    hostArchitecture: "x64",
    dockerVersion: "29.0.0",
    composeVersion: "v2.40.0",
    dockerArchitecture: platform.architecture,
    dockerOsType: "linux",
    dockerOperatingSystem: "Ubuntu 24.04",
    availableBytes: String(platform.minimumFreeDiskBytes),
  };
  assert.equal(assertAcceptanceEnvironment(environment, platform), environment);
  assert.throws(
    () =>
      assertAcceptanceEnvironment(
        { ...environment, availableBytes: "9".repeat(21) },
        platform,
      ),
    /environment does not match the contracted runner/,
  );
});

test("a passing report covers every mode-specific P0/P1 scenario and schema", async () => {
  const platform = SELF_HOST_ACCEPTANCE_CONTRACT.platforms[0];
  const release = {
    releaseVersion: "1.1.13",
    sourceRevision: "a".repeat(40),
    archiveSha256: "b".repeat(64),
  };
  const report = createAcceptanceReport({
    runId: "acceptance-1",
    platform,
    mode: "core-local",
    current: release,
    previous: {
      ...release,
      releaseVersion: "1.1.12",
      sourceRevision: "c".repeat(40),
    },
  });
  const running = structuredClone(report);
  report.scenarios = scenariosForMode(report.mode).map((scenario) => ({
    id: scenario.id,
    priority: scenario.priority,
    status: "pass",
    durationMs: 1,
    details: structuredClone(
      SELF_HOST_ACCEPTANCE_CONTRACT.scenarioEvidence[scenario.id] ?? {},
    ),
  }));
  report.security = Object.entries(
    SELF_HOST_ACCEPTANCE_CONTRACT.security.runtimeEvidence,
  ).map(([id, details]) => ({
    id,
    status: "pass",
    details: structuredClone(details),
  }));
  report.measurements.healthLatencyMs = {
    samples: SELF_HOST_ACCEPTANCE_CONTRACT.thresholds.healthLatencySamples,
    p50: 1,
    p95: 2,
    max: 3,
  };
  report.measurements.memoryBytes = {
    postgres: 1,
    server: 1,
    client: 1,
  };
  report.measurements.diskBytes = {
    afterInstall: 100,
    afterFixtures: 101,
    afterRestore: 101,
  };
  for (const field of [
    "freshInstallMs",
    "restartMs",
    "recreateMs",
    "restoreMs",
    "upgradeMs",
  ]) {
    report.measurements[field] = 1;
  }
  const details = (id) =>
    report.scenarios.find((scenario) => scenario.id === id).details;
  details("fresh-install").releaseVersion = report.releases.current.version;
  details("restart-persistence").migrationCount = 1;
  details("recreate-persistence").migrationCount = 1;
  details("database-unavailable-recovery").diagnosticsSha256 = "d".repeat(64);
  details("signed-upgrade").sourceVersion = report.releases.previous.version;
  details("signed-upgrade").targetVersion = report.releases.current.version;
  details("declared-application-rollback").targetVersion =
    report.releases.previous.version;
  details("resource-baseline").healthLatencyP95Ms =
    report.measurements.healthLatencyMs.p95;
  report.status = "passed";
  assert.equal(assertPassingAcceptanceReport(report), report);
  for (const [scenarioId, field] of [
    ["fresh-install", "installerSameArgumentDryRun"],
    ["owner-bootstrap-and-sign-in", "sameArgumentDryRun"],
    ["backup-clean-restore", "installerSameArgumentDryRun"],
    ["default-security-audit", "checks"],
  ]) {
    const weakened = structuredClone(report);
    weakened.scenarios.find(({ id }) => id === scenarioId).details[field] =
      false;
    assert.throws(
      () => assertPassingAcceptanceReport(weakened),
      new RegExp(`scenario evidence mismatch: ${scenarioId}\\.${field}`),
    );
  }
  const missingSecurity = structuredClone(report);
  missingSecurity.security.pop();
  assert.throws(
    () => assertPassingAcceptanceReport(missingSecurity),
    /required security evidence did not pass/,
  );
  const weakenedSecurity = structuredClone(report);
  weakenedSecurity.security[0].details.services = [];
  assert.throws(
    () => assertPassingAcceptanceReport(weakenedSecurity),
    /security evidence details mismatch/,
  );
  const weakenedJourney = structuredClone(report);
  weakenedJourney.scenarios.find(
    ({ id }) => id === "core-user-journey",
  ).details.routeVisible = false;
  assert.throws(
    () => assertPassingAcceptanceReport(weakenedJourney),
    /scenario evidence mismatch: core-user-journey\.routeVisible/,
  );
  const mismatchedUpgrade = structuredClone(report);
  mismatchedUpgrade.scenarios.find(
    ({ id }) => id === "signed-upgrade",
  ).details.targetVersion = "9.9.9";
  assert.throws(
    () => assertPassingAcceptanceReport(mismatchedUpgrade),
    /upgrade or rollback evidence does not match the releases/,
  );
  const zeroDuration = structuredClone(report);
  zeroDuration.measurements.restoreMs = 0;
  assert.throws(
    () => assertPassingAcceptanceReport(zeroDuration),
    /restoreMs is invalid or exceeds the contract/,
  );
  assert.equal(
    assertAcceptanceResourceBaseline(report.measurements),
    report.measurements,
  );
  const oversized = structuredClone(report.measurements);
  oversized.memoryBytes.server =
    SELF_HOST_ACCEPTANCE_CONTRACT.thresholds.memoryTotalBytes;
  assert.throws(
    () => assertAcceptanceResourceBaseline(oversized),
    /memory exceeds/,
  );

  const schema = JSON.parse(
    await fs.readFile(
      resolve(
        repositoryRoot,
        "schemas/self-host-acceptance-report.schema.json",
      ),
      "utf8",
    ),
  );
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  ajv.addFormat("date-time", {
    type: "string",
    validate: (value) => Number.isFinite(Date.parse(value)),
  });
  const validate = ajv.compile(schema);
  const valid = validate(report);
  assert.equal(valid, true, JSON.stringify(validate.errors));
  assert.equal(validate(running), true, JSON.stringify(validate.errors));

  const failed = structuredClone(report);
  failed.status = "failed";
  failed.scenarios = [];
  failed.security = [];
  failed.failure = { scenario: "preflight", message: "Docker unavailable" };
  assert.equal(validate(failed), true, JSON.stringify(validate.errors));
  failed.failure = null;
  assert.equal(validate(failed), false);
});
