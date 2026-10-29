import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  createAcceptanceReport,
  scenariosForMode,
  SELF_HOST_ACCEPTANCE_CONTRACT,
} from "./acceptance-core.mjs";
import {
  expectedCells,
  finalizeAcceptanceEvidence,
  parseFinalizationArguments,
} from "./finalize-acceptance.mjs";

const current = {
  releaseVersion: "1.1.14",
  sourceRevision: "a".repeat(40),
  archiveSha256: "b".repeat(64),
};
const previous = {
  releaseVersion: "1.1.13",
  sourceRevision: "c".repeat(40),
  archiveSha256: "d".repeat(64),
};

function argumentsFor(input, output) {
  return [
    "--input-directory",
    input,
    "--output-directory",
    output,
    "--run-id",
    "12345-1",
    "--workflow-revision",
    current.sourceRevision,
    "--workflow-ref",
    "trainingload-ai/trainingloadai/.github/workflows/selfhost-acceptance.yml@refs/tags/v1.1.14",
    "--current-version",
    current.releaseVersion,
    "--current-revision",
    current.sourceRevision,
    "--previous-version",
    previous.releaseVersion,
    "--previous-revision",
    previous.sourceRevision,
  ];
}

async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), "acceptance-finalizer-test-"));
  const input = resolve(root, "input");
  const output = resolve(root, "output");
  await fs.mkdir(input);
  for (const cell of expectedCells()) {
    const report = createAcceptanceReport({
      runId: `12345-1-${cell.id}`,
      platform: cell.platform,
      mode: cell.mode,
      current,
      previous,
    });
    report.scenarios = scenariosForMode(cell.mode).map((scenario) => ({
      id: scenario.id,
      priority: scenario.priority,
      status: "pass",
      durationMs: 1,
      details: structuredClone(
        SELF_HOST_ACCEPTANCE_CONTRACT.scenarioEvidence[scenario.id] ?? {},
      ),
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
    details("fresh-install").releaseVersion = current.releaseVersion;
    details("restart-persistence").migrationCount = 1;
    details("recreate-persistence").migrationCount = 1;
    details("database-unavailable-recovery").diagnosticsSha256 = "e".repeat(64);
    details("signed-upgrade").sourceVersion = previous.releaseVersion;
    details("signed-upgrade").targetVersion = current.releaseVersion;
    details("declared-application-rollback").targetVersion =
      previous.releaseVersion;
    details("resource-baseline").healthLatencyP95Ms =
      report.measurements.healthLatencyMs.p95;
    if (cell.mode === "connected") {
      details("provider-timeout-degrades").probeDurationMs =
        SELF_HOST_ACCEPTANCE_CONTRACT.thresholds.providerTimeoutMinimumMs;
    }
    report.security = Object.entries(
      SELF_HOST_ACCEPTANCE_CONTRACT.security.runtimeEvidence,
    ).map(([id, details]) => ({
      id,
      status: "pass",
      details: structuredClone(details),
    }));
    report.status = "passed";
    const directory = resolve(input, `selfhost-acceptance-${cell.id}`);
    await fs.mkdir(directory);
    await fs.writeFile(
      resolve(directory, "acceptance-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    await fs.writeFile(
      resolve(directory, "environment.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          platformId: cell.platform.id,
          hostPlatform: cell.platform.nodePlatform,
          hostArchitecture:
            cell.platform.architecture === "amd64" ? "x64" : "arm64",
          dockerVersion: "29.0.0",
          composeVersion: "v2.40.0",
          dockerArchitecture: cell.platform.architecture,
          dockerOsType: "linux",
          dockerOperatingSystem: ["darwin", "win32"].includes(
            cell.platform.nodePlatform,
          )
            ? "Docker Desktop"
            : "Acceptance fixture Docker",
          availableBytes: String(32 * 1024 ** 3),
        },
        null,
        2,
      )}\n`,
    );
  }
  return {
    root,
    input,
    output,
    options: parseFinalizationArguments(argumentsFor(input, output)),
  };
}

test("finalizes exactly one passing report per contracted matrix cell", async (t) => {
  const item = await fixture();
  t.after(() => fs.rm(item.root, { recursive: true, force: true }));
  const manifest = await finalizeAcceptanceEvidence(item.options);
  assert.equal(manifest.status, "passed");
  assert.equal(manifest.summary.requiredCells, 8);
  assert.equal(manifest.summary.passedCells, 8);
  assert.equal(manifest.cells.length, 8);
  assert.equal(
    manifest.summary.scenarioExecutions,
    expectedCells().reduce(
      (sum, cell) => sum + scenariosForMode(cell.mode).length,
      0,
    ),
  );
  const checksums = await fs.readFile(
    resolve(item.output, "acceptance-checksums.txt"),
    "utf8",
  );
  assert.match(checksums, /acceptance-manifest\.json/);
  assert.match(checksums, /reports\/windows-11-wsl2-connected\.json/);
  assert.match(checksums, /environments\/windows-11-wsl2-connected\.json/);
  assert.match(checksums, /contracts\/acceptance-contract\.json/);
});

test("publishes the exact report bytes that passed validation", async (t) => {
  const item = await fixture();
  t.after(() => fs.rm(item.root, { recursive: true, force: true }));
  const target = resolve(
    item.input,
    "selfhost-acceptance-ubuntu-amd64-core-local",
    "acceptance-report.json",
  );
  let replaced = false;
  const readEvidenceFile = async (path) => {
    const contents = await fs.readFile(path);
    if (path === target && !replaced) {
      replaced = true;
      await fs.writeFile(path, '{"status":"mutated-after-read"}\n');
    }
    return contents;
  };

  await finalizeAcceptanceEvidence(item.options, { readEvidenceFile });

  assert.equal(replaced, true);
  const published = JSON.parse(
    await fs.readFile(
      resolve(item.output, "reports/ubuntu-amd64-core-local.json"),
      "utf8",
    ),
  );
  assert.equal(published.status, "passed");
});

test("keeps the final acceptance path invisible until atomic publication", async (t) => {
  const item = await fixture();
  t.after(() => fs.rm(item.root, { recursive: true, force: true }));
  let observedRead = false;
  const readEvidenceFile = async (path) => {
    observedRead = true;
    await assert.rejects(fs.lstat(item.output), /ENOENT/);
    return fs.readFile(path);
  };

  await finalizeAcceptanceEvidence(item.options, { readEvidenceFile });

  assert.equal(observedRead, true);
  assert.equal((await fs.lstat(item.output)).isDirectory(), true);
  assert.deepEqual(
    (await fs.readdir(item.root)).filter((name) => name.includes(".partial-")),
    [],
  );
});

test("does not overwrite or remove an output created before publication", async (t) => {
  const item = await fixture();
  t.after(() => fs.rm(item.root, { recursive: true, force: true }));
  let created = false;
  const readEvidenceFile = async (path) => {
    if (!created) {
      created = true;
      await fs.mkdir(item.output);
      await fs.writeFile(resolve(item.output, "owner.txt"), "external\n");
    }
    return fs.readFile(path);
  };

  await assert.rejects(
    finalizeAcceptanceEvidence(item.options, { readEvidenceFile }),
    /acceptance output already exists/,
  );

  assert.equal(
    await fs.readFile(resolve(item.output, "owner.txt"), "utf8"),
    "external\n",
  );
  assert.deepEqual(
    (await fs.readdir(item.root)).filter((name) => name.includes(".partial-")),
    [],
  );
});

test("fails closed when a matrix report is missing and removes partial output", async (t) => {
  const item = await fixture();
  t.after(() => fs.rm(item.root, { recursive: true, force: true }));
  await fs.rm(
    resolve(
      item.input,
      "selfhost-acceptance-macos-apple-silicon-connected",
      "acceptance-report.json",
    ),
  );
  await assert.rejects(
    finalizeAcceptanceEvidence(item.options),
    /ENOENT|evidence file/,
  );
  await assert.rejects(fs.lstat(item.output), /ENOENT/);
  assert.deepEqual(
    (await fs.readdir(item.root)).filter((name) => name.includes(".partial-")),
    [],
  );
});

test("rejects a passing-looking report with weakened binding or evidence", async (t) => {
  const item = await fixture();
  t.after(() => fs.rm(item.root, { recursive: true, force: true }));
  const path = resolve(
    item.input,
    "selfhost-acceptance-ubuntu-amd64-core-local",
    "acceptance-report.json",
  );
  const report = JSON.parse(await fs.readFile(path, "utf8"));
  report.releases.current.revision = "e".repeat(40);
  await fs.writeFile(path, `${JSON.stringify(report)}\n`);
  await assert.rejects(
    finalizeAcceptanceEvidence(item.options),
    /current release identity is inconsistent/,
  );

  const evidenceItem = await fixture();
  t.after(() => fs.rm(evidenceItem.root, { recursive: true, force: true }));
  const evidencePath = resolve(
    evidenceItem.input,
    "selfhost-acceptance-ubuntu-amd64-core-local",
    "acceptance-report.json",
  );
  const weakened = JSON.parse(await fs.readFile(evidencePath, "utf8"));
  weakened.scenarios.find(
    ({ id }) => id === "owner-bootstrap-and-sign-in",
  ).details.sameArgumentDryRun = false;
  await fs.writeFile(evidencePath, `${JSON.stringify(weakened)}\n`);
  await assert.rejects(
    finalizeAcceptanceEvidence(evidenceItem.options),
    /scenario evidence mismatch: owner-bootstrap-and-sign-in\.sameArgumentDryRun/,
  );

  const secretItem = await fixture();
  t.after(() => fs.rm(secretItem.root, { recursive: true, force: true }));
  const secretPath = resolve(
    secretItem.input,
    "selfhost-acceptance-ubuntu-amd64-core-local",
    "acceptance-report.json",
  );
  const leaked = JSON.parse(await fs.readFile(secretPath, "utf8"));
  leaked.scenarios[0].details.debugIdentity = "owner@example.test";
  await fs.writeFile(secretPath, `${JSON.stringify(leaked)}\n`);
  await assert.rejects(
    finalizeAcceptanceEvidence(secretItem.options),
    /report failed secret scan: email-address/,
  );
});

test("rejects matrix evidence produced by the wrong Docker architecture", async (t) => {
  const item = await fixture();
  t.after(() => fs.rm(item.root, { recursive: true, force: true }));
  const path = resolve(
    item.input,
    "selfhost-acceptance-linux-arm64-core-local",
    "environment.json",
  );
  const environment = JSON.parse(await fs.readFile(path, "utf8"));
  environment.dockerArchitecture = "amd64";
  await fs.writeFile(path, `${JSON.stringify(environment)}\n`);
  await assert.rejects(
    finalizeAcceptanceEvidence(item.options),
    /environment does not match the contracted runner/,
  );

  const versionItem = await fixture();
  t.after(() => fs.rm(versionItem.root, { recursive: true, force: true }));
  const versionPath = resolve(
    versionItem.input,
    "selfhost-acceptance-ubuntu-amd64-core-local",
    "environment.json",
  );
  const versionEnvironment = JSON.parse(await fs.readFile(versionPath, "utf8"));
  versionEnvironment.composeVersion = "1.29.2";
  await fs.writeFile(versionPath, `${JSON.stringify(versionEnvironment)}\n`);
  await assert.rejects(
    finalizeAcceptanceEvidence(versionItem.options),
    /environment does not match the contracted runner/,
  );

  const desktopItem = await fixture();
  t.after(() => fs.rm(desktopItem.root, { recursive: true, force: true }));
  const desktopPath = resolve(
    desktopItem.input,
    "selfhost-acceptance-macos-apple-silicon-core-local",
    "environment.json",
  );
  const desktopEnvironment = JSON.parse(await fs.readFile(desktopPath, "utf8"));
  desktopEnvironment.dockerOperatingSystem = "Generic Linux VM";
  await fs.writeFile(desktopPath, `${JSON.stringify(desktopEnvironment)}\n`);
  await assert.rejects(
    finalizeAcceptanceEvidence(desktopItem.options),
    /environment does not match the contracted runner/,
  );
});

test("requires the acceptance workflow to run from the exact release tag", () => {
  const args = argumentsFor("/input", "/output");
  args[args.indexOf("--workflow-ref") + 1] =
    "trainingload-ai/trainingloadai/.github/workflows/selfhost-acceptance.yml@refs/heads/main";
  assert.throws(
    () => parseFinalizationArguments(args),
    /exact current release tag/,
  );
});
