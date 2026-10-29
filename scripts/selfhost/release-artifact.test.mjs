import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import composeContract from "../../docker/selfhost/compose-contract.json" with { type: "json" };
import imageContract from "../../docker/selfhost/image-contract.json" with { type: "json" };
import releasePolicy from "../../docker/selfhost/release-policy.json" with { type: "json" };
import supplyChainContract from "../../docker/selfhost/supply-chain-contract.json" with { type: "json" };
import { createChecksums } from "./create-checksums.mjs";
import { createReleaseManifest } from "./create-image-release-manifest.mjs";
import {
  SELF_HOST_RELEASE_TRUST,
  validateReleaseManifest,
  verifyReleaseEvidenceDirectory,
} from "./release-artifact.mjs";
import { repositoryRoot } from "./verify-compose-contract.mjs";

const workspaces = [];
const revision = "a".repeat(40);
const roles = ["client", "migrate", "server"];
const emptySarif = `${JSON.stringify(
  { version: "2.1.0", runs: [{ results: [] }] },
  null,
  2,
)}\n`;
const emptySarifSha256 = createHash("sha256").update(emptySarif).digest("hex");

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((path) => fs.rm(path, { recursive: true, force: true })),
  );
});

function imageResult(role, digit) {
  const digest = `sha256:${digit.repeat(64)}`;
  const image = `${supplyChainContract.imageRepositoryPrefix}${imageContract.images[role].name}`;
  return {
    schemaVersion: 1,
    role,
    image,
    digest,
    reference: `${image}@${digest}`,
    platforms: imageContract.platforms,
    platformDigests: {
      "linux/amd64": `sha256:${"d".repeat(64)}`,
      "linux/arm64": `sha256:${"e".repeat(64)}`,
    },
    attestationManifests: 2,
    sbomDocuments: 2,
    provenanceStatements: 2,
    sbom: { format: "spdx-json", file: `${role}.sbom.json` },
    provenance: { mode: "mode=max", file: `${role}.provenance.json` },
    signature: {
      tool: "cosign",
      version: "v3.0.6",
      oidcIssuer: supplyChainContract.signature.oidcIssuer,
      identity: `${supplyChainContract.sourceRepository}/${supplyChainContract.workflow}@refs/tags/v${releasePolicy.releaseVersion}`,
      verified: true,
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
          scans: Object.fromEntries(
            ["linux/amd64", "linux/arm64"].map((platform) => [
              platform,
              {
                file: `vulnerability/${item.role}-${platform.split("/")[1]}.sarif.json`,
                sha256: emptySarifSha256,
                findings: 0,
              },
            ]),
          ),
        },
      ]),
    ),
  };
}

function manifest() {
  const migrations = [
    {
      id: "20261017090000_self_host_owner_bootstrap",
      checksum: "e".repeat(64),
      phase: "baseline",
      releaseVersion: "1.1.13",
    },
  ];
  const results = [
    imageResult("migrate", "4"),
    imageResult("server", "1"),
    imageResult("client", "2"),
  ];
  return createReleaseManifest({
    version: releasePolicy.releaseVersion,
    revision,
    source: supplyChainContract.sourceRepository,
    created: "2026-10-17T00:00:00Z",
    results,
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
    vulnerabilityEvidence: vulnerabilityEvidence(results),
  });
}

function indexEvidence() {
  const amd = `sha256:${"d".repeat(64)}`;
  const arm = `sha256:${"e".repeat(64)}`;
  return {
    manifests: [
      { digest: amd, platform: { os: "linux", architecture: "amd64" } },
      { digest: arm, platform: { os: "linux", architecture: "arm64" } },
      {
        digest: `sha256:${"8".repeat(64)}`,
        annotations: {
          "vnd.docker.reference.type": "attestation-manifest",
          "vnd.docker.reference.digest": amd,
        },
      },
      {
        digest: `sha256:${"9".repeat(64)}`,
        annotations: {
          "vnd.docker.reference.type": "attestation-manifest",
          "vnd.docker.reference.digest": arm,
        },
      },
    ],
  };
}

async function writeJson(path, value) {
  await fs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function evidenceDirectory() {
  const directory = await fs.mkdtemp(join(tmpdir(), "selfhost-release-"));
  workspaces.push(directory);
  const value = manifest();
  await writeJson(resolve(directory, "release-manifest.json"), value);
  await fs.writeFile(
    resolve(directory, "image-digests.txt"),
    `${roles.map((role) => `${role}  ${value.images[role].reference}`).join("\n")}\n`,
  );
  await fs.mkdir(resolve(directory, "vulnerability"));
  const vulnerability = vulnerabilityEvidence(
    roles.map((role) =>
      imageResult(
        role,
        role === "server"
          ? "1"
          : role === "client"
            ? "2"
            : role === "migrate"
              ? "4"
              : "3",
      ),
    ),
  );
  await writeJson(
    resolve(directory, "vulnerability-result.json"),
    vulnerability,
  );
  for (const image of Object.values(vulnerability.images)) {
    for (const scan of Object.values(image.scans)) {
      await fs.writeFile(resolve(directory, scan.file), emptySarif);
    }
  }
  for (const role of roles) {
    await writeJson(resolve(directory, `${role}.index.json`), indexEvidence());
    await writeJson(resolve(directory, `${role}.sbom.json`), {
      documents: [{ spdxVersion: "SPDX-2.3" }, { spdxVersion: "SPDX-2.3" }],
    });
    await writeJson(resolve(directory, `${role}.provenance.json`), {
      statements: [{ buildType: "one" }, { buildType: "two" }],
    });
    await writeJson(resolve(directory, `${role}.signature.json`), [
      {
        critical: {
          image: { "docker-manifest-digest": value.images[role].digest },
        },
      },
    ]);
    await writeJson(
      resolve(directory, `${role}.result.json`),
      imageResult(
        role,
        role === "server"
          ? "1"
          : role === "client"
            ? "2"
            : role === "migrate"
              ? "4"
              : "3",
      ),
    );
  }
  await createChecksums(directory);
  await writeJson(resolve(directory, "checksums.bundle.json"), {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
  });
  return { directory, manifest: value };
}

function signatureVerifier(expectedDirectory, onVerify = null) {
  return async ({ checksumsPath, bundlePath, identity, oidcIssuer }) => {
    assert.notEqual(dirname(checksumsPath), resolve(expectedDirectory));
    assert.equal(dirname(bundlePath), dirname(checksumsPath));
    assert.equal(basename(checksumsPath), "checksums.txt");
    assert.equal(basename(bundlePath), "checksums.bundle.json");
    assert.equal(
      identity,
      `${supplyChainContract.sourceRepository}/${supplyChainContract.workflow}@refs/tags/v${releasePolicy.releaseVersion}`,
    );
    assert.equal(oidcIssuer, supplyChainContract.signature.oidcIssuer);
    if (onVerify) await onVerify({ checksumsPath, bundlePath });
  };
}

test("validates a strict upgrade-aware release manifest", async () => {
  assert.deepEqual(SELF_HOST_RELEASE_TRUST, {
    sourceRepository: supplyChainContract.sourceRepository,
    imageRepositoryPrefix: supplyChainContract.imageRepositoryPrefix,
    registry: supplyChainContract.registry,
    workflow: supplyChainContract.workflow,
    oidcIssuer: supplyChainContract.signature.oidcIssuer,
    signatureBundle: supplyChainContract.releaseEvidence.signatureBundle,
  });
  const value = manifest();
  assert.equal(validateReleaseManifest(value), value);
  const schema = JSON.parse(
    await fs.readFile(
      resolve(repositoryRoot, "schemas/self-host-release-manifest.schema.json"),
      "utf8",
    ),
  );
  const validate = new Ajv2020({
    strict: false,
    validateFormats: false,
  }).compile(schema);
  assert.equal(validate(value), true, JSON.stringify(validate.errors));

  const extra = structuredClone(value);
  extra.database.migrations[0].ignored = true;
  assert.throws(() => validateReleaseManifest(extra), /migration inventory/);

  const digestMismatch = structuredClone(value);
  digestMismatch.database.migrationInventorySha256 = "0".repeat(64);
  assert.throws(
    () => validateReleaseManifest(digestMismatch),
    /migration digest/,
  );
});

test("verifies checksummed image, signature, SBOM, and provenance evidence", async () => {
  const fixture = await evidenceDirectory();
  await assert.rejects(
    () => verifyReleaseEvidenceDirectory(fixture.directory),
    /cryptographic release signature verifier is required/,
  );
  const verified = await verifyReleaseEvidenceDirectory(fixture.directory, {
    verifySignature: signatureVerifier(fixture.directory),
  });
  assert.equal(verified.manifest.releaseVersion, releasePolicy.releaseVersion);
  assert.equal(verified.signatureVerified, true);
  assert.equal(verified.checksums.has("server.signature.json"), true);
  assert.match(verified.signedArtifactSha256.checksums, /^[a-f0-9]{64}$/);
  assert.match(verified.signedArtifactSha256.signatureBundle, /^[a-f0-9]{64}$/);

  await fs.writeFile(resolve(fixture.directory, "server.sbom.json"), "{}\n");
  await assert.rejects(
    () =>
      verifyReleaseEvidenceDirectory(fixture.directory, {
        verifySignature: signatureVerifier(fixture.directory),
      }),
    /checksum mismatch/,
  );
});

test("binds hashing, signature verification, and semantics to one private snapshot", async () => {
  const fixture = await evidenceDirectory();
  let snapshotRoot;
  const verified = await verifyReleaseEvidenceDirectory(fixture.directory, {
    verifySignature: signatureVerifier(
      fixture.directory,
      async ({ checksumsPath }) => {
        snapshotRoot = dirname(checksumsPath);
        await fs.writeFile(
          resolve(fixture.directory, "server.result.json"),
          "{}\n",
        );
        await fs.writeFile(
          resolve(fixture.directory, "checksums.txt"),
          "source changed after snapshot\n",
        );
        assert.match(
          await fs.readFile(checksumsPath, "utf8"),
          /server\.result\.json/,
        );
      },
    ),
  });
  assert.equal(verified.signatureVerified, true);
  assert.ok(snapshotRoot);
  await assert.rejects(fs.lstat(snapshotRoot), { code: "ENOENT" });
});

test("rejects a checksum payload replaced during signature verification", async () => {
  const fixture = await evidenceDirectory();
  await assert.rejects(
    () =>
      verifyReleaseEvidenceDirectory(fixture.directory, {
        verifySignature: signatureVerifier(
          fixture.directory,
          async ({ checksumsPath, bundlePath }) => {
            const snapshotRoot = dirname(checksumsPath);
            await fs.appendFile(
              resolve(snapshotRoot, "server.result.json"),
              " ",
            );
            await fs.rm(bundlePath);
            await createChecksums(snapshotRoot);
            await writeJson(bundlePath, {
              mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
            });
          },
        ),
      }),
    /checksum payload changed during signature verification/,
  );
});

test("rejects a signature bundle replaced during signature verification", async () => {
  const fixture = await evidenceDirectory();
  await assert.rejects(
    () =>
      verifyReleaseEvidenceDirectory(fixture.directory, {
        verifySignature: signatureVerifier(
          fixture.directory,
          async ({ bundlePath }) => {
            await writeJson(bundlePath, {
              mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
              replaced: true,
            });
          },
        ),
      }),
    /release signed artifacts changed during signature verification/,
  );
});

test("rejects recomputed evidence that is not bound to the image digest", async () => {
  const fixture = await evidenceDirectory();
  await writeJson(resolve(fixture.directory, "client.signature.json"), [
    {
      critical: {
        image: { "docker-manifest-digest": `sha256:${"0".repeat(64)}` },
      },
    },
  ]);
  await fs.unlink(resolve(fixture.directory, "checksums.bundle.json"));
  await createChecksums(fixture.directory);
  await writeJson(resolve(fixture.directory, "checksums.bundle.json"), {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
  });
  await assert.rejects(
    () =>
      verifyReleaseEvidenceDirectory(fixture.directory, {
        verifySignature: signatureVerifier(fixture.directory),
      }),
    /release evidence for client is invalid/,
  );
});

test("rejects recomputed vulnerability evidence with a remaining finding", async () => {
  const fixture = await evidenceDirectory();
  await writeJson(
    resolve(fixture.directory, "vulnerability/server-amd64.sarif.json"),
    {
      version: "2.1.0",
      runs: [{ results: [{ ruleId: "CVE-TEST" }] }],
    },
  );
  const evidencePath = resolve(fixture.directory, "vulnerability-result.json");
  const evidence = JSON.parse(await fs.readFile(evidencePath, "utf8"));
  evidence.images.server.scans["linux/amd64"].sha256 = createHash("sha256")
    .update(
      await fs.readFile(
        resolve(fixture.directory, "vulnerability/server-amd64.sarif.json"),
      ),
    )
    .digest("hex");
  await writeJson(evidencePath, evidence);
  const releaseManifestPath = resolve(
    fixture.directory,
    "release-manifest.json",
  );
  const releaseManifest = JSON.parse(
    await fs.readFile(releaseManifestPath, "utf8"),
  );
  releaseManifest.images.server.evidence.vulnerability.scans[
    "linux/amd64"
  ].sha256 = evidence.images.server.scans["linux/amd64"].sha256;
  await writeJson(releaseManifestPath, releaseManifest);
  await fs.unlink(resolve(fixture.directory, "checksums.bundle.json"));
  await createChecksums(fixture.directory);
  await writeJson(resolve(fixture.directory, "checksums.bundle.json"), {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
  });
  await assert.rejects(
    () =>
      verifyReleaseEvidenceDirectory(fixture.directory, {
        verifySignature: signatureVerifier(fixture.directory),
      }),
    /fixable critical\/high vulnerability findings remain/,
  );
});

test("rejects symlinks before reading release metadata", async () => {
  const fixture = await evidenceDirectory();
  await fs.symlink(
    "server.sbom.json",
    resolve(fixture.directory, "linked-evidence.json"),
  );
  await assert.rejects(
    () =>
      verifyReleaseEvidenceDirectory(fixture.directory, {
        verifySignature: signatureVerifier(fixture.directory),
      }),
    /symbolic link/,
  );
});

test("bounds the exact release evidence tree before checksum hashing", async () => {
  const emptyDirectory = await evidenceDirectory();
  await fs.mkdir(resolve(emptyDirectory.directory, "unrepresented-empty"));
  await assert.rejects(
    () =>
      verifyReleaseEvidenceDirectory(emptyDirectory.directory, {
        verifySignature: signatureVerifier(emptyDirectory.directory),
      }),
    /entry scan limit|unexpected directory/,
  );

  const oversized = await evidenceDirectory();
  await fs.truncate(
    resolve(oversized.directory, "server.sbom.json"),
    32 * 1024 * 1024 + 1,
  );
  await assert.rejects(
    () =>
      verifyReleaseEvidenceDirectory(oversized.directory, {
        verifySignature: signatureVerifier(oversized.directory),
      }),
    /release inventory path is unsafe/,
  );
});

test("rejects checksum paths that are not portable or escape the release root", async () => {
  for (const unsafePath of [
    "../outside",
    "nested/../../outside",
    "C:/outside",
    "nested\\outside",
    "nested/CON.txt",
  ]) {
    const fixture = await evidenceDirectory();
    await fs.appendFile(
      resolve(fixture.directory, "checksums.txt"),
      `${"0".repeat(64)}  ${unsafePath}\n`,
    );
    await assert.rejects(
      () =>
        verifyReleaseEvidenceDirectory(fixture.directory, {
          verifySignature: signatureVerifier(fixture.directory),
        }),
      /unsafe release path/,
      unsafePath,
    );
  }
});
