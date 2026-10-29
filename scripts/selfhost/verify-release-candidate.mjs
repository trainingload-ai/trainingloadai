#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import candidateSchema from "../../schemas/self-host-release-candidate-manifest.schema.json" with { type: "json" };
import {
  readRegularFileBounded,
  rethrowAfterPathCleanup,
  sha256File,
} from "./backup-artifact.mjs";
import {
  copyRegularTree,
  defaultVerifyBlob,
  expectedWorkflowIdentity,
  expectedWorkflowRef,
  verifyAcceptanceGate,
  verifyChecksumInventory,
} from "./finalize-release-candidate.mjs";
import { prepareAcceptanceRelease } from "./prepare-acceptance-release.mjs";
import { readReleaseAttestation } from "./release-attestation.mjs";
import candidateContract from "../../docker/selfhost/release-candidate-contract.json" with { type: "json" };

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const REVISION = /^[a-f0-9]{40}$/;

function invariant(condition, message) {
  if (!condition) throw new Error(`release candidate invalid: ${message}`);
}

function addFormats(ajv) {
  ajv.addFormat("date-time", {
    type: "string",
    validate: (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)),
  });
  return ajv;
}

const validateCandidate = addFormats(
  new Ajv2020({ strict: false, allErrors: true }),
).compile(candidateSchema);

async function readJson(path) {
  let contents;
  try {
    contents = (
      await readRegularFileBounded(path, {
        maximumBytes: candidateContract.limits.maximumMetadataFileBytes,
        minimumBytes: 1,
        label: "release candidate metadata",
      })
    ).contents;
  } catch {
    invariant(false, `unsafe metadata file: ${path}`);
  }
  try {
    return JSON.parse(contents.toString("utf8"));
  } catch {
    throw new Error(`release candidate invalid: malformed JSON: ${path}`);
  }
}

async function requireBoundedRegularFile(path) {
  const stat = await fs.lstat(path);
  invariant(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.size > 0 &&
      stat.size <= candidateContract.limits.maximumMetadataFileBytes,
    `unsafe signature input: ${path}`,
  );
}

function exactPathInventory(entries, expected, label) {
  const paths = entries.map(({ path }) => path);
  invariant(
    new Set(paths).size === paths.length,
    `${label} paths are duplicated`,
  );
  invariant(
    JSON.stringify([...paths].sort()) === JSON.stringify([...expected].sort()),
    `${label} inventory differs from the contract`,
  );
}

async function verifyManifestFiles(root, entries, prefix) {
  for (const entry of entries) {
    invariant(
      entry.path.startsWith(`${prefix}/`) &&
        (await sha256File(resolve(root, ...entry.path.split("/")))) ===
          entry.sha256,
      `${entry.path} hash differs`,
    );
  }
}

export function parseReleaseCandidateVerificationArguments(argv) {
  const options = {
    candidateDirectory: null,
    releaseVersion: null,
    releaseRevision: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    const key = {
      "--candidate-directory": "candidateDirectory",
      "--release-version": "releaseVersion",
      "--release-revision": "releaseRevision",
    }[argument];
    const value = argv[index + 1];
    if (!key || !value || value.startsWith("--") || options[key] !== null) {
      throw new Error(
        `invalid release candidate verification argument: ${argument}`,
      );
    }
    options[key] = value;
    index += 1;
  }
  invariant(options.candidateDirectory, "--candidate-directory is required");
  invariant(VERSION.test(options.releaseVersion ?? ""), "version is invalid");
  invariant(
    REVISION.test(options.releaseRevision ?? ""),
    "revision is invalid",
  );
  return options;
}

async function verifyReleaseCandidateSnapshot(
  options,
  dependencies,
  root,
  work,
) {
  const verifyBlob = dependencies.verifyBlob ?? defaultVerifyBlob;
  const prepareRelease =
    dependencies.prepareRelease ?? prepareAcceptanceRelease;
  const verifyAcceptance =
    dependencies.verifyAcceptance ?? verifyAcceptanceGate;
  const readAttestation =
    dependencies.readAttestation ?? readReleaseAttestation;
  const now = dependencies.now?.() ?? new Date();
  const checksumsPath = resolve(root, candidateContract.artifact.checksums);
  const signaturePath = resolve(
    root,
    candidateContract.artifact.signatureBundle,
  );

  await Promise.all([
    requireBoundedRegularFile(checksumsPath),
    requireBoundedRegularFile(signaturePath),
  ]);
  const signedChecksumsContents = (
    await readRegularFileBounded(checksumsPath, {
      maximumBytes: candidateContract.limits.maximumMetadataFileBytes,
      minimumBytes: 1,
      label: "release candidate signed checksum payload",
    })
  ).contents;
  await Promise.resolve(
    verifyBlob({
      bundlePath: signaturePath,
      identity: expectedWorkflowIdentity(
        candidateContract.workflow,
        options.releaseVersion,
      ),
      payloadPath: checksumsPath,
    }),
  );
  await verifyChecksumInventory(root, {
    checksumsName: candidateContract.artifact.checksums,
    signatureName: candidateContract.artifact.signatureBundle,
    maximumBytes: candidateContract.limits.maximumCandidateBytes,
    expectedChecksumsContents: signedChecksumsContents,
  });

  const manifestPath = resolve(root, candidateContract.artifact.manifest);
  const manifest = await readJson(manifestPath);
  invariant(
    validateCandidate(manifest),
    `manifest schema validation failed: ${JSON.stringify(validateCandidate.errors)}`,
  );
  invariant(
    manifest.release.version === options.releaseVersion &&
      manifest.release.revision === options.releaseRevision &&
      manifest.workflow.revision === options.releaseRevision &&
      manifest.workflow.ref ===
        expectedWorkflowRef(candidateContract.workflow, options.releaseVersion),
    "manifest identity differs from the requested release",
  );
  const releaseArchive = `release/trainingload-selfhost-${options.releaseVersion}.tar.gz`;
  invariant(
    manifest.release.archive === releaseArchive &&
      manifest.release.checksum === `${releaseArchive}.sha256` &&
      manifest.release.signatureBundle ===
        `${releaseArchive}.sha256.bundle.json`,
    "release artifact paths differ from the exact version",
  );

  exactPathInventory(
    manifest.documents,
    candidateContract.requiredDocuments.map(
      (path) => `documents/${basename(path)}`,
    ),
    "document",
  );
  exactPathInventory(
    manifest.contracts,
    candidateContract.requiredContracts.map(
      (path) => `contracts/${basename(path)}`,
    ),
    "contract",
  );
  await Promise.all([
    verifyManifestFiles(root, manifest.documents, "documents"),
    verifyManifestFiles(root, manifest.contracts, "contracts"),
  ]);

  const prepared = await prepareRelease({
    artifactDirectory: resolve(
      root,
      candidateContract.artifact.releaseDirectory,
    ),
    outputDirectory: resolve(work, "release"),
    version: options.releaseVersion,
    revision: options.releaseRevision,
  });
  invariant(
    prepared.outerSignatureVerified === true &&
      prepared.innerSignatureVerified === true &&
      prepared.archiveSha256 === manifest.release.archiveSha256,
    "nested release signatures or archive digest differ",
  );
  for (const [path, expectedSha256] of [
    [manifest.release.releaseManifest, manifest.release.releaseManifestSha256],
    [manifest.release.bundleManifest, manifest.release.bundleManifestSha256],
  ]) {
    invariant(
      (await sha256File(resolve(root, ...path.split("/")))) === expectedSha256,
      `${path} hash differs`,
    );
  }
  invariant(
    (await sha256File(
      resolve(prepared.releaseRoot, "release-manifest.json"),
    )) === manifest.release.releaseManifestSha256 &&
      (await sha256File(
        resolve(prepared.releaseRoot, "bundle-manifest.json"),
      )) === manifest.release.bundleManifestSha256,
    "copied release metadata differs from the verified archive",
  );
  const [releaseManifest, bundleManifest] = await Promise.all([
    readJson(resolve(root, ...manifest.release.releaseManifest.split("/"))),
    readJson(resolve(root, ...manifest.release.bundleManifest.split("/"))),
  ]);
  const compatibility = manifest.compatibility;
  invariant(
    compatibility.configSchemaVersion === releaseManifest.configSchemaVersion &&
      compatibility.composeSchemaVersion ===
        releaseManifest.composeSchemaVersion &&
      compatibility.releaseBundleSchemaVersion ===
        bundleManifest.schemaVersion &&
      compatibility.databaseSchemaEpoch ===
        releaseManifest.database?.schemaEpoch &&
      compatibility.migrationHead === releaseManifest.database?.migrationHead &&
      compatibility.compatibilityWindowMinorVersions ===
        releaseManifest.database?.compatibilityWindowMinorVersions &&
      compatibility.databaseRollback ===
        releaseManifest.database?.databaseRollback &&
      JSON.stringify(compatibility.supportedSourceVersions) ===
        JSON.stringify(releaseManifest.upgrade?.supportedSourceVersions) &&
      JSON.stringify(compatibility.applicationRollbackTo) ===
        JSON.stringify(releaseManifest.upgrade?.applicationRollbackTo),
    "candidate compatibility differs from the verified release manifest",
  );

  const acceptance = await verifyAcceptance(
    resolve(root, candidateContract.artifact.acceptanceDirectory),
    {
      releaseVersion: options.releaseVersion,
      releaseRevision: options.releaseRevision,
      acceptanceRunId: manifest.acceptance.workflowRunId,
      acceptanceRunAttempt: manifest.acceptance.workflowRunAttempt,
    },
    dependencies,
  );
  invariant(
    acceptance.signatureVerified === true &&
      acceptance.manifestSha256 === manifest.acceptance.manifestSha256 &&
      acceptance.manifest.releases.current.archiveSha256 ===
        manifest.release.archiveSha256 &&
      acceptance.manifest.summary.requiredCells ===
        manifest.acceptance.requiredCells &&
      acceptance.manifest.summary.passedCells ===
        manifest.acceptance.passedCells &&
      acceptance.manifest.summary.scenarioExecutions ===
        manifest.acceptance.scenarioExecutions &&
      acceptance.manifest.summary.securityChecks ===
        manifest.acceptance.securityChecks,
    "nested acceptance evidence differs from the candidate manifest",
  );

  const attestationPath = resolve(
    root,
    ...manifest.attestations.source.path.split("/"),
  );
  invariant(
    (await sha256File(attestationPath)) === manifest.attestations.source.sha256,
    "release attestation hash differs",
  );
  const attestation = await readAttestation(attestationPath, {
    releaseVersion: options.releaseVersion,
    releaseRevision: options.releaseRevision,
    releaseArchiveSha256: manifest.release.archiveSha256,
    now,
  });
  invariant(
    attestation.codexCleanRoom.evidenceSha256 ===
      manifest.attestations.codexCleanRoom.evidenceSha256 &&
      attestation.codexCleanRoom.reference ===
        manifest.attestations.codexCleanRoom.reference &&
      attestation.codexCleanRoom.platform ===
        manifest.attestations.codexCleanRoom.platform &&
      attestation.codexCleanRoom.architecture ===
        manifest.attestations.codexCleanRoom.architecture &&
      attestation.codexCleanRoom.dockerVersion ===
        manifest.attestations.codexCleanRoom.dockerVersion &&
      attestation.codexCleanRoom.composeVersion ===
        manifest.attestations.codexCleanRoom.composeVersion &&
      attestation.codexCleanRoom.dockerOperatingSystem ===
        manifest.attestations.codexCleanRoom.dockerOperatingSystem &&
      attestation.issueReview.evidenceSha256 ===
        manifest.attestations.issueReview.evidenceSha256 &&
      attestation.issueReview.reference ===
        manifest.attestations.issueReview.reference &&
      attestation.codexCleanRoom.hostRestartPassed === true &&
      attestation.codexCleanRoom.postRestartDataVerified === true &&
      attestation.issueReview.unresolvedP0 === 0 &&
      attestation.issueReview.unresolvedP1 === 0 &&
      attestation.issueReview.releaseBlockers === 0,
    "release attestation summary differs from the candidate manifest",
  );

  return {
    schemaVersion: 1,
    kind: "trainingload-selfhost-release-candidate-verification",
    status: "passed",
    candidateId: manifest.candidateId,
    releaseVersion: manifest.release.version,
    releaseRevision: manifest.release.revision,
    archiveSha256: manifest.release.archiveSha256,
    matrixCells: manifest.acceptance.passedCells,
    hostRestartVerified: true,
    unresolvedP0: 0,
    unresolvedP1: 0,
    releaseBlockers: 0,
  };
}

export async function verifyReleaseCandidate(options, dependencies = {}) {
  const source = resolve(options.candidateDirectory);
  const work = await fs.mkdtemp(resolve(tmpdir(), "selfhost-rc-verify-"));
  let result;
  let operationError = null;
  try {
    const snapshot = resolve(work, "candidate");
    await copyRegularTree(
      source,
      snapshot,
      candidateContract.limits.maximumCandidateBytes,
    );
    result = await verifyReleaseCandidateSnapshot(
      options,
      dependencies,
      snapshot,
      work,
    );
  } catch (error) {
    operationError = error;
  }
  await rethrowAfterPathCleanup(operationError, [
    {
      path: work,
      options: { recursive: true, force: true },
    },
  ]);
  return result;
}

async function main() {
  try {
    const options = parseReleaseCandidateVerificationArguments(
      process.argv.slice(2),
    );
    const result = await verifyReleaseCandidate(options);
    process.stdout.write(
      `${JSON.stringify(result, null, options.json ? 2 : 0)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        schemaVersion: 1,
        kind: "trainingload-selfhost-release-candidate-verification",
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
