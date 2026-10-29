import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { repositoryRoot } from "./verify-image-contract.mjs";
import {
  validateSupplyChainInputReaders,
  validateWorkflow,
} from "./verify-image-workflow.mjs";

const contract = JSON.parse(
  await readFile(
    resolve(repositoryRoot, "docker/selfhost/supply-chain-contract.json"),
    "utf8",
  ),
);
const workflow = await readFile(
  resolve(repositoryRoot, contract.workflow),
  "utf8",
);
const supplyChainInputSources = Object.fromEntries(
  await Promise.all(
    [
      "create-image-release-manifest.mjs",
      "verify-published-evidence.mjs",
      "promote-image-release.mjs",
      "release-artifact.mjs",
      "release-bundle.mjs",
      "scan-image-layers.mjs",
      "vulnerability-evidence.mjs",
    ].map(async (name) => [
      name,
      await readFile(resolve(repositoryRoot, "scripts/selfhost", name), "utf8"),
    ]),
  ),
);

test("repository workflow satisfies the supply-chain contract", () => {
  assert.deepEqual(validateWorkflow(workflow, contract), []);
  assert.deepEqual(
    validateSupplyChainInputReaders(supplyChainInputSources),
    [],
  );
});

test("requires bounded stable JSON inputs before supply-chain decisions", () => {
  const invalid = {
    ...supplyChainInputSources,
    "promote-image-release.mjs": supplyChainInputSources[
      "promote-image-release.mjs"
    ]
      .replaceAll("readRegularFileBounded", "readFile")
      .replaceAll("validateReleaseManifest", "acceptReleaseManifest"),
    "scan-image-layers.mjs": supplyChainInputSources["scan-image-layers.mjs"]
      .replaceAll("consumeRegularFileBounded", "createReadStream")
      .replace(
        "await rethrowAfterPathCleanup(",
        "throw operationError; await Promise.resolve(",
      ),
    "vulnerability-evidence.mjs": supplyChainInputSources[
      "vulnerability-evidence.mjs"
    ].replace(
      'createHash("sha256").update(contents).digest("hex")',
      "sha256File(path)",
    ),
    "verify-published-evidence.mjs": supplyChainInputSources[
      "verify-published-evidence.mjs"
    ].replaceAll("publishRegularFileExclusive", "writeFile"),
    "release-bundle.mjs": supplyChainInputSources[
      "release-bundle.mjs"
    ].replaceAll("verifyCurrentSignedBundle", "trustVerifiedSnapshot"),
  };
  const codes = validateSupplyChainInputReaders(invalid).map(
    (error) => error.code,
  );
  assert.ok(codes.includes("BOUNDED_SUPPLY_CHAIN_INPUT"));
  assert.ok(codes.includes("PROMOTION_MANIFEST"));
  assert.ok(codes.includes("BOUNDED_LAYER_SCAN"));
  assert.ok(codes.includes("IMAGE_SCAN_CLEANUP"));
  assert.ok(codes.includes("VULNERABILITY_BYTE_BINDING"));
  assert.ok(codes.includes("ATOMIC_EVIDENCE_PUBLICATION"));
  assert.ok(codes.includes("SIGNED_BUNDLE_SOURCE_BINDING"));
});

test("rejects a weakened or unbounded vulnerability evidence contract", () => {
  const invalidContract = structuredClone(contract);
  invalidContract.vulnerabilityScan.maximumFindings = 1;
  invalidContract.vulnerabilityScan.maximumEvidenceBytes = Number.MAX_VALUE;
  invalidContract.vulnerabilityScan.evidenceFormat = "text";
  const codes = validateWorkflow(workflow, invalidContract).map(
    (error) => error.code,
  );
  assert.ok(codes.includes("VULNERABILITY_CONTRACT"));
});

test("rejects a mutable action reference", () => {
  const invalid = workflow.replace(
    contract.actions["actions/checkout"].sha,
    "v7",
  );
  const codes = validateWorkflow(invalid, contract).map((error) => error.code);
  assert.ok(codes.includes("ACTION_PIN"));
});

test("rejects automatic publishing and latest tags", () => {
  const invalid = workflow
    .replace("default: false", "default: true")
    .replace("candidate-$GITHUB_RUN_ID", "latest");
  const codes = validateWorkflow(invalid, contract).map((error) => error.code);
  assert.ok(codes.includes("PUBLISH_DEFAULT"));
  assert.ok(codes.includes("MUTABLE"));
});

test("keeps verification-only source builds out of the publishing path", () => {
  const invalidSourceRouting = workflow.replace(
    "    if: ${{ !inputs.publish }}",
    "    if: ${{ inputs.publish }}",
  );
  const sourceCodes = validateWorkflow(invalidSourceRouting, contract).map(
    (error) => error.code,
  );
  assert.ok(sourceCodes.includes("SOURCE_SMOKE_ROUTING"));

  const invalidPublishRouting = workflow.replace(
    "  publish-candidates:\n    needs: validate-contracts",
    "  publish-candidates:\n    needs: smoke-source-images",
  );
  const publishCodes = validateWorkflow(invalidPublishRouting, contract).map(
    (error) => error.code,
  );
  assert.ok(publishCodes.includes("PUBLISH_SINGLE_BUILD"));
});

test("requires platform-specific local tags when re-pulling a multi-arch digest", () => {
  const invalid = workflow.replace(
    'docker image rm "$reference"',
    'true # keep the conflicting multi-arch digest reference',
  );
  const codes = validateWorkflow(invalid, contract).map((error) => error.code);
  assert.ok(codes.includes("PULLED_PLATFORM_RELEASE"));
});

test("requires the signed release inventory before artifact upload", () => {
  const invalid = workflow.replace(
    "- name: Upload release evidence",
    "- name: Publish evidence artifact",
  );
  const codes = validateWorkflow(invalid, contract).map((error) => error.code);
  assert.ok(codes.includes("RELEASE_EVIDENCE_ORDER"));
});

test("requires bundle signing, installer dry-run, reproducible archive, and upload order", () => {
  const invalid = workflow
    .replace('install.sh" --dry-run --json', 'install.sh" --json')
    .replace("--sort=name", "--sort=none")
    .replace("gzip -n", "gzip")
    .replace('cmp "dist/$bundle.tar.gz"', "true # no reproducibility check")
    .replaceAll(
      '"dist/$bundle.tar.gz.sha256.bundle.json"',
      '"dist/unsigned-archive.bundle.json"',
    );
  const codes = validateWorkflow(invalid, contract).map((error) => error.code);
  assert.ok(codes.includes("INSTALLER_DRY_RUN"));
  assert.ok(codes.includes("REPRODUCIBLE_ARCHIVE"));
  assert.ok(codes.includes("REPRODUCIBLE_GZIP"));
  assert.ok(codes.includes("REPRODUCIBILITY_CHECK"));
  assert.ok(codes.includes("ARCHIVE_SIGNATURE"));
  assert.ok(codes.includes("RELEASE_BUNDLE_ORDER"));
});

test("publishes only the three self-host application roles", () => {
  assert.doesNotMatch(workflow, /role: docs|name: docs|SELF_HOST_DOCS_IMAGE/);
});

test("rejects a fail-open vulnerability scan", () => {
  const invalid = workflow
    .replace("            --ignore-unfixed \\", "            --ignore-status \\")
    .replace(
      "[.runs[]?.results[]?] | length == 0",
      "[.runs[]?.results[]?] | length >= 0",
    );
  const codes = validateWorkflow(invalid, contract).map((error) => error.code);
  assert.ok(codes.includes("VULNERABILITY_FIXABLE"));
  assert.ok(codes.includes("VULNERABILITY_FAIL"));
});

test("rejects elevated vulnerability scanner permissions", () => {
  const invalid = workflow.replace(
    "      packages: read\n    strategy:",
    "      packages: write\n      id-token: write\n    strategy:",
  );
  const codes = validateWorkflow(invalid, contract).map((error) => error.code);
  assert.ok(codes.includes("VULNERABILITY_PERMISSIONS"));
});

test("requires registry authentication before verifying private scan digests", () => {
  const invalid = workflow.replace(
    "name: Log in read-only to GitHub Container Registry",
    "name: Deferred registry login",
  );
  const codes = validateWorkflow(invalid, contract).map((error) => error.code);
  assert.ok(codes.includes("VULNERABILITY_ORDER"));
});

test("rejects missing read-only scope or an unbound scanner identity", () => {
  const invalid = workflow
    .replace(
      "      contents: read\n      packages: read",
      "      packages: read",
    )
    .replace(
      "TRIVY_USERNAME: ${{ github.actor }}",
      "TRIVY_USERNAME: anonymous",
    );
  const codes = validateWorkflow(invalid, contract).map((error) => error.code);
  assert.ok(codes.includes("VULNERABILITY_PERMISSIONS"));
});

test("uploads complete SARIF evidence before enforcing the zero-findings gate", () => {
  const invalid = workflow.replace(
    "name: Upload immutable vulnerability evidence",
    "name: Reject fixable critical or high vulnerabilities",
  );
  const codes = validateWorkflow(invalid, contract).map((error) => error.code);
  assert.ok(codes.includes("VULNERABILITY_ORDER"));
});
