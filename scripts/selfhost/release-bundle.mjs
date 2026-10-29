import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import bundleContract from "../../docker/selfhost/release-bundle-contract.json" with { type: "json" };
import {
  assertPortablePathInventory,
  copyRegularFileBounded,
  consumeByteBudget,
  DirectoryEntryLimitError,
  inspectRegularTree,
  readDirectoryEntriesBounded,
  readRegularFileBounded,
  rethrowAfterPathCleanup,
  sha256File,
} from "./backup-artifact.mjs";
import { createChecksums } from "./create-checksums.mjs";
import { rethrowAfterPrivateHandleCleanup } from "./private-path.mjs";
import {
  releaseEvidenceFiles,
  validateReleaseManifest,
  verifyReleaseEvidenceDirectory,
} from "./release-artifact.mjs";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PORTABLE_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

function versionAtLeast(value, minimum) {
  if (!/^\d+\.\d+\.\d+$/.test(value ?? "")) return false;
  const actual = value.split(".").map(Number);
  const required = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== required[index]) {
      return actual[index] > required[index];
    }
  }
  return true;
}

function hasExactKeys(value, expected) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expected].sort().join(",")
  );
}

function validateContract(contract) {
  if (
    !hasExactKeys(contract, [
      "schemaVersion",
      "bundleSchemaVersion",
      "archivePrefix",
      "minimumNodeVersion",
      "limits",
      "compatibility",
      "files",
      "entrypoints",
      "evidence",
    ]) ||
    contract.schemaVersion !== 1 ||
    contract.bundleSchemaVersion !== 1 ||
    contract.archivePrefix !== "trainingload-selfhost" ||
    !/^\d+\.\d+\.\d+$/.test(contract.minimumNodeVersion ?? "") ||
    !hasExactKeys(contract.limits, [
      "maximumFileBytes",
      "maximumBundleBytes",
      "maximumRuntimeTopLevelEntries",
    ]) ||
    contract.limits.maximumFileBytes !== 32 * 1024 ** 2 ||
    contract.limits.maximumBundleBytes !== 512 * 1024 ** 2 ||
    contract.limits.maximumRuntimeTopLevelEntries !== 1024 ||
    contract.limits.maximumBundleBytes < contract.limits.maximumFileBytes ||
    !hasExactKeys(contract.compatibility, [
      "schemaVersion",
      "staticFilesPolicy",
      "requiredFiles",
    ]) ||
    contract.compatibility.schemaVersion !== 1 ||
    contract.compatibility.staticFilesPolicy !==
      "required-baseline-with-signed-additions" ||
    !Array.isArray(contract.compatibility.requiredFiles) ||
    !contract.compatibility.requiredFiles.length ||
    !Array.isArray(contract.files) ||
    !contract.files.length ||
    !hasExactKeys(contract.entrypoints, [
      "installLinux",
      "installWindows",
      "cliLinux",
      "cliWindows",
    ]) ||
    !hasExactKeys(contract.evidence, [
      "algorithm",
      "checksums",
      "signatureBundle",
    ]) ||
    contract.evidence.algorithm !== "sha256" ||
    contract.evidence.checksums !== "checksums.txt" ||
    contract.evidence.signatureBundle !== "checksums.bundle.json"
  ) {
    throw new Error("self-host release bundle contract is invalid");
  }
  const paths = new Set();
  for (const file of contract.files) {
    if (
      !hasExactKeys(file, ["path", "mode"]) ||
      !PORTABLE_PATH.test(file.path ?? "") ||
      !["0644", "0755"].includes(file.mode) ||
      paths.has(file.path)
    ) {
      throw new Error("self-host release bundle file contract is invalid");
    }
    paths.add(file.path);
  }
  assertPortablePathInventory(
    contract.files.map(({ path }) => ({ path, kind: "file" })),
    "release bundle contract",
  );
  const required = new Set();
  for (const path of contract.compatibility.requiredFiles) {
    if (
      !PORTABLE_PATH.test(path ?? "") ||
      required.has(path) ||
      !paths.has(path)
    ) {
      throw new Error("self-host release compatibility baseline is invalid");
    }
    required.add(path);
  }
  return contract;
}

export const SELF_HOST_RELEASE_BUNDLE_CONTRACT = Object.freeze(
  validateContract(bundleContract),
);
export const SELF_HOST_RELEASE_BUNDLE_LIMITS = Object.freeze({
  ...SELF_HOST_RELEASE_BUNDLE_CONTRACT.limits,
});

function staticFiles() {
  return SELF_HOST_RELEASE_BUNDLE_CONTRACT.files
    .map((file) => ({ ...file }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function createReleaseBundleManifest(manifest) {
  validateReleaseManifest(manifest);
  return {
    schemaVersion: SELF_HOST_RELEASE_BUNDLE_CONTRACT.bundleSchemaVersion,
    kind: "trainingload-selfhost-release-bundle",
    releaseVersion: manifest.releaseVersion,
    created: manifest.created,
    archiveBaseName: `${SELF_HOST_RELEASE_BUNDLE_CONTRACT.archivePrefix}-${manifest.releaseVersion}`,
    minimumNodeVersion: SELF_HOST_RELEASE_BUNDLE_CONTRACT.minimumNodeVersion,
    platforms: ["linux/amd64", "linux/arm64"],
    entrypoints: { ...SELF_HOST_RELEASE_BUNDLE_CONTRACT.entrypoints },
    staticFiles: staticFiles(),
    evidence: { ...SELF_HOST_RELEASE_BUNDLE_CONTRACT.evidence },
  };
}

export function validateReleaseBundleManifest(bundle, releaseManifest) {
  validateReleaseManifest(releaseManifest);
  if (
    !hasExactKeys(bundle, [
      "schemaVersion",
      "kind",
      "releaseVersion",
      "created",
      "archiveBaseName",
      "minimumNodeVersion",
      "platforms",
      "entrypoints",
      "staticFiles",
      "evidence",
    ]) ||
    bundle.schemaVersion !==
      SELF_HOST_RELEASE_BUNDLE_CONTRACT.bundleSchemaVersion ||
    bundle.kind !== "trainingload-selfhost-release-bundle" ||
    !SEMVER.test(bundle.releaseVersion ?? "") ||
    bundle.releaseVersion !== releaseManifest.releaseVersion ||
    bundle.created !== releaseManifest.created ||
    bundle.archiveBaseName !==
      `${SELF_HOST_RELEASE_BUNDLE_CONTRACT.archivePrefix}-${releaseManifest.releaseVersion}` ||
    !versionAtLeast(
      bundle.minimumNodeVersion,
      SELF_HOST_RELEASE_BUNDLE_CONTRACT.minimumNodeVersion,
    ) ||
    JSON.stringify(bundle.platforms) !==
      JSON.stringify(["linux/amd64", "linux/arm64"]) ||
    !hasExactKeys(bundle.entrypoints, [
      "installLinux",
      "installWindows",
      "cliLinux",
      "cliWindows",
    ]) ||
    Object.entries(SELF_HOST_RELEASE_BUNDLE_CONTRACT.entrypoints).some(
      ([name, value]) => bundle.entrypoints[name] !== value,
    ) ||
    !hasExactKeys(bundle.evidence, [
      "algorithm",
      "checksums",
      "signatureBundle",
    ]) ||
    Object.entries(SELF_HOST_RELEASE_BUNDLE_CONTRACT.evidence).some(
      ([name, value]) => bundle.evidence[name] !== value,
    ) ||
    !Array.isArray(bundle.staticFiles) ||
    !bundle.staticFiles.length ||
    bundle.staticFiles.length > 10_000
  ) {
    throw new Error("self-host release bundle manifest is invalid");
  }
  const reserved = new Set([
    ...releaseEvidenceFiles(releaseManifest),
    "bundle-manifest.json",
    bundle.evidence.checksums,
    bundle.evidence.signatureBundle,
  ]);
  const declared = new Map();
  for (const file of bundle.staticFiles) {
    if (
      !hasExactKeys(file, ["path", "mode"]) ||
      !PORTABLE_PATH.test(file.path ?? "") ||
      !["0644", "0755"].includes(file.mode) ||
      reserved.has(file.path) ||
      declared.has(file.path)
    ) {
      throw new Error("self-host release bundle manifest is invalid");
    }
    declared.set(file.path, file.mode);
  }
  assertPortablePathInventory(
    [...reserved, ...declared.keys()].map((path) => ({ path, kind: "file" })),
    "release bundle manifest",
  );
  const currentFiles = new Map(
    SELF_HOST_RELEASE_BUNDLE_CONTRACT.files.map((file) => [
      file.path,
      file.mode,
    ]),
  );
  for (const path of SELF_HOST_RELEASE_BUNDLE_CONTRACT.compatibility
    .requiredFiles) {
    if (declared.get(path) !== currentFiles.get(path)) {
      throw new Error(`self-host release bundle omits required file: ${path}`);
    }
  }
  return bundle;
}

function renderReleaseEnvironment(source, manifest) {
  const replacements = {
    SELF_HOST_MIGRATE_IMAGE: manifest.images.migrate.reference,
    SELF_HOST_SERVER_IMAGE: manifest.images.server.reference,
    SELF_HOST_CLIENT_IMAGE: manifest.images.client.reference,
    SELF_HOST_VERSION: manifest.releaseVersion,
  };
  let output = source;
  for (const [name, value] of Object.entries(replacements)) {
    const pattern = new RegExp(`^${name}=.*$`, "m");
    if (!pattern.test(output)) {
      throw new Error(`release environment template is missing ${name}`);
    }
    output = output.replace(pattern, `${name}=${value}`);
  }
  return output;
}

function reserveBundleBytes(budget, bytes, label) {
  if (bytes > SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes) {
    throw new Error(
      `${label} exceeds the ${SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes} byte file limit`,
    );
  }
  try {
    consumeByteBudget(budget, bytes);
  } catch (error) {
    throw new Error(
      `release bundle exceeds the ${SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumBundleBytes} byte total limit`,
      { cause: error },
    );
  }
}

async function copyRegularFile(source, destination, mode, budget) {
  const stat = await fs.lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`release source is not a regular file: ${source}`);
  }
  reserveBundleBytes(budget, stat.size, `release source ${source}`);
  await copyRegularFileBounded(source, destination, {
    maximumBytes: SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes,
    expectedSizeBytes: stat.size,
    mode: Number.parseInt(mode, 8),
    parentMode: 0o755,
    label: "release bundle source copy",
  });
}

async function readJsonDocument(path) {
  let contents;
  try {
    contents = (
      await readRegularFileBounded(path, {
        maximumBytes: SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes,
        label: "release JSON source",
      })
    ).contents;
  } catch {
    throw new Error(`release JSON source is unsafe: ${path}`);
  }
  return {
    value: JSON.parse(contents.toString("utf8")),
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

async function readJson(path) {
  return (await readJsonDocument(path)).value;
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

async function inspectExactBundleTree(root, expectedFiles) {
  const expected = [...expectedFiles].sort();
  const shape = expectedTreeShape(expected);
  const tree = await inspectRegularTree(root, {
    maximumFiles: expected.length,
    maximumDirectories: Math.max(1, shape.directories.length),
    maximumDepth: shape.maximumDepth,
  });
  if (
    JSON.stringify(
      tree.files.map(({ relativePath }) => relativePath).sort(),
    ) !== JSON.stringify(expected) ||
    JSON.stringify([...tree.directories].sort()) !==
      JSON.stringify(shape.directories)
  ) {
    throw new Error("assembled release bundle inventory is inconsistent");
  }
  return tree;
}

function treeBytes(tree) {
  return tree.files.reduce((total, file) => total + file.sizeBytes, 0);
}

async function verifySignedBundleByteLimits(root, paths) {
  const budget = {
    consumedBytes: 0,
    maximumBytes: SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumBundleBytes,
  };
  for (const path of [...new Set(paths)]) {
    const file = await fs.lstat(resolve(root, ...path.split("/")));
    if (!file.isFile() || file.isSymbolicLink()) {
      throw new Error(`release bundle path is unsafe: ${path}`);
    }
    reserveBundleBytes(budget, file.size, `release bundle path ${path}`);
  }
  return budget.consumedBytes;
}

async function verifyCurrentSignedBundle(root, signedPaths, verified) {
  const expectedChecksumPaths = signedPaths
    .filter(
      (path) =>
        path !== SELF_HOST_RELEASE_BUNDLE_CONTRACT.evidence.checksums &&
        path !== SELF_HOST_RELEASE_BUNDLE_CONTRACT.evidence.signatureBundle,
    )
    .sort();
  const actualChecksumPaths =
    verified.checksums instanceof Map
      ? [...verified.checksums.keys()].sort()
      : [];
  const signedArtifactSha256 = verified.signedArtifactSha256;
  if (
    JSON.stringify(actualChecksumPaths) !==
      JSON.stringify(expectedChecksumPaths) ||
    !/^[a-f0-9]{64}$/.test(signedArtifactSha256?.checksums ?? "") ||
    !/^[a-f0-9]{64}$/.test(signedArtifactSha256?.signatureBundle ?? "")
  ) {
    throw new Error(
      "self-host release verifier did not bind the current bundle source",
    );
  }

  validateRuntimeRoot(await inspectRuntimeRoot(root), signedPaths);
  await verifySignedBundleByteLimits(root, signedPaths);
  const signedDirectories = new Map();
  for (const path of expectedChecksumPaths) {
    const [topLevel, ...remaining] = path.split("/");
    if (!remaining.length) continue;
    if (!signedDirectories.has(topLevel)) signedDirectories.set(topLevel, []);
    signedDirectories.get(topLevel).push(remaining.join("/"));
  }
  for (const [topLevel, files] of signedDirectories) {
    await inspectExactBundleTree(resolve(root, topLevel), files);
  }
  for (const [path, expectedDigest] of verified.checksums) {
    if (
      (await sha256File(resolve(root, ...path.split("/")))) !== expectedDigest
    ) {
      throw new Error(
        `release bundle source changed after verification: ${path}`,
      );
    }
  }
  if (
    (await sha256File(
      resolve(root, SELF_HOST_RELEASE_BUNDLE_CONTRACT.evidence.checksums),
    )) !== signedArtifactSha256.checksums ||
    (await sha256File(
      resolve(root, SELF_HOST_RELEASE_BUNDLE_CONTRACT.evidence.signatureBundle),
    )) !== signedArtifactSha256.signatureBundle
  ) {
    throw new Error(
      "release bundle signed artifacts changed after verification",
    );
  }
}

async function inspectRuntimeRoot(root) {
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("release bundle root must be a real directory");
  }
  let entries;
  try {
    entries = await readDirectoryEntriesBounded(
      root,
      SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumRuntimeTopLevelEntries,
    );
  } catch (error) {
    if (!(error instanceof DirectoryEntryLimitError)) throw error;
    throw new Error("release bundle runtime root exceeds its entry limit", {
      cause: error,
    });
  }
  return Promise.all(
    entries.map(async ({ name }) => {
      const stat = await fs.lstat(resolve(root, name));
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
        throw new Error(`release bundle root entry is unsafe: ${name}`);
      }
      return { name, stat };
    }),
  );
}

function validateRuntimeRoot(entries, signedPaths) {
  const signedTopLevel = new Set(signedPaths.map((path) => path.split("/")[0]));
  for (const { name, stat } of entries) {
    if (signedTopLevel.has(name)) continue;
    if (name === ".env.selfhost") {
      if (
        !stat.isFile() ||
        stat.size > SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes
      ) {
        throw new Error("release bundle runtime config is unsafe");
      }
      continue;
    }
    if (!stat.isDirectory()) {
      throw new Error(`release bundle has an undeclared root file: ${name}`);
    }
  }
}

async function syncDirectory(path) {
  const handle = await fs.open(path, "r");
  let operationError = null;
  try {
    await handle.sync();
  } catch (error) {
    operationError = error;
  }
  await rethrowAfterPrivateHandleCleanup(operationError, [handle]);
}

async function requireMissingOutput(path) {
  const existing = await fs.lstat(path).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (existing) throw new Error("release bundle output already exists");
}

export async function buildSelfHostReleaseBundle({
  repositoryRoot,
  evidenceDirectory,
  outputDirectory,
  manifestValidator = validateReleaseManifest,
  dependencies = {},
}) {
  const root = resolve(repositoryRoot);
  const evidence = resolve(evidenceDirectory);
  const output = resolve(outputDirectory);
  const parent = dirname(output);
  await requireMissingOutput(output);
  const manifest = manifestValidator(
    await readJson(resolve(evidence, "release-manifest.json")),
  );
  const staging = resolve(
    parent,
    `.${basename(output)}.partial-${randomUUID()}`,
  );
  await fs.mkdir(parent, { recursive: true });
  await fs.mkdir(staging, { mode: 0o755 });
  const budget = {
    consumedBytes: 0,
    maximumBytes: SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumBundleBytes,
  };
  const sync = dependencies.syncDirectory ?? syncDirectory;
  let published = false;
  try {
    for (const file of staticFiles()) {
      const source = resolve(root, ...file.path.split("/"));
      const destination = resolve(staging, ...file.path.split("/"));
      if (file.path === ".env.example") {
        const stat = await fs.lstat(source);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.size > SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes
        ) {
          throw new Error("release environment template is unsafe");
        }
        let template;
        try {
          template = (
            await readRegularFileBounded(source, {
              maximumBytes: SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes,
              expectedSizeBytes: stat.size,
              label: "release environment template",
            })
          ).contents.toString("utf8");
        } catch (error) {
          throw new Error("release environment template is unsafe", {
            cause: error,
          });
        }
        const rendered = renderReleaseEnvironment(template, manifest);
        reserveBundleBytes(
          budget,
          Buffer.byteLength(rendered, "utf8"),
          "rendered release environment template",
        );
        await fs.writeFile(destination, rendered, { mode: 0o644, flag: "wx" });
      } else {
        await copyRegularFile(source, destination, file.mode, budget);
      }
    }
    for (const path of releaseEvidenceFiles(manifest)) {
      await copyRegularFile(
        resolve(evidence, ...path.split("/")),
        resolve(staging, ...path.split("/")),
        "0644",
        budget,
      );
    }
    const serializedBundleManifest = `${JSON.stringify(createReleaseBundleManifest(manifest), null, 2)}\n`;
    reserveBundleBytes(
      budget,
      Buffer.byteLength(serializedBundleManifest, "utf8"),
      "release bundle manifest",
    );
    await fs.writeFile(
      resolve(staging, "bundle-manifest.json"),
      serializedBundleManifest,
      { mode: 0o644, flag: "wx" },
    );
    const expected = [
      ...staticFiles().map((file) => file.path),
      ...releaseEvidenceFiles(manifest),
      "bundle-manifest.json",
    ].sort();
    const tree = await inspectExactBundleTree(staging, expected);
    if (treeBytes(tree) !== budget.consumedBytes) {
      throw new Error(
        "assembled release bundle byte accounting is inconsistent",
      );
    }
    await createChecksums(staging);
    const checksumStat = await fs.lstat(resolve(staging, "checksums.txt"));
    reserveBundleBytes(budget, checksumStat.size, "release bundle checksums");
    await fs.chmod(resolve(staging, "checksums.txt"), 0o644);
    const finalTree = await inspectExactBundleTree(staging, [
      ...expected,
      "checksums.txt",
    ]);
    if (treeBytes(finalTree) !== budget.consumedBytes) {
      throw new Error(
        "assembled release bundle byte accounting is inconsistent",
      );
    }
    await sync(staging);
    await requireMissingOutput(output);
    await fs.rename(staging, output);
    published = true;
    await sync(parent);
    return {
      root: output,
      manifest,
      bundleManifest: createReleaseBundleManifest(manifest),
      checksumsPath: resolve(output, "checksums.txt"),
      signatureBundlePath: resolve(
        output,
        SELF_HOST_RELEASE_BUNDLE_CONTRACT.evidence.signatureBundle,
      ),
    };
  } catch (error) {
    await rethrowAfterPathCleanup(
      error,
      [
        {
          path: published ? output : staging,
          options: { recursive: true, force: true },
        },
      ],
      dependencies,
    );
  }
}

export async function verifySelfHostReleaseBundle(
  directory,
  { verifySignature, releaseVerifier = verifyReleaseEvidenceDirectory } = {},
) {
  const root = resolve(directory);
  const runtimeRoot = await inspectRuntimeRoot(root);
  const [releaseDocument, bundleDocument] = await Promise.all([
    readJsonDocument(resolve(root, "release-manifest.json")),
    readJsonDocument(resolve(root, "bundle-manifest.json")),
  ]);
  const releaseManifest = releaseDocument.value;
  const bundleManifest = bundleDocument.value;
  validateReleaseBundleManifest(bundleManifest, releaseManifest);
  const additionalFiles = [
    ...bundleManifest.staticFiles.map((file) => file.path),
    "bundle-manifest.json",
  ];
  const signedPaths = [
    ...releaseEvidenceFiles(releaseManifest),
    ...additionalFiles,
    bundleManifest.evidence.checksums,
    bundleManifest.evidence.signatureBundle,
  ];
  validateRuntimeRoot(runtimeRoot, signedPaths);
  await verifySignedBundleByteLimits(root, signedPaths);
  const verified = await releaseVerifier(root, {
    verifySignature,
    additionalFiles,
    strictTree: false,
  });
  if (
    verified?.signatureVerified !== true ||
    verified.manifest?.releaseVersion !== bundleManifest.releaseVersion ||
    verified.checksums?.get("release-manifest.json") !==
      releaseDocument.sha256 ||
    verified.checksums?.get("bundle-manifest.json") !== bundleDocument.sha256
  ) {
    throw new Error(
      "self-host release bundle signature did not bind the inspected manifests",
    );
  }
  if (process.platform !== "win32") {
    const expectedModes = new Map(
      bundleManifest.staticFiles.map((file) => [
        file.path,
        Number.parseInt(file.mode, 8),
      ]),
    );
    for (const path of [
      ...releaseEvidenceFiles(releaseManifest),
      "bundle-manifest.json",
      bundleManifest.evidence.checksums,
      bundleManifest.evidence.signatureBundle,
    ]) {
      expectedModes.set(path, 0o644);
    }
    for (const [path, expectedMode] of expectedModes) {
      const stat = await fs.lstat(resolve(root, ...path.split("/")));
      if ((stat.mode & 0o777) !== expectedMode) {
        throw new Error(`release bundle file mode is invalid: ${path}`);
      }
    }
  }
  const environmentRead = await readRegularFileBounded(
    resolve(root, ".env.example"),
    {
      maximumBytes: SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes,
      label: "release bundle environment",
    },
  );
  if (
    verified.checksums.get(".env.example") !==
    createHash("sha256").update(environmentRead.contents).digest("hex")
  ) {
    throw new Error(
      "release bundle environment differs from the signed evidence snapshot",
    );
  }
  const environment = environmentRead.contents.toString("utf8");
  for (const [name, value] of Object.entries({
    SELF_HOST_MIGRATE_IMAGE: releaseManifest.images.migrate.reference,
    SELF_HOST_SERVER_IMAGE: releaseManifest.images.server.reference,
    SELF_HOST_CLIENT_IMAGE: releaseManifest.images.client.reference,
    SELF_HOST_VERSION: releaseManifest.releaseVersion,
  })) {
    if (!environment.split(/\r?\n/).includes(`${name}=${value}`)) {
      throw new Error(`release bundle environment does not bind ${name}`);
    }
  }
  await verifyCurrentSignedBundle(root, signedPaths, verified);
  return {
    root,
    manifest: verified.manifest,
    bundleManifest,
    checksums: new Map(verified.checksums),
    signedArtifactSha256: verified.signedArtifactSha256,
    signatureVerified: true,
  };
}
