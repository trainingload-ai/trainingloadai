import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  assertPortablePathInventory,
  consumeByteBudget,
  copyRegularFileBounded,
  inspectRegularTree,
  readRegularFileBounded,
  rethrowAfterPathCleanup,
  sha256File,
} from "./backup-artifact.mjs";
import {
  validateCosignPayload,
  validatePublishedEvidence,
} from "./verify-published-evidence.mjs";
import {
  validateVulnerabilityEvidence,
  validateVulnerabilityEvidenceFiles,
} from "./vulnerability-evidence.mjs";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const MIGRATION_ID = /^(?:\d{4}|\d{14})_[a-z0-9_]+$/;
const IMAGE_ROLES = ["client", "migrate", "server"];
const IMAGE_NAMES = Object.freeze({
  client: "trainingload-client",
  migrate: "trainingload-migrate",
  server: "trainingload-server",
});
const PLATFORMS = ["linux/amd64", "linux/arm64"];
const MAX_METADATA_BYTES = 32 * 1024 * 1024;
const MAX_EVIDENCE_BYTES = 512 * 1024 * 1024;
const MAX_EVIDENCE_FILES = 10_128;

export const SELF_HOST_RELEASE_TRUST = Object.freeze({
  sourceRepository: "https://github.com/Buerber/trainingloadai",
  imageRepositoryPrefix: "ghcr.io/buerber/trainingloadai/",
  registry: "ghcr.io",
  workflow: ".github/workflows/selfhost-images.yml",
  oidcIssuer: "https://token.actions.githubusercontent.com",
  signatureBundle: "checksums.bundle.json",
});

function hasExactKeys(value, expected) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expected].sort().join(",")
  );
}

function exactStringArray(value, { semver = false } = {}) {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => typeof item === "string" && (!semver || SEMVER.test(item)),
    ) &&
    new Set(value).size === value.length
  );
}

function canonicalMigrationDigest(migrations) {
  return createHash("sha256").update(JSON.stringify(migrations)).digest("hex");
}

function assertPortableReleasePath(path) {
  const segments = path.split("/");
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[\0\r\n]/.test(path) ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes(":") ||
        /[. ]$/.test(segment) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
    )
  ) {
    throw new Error(`unsafe release path: ${JSON.stringify(path)}`);
  }
}

function expectedTreeShape(paths) {
  const directories = new Set();
  let maximumDepth = 1;
  for (const path of paths) {
    const segments = path.split("/");
    maximumDepth = Math.max(maximumDepth, segments.length - 1);
    for (let depth = 1; depth < segments.length; depth += 1) {
      directories.add(segments.slice(0, depth).join("/"));
    }
  }
  return { directories: [...directories].sort(), maximumDepth };
}

async function verifyExactRegularTree(root, expectedFiles, label) {
  const expected = [...expectedFiles].sort();
  const shape = expectedTreeShape(expected);
  const tree = await inspectRegularTree(root, {
    maximumFiles: expected.length,
    maximumDirectories: Math.max(1, shape.directories.length),
    maximumDepth: shape.maximumDepth,
  });
  if (
    JSON.stringify(tree.files.map((file) => file.relativePath).sort()) !==
      JSON.stringify(expected) ||
    JSON.stringify([...tree.directories].sort()) !==
      JSON.stringify(shape.directories)
  ) {
    throw new Error(`${label} does not match its exact signed tree`);
  }
}

function validateImage(role, image, manifest) {
  const expectedIdentity = `${manifest.source.url}/${manifest.verification.workflow}@refs/tags/v${manifest.releaseVersion}`;
  const vulnerability = image?.evidence?.vulnerability;
  if (
    !hasExactKeys(image, [
      "name",
      "repository",
      "digest",
      "reference",
      "tags",
      "platforms",
      "platformDigests",
      "evidence",
    ]) ||
    image.name !== IMAGE_NAMES[role] ||
    image.repository !==
      `${SELF_HOST_RELEASE_TRUST.imageRepositoryPrefix}${IMAGE_NAMES[role]}` ||
    !DIGEST.test(image.digest ?? "") ||
    image.reference !== `${image.repository}@${image.digest}` ||
    JSON.stringify(image.tags) !==
      JSON.stringify([
        manifest.releaseVersion,
        `sha-${manifest.source.revision}`,
      ]) ||
    JSON.stringify(image.platforms) !== JSON.stringify(PLATFORMS) ||
    !hasExactKeys(image.platformDigests, PLATFORMS) ||
    Object.values(image.platformDigests).some(
      (digest) => !DIGEST.test(digest),
    ) ||
    !hasExactKeys(image.evidence, [
      "sbom",
      "provenance",
      "signature",
      "vulnerability",
    ]) ||
    !hasExactKeys(image.evidence.sbom, ["format", "file"]) ||
    image.evidence.sbom.format !== "spdx-json" ||
    image.evidence.sbom.file !== `${role}.sbom.json` ||
    !hasExactKeys(image.evidence.provenance, ["mode", "file"]) ||
    image.evidence.provenance.mode !== "mode=max" ||
    image.evidence.provenance.file !== `${role}.provenance.json` ||
    !hasExactKeys(image.evidence.signature, [
      "tool",
      "version",
      "oidcIssuer",
      "identity",
      "verified",
    ]) ||
    image.evidence.signature.tool !== "cosign" ||
    typeof image.evidence.signature.version !== "string" ||
    !image.evidence.signature.version ||
    image.evidence.signature.oidcIssuer !== manifest.verification.oidcIssuer ||
    image.evidence.signature.identity !== expectedIdentity ||
    image.evidence.signature.verified !== true ||
    !hasExactKeys(vulnerability, [
      "tool",
      "actionVersion",
      "policy",
      "resultFile",
      "scans",
    ]) ||
    vulnerability.tool !== "docker-scout" ||
    vulnerability.actionVersion !== "v1.24.0" ||
    vulnerability.policy !== "zero-fixable-critical-high" ||
    vulnerability.resultFile !== "vulnerability-result.json" ||
    !hasExactKeys(vulnerability.scans, PLATFORMS) ||
    Object.entries(vulnerability.scans).some(([platform, scan]) => {
      const architecture = platform === "linux/amd64" ? "amd64" : "arm64";
      return (
        !hasExactKeys(scan, ["file", "sha256", "findings"]) ||
        scan.file !== `vulnerability/${role}-${architecture}.sarif.json` ||
        !SHA256.test(scan.sha256 ?? "") ||
        scan.findings !== 0
      );
    })
  ) {
    throw new Error(`release manifest image ${role} is invalid`);
  }
}

export function validateReleaseManifest(manifest) {
  if (
    !hasExactKeys(manifest, [
      "schemaVersion",
      "releaseVersion",
      "configSchemaVersion",
      "composeSchemaVersion",
      "releaseKind",
      "source",
      "created",
      "registry",
      "license",
      "runtimeIdentity",
      "images",
      "upgrade",
      "database",
      "verification",
    ]) ||
    manifest.schemaVersion !== 1 ||
    !SEMVER.test(manifest.releaseVersion ?? "") ||
    !Number.isInteger(manifest.configSchemaVersion) ||
    manifest.configSchemaVersion < 1 ||
    !Number.isInteger(manifest.composeSchemaVersion) ||
    manifest.composeSchemaVersion < 1 ||
    typeof manifest.releaseKind !== "string" ||
    !manifest.releaseKind ||
    !hasExactKeys(manifest.source, ["url", "revision"]) ||
    manifest.source.url !== SELF_HOST_RELEASE_TRUST.sourceRepository ||
    !REVISION.test(manifest.source.revision ?? "") ||
    !Number.isFinite(Date.parse(manifest.created ?? "")) ||
    manifest.registry !== SELF_HOST_RELEASE_TRUST.registry ||
    manifest.license !== "AGPL-3.0-only" ||
    !hasExactKeys(manifest.runtimeIdentity, ["uid", "gid"]) ||
    manifest.runtimeIdentity.uid !== 10001 ||
    manifest.runtimeIdentity.gid !== 10001 ||
    !hasExactKeys(manifest.images, IMAGE_ROLES) ||
    !hasExactKeys(manifest.upgrade, [
      "supportedSourceVersions",
      "applicationRollbackTo",
      "backupRequired",
    ]) ||
    !exactStringArray(manifest.upgrade.supportedSourceVersions, {
      semver: true,
    }) ||
    !exactStringArray(manifest.upgrade.applicationRollbackTo, {
      semver: true,
    }) ||
    manifest.upgrade.applicationRollbackTo.some(
      (version) => !manifest.upgrade.supportedSourceVersions.includes(version),
    ) ||
    manifest.upgrade.backupRequired !== true ||
    !hasExactKeys(manifest.database, [
      "schemaEpoch",
      "migrationPolicy",
      "migrationHead",
      "migrationInventorySha256",
      "compatibilityWindowMinorVersions",
      "databaseRollback",
      "migrations",
    ]) ||
    !Number.isInteger(manifest.database.schemaEpoch) ||
    manifest.database.schemaEpoch < 1 ||
    manifest.database.migrationPolicy !== "expand-contract" ||
    !MIGRATION_ID.test(manifest.database.migrationHead ?? "") ||
    !SHA256.test(manifest.database.migrationInventorySha256 ?? "") ||
    !Number.isInteger(manifest.database.compatibilityWindowMinorVersions) ||
    manifest.database.compatibilityWindowMinorVersions < 2 ||
    manifest.database.databaseRollback !== "unsupported" ||
    !Array.isArray(manifest.database.migrations) ||
    !manifest.database.migrations.length ||
    !hasExactKeys(manifest.verification, [
      "workflow",
      "oidcIssuer",
      "digestAlgorithm",
      "evidenceFilesCoveredBy",
      "releaseEvidenceSignature",
    ]) ||
    manifest.verification.workflow !== SELF_HOST_RELEASE_TRUST.workflow ||
    manifest.verification.oidcIssuer !== SELF_HOST_RELEASE_TRUST.oidcIssuer ||
    manifest.verification.digestAlgorithm !== "sha256" ||
    manifest.verification.evidenceFilesCoveredBy !== "checksums.txt" ||
    !hasExactKeys(manifest.verification.releaseEvidenceSignature, [
      "tool",
      "version",
      "bundle",
    ]) ||
    manifest.verification.releaseEvidenceSignature.tool !== "cosign" ||
    manifest.verification.releaseEvidenceSignature.version !== "v3.0.6" ||
    manifest.verification.releaseEvidenceSignature.bundle !==
      SELF_HOST_RELEASE_TRUST.signatureBundle
  ) {
    throw new Error("self-host release manifest is invalid");
  }

  for (const role of IMAGE_ROLES) {
    validateImage(role, manifest.images[role], manifest);
  }
  let previousId = "";
  const ids = new Set();
  for (const migration of manifest.database.migrations) {
    if (
      !hasExactKeys(migration, ["id", "checksum", "phase", "releaseVersion"]) ||
      !MIGRATION_ID.test(migration.id ?? "") ||
      !SHA256.test(migration.checksum ?? "") ||
      !["baseline", "expand", "backfill", "contract"].includes(
        migration.phase,
      ) ||
      !SEMVER.test(migration.releaseVersion ?? "") ||
      migration.id <= previousId ||
      ids.has(migration.id)
    ) {
      throw new Error("release manifest migration inventory is invalid");
    }
    previousId = migration.id;
    ids.add(migration.id);
  }
  if (
    manifest.database.migrationHead !==
      manifest.database.migrations.at(-1).id ||
    manifest.database.migrationInventorySha256 !==
      canonicalMigrationDigest(manifest.database.migrations)
  ) {
    throw new Error("release manifest migration digest is invalid");
  }
  return manifest;
}

function parseChecksums(text) {
  const result = new Map();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line) continue;
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match || result.has(match[2]) || match[2] === "checksums.txt") {
      throw new Error(`invalid release checksum line ${index + 1}`);
    }
    assertPortableReleasePath(match[2]);
    result.set(match[2], match[1]);
  }
  if (!result.size) throw new Error("release checksums are empty");
  return result;
}

export function releaseEvidenceFiles(manifest) {
  validateReleaseManifest(manifest);
  const files = [
    "release-manifest.json",
    "image-digests.txt",
    "vulnerability-result.json",
  ];
  for (const role of IMAGE_ROLES) {
    files.push(
      `${role}.index.json`,
      manifest.images[role].evidence.sbom.file,
      manifest.images[role].evidence.provenance.file,
      `${role}.signature.json`,
      `${role}.result.json`,
      ...Object.values(manifest.images[role].evidence.vulnerability.scans).map(
        (scan) => scan.file,
      ),
    );
  }
  const unique = [...new Set(files)].sort();
  assertPortablePathInventory(
    unique.map((path) => ({ path, kind: "file" })),
    "release evidence inventory",
  );
  return unique;
}

async function readBoundedText(path) {
  return (
    await readRegularFileBounded(path, {
      maximumBytes: MAX_METADATA_BYTES,
      label: "release metadata",
    })
  ).contents.toString("utf8");
}

async function readBoundedJson(path) {
  return JSON.parse(await readBoundedText(path));
}

async function copyEvidenceFile(sourceRoot, snapshotRoot, path, budget) {
  assertPortableReleasePath(path);
  const source = resolve(sourceRoot, ...path.split("/"));
  const destination = resolve(snapshotRoot, ...path.split("/"));
  const stat = await fs.lstat(source);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    !Number.isSafeInteger(stat.size) ||
    stat.size < 0 ||
    stat.size > MAX_METADATA_BYTES
  ) {
    throw new Error(`release inventory path is unsafe: ${path}`);
  }
  consumeByteBudget(budget, stat.size);
  await copyRegularFileBounded(source, destination, {
    maximumBytes: MAX_METADATA_BYTES,
    expectedSizeBytes: stat.size,
    mode: 0o600,
    parentMode: 0o700,
    label: "release evidence snapshot",
  });
}

export async function validateReleaseEvidenceContents(directory, manifest) {
  const root = resolve(directory);
  const vulnerabilityEvidence = validateVulnerabilityEvidence(
    await readBoundedJson(resolve(root, "vulnerability-result.json")),
  );
  await validateVulnerabilityEvidenceFiles(root, vulnerabilityEvidence);
  for (const role of IMAGE_ROLES) {
    const published = validatePublishedEvidence(
      await readBoundedJson(resolve(root, `${role}.index.json`)),
      await readBoundedJson(
        resolve(root, manifest.images[role].evidence.sbom.file),
      ),
      await readBoundedJson(
        resolve(root, manifest.images[role].evidence.provenance.file),
      ),
      PLATFORMS,
    );
    const signatureErrors = validateCosignPayload(
      await readBoundedJson(resolve(root, `${role}.signature.json`)),
      manifest.images[role].digest,
    );
    if (
      published.errors.length ||
      signatureErrors.length ||
      JSON.stringify(published.summary?.platforms) !==
        JSON.stringify(manifest.images[role].platforms) ||
      JSON.stringify(published.summary?.platformDigests) !==
        JSON.stringify(manifest.images[role].platformDigests)
    ) {
      throw new Error(`release evidence for ${role} is invalid`);
    }
    const result = await readBoundedJson(resolve(root, `${role}.result.json`));
    if (
      result?.schemaVersion !== 1 ||
      result.role !== role ||
      result.digest !== manifest.images[role].digest ||
      result.reference !== manifest.images[role].reference ||
      result.signature?.verified !== true ||
      vulnerabilityEvidence.images[role].reference !==
        manifest.images[role].reference ||
      vulnerabilityEvidence.images[role].digest !==
        manifest.images[role].digest ||
      JSON.stringify(vulnerabilityEvidence.images[role].scans) !==
        JSON.stringify(manifest.images[role].evidence.vulnerability.scans)
    ) {
      throw new Error(`release result for ${role} is invalid`);
    }
  }
  const digestLines = (
    await readBoundedText(resolve(root, "image-digests.txt"))
  )
    .trim()
    .split(/\r?\n/);
  const expectedDigestLines = IMAGE_ROLES.map(
    (role) => `${role}  ${manifest.images[role].reference}`,
  );
  if (JSON.stringify(digestLines) !== JSON.stringify(expectedDigestLines)) {
    throw new Error("release image digest inventory does not match manifest");
  }
  return manifest;
}

export async function verifyReleaseEvidenceDirectory(
  directory,
  { verifySignature, additionalFiles = [], strictTree = true } = {},
) {
  if (typeof verifySignature !== "function") {
    throw new Error("a cryptographic release signature verifier is required");
  }
  const root = resolve(directory);
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("release evidence root must be a real directory");
  }
  if (
    !Array.isArray(additionalFiles) ||
    additionalFiles.length > MAX_EVIDENCE_FILES
  ) {
    throw new Error("release additional file inventory exceeds its limit");
  }
  const snapshotRoot = await fs.mkdtemp(
    resolve(tmpdir(), "selfhost-release-evidence-"),
  );
  let result;
  let operationError = null;
  try {
    await fs.chmod(snapshotRoot, 0o700);
    const budget = {
      consumedBytes: 0,
      maximumBytes: MAX_EVIDENCE_BYTES,
    };
    const bootstrapFiles = [
      "checksums.txt",
      "release-manifest.json",
      SELF_HOST_RELEASE_TRUST.signatureBundle,
    ];
    for (const path of bootstrapFiles) {
      await copyEvidenceFile(root, snapshotRoot, path, budget);
    }
    let checksumText;
    try {
      checksumText = await readBoundedText(
        resolve(snapshotRoot, "checksums.txt"),
      );
    } catch (error) {
      throw new Error("release checksum file is invalid", { cause: error });
    }
    const checksums = parseChecksums(checksumText);
    const manifest = validateReleaseManifest(
      await readBoundedJson(resolve(snapshotRoot, "release-manifest.json")),
    );
    for (const path of additionalFiles) assertPortableReleasePath(path);
    const expected = [
      ...new Set([...releaseEvidenceFiles(manifest), ...additionalFiles]),
    ].sort();
    if (expected.length > MAX_EVIDENCE_FILES) {
      throw new Error("release checksum inventory exceeds its file limit");
    }
    assertPortablePathInventory(
      expected.map((path) => ({ path, kind: "file" })),
      "release checksum inventory",
    );
    if (
      JSON.stringify(expected) !== JSON.stringify([...checksums.keys()].sort())
    ) {
      throw new Error("release checksum inventory is incomplete or unexpected");
    }
    const completeInventory = [
      ...expected,
      "checksums.txt",
      SELF_HOST_RELEASE_TRUST.signatureBundle,
    ];
    if (strictTree) {
      await verifyExactRegularTree(root, completeInventory, "release evidence");
    } else {
      const signedDirectories = new Map();
      for (const path of expected) {
        const [topLevel, ...remaining] = path.split("/");
        if (!remaining.length) continue;
        if (!signedDirectories.has(topLevel)) {
          signedDirectories.set(topLevel, []);
        }
        signedDirectories.get(topLevel).push(remaining.join("/"));
      }
      for (const [topLevel, files] of signedDirectories) {
        await verifyExactRegularTree(
          resolve(root, topLevel),
          files,
          `signed release subtree ${topLevel}`,
        );
      }
    }
    const copied = new Set(bootstrapFiles);
    for (const path of expected) {
      if (copied.has(path)) continue;
      await copyEvidenceFile(root, snapshotRoot, path, budget);
      copied.add(path);
    }
    await verifyExactRegularTree(
      snapshotRoot,
      completeInventory,
      "release evidence snapshot",
    );
    for (const [path, expectedDigest] of checksums) {
      if (
        (await sha256File(resolve(snapshotRoot, ...path.split("/")))) !==
        expectedDigest
      ) {
        throw new Error(`release checksum mismatch: ${path}`);
      }
    }
    const signatureBundlePath = resolve(
      snapshotRoot,
      SELF_HOST_RELEASE_TRUST.signatureBundle,
    );
    await readBoundedJson(signatureBundlePath);
    const signedArtifactSha256 = {
      checksums: await sha256File(resolve(snapshotRoot, "checksums.txt")),
      signatureBundle: await sha256File(signatureBundlePath),
    };
    const signatureIdentity = `${SELF_HOST_RELEASE_TRUST.sourceRepository}/${SELF_HOST_RELEASE_TRUST.workflow}@refs/tags/v${manifest.releaseVersion}`;
    await verifySignature({
      checksumsPath: resolve(snapshotRoot, "checksums.txt"),
      bundlePath: signatureBundlePath,
      identity: signatureIdentity,
      oidcIssuer: SELF_HOST_RELEASE_TRUST.oidcIssuer,
    });
    if (
      (await readBoundedText(resolve(snapshotRoot, "checksums.txt"))) !==
      checksumText
    ) {
      throw new Error(
        "release checksum payload changed during signature verification",
      );
    }
    if (
      (await sha256File(resolve(snapshotRoot, "checksums.txt"))) !==
        signedArtifactSha256.checksums ||
      (await sha256File(signatureBundlePath)) !==
        signedArtifactSha256.signatureBundle
    ) {
      throw new Error(
        "release signed artifacts changed during signature verification",
      );
    }
    await verifyExactRegularTree(
      snapshotRoot,
      completeInventory,
      "release evidence snapshot",
    );
    for (const [path, expectedDigest] of checksums) {
      if (
        (await sha256File(resolve(snapshotRoot, ...path.split("/")))) !==
        expectedDigest
      ) {
        throw new Error(
          `release checksum mismatch after signature verification: ${path}`,
        );
      }
    }
    await validateReleaseEvidenceContents(snapshotRoot, manifest);
    result = {
      root,
      manifest,
      checksums,
      signedArtifactSha256,
      signatureVerified: true,
    };
  } catch (error) {
    operationError = error;
  }
  await rethrowAfterPathCleanup(operationError, [
    {
      path: snapshotRoot,
      options: { recursive: true, force: false },
    },
  ]);
  return result;
}
