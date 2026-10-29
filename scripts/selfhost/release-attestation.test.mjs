import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  parseReleaseAttestationPreparationArguments,
  prepareReleaseAttestationSubmission,
  validateReleaseAttestation,
} from "./release-attestation.mjs";

const VERSION = "1.1.13";
const REVISION = "a".repeat(40);
const ARCHIVE = "b".repeat(64);

function fixture(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "trainingload-selfhost-release-attestation",
    generatedAt: "2026-10-18T00:00:00.000Z",
    release: {
      version: VERSION,
      revision: REVISION,
      archiveSha256: ARCHIVE,
    },
    codexCleanRoom: {
      status: "passed",
      reference: "codex://threads/clean-room-result",
      evidenceSha256: "c".repeat(64),
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
        "https://github.com/Buerber/trainingloadai/issues/123#release-review",
      evidenceSha256: "d".repeat(64),
      knownLimitationsReviewed: true,
      unresolvedP0: 0,
      unresolvedP1: 0,
      releaseBlockers: 0,
    },
    ...overrides,
  };
}

const expected = {
  releaseVersion: VERSION,
  releaseRevision: REVISION,
  releaseArchiveSha256: ARCHIVE,
  now: new Date("2026-10-18T01:00:00.000Z"),
};

test("accepts a release-bound clean-room and issue attestation", () => {
  const value = fixture();
  assert.equal(validateReleaseAttestation(value, expected), value);
});

test("rejects a missing host restart or unresolved release issue", () => {
  const noRestart = fixture();
  noRestart.codexCleanRoom.hostRestartPassed = false;
  assert.throws(
    () => validateReleaseAttestation(noRestart, expected),
    /schema validation failed/,
  );

  const unresolved = fixture();
  unresolved.issueReview.releaseBlockers = 1;
  assert.throws(
    () => validateReleaseAttestation(unresolved, expected),
    /schema validation failed/,
  );
});

test("rejects stale, mismatched, or impossible platform evidence", () => {
  assert.throws(
    () =>
      validateReleaseAttestation(fixture(), {
        ...expected,
        releaseArchiveSha256: "e".repeat(64),
      }),
    /release identity differs/,
  );
  assert.throws(
    () =>
      validateReleaseAttestation(fixture(), {
        ...expected,
        now: new Date("2026-12-18T00:00:00.000Z"),
      }),
    /older than 30 days/,
  );
  const impossible = fixture();
  impossible.codexCleanRoom.architecture = "arm64";
  assert.throws(
    () => validateReleaseAttestation(impossible, expected),
    /platform and architecture differ/,
  );

  const composeV1 = fixture();
  composeV1.codexCleanRoom.composeVersion = "1.29.2";
  assert.throws(
    () => validateReleaseAttestation(composeV1, expected),
    /Docker or Compose version is unsupported/,
  );

  const wrongDesktopRuntime = fixture();
  wrongDesktopRuntime.codexCleanRoom.platform = "macos-apple-silicon";
  wrongDesktopRuntime.codexCleanRoom.architecture = "arm64";
  assert.throws(
    () => validateReleaseAttestation(wrongDesktopRuntime, expected),
    /Docker operating system differs from the platform runtime/,
  );
});

test("rejects evidence references with embedded credentials, queries, or secret material", () => {
  const credentials = fixture();
  credentials.issueReview.reference =
    "https://operator:password@example.com/release-review";
  assert.throws(
    () => validateReleaseAttestation(credentials, expected),
    /schema validation failed|must not contain credentials/,
  );

  const query = fixture();
  query.issueReview.reference =
    "https://example.com/release-review?token=highly-sensitive-token";
  assert.throws(
    () => validateReleaseAttestation(query, expected),
    /schema validation failed|must not contain credentials/,
  );

  const token = fixture();
  token.codexCleanRoom.dockerVersion =
    "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
  assert.throws(
    () => validateReleaseAttestation(token, expected),
    /possible secret: github-token/,
  );
});

test("prepares a schema-valid canonical GitHub workflow submission", async (t) => {
  const root = await fs.mkdtemp(resolve(tmpdir(), "selfhost-attestation-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const path = resolve(root, "release-attestation.json");
  const value = fixture();
  await fs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  const result = await prepareReleaseAttestationSubmission(
    {
      attestationFile: path,
      releaseVersion: VERSION,
      releaseRevision: REVISION,
      releaseArchiveSha256: ARCHIVE,
    },
    { now: expected.now },
  );
  assert.equal(result.status, "passed");
  assert.deepEqual(
    JSON.parse(Buffer.from(result.releaseAttestationBase64, "base64")),
    value,
  );
});

test("parses only an exact release-bound attestation preparation command", () => {
  assert.deepEqual(
    parseReleaseAttestationPreparationArguments([
      "--attestation-file",
      "/tmp/release-attestation.json",
      "--release-version",
      VERSION,
      "--release-revision",
      REVISION,
      "--release-archive-sha256",
      ARCHIVE,
      "--json",
    ]),
    {
      attestationFile: "/tmp/release-attestation.json",
      releaseVersion: VERSION,
      releaseRevision: REVISION,
      releaseArchiveSha256: ARCHIVE,
      json: true,
    },
  );
  assert.throws(
    () =>
      parseReleaseAttestationPreparationArguments([
        "--attestation-file",
        "/tmp/release-attestation.json",
        "--release-version",
        VERSION,
        "--release-revision",
        REVISION,
        "--release-archive-sha256",
        "latest",
      ]),
    /archive SHA-256 is invalid/,
  );
});

test("the attestation preparation CLI emits a canonical machine submission", async (t) => {
  const root = await fs.mkdtemp(resolve(tmpdir(), "selfhost-attestation-cli-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const path = resolve(root, "release-attestation.json");
  const value = fixture({ generatedAt: new Date().toISOString() });
  await fs.writeFile(path, `${JSON.stringify(value)}\n`);
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./release-attestation.mjs", import.meta.url)),
      "--attestation-file",
      path,
      "--release-version",
      VERSION,
      "--release-revision",
      REVISION,
      "--release-archive-sha256",
      ARCHIVE,
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const submission = JSON.parse(result.stdout);
  assert.equal(submission.status, "passed");
  assert.deepEqual(
    JSON.parse(Buffer.from(submission.releaseAttestationBase64, "base64")),
    value,
  );
});
