import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { test } from "node:test";
import candidateContract from "../../docker/selfhost/release-candidate-contract.json" with { type: "json" };
import { repositoryRoot } from "./verify-image-contract.mjs";
import { verifyReleaseCandidateWorkflow } from "./verify-release-candidate-workflow.mjs";

const workflowPath = `${repositoryRoot}/${candidateContract.workflow}`;
const finalizerPath = `${repositoryRoot}/scripts/selfhost/finalize-release-candidate.mjs`;

async function source() {
  return fs.readFile(workflowPath, "utf8");
}

test("repository release candidate workflow is complete and fail-closed", async () => {
  const result = await verifyReleaseCandidateWorkflow();
  assert.equal(result.inputs, 7);
  assert.equal(result.documents, 7);
  assert.equal(result.contracts, 10);
});

test("rejects weakened candidate tree or cumulative byte bounds", async () => {
  await assert.rejects(
    verifyReleaseCandidateWorkflow({
      contract: {
        ...candidateContract,
        limits: {
          ...candidateContract.limits,
          maximumCandidateBytes:
            candidateContract.limits.maximumReleaseArchiveBytes,
        },
      },
    }),
    /evidence bounds changed/,
  );
  await assert.rejects(
    verifyReleaseCandidateWorkflow({
      contract: {
        ...candidateContract,
        limits: {
          ...candidateContract.limits,
          maximumEvidenceDepth: 65,
        },
      },
    }),
    /evidence bounds changed/,
  );
});

test("rejects an unbounded candidate evidence copy", async () => {
  const finalizer = await fs.readFile(finalizerPath, "utf8");
  await assert.rejects(
    verifyReleaseCandidateWorkflow({
      finalizerSource: finalizer.replaceAll(
        "copyRegularTreeBounded",
        "copyRegularTree",
      ),
    }),
    /bounded regular-tree snapshot control/,
  );
  await assert.rejects(
    verifyReleaseCandidateWorkflow({
      finalizerSource: `${finalizer}\nfs.cp(source, destination);\n`,
    }),
    /bounded regular-tree snapshot control/,
  );
});

test("rejects a finalizer that stops binding copied inputs to verified snapshots", async () => {
  const finalizer = await fs.readFile(finalizerPath, "utf8");
  await assert.rejects(
    verifyReleaseCandidateWorkflow({
      finalizerSource: finalizer.replaceAll(
        "prepared.outerArtifactSha256",
        "prepared.unverifiedArtifactSha256",
      ),
    }),
    /does not bind copied inputs to verified snapshots/,
  );
});

test("rejects an automatic release candidate trigger", async () => {
  const changed = (await source()).replace(
    "  workflow_dispatch:\n",
    "  push:\n    tags: ['v*']\n  workflow_dispatch:\n",
  );
  await assert.rejects(
    verifyReleaseCandidateWorkflow({ source: changed }),
    /manual only/,
  );
});

test("rejects a mutable action", async () => {
  const changed = (await source()).replace(
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/checkout@main",
  );
  await assert.rejects(
    verifyReleaseCandidateWorkflow({ source: changed }),
    /not pinned/,
  );
});

test("rejects checkout before authenticated inputs", async () => {
  const changed = (await source()).replace(
    "Authenticate inputs before checkout",
    "Authenticate inputs after checkout",
  );
  await assert.rejects(
    verifyReleaseCandidateWorkflow({ source: changed }),
    /checkout occurs before artifact authentication/,
  );
});

test("rejects mutable pre-checkout checksum and archive reads", async () => {
  const changed = (await source())
    .replace(
      "const acceptanceChecksumContents = readStable(acceptanceChecksums);",
      "const acceptanceChecksumContents = fs.readFileSync(acceptanceChecksums);",
    )
    .replace(
      "release archive changed while inspecting it",
      "release archive accepted without a final digest",
    );
  await assert.rejects(
    verifyReleaseCandidateWorkflow({ source: changed }),
    /pre-checkout check is missing/,
  );
});

test("rejects invalid pre-checkout authentication JavaScript", async () => {
  const changed = (await source()).replace(
    "const root = path.resolve(process.env.RC_ROOT);",
    "const root == path.resolve(process.env.RC_ROOT);",
  );
  await assert.rejects(
    verifyReleaseCandidateWorkflow({ source: changed }),
    /bootstrap has invalid JavaScript/,
  );
});

test("rejects an omitted clean-room attestation", async () => {
  const changed = (await source()).replace(
    '          --attestation-file "${{ runner.temp }}/selfhost-rc-${{ github.run_id }}-${{ github.run_attempt }}/release-attestation.input.json"\n',
    "",
  );
  await assert.rejects(
    verifyReleaseCandidateWorkflow({ source: changed }),
    /finalizer omits --attestation-file/,
  );
});

test("rejects an attestation that does not prove host restart persistence", async () => {
  const changed = (await source()).replaceAll(
    "hostRestartPassed",
    "removedHostRestartClaim",
  );
  await assert.rejects(
    verifyReleaseCandidateWorkflow({ source: changed }),
    /attestation guard is missing|pre-checkout check is missing/,
  );
});

test("rejects upload before the candidate signature is verified", async () => {
  const changed = (await source())
    .replace(
      "      - name: Upload the immutable release candidate",
      "      - name: Verify the candidate signature placeholder",
    )
    .replace(
      "      - name: Verify the candidate signature\n",
      "      - name: Upload the immutable release candidate\n",
    )
    .replace(
      "      - name: Verify the candidate signature placeholder",
      "      - name: Verify the candidate signature",
    );
  await assert.rejects(
    verifyReleaseCandidateWorkflow({ source: changed }),
    /finalization, signing, upload, or cleanup order/,
  );
});

test("rejects upload without complete nested candidate verification", async () => {
  const changed = (await source()).replace(
    "      - name: Verify the complete release candidate\n",
    "      - name: Removed complete candidate verification\n",
  );
  await assert.rejects(
    verifyReleaseCandidateWorkflow({ source: changed }),
    /finalization, signing, upload, or cleanup order/,
  );
});
