import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import candidateContract from "../../docker/selfhost/release-candidate-contract.json" with { type: "json" };
import v1Contract from "../../docker/selfhost/v1-contract.json" with { type: "json" };
import {
  createAcceptanceReport,
  scenariosForMode,
  SELF_HOST_ACCEPTANCE_CONTRACT,
} from "./acceptance-core.mjs";
import { sha256File } from "./backup-artifact.mjs";
import { createChecksums } from "./create-checksums.mjs";
import {
  expectedCells,
  finalizeAcceptanceEvidence,
  parseFinalizationArguments,
} from "./finalize-acceptance.mjs";
import {
  finalizeReleaseCandidate,
  parseReleaseCandidateArguments,
  verifyAcceptanceGate,
  verifyChecksumInventory,
} from "./finalize-release-candidate.mjs";
import {
  parseReleaseCandidateVerificationArguments,
  verifyReleaseCandidate,
} from "./verify-release-candidate.mjs";
import { repositoryRoot } from "./verify-image-contract.mjs";

const VERSION = "1.1.13";
const REVISION = "a".repeat(40);
const SHA = "b".repeat(64);

function options(root) {
  return {
    releaseArtifactDirectory: resolve(root, "release-artifact"),
    acceptanceDirectory: resolve(root, "acceptance"),
    outputDirectory: resolve(root, "candidate"),
    candidateId: "rc.1",
    workflowRunId: "300",
    workflowRevision: REVISION,
    workflowRef: `trainingload-ai/trainingloadai/${candidateContract.workflow}@refs/tags/v${VERSION}`,
    releaseRunId: "100",
    releaseVersion: VERSION,
    releaseRevision: REVISION,
    acceptanceRunId: "200",
    acceptanceRunAttempt: 1,
    attestationFile: resolve(root, "release-attestation.json"),
  };
}

async function makeFixture() {
  const root = await fs.mkdtemp(resolve(tmpdir(), "selfhost-rc-test-"));
  const opts = options(root);
  const releaseRoot = resolve(
    root,
    `prepared/trainingload-selfhost-${VERSION}`,
  );
  await fs.mkdir(opts.releaseArtifactDirectory, { recursive: true });
  await fs.mkdir(opts.acceptanceDirectory, { recursive: true });
  await fs.mkdir(releaseRoot, { recursive: true });
  const archiveName = `trainingload-selfhost-${VERSION}.tar.gz`;
  const archivePath = resolve(opts.releaseArtifactDirectory, archiveName);
  await fs.writeFile(archivePath, "synthetic signed archive\n");
  const archiveSha256 = await sha256File(archivePath);
  await fs.writeFile(
    `${archivePath}.sha256`,
    `${archiveSha256}  ${archiveName}\n`,
  );
  await fs.writeFile(`${archivePath}.sha256.bundle.json`, "{}\n");
  const outerArtifactSha256 = {
    archive: archiveSha256,
    checksum: await sha256File(`${archivePath}.sha256`),
    signatureBundle: await sha256File(`${archivePath}.sha256.bundle.json`),
  };
  await fs.writeFile(
    opts.attestationFile,
    `${JSON.stringify({
      schemaVersion: 1,
      kind: "trainingload-selfhost-release-attestation",
      generatedAt: "2026-10-18T00:00:00.000Z",
      release: {
        version: VERSION,
        revision: REVISION,
        archiveSha256,
      },
      codexCleanRoom: {
        status: "passed",
        reference: "codex://threads/clean-room-result",
        evidenceSha256: SHA,
        platform: "ubuntu-amd64",
        architecture: "amd64",
        dockerVersion: "29.0.0",
        composeVersion: "v2.40.0",
        dockerOperatingSystem: "Ubuntu 24.04",
        agent: "codex",
        contractSource: "signed-release-bundle-only",
        cleanTarget: true,
        installerDryRunPassed: true,
        installationCompleted: true,
        deploymentReady: true,
        ownerBootstrapPerformedByOperator: true,
        coreUserJourneyPassed: true,
        containerRecreatePassed: true,
        hostRestartPassed: true,
        postRestartDataVerified: true,
        diagnosticsReviewed: true,
        secretScan: "pass",
      },
      issueReview: {
        status: "passed",
        reference:
          "https://github.com/trainingload-ai/trainingloadai/issues/123#release-review",
        evidenceSha256: "c".repeat(64),
        knownLimitationsReviewed: true,
        unresolvedP0: 0,
        unresolvedP1: 0,
        releaseBlockers: 0,
      },
    })}\n`,
  );

  const releaseManifest = {
    releaseVersion: VERSION,
    source: { revision: REVISION },
    configSchemaVersion: 1,
    composeSchemaVersion: 1,
    upgrade: { supportedSourceVersions: [], applicationRollbackTo: [] },
    database: {
      schemaEpoch: 1,
      migrationHead: "20261017090000_self_host_owner_bootstrap",
      compatibilityWindowMinorVersions: 2,
      databaseRollback: "unsupported",
    },
  };
  const bundleManifest = { schemaVersion: 1, releaseVersion: VERSION };
  await fs.writeFile(
    resolve(releaseRoot, "release-manifest.json"),
    `${JSON.stringify(releaseManifest)}\n`,
  );
  await fs.writeFile(
    resolve(releaseRoot, "bundle-manifest.json"),
    `${JSON.stringify(bundleManifest)}\n`,
  );
  await fs.writeFile(resolve(releaseRoot, "checksums.txt"), "synthetic\n");
  await fs.writeFile(resolve(releaseRoot, "checksums.bundle.json"), "{}\n");
  for (const path of [
    ...candidateContract.requiredDocuments,
    ...candidateContract.requiredContracts,
  ]) {
    const destination = resolve(releaseRoot, ...path.split("/"));
    await fs.mkdir(resolve(destination, ".."), { recursive: true });
    await fs.copyFile(resolve(repositoryRoot, ...path.split("/")), destination);
  }

  const acceptanceManifestPath = resolve(
    opts.acceptanceDirectory,
    "acceptance-manifest.json",
  );
  await fs.writeFile(acceptanceManifestPath, '{"synthetic":true}\n');
  await createChecksums(opts.acceptanceDirectory, "acceptance-checksums.txt");
  await fs.writeFile(
    resolve(opts.acceptanceDirectory, "acceptance-checksums.bundle.json"),
    "{}\n",
  );
  const acceptanceManifestSha256 = await sha256File(acceptanceManifestPath);
  const signedArtifactSha256 = {
    checksums: await sha256File(
      resolve(opts.acceptanceDirectory, "acceptance-checksums.txt"),
    ),
    signatureBundle: await sha256File(
      resolve(opts.acceptanceDirectory, "acceptance-checksums.bundle.json"),
    ),
  };
  const acceptance = {
    signatureVerified: true,
    manifestSha256: acceptanceManifestSha256,
    signedArtifactSha256,
    manifest: {
      releases: { current: { archiveSha256 } },
      summary: {
        requiredCells: 8,
        passedCells: 8,
        scenarioExecutions: 118,
        securityChecks: 56,
      },
    },
  };
  const dependencies = {
    now: () => new Date("2026-10-18T01:00:00.000Z"),
    verifyV1: async () => v1Contract,
    prepareRelease: async () => ({
      archiveSha256,
      outerArtifactSha256,
      outerSignatureVerified: true,
      innerSignatureVerified: true,
      releaseRoot,
    }),
    verifyAcceptance: async () => acceptance,
  };
  return { root, opts, releaseRoot, archiveSha256, acceptance, dependencies };
}

async function makeRealAcceptanceGate() {
  const root = await fs.mkdtemp(resolve(tmpdir(), "selfhost-rc-acceptance-"));
  const input = resolve(root, "input");
  const output = resolve(root, "output");
  await fs.mkdir(input);
  const current = {
    releaseVersion: VERSION,
    sourceRevision: REVISION,
    archiveSha256: "e".repeat(64),
  };
  const previous = {
    releaseVersion: "1.1.12",
    sourceRevision: "f".repeat(40),
    archiveSha256: "1".repeat(64),
  };
  for (const cell of expectedCells()) {
    const report = createAcceptanceReport({
      runId: `200-1-${cell.id}`,
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
    details("database-unavailable-recovery").diagnosticsSha256 = "2".repeat(64);
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
      `${JSON.stringify(report)}\n`,
    );
    await fs.writeFile(
      resolve(directory, "environment.json"),
      `${JSON.stringify({
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
      })}\n`,
    );
  }
  const args = [
    "--input-directory",
    input,
    "--output-directory",
    output,
    "--run-id",
    "200-1",
    "--workflow-revision",
    REVISION,
    "--workflow-ref",
    `trainingload-ai/trainingloadai/.github/workflows/selfhost-acceptance.yml@refs/tags/v${VERSION}`,
    "--current-version",
    VERSION,
    "--current-revision",
    REVISION,
    "--previous-version",
    previous.releaseVersion,
    "--previous-revision",
    previous.sourceRevision,
  ];
  await finalizeAcceptanceEvidence(parseFinalizationArguments(args));
  await fs.writeFile(
    resolve(output, "acceptance-checksums.bundle.json"),
    "{}\n",
  );
  return { root, output, current };
}

test("parses an exact tagged release candidate invocation", () => {
  const opts = options("/tmp/rc-arguments");
  const flags = {
    releaseArtifactDirectory: "--release-artifact-directory",
    acceptanceDirectory: "--acceptance-directory",
    outputDirectory: "--output-directory",
    candidateId: "--candidate-id",
    workflowRunId: "--workflow-run-id",
    workflowRevision: "--workflow-revision",
    workflowRef: "--workflow-ref",
    releaseRunId: "--release-run-id",
    releaseVersion: "--release-version",
    releaseRevision: "--release-revision",
    acceptanceRunId: "--acceptance-run-id",
    acceptanceRunAttempt: "--acceptance-run-attempt",
    attestationFile: "--attestation-file",
  };
  const argv = Object.entries(flags).flatMap(([key, flag]) => [
    flag,
    String(opts[key]),
  ]);
  const parsed = parseReleaseCandidateArguments(argv);
  assert.equal(parsed.candidateId, "rc.1");
  assert.equal(parsed.acceptanceRunAttempt, 1);
});

test("parses a bounded downloaded candidate verification invocation", () => {
  assert.deepEqual(
    parseReleaseCandidateVerificationArguments([
      "--candidate-directory",
      "/tmp/candidate",
      "--release-version",
      VERSION,
      "--release-revision",
      REVISION,
      "--json",
    ]),
    {
      candidateDirectory: "/tmp/candidate",
      releaseVersion: VERSION,
      releaseRevision: REVISION,
      json: true,
    },
  );
  assert.throws(
    () =>
      parseReleaseCandidateVerificationArguments([
        "--candidate-directory",
        "/tmp/candidate",
        "--release-version",
        "latest",
        "--release-revision",
        REVISION,
      ]),
    /version is invalid/,
  );
});

test("rejects a candidate without a passing structured attestation", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const attestation = JSON.parse(
    await fs.readFile(fixture.opts.attestationFile, "utf8"),
  );
  attestation.codexCleanRoom.hostRestartPassed = false;
  await fs.writeFile(
    fixture.opts.attestationFile,
    `${JSON.stringify(attestation)}\n`,
  );
  await assert.rejects(
    finalizeReleaseCandidate(fixture.opts, fixture.dependencies),
    /release attestation invalid: schema validation failed/,
  );
  await assert.rejects(fs.lstat(fixture.opts.outputDirectory), /ENOENT/);
});

test("assembles a self-contained candidate only after every gate passes", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const result = await finalizeReleaseCandidate(
    fixture.opts,
    fixture.dependencies,
  );
  assert.equal(result.manifest.status, "candidate");
  assert.equal(result.manifest.release.archiveSha256, fixture.archiveSha256);
  assert.equal(result.manifest.acceptance.passedCells, 8);
  assert.equal(
    result.manifest.attestations.codexCleanRoom.hostRestartPassed,
    true,
  );
  assert.equal(result.manifest.summary.unresolvedP0, 0);
  const files = (await fs.readdir(fixture.opts.outputDirectory)).sort();
  assert.deepEqual(files, [
    "acceptance",
    "attestations",
    "contracts",
    "documents",
    "release",
    "release-candidate-checksums.txt",
    "release-candidate-manifest.json",
  ]);
  for (const path of result.manifest.documents) {
    assert.match(path.path, /^documents\//);
    assert.equal(path.sha256.length, 64);
  }
});

test("revalidates the complete downloaded candidate evidence chain", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await finalizeReleaseCandidate(fixture.opts, fixture.dependencies);
  await fs.writeFile(
    resolve(
      fixture.opts.outputDirectory,
      candidateContract.artifact.signatureBundle,
    ),
    "{}\n",
  );
  let verifiedIdentity = null;
  const result = await verifyReleaseCandidate(
    {
      candidateDirectory: fixture.opts.outputDirectory,
      releaseVersion: VERSION,
      releaseRevision: REVISION,
    },
    {
      ...fixture.dependencies,
      verifyBlob: async ({ identity }) => {
        verifiedIdentity = identity;
        await fs.appendFile(
          resolve(
            fixture.opts.outputDirectory,
            "attestations/release-attestation.json",
          ),
          " ",
        );
      },
    },
  );
  assert.equal(result.status, "passed");
  assert.equal(result.matrixCells, 8);
  assert.equal(result.hostRestartVerified, true);
  assert.equal(
    verifiedIdentity,
    `https://github.com/trainingload-ai/trainingloadai/.github/workflows/selfhost-release-candidate.yml@refs/tags/v${VERSION}`,
  );
  assert.match(
    await fs.readFile(
      resolve(
        fixture.opts.outputDirectory,
        "attestations/release-attestation.json",
      ),
      "utf8",
    ),
    / $/,
  );

  await fs.appendFile(
    resolve(
      fixture.opts.outputDirectory,
      "attestations/release-attestation.json",
    ),
    " ",
  );
  await assert.rejects(
    verifyReleaseCandidate(
      {
        candidateDirectory: fixture.opts.outputDirectory,
        releaseVersion: VERSION,
        releaseRevision: REVISION,
      },
      {
        ...fixture.dependencies,
        verifyBlob: () => {},
      },
    ),
    /checksum mismatch/,
  );
});

test("rejects a candidate checksum payload replaced during signature verification", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await finalizeReleaseCandidate(fixture.opts, fixture.dependencies);
  await fs.writeFile(
    resolve(
      fixture.opts.outputDirectory,
      candidateContract.artifact.signatureBundle,
    ),
    "{}\n",
  );
  await assert.rejects(
    verifyReleaseCandidate(
      {
        candidateDirectory: fixture.opts.outputDirectory,
        releaseVersion: VERSION,
        releaseRevision: REVISION,
      },
      {
        ...fixture.dependencies,
        verifyBlob: async ({ bundlePath, payloadPath }) => {
          const snapshotRoot = resolve(payloadPath, "..");
          const attestationPath = resolve(
            snapshotRoot,
            "attestations/release-attestation.json",
          );
          await fs.appendFile(attestationPath, " ");
          const manifestPath = resolve(
            snapshotRoot,
            candidateContract.artifact.manifest,
          );
          const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
          manifest.attestations.source.sha256 =
            await sha256File(attestationPath);
          await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
          await fs.rm(bundlePath);
          await createChecksums(
            snapshotRoot,
            candidateContract.artifact.checksums,
          );
          await fs.writeFile(bundlePath, "{}\n");
        },
      },
    ),
    /checksum payload changed during signature verification/,
  );
});

test("rejects signed candidate metadata that misstates release paths or compatibility", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await finalizeReleaseCandidate(fixture.opts, fixture.dependencies);
  await fs.writeFile(
    resolve(
      fixture.opts.outputDirectory,
      candidateContract.artifact.signatureBundle,
    ),
    "{}\n",
  );
  const manifestPath = resolve(
    fixture.opts.outputDirectory,
    candidateContract.artifact.manifest,
  );
  const original = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const signaturePath = resolve(
    fixture.opts.outputDirectory,
    candidateContract.artifact.signatureBundle,
  );
  const resign = async () => {
    await fs.rm(signaturePath);
    await createChecksums(
      fixture.opts.outputDirectory,
      candidateContract.artifact.checksums,
    );
    await fs.writeFile(signaturePath, "{}\n");
  };
  const verify = () =>
    verifyReleaseCandidate(
      {
        candidateDirectory: fixture.opts.outputDirectory,
        releaseVersion: VERSION,
        releaseRevision: REVISION,
      },
      { ...fixture.dependencies, verifyBlob: () => {} },
    );

  const wrongPath = structuredClone(original);
  wrongPath.release.archive = "release/trainingload-selfhost-9.9.9.tar.gz";
  await fs.writeFile(manifestPath, `${JSON.stringify(wrongPath)}\n`);
  await resign();
  await assert.rejects(verify(), /paths differ from the exact version/);

  const wrongCompatibility = structuredClone(original);
  wrongCompatibility.compatibility.configSchemaVersion += 1;
  await fs.writeFile(manifestPath, `${JSON.stringify(wrongCompatibility)}\n`);
  await resign();
  await assert.rejects(
    verify(),
    /compatibility differs from the verified release manifest/,
  );

  const wrongCleanRoomRuntime = structuredClone(original);
  wrongCleanRoomRuntime.attestations.codexCleanRoom.dockerOperatingSystem =
    "Docker Desktop";
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(wrongCleanRoomRuntime)}\n`,
  );
  await resign();
  await assert.rejects(
    verify(),
    /release attestation summary differs from the candidate manifest/,
  );
});

test("fails closed and removes partial output when acceptance binds another archive", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  fixture.acceptance.manifest.releases.current.archiveSha256 = "d".repeat(64);
  await assert.rejects(
    finalizeReleaseCandidate(fixture.opts, fixture.dependencies),
    /accepted archive/,
  );
  await assert.rejects(fs.lstat(fixture.opts.outputDirectory), /ENOENT/);
});

test("does not replace an empty candidate output created during assembly", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  await assert.rejects(
    finalizeReleaseCandidate(fixture.opts, {
      ...fixture.dependencies,
      verifyV1: async () => {
        await fs.mkdir(fixture.opts.outputDirectory);
        return v1Contract;
      },
    }),
    /output directory already exists/,
  );

  assert.deepEqual(await fs.readdir(fixture.opts.outputDirectory), []);
  assert.deepEqual(
    (await fs.readdir(fixture.root)).filter((name) =>
      name.includes(".partial-"),
    ),
    [],
  );
});

test("rejects release artifacts changed after their verified snapshot", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  const prepareRelease = fixture.dependencies.prepareRelease;
  await assert.rejects(
    finalizeReleaseCandidate(fixture.opts, {
      ...fixture.dependencies,
      prepareRelease: async (...args) => {
        const prepared = await prepareRelease(...args);
        await fs.appendFile(
          resolve(
            fixture.opts.releaseArtifactDirectory,
            `trainingload-selfhost-${VERSION}.tar.gz`,
          ),
          "drift",
        );
        return prepared;
      },
    }),
    /copied release artifacts differ from the verified snapshot/,
  );
  await assert.rejects(fs.lstat(fixture.opts.outputDirectory), /ENOENT/);
});

test("rejects acceptance artifacts changed after their verified snapshot", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await assert.rejects(
    finalizeReleaseCandidate(fixture.opts, {
      ...fixture.dependencies,
      verifyAcceptance: async () => {
        await fs.writeFile(
          resolve(fixture.opts.acceptanceDirectory, "acceptance-manifest.json"),
          '{"synthetic":"drift"}\n',
        );
        const signaturePath = resolve(
          fixture.opts.acceptanceDirectory,
          "acceptance-checksums.bundle.json",
        );
        await fs.rm(signaturePath);
        await createChecksums(
          fixture.opts.acceptanceDirectory,
          "acceptance-checksums.txt",
        );
        await fs.writeFile(signaturePath, "{}\n");
        return fixture.acceptance;
      },
    }),
    /copied acceptance artifacts differ from the verified snapshot/,
  );
  await assert.rejects(fs.lstat(fixture.opts.outputDirectory), /ENOENT/);
});

test("checksum inventory rejects tampering and unlisted files", async (t) => {
  const root = await fs.mkdtemp(resolve(tmpdir(), "selfhost-rc-checksum-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(resolve(root, "evidence.json"), "{}\n");
  await createChecksums(root, "evidence-checksums.txt");
  await fs.writeFile(resolve(root, "evidence-checksums.bundle.json"), "{}\n");
  const verified = await verifyChecksumInventory(root, {
    checksumsName: "evidence-checksums.txt",
    signatureName: "evidence-checksums.bundle.json",
  });
  assert.equal(verified.entries, 1);
  assert.equal(verified.sizeBytes > 0, true);
  await assert.rejects(
    verifyChecksumInventory(root, {
      checksumsName: "evidence-checksums.txt",
      signatureName: "evidence-checksums.bundle.json",
      maximumBytes: 1,
    }),
    /cumulative byte limit/,
  );
  await fs.writeFile(resolve(root, "evidence.json"), '{"tampered":true}\n');
  await assert.rejects(
    verifyChecksumInventory(root, {
      checksumsName: "evidence-checksums.txt",
      signatureName: "evidence-checksums.bundle.json",
    }),
    /checksum mismatch/,
  );
});

test("checksum inventory rejects unrepresented empty directories", async (t) => {
  const root = await fs.mkdtemp(resolve(tmpdir(), "selfhost-rc-empty-dir-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(resolve(root, "evidence.json"), "{}\n");
  await createChecksums(root, "evidence-checksums.txt");
  await fs.writeFile(resolve(root, "evidence-checksums.bundle.json"), "{}\n");
  await fs.mkdir(resolve(root, "unrepresented-empty-directory"));
  await assert.rejects(
    verifyChecksumInventory(root, {
      checksumsName: "evidence-checksums.txt",
      signatureName: "evidence-checksums.bundle.json",
    }),
    /unexpected empty directory/,
  );
});

test("checksum inventory refuses a symlink before hashing", async (t) => {
  if (process.platform === "win32")
    return t.skip("symlink setup is privileged");
  const root = await fs.mkdtemp(resolve(tmpdir(), "selfhost-rc-link-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(resolve(root, "target"), "safe\n");
  await fs.symlink(resolve(root, "target"), resolve(root, "link"));
  await fs.writeFile(
    resolve(root, "evidence-checksums.txt"),
    `${SHA}  target\n`,
  );
  await fs.writeFile(resolve(root, "evidence-checksums.bundle.json"), "{}\n");
  await assert.rejects(
    verifyChecksumInventory(root, {
      checksumsName: "evidence-checksums.txt",
      signatureName: "evidence-checksums.bundle.json",
    }),
    /symbolic link/,
  );
});

test("revalidates every signed aggregate acceptance cell", async (t) => {
  const fixture = await makeRealAcceptanceGate();
  const weakenedFixture = await makeRealAcceptanceGate();
  t.after(async () => {
    await Promise.all(
      [fixture, weakenedFixture].map(({ root }) =>
        fs.rm(root, { recursive: true, force: true }),
      ),
    );
  });
  const opts = options(fixture.root);
  let verifiedIdentity = null;
  const verified = await verifyAcceptanceGate(fixture.output, opts, {
    verifyBlob: async ({ identity }) => {
      verifiedIdentity = identity;
      await fs.appendFile(
        resolve(fixture.output, "reports/ubuntu-amd64-core-local.json"),
        " ",
      );
    },
  });
  assert.equal(verified.manifest.summary.passedCells, 8);
  assert.equal(
    verified.manifest.releases.current.archiveSha256,
    "e".repeat(64),
  );
  assert.equal(
    verifiedIdentity,
    `https://github.com/trainingload-ai/trainingloadai/.github/workflows/selfhost-acceptance.yml@refs/tags/v${VERSION}`,
  );

  await fs.appendFile(
    resolve(fixture.output, "reports/ubuntu-amd64-core-local.json"),
    " ",
  );
  await assert.rejects(
    verifyAcceptanceGate(fixture.output, opts, { verifyBlob: () => {} }),
    /checksum mismatch/,
  );

  const reportPath = resolve(
    weakenedFixture.output,
    "reports/ubuntu-amd64-core-local.json",
  );
  const manifestPath = resolve(
    weakenedFixture.output,
    "acceptance-manifest.json",
  );
  const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  report.scenarios.find(({ id }) => id === "fresh-install").details.ready =
    false;
  await fs.writeFile(reportPath, `${JSON.stringify(report)}\n`);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.cells.find(
    ({ id }) => id === "ubuntu-amd64-core-local",
  ).reportSha256 = await sha256File(reportPath);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await fs.rm(
    resolve(weakenedFixture.output, "acceptance-checksums.bundle.json"),
  );
  await createChecksums(weakenedFixture.output, "acceptance-checksums.txt");
  await fs.writeFile(
    resolve(weakenedFixture.output, "acceptance-checksums.bundle.json"),
    "{}\n",
  );
  await assert.rejects(
    verifyAcceptanceGate(weakenedFixture.output, opts, {
      verifyBlob: () => {},
    }),
    /scenario evidence mismatch: fresh-install.ready/,
  );

  report.scenarios.find(({ id }) => id === "fresh-install").details.ready =
    true;
  await fs.writeFile(reportPath, `${JSON.stringify(report)}\n`);
  const environmentPath = resolve(
    weakenedFixture.output,
    "environments/ubuntu-amd64-core-local.json",
  );
  const environment = JSON.parse(await fs.readFile(environmentPath, "utf8"));
  environment.composeVersion = "1.29.2";
  await fs.writeFile(environmentPath, `${JSON.stringify(environment)}\n`);
  const weakenedCell = manifest.cells.find(
    ({ id }) => id === "ubuntu-amd64-core-local",
  );
  weakenedCell.reportSha256 = await sha256File(reportPath);
  weakenedCell.environmentSha256 = await sha256File(environmentPath);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await fs.rm(
    resolve(weakenedFixture.output, "acceptance-checksums.bundle.json"),
  );
  await createChecksums(weakenedFixture.output, "acceptance-checksums.txt");
  await fs.writeFile(
    resolve(weakenedFixture.output, "acceptance-checksums.bundle.json"),
    "{}\n",
  );
  await assert.rejects(
    verifyAcceptanceGate(weakenedFixture.output, opts, {
      verifyBlob: () => {},
    }),
    /environment does not match the contracted runner/,
  );

  environment.composeVersion = "v2.40.0";
  await fs.writeFile(environmentPath, `${JSON.stringify(environment)}\n`);
  report.scenarios.find(
    ({ id }) => id === "fresh-install",
  ).details.diagnosticNote = "password=downloaded-evidence-secret";
  await fs.writeFile(reportPath, `${JSON.stringify(report)}\n`);
  weakenedCell.reportSha256 = await sha256File(reportPath);
  weakenedCell.environmentSha256 = await sha256File(environmentPath);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await fs.rm(
    resolve(weakenedFixture.output, "acceptance-checksums.bundle.json"),
  );
  await createChecksums(weakenedFixture.output, "acceptance-checksums.txt");
  await fs.writeFile(
    resolve(weakenedFixture.output, "acceptance-checksums.bundle.json"),
    "{}\n",
  );
  await assert.rejects(
    verifyAcceptanceGate(weakenedFixture.output, opts, {
      verifyBlob: () => {},
    }),
    /report failed secret scan: secret-assignment/,
  );
});

test("rejects an acceptance checksum payload replaced during signature verification", async (t) => {
  const fixture = await makeRealAcceptanceGate();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await assert.rejects(
    verifyAcceptanceGate(fixture.output, options(fixture.root), {
      verifyBlob: async ({ bundlePath, payloadPath }) => {
        const snapshotRoot = resolve(payloadPath, "..");
        const reportPath = resolve(
          snapshotRoot,
          "reports/ubuntu-amd64-core-local.json",
        );
        await fs.appendFile(reportPath, " ");
        const manifestPath = resolve(snapshotRoot, "acceptance-manifest.json");
        const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        manifest.cells.find(
          ({ id }) => id === "ubuntu-amd64-core-local",
        ).reportSha256 = await sha256File(reportPath);
        await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
        await fs.rm(bundlePath);
        await createChecksums(snapshotRoot, "acceptance-checksums.txt");
        await fs.writeFile(bundlePath, "{}\n");
      },
    }),
    /checksum payload changed during signature verification/,
  );
});

test("acceptance gate bounds signature inputs before invoking Cosign", async (t) => {
  const fixture = await makeRealAcceptanceGate();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await fs.truncate(
    resolve(fixture.output, "acceptance-checksums.txt"),
    candidateContract.limits.maximumMetadataFileBytes + 1,
  );
  let signatureInvoked = false;
  await assert.rejects(
    verifyAcceptanceGate(fixture.output, options(fixture.root), {
      verifyBlob: () => {
        signatureInvoked = true;
      },
    }),
    /unsafe or oversized file/,
  );
  assert.equal(signatureInvoked, false);
});
