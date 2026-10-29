import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";
import { Script } from "node:vm";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";
import bundleContract from "../../docker/selfhost/release-bundle-contract.json" with { type: "json" };
import candidateContract from "../../docker/selfhost/release-candidate-contract.json" with { type: "json" };
import supplyChainContract from "../../docker/selfhost/supply-chain-contract.json" with { type: "json" };
import v1Contract from "../../docker/selfhost/v1-contract.json" with { type: "json" };
import { repositoryRoot } from "./verify-image-contract.mjs";
import { verifySelfHostV1Contract } from "./verify-v1-contract.mjs";

const EXPECTED_INPUTS = Object.freeze([
  "candidate_id",
  "release_run_id",
  "release_version",
  "release_revision",
  "acceptance_run_id",
  "acceptance_run_attempt",
  "release_attestation_base64",
]);
const CANDIDATE_FINALIZER = "scripts/selfhost/finalize-release-candidate.mjs";

const EXACT_CONTRACT_KEYS = Object.freeze([
  "schemaVersion",
  "kind",
  "workflow",
  "releaseWorkflow",
  "acceptanceWorkflow",
  "attestationPreparer",
  "verifier",
  "manualOnly",
  "nodeVersion",
  "candidatePattern",
  "artifact",
  "requiredDocuments",
  "requiredContracts",
  "gates",
  "limits",
]);

function hasExactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function invariant(condition, message) {
  if (!condition)
    throw new Error(`release candidate workflow invalid: ${message}`);
}

function validateContract(contract) {
  invariant(
    hasExactKeys(contract, EXACT_CONTRACT_KEYS),
    "contract shape changed",
  );
  invariant(
    contract.schemaVersion === 1 &&
      contract.kind === "trainingload-selfhost-release-candidate-contract" &&
      contract.workflow ===
        ".github/workflows/selfhost-release-candidate.yml" &&
      contract.releaseWorkflow === supplyChainContract.workflow &&
      contract.acceptanceWorkflow ===
        ".github/workflows/selfhost-acceptance.yml" &&
      contract.attestationPreparer ===
        "scripts/selfhost/release-attestation.mjs" &&
      contract.verifier === "scripts/selfhost/verify-release-candidate.mjs" &&
      contract.manualOnly === true &&
      contract.nodeVersion === "22.23.3" &&
      contract.candidatePattern === "^rc\\.[1-9][0-9]*$",
    "contract identity changed",
  );
  invariant(
    hasExactKeys(contract.artifact, [
      "name",
      "manifest",
      "checksums",
      "signatureBundle",
      "releaseDirectory",
      "acceptanceDirectory",
      "attestationsDirectory",
      "documentsDirectory",
      "contractsDirectory",
      "retentionDays",
    ]) &&
      contract.artifact.manifest === "release-candidate-manifest.json" &&
      contract.artifact.checksums === "release-candidate-checksums.txt" &&
      contract.artifact.signatureBundle ===
        "release-candidate-checksums.bundle.json" &&
      contract.artifact.retentionDays >= 90,
    "artifact contract changed",
  );
  invariant(
    hasExactKeys(contract.gates, [
      "exactReleaseTagAndRevision",
      "releaseOuterAndInnerSignatures",
      "completeAcceptanceSignature",
      "acceptanceStatus",
      "requiredMatrixCells",
      "structuredReleaseAttestation",
      "codexCleanRoomHostRestart",
      "unresolvedP0",
      "unresolvedP1",
      "databaseRollback",
    ]) &&
      contract.gates.exactReleaseTagAndRevision === true &&
      contract.gates.releaseOuterAndInnerSignatures === true &&
      contract.gates.completeAcceptanceSignature === true &&
      contract.gates.acceptanceStatus === "passed" &&
      contract.gates.requiredMatrixCells === 8 &&
      contract.gates.structuredReleaseAttestation === true &&
      contract.gates.codexCleanRoomHostRestart === true &&
      contract.gates.unresolvedP0 === 0 &&
      contract.gates.unresolvedP1 === 0 &&
      contract.gates.databaseRollback === "unsupported",
    "release gates changed",
  );
  invariant(
    hasExactKeys(contract.limits, [
      "maximumReleaseArchiveBytes",
      "maximumCandidateBytes",
      "maximumAcceptanceEvidenceBytes",
      "maximumAttestationBytes",
      "maximumAttestationAgeDays",
      "maximumMetadataFileBytes",
      "maximumEvidenceFiles",
      "maximumEvidenceDirectories",
      "maximumEvidenceDepth",
    ]) &&
      Object.values(contract.limits).every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) &&
      contract.limits.maximumReleaseArchiveBytes === 4 * 1024 ** 3 &&
      contract.limits.maximumCandidateBytes === 4.5 * 1024 ** 3 &&
      contract.limits.maximumAcceptanceEvidenceBytes === 64 * 1024 ** 2 &&
      contract.limits.maximumAttestationBytes === 64 * 1024 &&
      contract.limits.maximumAttestationAgeDays === 30 &&
      contract.limits.maximumMetadataFileBytes === 16 * 1024 ** 2 &&
      contract.limits.maximumEvidenceFiles === 10_000 &&
      contract.limits.maximumEvidenceDirectories === 10_000 &&
      contract.limits.maximumEvidenceDepth === 64,
    "evidence bounds changed",
  );
  for (const list of [contract.requiredDocuments, contract.requiredContracts]) {
    invariant(
      Array.isArray(list) &&
        list.length > 0 &&
        new Set(list).size === list.length,
      "required inventory is empty or duplicated",
    );
  }
}

function actionReferences(workflow) {
  return Object.values(workflow.jobs ?? {}).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : [])),
  );
}

function expectedActionReference(name) {
  const action = supplyChainContract.actions[name];
  invariant(action, `unknown action ${name}`);
  return `${name}@${action.sha}`;
}

function step(job, name) {
  return job.steps.find((item) => item.name === name);
}

function stepIndex(job, name) {
  return job.steps.findIndex((item) => item.name === name);
}

export async function verifyReleaseCandidateWorkflow({
  source,
  finalizerSource,
  contract = candidateContract,
} = {}) {
  validateContract(contract);
  await verifySelfHostV1Contract(v1Contract);
  const workflowSource =
    source ??
    (await fs.readFile(`${repositoryRoot}/${contract.workflow}`, "utf8"));
  const finalizerImplementation =
    finalizerSource ??
    (await fs.readFile(`${repositoryRoot}/${CANDIDATE_FINALIZER}`, "utf8"));
  const workflow = YAML.parse(workflowSource);
  invariant(
    hasExactKeys(workflow.on, ["workflow_dispatch"]),
    "workflow must be manual only",
  );
  const inputs = workflow.on.workflow_dispatch?.inputs;
  invariant(
    JSON.stringify(Object.keys(inputs ?? {})) ===
      JSON.stringify(EXPECTED_INPUTS),
    "workflow inputs changed",
  );
  for (const [name, input] of Object.entries(inputs ?? {})) {
    invariant(
      input.required === true && input.type === "string" && input.description,
      `input is not explicit and required: ${name}`,
    );
  }
  invariant(
    workflow.permissions?.contents === "read" &&
      workflow.permissions?.actions === "read" &&
      Object.keys(workflow.permissions).length === 2,
    "global permissions are not least privilege",
  );
  invariant(
    workflow.env?.NODE_VERSION === contract.nodeVersion,
    "Node version differs from the contract",
  );
  invariant(
    Object.keys(workflow.jobs ?? {}).length === 1 &&
      workflow.jobs["promote-candidate"],
    "workflow must have one fail-closed promotion job",
  );
  const job = workflow.jobs["promote-candidate"];
  invariant(
    job["runs-on"] === "ubuntu-24.04" &&
      job.permissions?.contents === "read" &&
      job.permissions?.actions === "read" &&
      job.permissions?.["id-token"] === "write",
    "promotion job platform or permissions changed",
  );
  invariant(
    !workflowSource.includes("continue-on-error") &&
      !workflowSource.includes("pull_request_target") &&
      !workflowSource.includes("--skip-verify") &&
      !workflowSource.includes("docker compose down -v") &&
      !workflowSource.includes("--volumes"),
    "workflow contains a fail-open or destructive control",
  );

  const references = actionReferences(workflow);
  for (const reference of references) {
    const [name, revision] = reference.split("@");
    invariant(
      /^[a-f0-9]{40}$/.test(revision ?? "") &&
        reference === expectedActionReference(name),
      `action is not pinned to the approved revision: ${reference}`,
    );
  }
  for (const name of [
    "actions/setup-node",
    "sigstore/cosign-installer",
    "actions/download-artifact",
    "actions/checkout",
    "actions/upload-artifact",
  ]) {
    invariant(
      references.includes(expectedActionReference(name)),
      `required action is missing: ${name}`,
    );
  }

  const authenticateIndex = stepIndex(
    job,
    "Authenticate inputs before checkout",
  );
  const checkoutIndex = stepIndex(
    job,
    "Check out the authenticated release revision",
  );
  invariant(
    authenticateIndex >= 0 && checkoutIndex > authenticateIndex,
    "checkout occurs before artifact authentication",
  );
  for (let index = 0; index < checkoutIndex; index += 1) {
    const current = job.steps[index];
    invariant(
      !current.uses?.startsWith("actions/checkout@"),
      "an earlier checkout bypasses authentication",
    );
  }
  const guard = step(
    job,
    "Require the exact release tag, revision, and explicit attestations",
  );
  invariant(
    guard?.run?.includes('test "$GITHUB_SHA" = "$RELEASE_REVISION"') &&
      guard.run.includes(
        'test "$GITHUB_REF" = "refs/tags/v$RELEASE_VERSION"',
      ) &&
      guard.run.includes("RELEASE_ATTESTATION_BASE64") &&
      guard.run.includes("hostRestartPassed") &&
      guard.run.includes("postRestartDataVerified") &&
      guard.run.includes("releaseBlockers") &&
      guard.run.includes("signed-release-bundle-only"),
    "exact tag or attestation guard is missing",
  );
  for (const [name, runId] of [
    ["Download the exact signed release", "inputs.release_run_id"],
    [
      "Download the exact signed aggregate acceptance gate",
      "inputs.acceptance_run_id",
    ],
  ]) {
    const download = step(job, name);
    invariant(
      download?.uses === expectedActionReference("actions/download-artifact") &&
        String(download.with?.["run-id"]).includes(runId) &&
        String(download.with?.["github-token"]).includes("GITHUB_TOKEN"),
      `${name} is not bound to an exact authenticated run`,
    );
  }
  const authenticate =
    step(job, "Authenticate inputs before checkout")?.run ?? "";
  const bootstrapSource = authenticate.match(
    /node <<'NODE'\n([\s\S]+)\nNODE\n?$/,
  )?.[1];
  invariant(
    bootstrapSource,
    "pre-checkout authentication bootstrap is missing",
  );
  try {
    new Script(bootstrapSource, {
      filename: "selfhost-release-candidate-bootstrap.cjs",
    });
  } catch (error) {
    throw new Error(
      "release candidate workflow invalid: pre-checkout authentication bootstrap has invalid JavaScript",
      { cause: error },
    );
  }
  for (const marker of [
    "cosign",
    "selfhost-images.yml",
    "selfhost-acceptance.yml",
    "sha256",
    "acceptance-checksums.txt",
    "acceptance-checksums.bundle.json",
    'tar", ["-xOzf"',
    'part === "." || part === ".."',
    "releaseManifest.source?.revision",
    "attestation.release?.archiveSha256 !== checksumMatch[1]",
    "attestation.codexCleanRoom?.hostRestartPassed !== true",
    "attestation.issueReview?.releaseBlockers !== 0",
    "acceptanceManifest.summary?.passedCells !== 8",
    "function readStable(file, maximum = maxMetadata)",
    "sameFile(before, opened)",
    "release archive changed while inspecting it",
    "const acceptanceChecksumContents = readStable(acceptanceChecksums)",
    "acceptance checksum changed during verification",
    "acceptanceManifestContents",
  ]) {
    invariant(
      authenticate.includes(marker),
      `pre-checkout check is missing: ${marker}`,
    );
  }
  invariant(
    !authenticate.includes('tar\", [\"-xzf\"'),
    "archive is extracted before checkout",
  );
  const checkout = step(job, "Check out the authenticated release revision");
  invariant(
    checkout?.uses === expectedActionReference("actions/checkout") &&
      String(checkout.with?.ref).includes("inputs.release_revision") &&
      checkout.with?.["persist-credentials"] === false,
    "checkout is not pinned to the authenticated revision",
  );

  const finalizeIndex = stepIndex(
    job,
    "Assemble the complete release candidate evidence",
  );
  const signIndex = stepIndex(job, "Sign the complete candidate inventory");
  const verifyIndex = stepIndex(job, "Verify the candidate signature");
  const completeVerifyIndex = stepIndex(
    job,
    "Verify the complete release candidate",
  );
  const uploadIndex = stepIndex(job, "Upload the immutable release candidate");
  const cleanupIndex = stepIndex(job, "Remove test-owned candidate workspace");
  invariant(
    finalizeIndex > checkoutIndex &&
      signIndex > finalizeIndex &&
      verifyIndex > signIndex &&
      completeVerifyIndex > verifyIndex &&
      uploadIndex > completeVerifyIndex &&
      cleanupIndex > uploadIndex,
    "candidate finalization, signing, upload, or cleanup order changed",
  );
  const finalize = job.steps[finalizeIndex].run ?? "";
  invariant(
    finalize.includes(CANDIDATE_FINALIZER),
    "candidate workflow does not call the reviewed finalizer",
  );
  for (const flag of [
    "--release-artifact-directory",
    "--acceptance-directory",
    "--output-directory",
    "--candidate-id",
    "--workflow-run-id",
    "--workflow-revision",
    "--workflow-ref",
    "--release-run-id",
    "--release-version",
    "--release-revision",
    "--acceptance-run-id",
    "--acceptance-run-attempt",
    "--attestation-file",
  ]) {
    invariant(finalize.includes(flag), `finalizer omits ${flag}`);
  }
  invariant(
    finalizerImplementation.includes("copyRegularTreeBounded") &&
      finalizerImplementation.includes("maximumFileBytes: maximumBytes") &&
      finalizerImplementation.includes("minimumFileBytes: 1") &&
      finalizerImplementation.includes("validateTree:") &&
      !finalizerImplementation.includes("fs.cp(") &&
      !finalizerImplementation.includes("fs.cpSync("),
    "candidate finalizer omits the bounded regular-tree snapshot control",
  );
  invariant(
    finalizerImplementation.includes("prepared.outerArtifactSha256") &&
      finalizerImplementation.includes("acceptance.signedArtifactSha256") &&
      finalizerImplementation.includes(
        "verifyChecksumInventory(acceptanceOutput",
      ) &&
      finalizerImplementation.includes(
        "copied release artifacts differ from the verified snapshot",
      ) &&
      finalizerImplementation.includes(
        "copied acceptance artifacts differ from the verified snapshot",
      ),
    "candidate finalizer does not bind copied inputs to verified snapshots",
  );
  invariant(
    job.steps[signIndex].run.includes(contract.artifact.signatureBundle) &&
      job.steps[signIndex].run.includes(contract.artifact.checksums) &&
      job.steps[verifyIndex].run.includes("GITHUB_WORKFLOW_REF") &&
      job.steps[completeVerifyIndex].run.includes(
        "selfhost:release-candidate-verify",
      ) &&
      job.steps[completeVerifyIndex].run.includes("--release-revision") &&
      job.steps[uploadIndex].uses ===
        expectedActionReference("actions/upload-artifact") &&
      job.steps[uploadIndex].with?.["retention-days"] ===
        contract.artifact.retentionDays &&
      job.steps[cleanupIndex].if === "${{ always() }}",
    "signed artifact publication controls changed",
  );

  const bundleFiles = new Set(bundleContract.files.map(({ path }) => path));
  const baseline = new Set(bundleContract.compatibility.requiredFiles);
  for (const path of [
    ...contract.requiredDocuments,
    ...contract.requiredContracts,
  ]) {
    invariant(bundleFiles.has(path), `release bundle omits ${path}`);
    invariant(
      await fs.stat(`${repositoryRoot}/${path}`),
      `required file missing: ${path}`,
    );
  }
  for (const path of [
    "SELF_HOST_OPERATIONS.md",
    "SELF_HOST_KNOWN_LIMITATIONS.md",
    "docker/selfhost/v1-contract.json",
    "docker/selfhost/documentation-contract.json",
    "docker/selfhost/release-candidate-contract.json",
    "schemas/self-host-release-candidate-manifest.schema.json",
    "schemas/self-host-release-attestation.schema.json",
  ]) {
    invariant(baseline.has(path), `v1 compatibility baseline omits ${path}`);
  }
  const candidateSchema = JSON.parse(
    await fs.readFile(
      `${repositoryRoot}/schemas/self-host-release-candidate-manifest.schema.json`,
      "utf8",
    ),
  );
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  ajv.addFormat("date-time", {
    type: "string",
    validate: (value) => Number.isFinite(Date.parse(value)),
  });
  ajv.compile(candidateSchema);
  const packageManifest = JSON.parse(
    await fs.readFile(`${repositoryRoot}/package.json`, "utf8"),
  );
  invariant(
    packageManifest.scripts?.["selfhost:release-attestation-prepare"] ===
      `node ${contract.attestationPreparer}` &&
      packageManifest.scripts?.["selfhost:release-candidate-verify"] ===
        `node ${contract.verifier}`,
    "release candidate package entrypoint changed",
  );
  return {
    actions: references.length,
    inputs: EXPECTED_INPUTS.length,
    documents: contract.requiredDocuments.length,
    contracts: contract.requiredContracts.length,
  };
}

async function main() {
  const result = await verifyReleaseCandidateWorkflow();
  process.stdout.write(
    `self-host release candidate workflow: PASS (${result.inputs} inputs, ${result.actions} pinned actions)\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

export { EXPECTED_INPUTS };
