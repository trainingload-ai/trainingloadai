import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import composeContract from "../../docker/selfhost/compose-contract.json" with { type: "json" };
import imageContract from "../../docker/selfhost/image-contract.json" with { type: "json" };
import releasePolicy from "../../docker/selfhost/release-policy.json" with { type: "json" };
import supplyChainContract from "../../docker/selfhost/supply-chain-contract.json" with { type: "json" };
import { inspectRegularTree } from "./backup-artifact.mjs";
import { createReleaseManifest } from "./create-image-release-manifest.mjs";
import { createChecksums } from "./create-checksums.mjs";
import { releaseEvidenceFiles } from "./release-artifact.mjs";
import {
  buildSelfHostReleaseBundle,
  SELF_HOST_RELEASE_BUNDLE_CONTRACT,
  SELF_HOST_RELEASE_BUNDLE_LIMITS,
  validateReleaseBundleManifest,
  verifySelfHostReleaseBundle,
} from "./release-bundle.mjs";
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
      identity: `${supplyChainContract.sourceRepository}/${supplyChainContract.workflow}@refs/tags/v1.1.13`,
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

function releaseManifest() {
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
    version: "1.1.13",
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

async function createEvidence() {
  const directory = await fs.mkdtemp(
    join(tmpdir(), "selfhost-bundle-evidence-"),
  );
  workspaces.push(directory);
  const manifest = releaseManifest();
  await writeJson(resolve(directory, "release-manifest.json"), manifest);
  await fs.writeFile(
    resolve(directory, "image-digests.txt"),
    `${roles.map((role) => `${role}  ${manifest.images[role].reference}`).join("\n")}\n`,
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
          image: { "docker-manifest-digest": manifest.images[role].digest },
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
  assert.deepEqual(
    (await inspectRegularTree(directory)).files
      .map(({ relativePath }) => relativePath)
      .sort(),
    releaseEvidenceFiles(manifest).sort(),
  );
  return { directory, manifest };
}

async function createBundle() {
  const evidence = await createEvidence();
  const parent = await fs.mkdtemp(join(tmpdir(), "selfhost-release-output-"));
  workspaces.push(parent);
  const output = resolve(parent, "trainingload-selfhost-1.1.13");
  const result = await buildSelfHostReleaseBundle({
    repositoryRoot,
    evidenceDirectory: evidence.directory,
    outputDirectory: output,
  });
  await writeJson(resolve(output, "checksums.bundle.json"), {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
  });
  await fs.chmod(resolve(output, "checksums.bundle.json"), 0o644);
  return { ...evidence, ...result, output };
}

async function createRepositoryFixture() {
  const directory = await fs.mkdtemp(
    join(tmpdir(), "selfhost-release-source-"),
  );
  workspaces.push(directory);
  for (const { path } of SELF_HOST_RELEASE_BUNDLE_CONTRACT.files) {
    const destination = resolve(directory, ...path.split("/"));
    await fs.mkdir(dirname(destination), { recursive: true });
    await fs.copyFile(resolve(repositoryRoot, ...path.split("/")), destination);
  }
  return directory;
}

async function removeStaticFilesAndResign(bundle, paths) {
  for (const path of paths) await fs.rm(resolve(bundle.output, path));
  const manifestPath = resolve(bundle.output, "bundle-manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const removed = new Set(paths);
  manifest.staticFiles = manifest.staticFiles.filter(
    ({ path }) => !removed.has(path),
  );
  await writeJson(manifestPath, manifest);
  await fs.rm(resolve(bundle.output, "checksums.bundle.json"));
  await createChecksums(bundle.output);
  await fs.chmod(resolve(bundle.output, "checksums.txt"), 0o644);
  await writeJson(resolve(bundle.output, "checksums.bundle.json"), {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
  });
  await fs.chmod(resolve(bundle.output, "checksums.bundle.json"), 0o644);
}

test("builds a complete digest-bound cross-platform release bundle", async () => {
  const bundle = await createBundle();
  const environment = await fs.readFile(
    resolve(bundle.output, ".env.example"),
    "utf8",
  );
  for (const [role, name] of [
    ["migrate", "SELF_HOST_MIGRATE_IMAGE"],
    ["server", "SELF_HOST_SERVER_IMAGE"],
    ["client", "SELF_HOST_CLIENT_IMAGE"],
  ]) {
    assert.match(
      environment,
      new RegExp(`^${name}=.+@sha256:[a-f0-9]{64}$`, "m"),
    );
    assert.ok(environment.includes(bundle.manifest.images[role].reference));
  }
  assert.match(environment, /^SELF_HOST_VERSION=1\.1\.13$/m);
  assert.equal(
    (await fs.stat(resolve(bundle.output, "install.sh"))).mode & 0o777,
    0o755,
  );
  assert.equal(
    (await fs.stat(resolve(bundle.output, "scripts/selfhost/cli.mjs"))).mode &
      0o777,
    0o755,
  );

  const schema = JSON.parse(
    await fs.readFile(
      resolve(
        repositoryRoot,
        "schemas/self-host-release-bundle-manifest.schema.json",
      ),
      "utf8",
    ),
  );
  const validate = new Ajv2020({
    strict: false,
    validateFormats: false,
  }).compile(schema);
  assert.equal(
    validate(bundle.bundleManifest),
    true,
    JSON.stringify(validate.errors),
  );
  assert.deepEqual(
    bundle.bundleManifest.staticFiles,
    [...SELF_HOST_RELEASE_BUNDLE_CONTRACT.files].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  );
});

test("verifies the signed bundle after runtime state is created and rejects tampering", async () => {
  const bundle = await createBundle();
  const verifySignature = async ({ identity, oidcIssuer }) => {
    assert.equal(
      identity,
      `${supplyChainContract.sourceRepository}/${supplyChainContract.workflow}@refs/tags/v1.1.13`,
    );
    assert.equal(oidcIssuer, supplyChainContract.signature.oidcIssuer);
  };
  const verified = await verifySelfHostReleaseBundle(bundle.output, {
    verifySignature,
  });
  assert.equal(verified.signatureVerified, true);
  assert.equal(verified.checksums instanceof Map, true);
  assert.match(
    verified.checksums.get("compose.yml"),
    /^[a-f0-9]{64}$/,
  );
  assert.equal(verified.checksums.has("docker/selfhost/Caddyfile"), false);

  await fs.mkdir(resolve(bundle.output, "data/uploads"), { recursive: true });
  await fs.writeFile(
    resolve(bundle.output, "data/uploads/activity.fit"),
    "user data\n",
  );
  await fs.writeFile(
    resolve(bundle.output, ".env.selfhost"),
    "runtime config\n",
  );
  assert.equal(
    (await verifySelfHostReleaseBundle(bundle.output, { verifySignature }))
      .signatureVerified,
    true,
  );

  await fs.writeFile(resolve(bundle.output, "operator-note.txt"), "unsigned\n");
  await assert.rejects(
    () => verifySelfHostReleaseBundle(bundle.output, { verifySignature }),
    /undeclared root file/,
  );
  await fs.unlink(resolve(bundle.output, "operator-note.txt"));

  if (process.platform !== "win32") {
    await fs.symlink("data", resolve(bundle.output, "linked-runtime"));
    await assert.rejects(
      () => verifySelfHostReleaseBundle(bundle.output, { verifySignature }),
      /root entry is unsafe/,
    );
    await fs.unlink(resolve(bundle.output, "linked-runtime"));
  }

  await fs.writeFile(
    resolve(bundle.output, "scripts/selfhost/unlisted-runtime.mjs"),
    "export {};\n",
  );
  await assert.rejects(
    () => verifySelfHostReleaseBundle(bundle.output, { verifySignature }),
    /entry scan limit|exact signed tree/,
  );
  await fs.unlink(
    resolve(bundle.output, "scripts/selfhost/unlisted-runtime.mjs"),
  );

  if (process.platform !== "win32") {
    await fs.chmod(resolve(bundle.output, "install.sh"), 0o644);
    await assert.rejects(
      () => verifySelfHostReleaseBundle(bundle.output, { verifySignature }),
      /file mode is invalid: install\.sh/,
    );
    await fs.chmod(resolve(bundle.output, "install.sh"), 0o755);
  }

  await fs.appendFile(resolve(bundle.output, "SELF_HOSTING.md"), "tampered\n");
  await assert.rejects(
    () => verifySelfHostReleaseBundle(bundle.output, { verifySignature }),
    /checksum mismatch/,
  );
});

test("binds inspected bundle inputs to the signed snapshot inventory", async () => {
  const bundle = await createBundle();
  const digest = async (path) =>
    createHash("sha256")
      .update(await fs.readFile(path))
      .digest("hex");
  await assert.rejects(
    () =>
      verifySelfHostReleaseBundle(bundle.output, {
        releaseVerifier: async () => ({
          signatureVerified: true,
          manifest: bundle.manifest,
          checksums: new Map(),
        }),
      }),
    /did not bind the inspected manifests/,
  );

  const checksums = new Map([
    [
      "release-manifest.json",
      await digest(resolve(bundle.output, "release-manifest.json")),
    ],
    [
      "bundle-manifest.json",
      await digest(resolve(bundle.output, "bundle-manifest.json")),
    ],
    [".env.example", "0".repeat(64)],
  ]);
  await assert.rejects(
    () =>
      verifySelfHostReleaseBundle(bundle.output, {
        releaseVerifier: async () => ({
          signatureVerified: true,
          manifest: bundle.manifest,
          checksums,
        }),
      }),
    /environment differs from the signed evidence snapshot/,
  );
});

test("rejects bundle source changes made during inner signature verification", async () => {
  const bundle = await createBundle();
  await assert.rejects(
    verifySelfHostReleaseBundle(bundle.output, {
      verifySignature: async () => {
        await fs.appendFile(
          resolve(bundle.output, "install.sh"),
          "# changed during Cosign\n",
        );
      },
    }),
    /release bundle source changed after verification: install\.sh/,
  );

  const signatureDrift = await createBundle();
  await assert.rejects(
    verifySelfHostReleaseBundle(signatureDrift.output, {
      verifySignature: async () => {
        await fs.writeFile(
          resolve(signatureDrift.output, "checksums.bundle.json"),
          '{"changed":true}\n',
        );
      },
    }),
    /release bundle signed artifacts changed after verification/,
  );
});

test("accepts signed additive bundle evolution but preserves the v1 runtime baseline", async () => {
  const optional = SELF_HOST_RELEASE_BUNDLE_CONTRACT.files
    .map(({ path }) => path)
    .filter(
      (path) =>
        !SELF_HOST_RELEASE_BUNDLE_CONTRACT.compatibility.requiredFiles.includes(
          path,
        ),
    );
  assert.ok(optional.length > 0);

  const historical = await createBundle();
  await removeStaticFilesAndResign(historical, optional);
  assert.equal(
    (
      await verifySelfHostReleaseBundle(historical.output, {
        verifySignature: async () => undefined,
      })
    ).signatureVerified,
    true,
  );

  const downgraded = await createBundle();
  await removeStaticFilesAndResign(downgraded, ["compose.yml"]);
  await assert.rejects(
    verifySelfHostReleaseBundle(downgraded.output, {
      verifySignature: async () => undefined,
    }),
    /omits required file: compose\.yml/,
  );

  for (const path of ["self_hosting.md", "SELF_HOSTING.md/nested"]) {
    const colliding = structuredClone(historical.bundleManifest);
    colliding.staticFiles.push({ path, mode: "0644" });
    assert.throws(
      () => validateReleaseBundleManifest(colliding, historical.manifest),
      /path collision/,
    );
  }
});

test("refuses to overwrite an existing release bundle", async () => {
  const evidence = await createEvidence();
  const parent = await fs.mkdtemp(join(tmpdir(), "selfhost-release-existing-"));
  workspaces.push(parent);
  const output = resolve(parent, "existing");
  await fs.mkdir(output);
  await assert.rejects(
    () =>
      buildSelfHostReleaseBundle({
        repositoryRoot,
        evidenceDirectory: evidence.directory,
        outputDirectory: output,
      }),
    /already exists/,
  );
});

test("does not replace an empty release output created during assembly", async () => {
  const evidence = await createEvidence();
  const parent = await fs.mkdtemp(join(tmpdir(), "selfhost-release-race-"));
  workspaces.push(parent);
  const output = resolve(parent, "created-during-assembly");

  await assert.rejects(
    () =>
      buildSelfHostReleaseBundle({
        repositoryRoot,
        evidenceDirectory: evidence.directory,
        outputDirectory: output,
        manifestValidator: (manifest) => {
          mkdirSync(output);
          return manifest;
        },
      }),
    /already exists/,
  );

  assert.deepEqual(await fs.readdir(output), []);
  assert.deepEqual(
    (await fs.readdir(parent)).filter((name) => name.includes(".partial-")),
    [],
  );
});

test("removes a published release bundle when parent durability fails", async () => {
  const evidence = await createEvidence();
  const parent = await fs.mkdtemp(join(tmpdir(), "selfhost-release-sync-"));
  workspaces.push(parent);
  const output = resolve(parent, "durability-failed");
  let syncCalls = 0;

  await assert.rejects(
    () =>
      buildSelfHostReleaseBundle({
        repositoryRoot,
        evidenceDirectory: evidence.directory,
        outputDirectory: output,
        dependencies: {
          syncDirectory: async () => {
            syncCalls += 1;
            if (syncCalls === 2) {
              const error = new Error("injected parent sync failure");
              error.code = "EIO";
              throw error;
            }
          },
        },
      }),
    /injected parent sync failure/,
  );

  assert.equal(syncCalls, 2);
  await assert.rejects(fs.lstat(output), { code: "ENOENT" });
  assert.deepEqual(
    (await fs.readdir(parent)).filter((name) => name.includes(".partial-")),
    [],
  );
});

test("reports cleanup failure after release bundle publication fails", async () => {
  const evidence = await createEvidence();
  const parent = await fs.mkdtemp(
    join(tmpdir(), "selfhost-release-sync-cleanup-"),
  );
  workspaces.push(parent);
  const output = resolve(parent, "cleanup-failed");
  let syncCalls = 0;

  await assert.rejects(
    () =>
      buildSelfHostReleaseBundle({
        repositoryRoot,
        evidenceDirectory: evidence.directory,
        outputDirectory: output,
        dependencies: {
          syncDirectory: async () => {
            syncCalls += 1;
            if (syncCalls === 2) {
              const error = new Error("injected parent sync failure");
              error.code = "EIO";
              throw error;
            }
          },
          removePath: async () => {
            const error = new Error(
              "injected published output cleanup failure",
            );
            error.code = "EPERM";
            throw error;
          },
        },
      }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.match(error.message, /required path cleanup was incomplete/);
      assert.deepEqual(
        error.errors.map((item) => item.message),
        [
          "injected parent sync failure",
          "injected published output cleanup failure",
        ],
      );
      return true;
    },
  );

  assert.equal(syncCalls, 2);
  assert.equal((await fs.lstat(output)).isDirectory(), true);
});

test("bounds release sources and signed bundle bytes before expensive work", async () => {
  const evidence = await createEvidence();
  const source = await createRepositoryFixture();
  await fs.truncate(
    resolve(source, "AGENTS.md"),
    SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes + 1,
  );
  const parent = await fs.mkdtemp(join(tmpdir(), "selfhost-release-bounds-"));
  workspaces.push(parent);
  const output = resolve(parent, "oversized-source");
  await assert.rejects(
    () =>
      buildSelfHostReleaseBundle({
        repositoryRoot: source,
        evidenceDirectory: evidence.directory,
        outputDirectory: output,
      }),
    /exceeds the .* byte file limit/,
  );
  await assert.rejects(fs.stat(output), { code: "ENOENT" });

  const bundle = await createBundle();
  const oversizedFiles = bundle.bundleManifest.staticFiles
    .map(({ path }) => path)
    .filter((path) => path !== ".env.example")
    .slice(0, 17);
  assert.equal(oversizedFiles.length, 17);
  for (const path of oversizedFiles) {
    await fs.truncate(
      resolve(bundle.output, ...path.split("/")),
      SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes,
    );
  }
  let releaseVerifierCalled = false;
  await assert.rejects(
    () =>
      verifySelfHostReleaseBundle(bundle.output, {
        releaseVerifier: async () => {
          releaseVerifierCalled = true;
          return { signatureVerified: true, manifest: bundle.manifest };
        },
      }),
    /exceeds the .* byte total limit/,
  );
  assert.equal(releaseVerifierCalled, false);
});

test("bounds runtime root entries before bundle verification", async () => {
  const bundle = await createBundle();
  const existingEntries = await fs.readdir(bundle.output);
  const added =
    SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumRuntimeTopLevelEntries -
    existingEntries.length +
    1;
  await Promise.all(
    Array.from({ length: added }, (_, index) =>
      fs.mkdir(resolve(bundle.output, `runtime-data-${index}`)),
    ),
  );
  let releaseVerifierCalled = false;
  await assert.rejects(
    () =>
      verifySelfHostReleaseBundle(bundle.output, {
        releaseVerifier: async () => {
          releaseVerifierCalled = true;
          return { signatureVerified: true, manifest: bundle.manifest };
        },
      }),
    /runtime root exceeds its entry limit/,
  );
  assert.equal(releaseVerifierCalled, false);
});
