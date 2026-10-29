import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCosignPayload,
  validatePublishedEvidence,
} from "./verify-published-evidence.mjs";

const platforms = ["linux/amd64", "linux/arm64"];
const amd64Digest = `sha256:${"a".repeat(64)}`;
const arm64Digest = `sha256:${"b".repeat(64)}`;

function manifest({ omitArmAttestation = false } = {}) {
  const descriptors = [
    { digest: amd64Digest, platform: { os: "linux", architecture: "amd64" } },
    { digest: arm64Digest, platform: { os: "linux", architecture: "arm64" } },
    {
      digest: `sha256:${"c".repeat(64)}`,
      platform: { os: "unknown", architecture: "unknown" },
      annotations: {
        "vnd.docker.reference.type": "attestation-manifest",
        "vnd.docker.reference.digest": amd64Digest,
      },
    },
  ];
  if (!omitArmAttestation) {
    descriptors.push({
      digest: `sha256:${"d".repeat(64)}`,
      platform: { os: "unknown", architecture: "unknown" },
      annotations: {
        "vnd.docker.reference.type": "attestation-manifest",
        "vnd.docker.reference.digest": arm64Digest,
      },
    });
  }
  return { schemaVersion: 2, manifests: descriptors };
}

const sbom = {
  linux_amd64: { SPDX: { spdxVersion: "SPDX-2.3" } },
  linux_arm64: { SPDX: { spdxVersion: "SPDX-2.3" } },
};
const provenance = {
  linux_amd64: { SLSA: { buildType: "https://mobyproject.org/buildkit@v1" } },
  linux_arm64: { SLSA: { buildType: "https://mobyproject.org/buildkit@v1" } },
};

test("accepts two runnable platforms with per-platform evidence", () => {
  const result = validatePublishedEvidence(
    manifest(),
    sbom,
    provenance,
    platforms,
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.sbomDocuments, 2);
  assert.equal(result.summary.provenanceStatements, 2);
  assert.equal(result.summary.attestationManifests, 2);
});

test("rejects missing platform attestation and incomplete SBOM", () => {
  const result = validatePublishedEvidence(
    manifest({ omitArmAttestation: true }),
    { SPDX: { spdxVersion: "SPDX-2.3" } },
    provenance,
    platforms,
  );
  assert.ok(result.errors.some((error) => error.code === "ATTESTATION"));
  assert.ok(result.errors.some((error) => error.code === "SBOM"));
});

test("requires the verified Cosign payload to cover the image digest", () => {
  const payload = [
    {
      critical: {
        image: { "docker-manifest-digest": amd64Digest },
      },
    },
  ];
  assert.deepEqual(validateCosignPayload(payload, amd64Digest), []);
  assert.equal(
    validateCosignPayload(payload, arm64Digest)[0].code,
    "SIGNATURE",
  );
  assert.equal(validateCosignPayload([], amd64Digest)[0].code, "SIGNATURE");
});
