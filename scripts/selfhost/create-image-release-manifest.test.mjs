import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import composeContract from "../../docker/selfhost/compose-contract.json" with { type: "json" };
import imageContract from "../../docker/selfhost/image-contract.json" with { type: "json" };
import releasePolicy from "../../docker/selfhost/release-policy.json" with { type: "json" };
import supplyChainContract from "../../docker/selfhost/supply-chain-contract.json" with { type: "json" };
import { createReleaseManifest } from "./create-image-release-manifest.mjs";

const revision = "a".repeat(40);

function result(role, digit) {
  const digest = `sha256:${digit.repeat(64)}`;
  const image = `${supplyChainContract.imageRepositoryPrefix}${imageContract.images[role].name}`;
  return {
    role,
    image,
    digest,
    reference: `${image}@${digest}`,
    platforms: imageContract.platforms,
    platformDigests: {
      "linux/amd64": `sha256:${"d".repeat(64)}`,
      "linux/arm64": `sha256:${"e".repeat(64)}`,
    },
    sbom: { format: "spdx-json", file: `${role}.sbom.json` },
    provenance: { mode: "mode=max", file: `${role}.provenance.json` },
    signature: {
      verified: true,
      tool: "cosign",
      version: "v3.0.6",
      oidcIssuer: supplyChainContract.signature.oidcIssuer,
      identity: `${supplyChainContract.sourceRepository}/${supplyChainContract.workflow}@refs/tags/v1.1.13`,
    },
  };
}

function vulnerabilityEvidence(results) {
  return {
    schemaVersion: 1,
    kind: "trainingload-selfhost-vulnerability-evidence",
    tool: { name: "trivy", version: "v0.76.1" },
    policy: {
      severities: ["critical", "high"],
      onlyFixed: true,
      maximumFindings: 0,
    },
    images: Object.fromEntries(
      results.map((item) => [
        item.role,
        {
          reference: item.reference,
          digest: item.digest,
          scans: {
            "linux/amd64": {
              file: `vulnerability/${item.role}-amd64.sarif.json`,
              sha256: "f".repeat(64),
              findings: 0,
            },
            "linux/arm64": {
              file: `vulnerability/${item.role}-arm64.sarif.json`,
              sha256: "f".repeat(64),
              findings: 0,
            },
          },
        },
      ]),
    ),
  };
}

const migrations = [
  {
    id: "20261017090000_self_host_owner_bootstrap",
    checksum: "e".repeat(64),
    phase: "baseline",
    releaseVersion: "1.1.13",
  },
];

const imageResults = [
  result("migrate", "4"),
  result("server", "1"),
  result("client", "2"),
];

const input = {
  version: "1.1.13",
  revision,
  source: supplyChainContract.sourceRepository,
  created: "2026-10-17T00:00:00Z",
  results: imageResults,
  imageContract,
  supplyChainContract,
  composeContract,
  releasePolicy,
  databaseInventory: {
    schemaEpoch: 1,
    migrationPolicy: "expand-contract",
    migrationHead: "20261017090000_self_host_owner_bootstrap",
    migrationInventorySha256: createHash("sha256")
      .update(JSON.stringify(migrations))
      .digest("hex"),
    compatibilityWindowMinorVersions: 2,
    databaseRollback: "unsupported",
    migrations,
  },
  vulnerabilityEvidence: vulnerabilityEvidence(imageResults),
};

test("creates a digest-bound manifest for every image role", () => {
  const manifest = createReleaseManifest(input);
  assert.deepEqual(Object.keys(manifest.images).sort(), [
    "client",
    "migrate",
    "server",
  ]);
  assert.equal(manifest.images.server.tags[0], "1.1.13");
  assert.equal(manifest.images.server.tags[1], `sha-${revision}`);
  assert.match(manifest.images.server.reference, /@sha256:[a-f0-9]{64}$/);
  assert.equal(manifest.composeSchemaVersion, 2);
  assert.equal(manifest.database.migrationPolicy, "expand-contract");
  assert.equal(manifest.database.migrations.length, 1);
  assert.deepEqual(manifest.upgrade, releasePolicy.upgrade);
});

test("rejects incomplete roles and unverified signatures", () => {
  assert.throws(() =>
    createReleaseManifest({ ...input, results: input.results.slice(0, 2) }),
  );
  const results = structuredClone(input.results);
  results[0].signature.verified = false;
  assert.throws(() => createReleaseManifest({ ...input, results }));
});

test("rejects mutable or malformed references", () => {
  const results = structuredClone(input.results);
  results[1].reference = `${results[1].image}:latest`;
  assert.throws(() => createReleaseManifest({ ...input, results }));
});

test("rejects missing platform digests and downgraded evidence", () => {
  const missingPlatform = structuredClone(input.results);
  delete missingPlatform[0].platformDigests["linux/arm64"];
  assert.throws(() =>
    createReleaseManifest({ ...input, results: missingPlatform }),
  );

  const downgraded = structuredClone(input.results);
  downgraded[1].provenance.mode = "mode=min";
  assert.throws(() => createReleaseManifest({ ...input, results: downgraded }));
});

test("rejects vulnerability evidence bound to a different digest", () => {
  const evidence = structuredClone(input.vulnerabilityEvidence);
  evidence.images.server.digest = `sha256:${"9".repeat(64)}`;
  evidence.images.server.reference = `${input.results.find(({ role }) => role === "server").image}@${evidence.images.server.digest}`;
  assert.throws(
    () => createReleaseManifest({ ...input, vulnerabilityEvidence: evidence }),
    /not bound to the image digest/,
  );
});
