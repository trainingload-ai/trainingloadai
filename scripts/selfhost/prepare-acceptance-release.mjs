import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import supplyChainContract from "../../docker/selfhost/supply-chain-contract.json" with { type: "json" };
import {
  assertPortablePathInventory,
  copyRegularFileBounded,
  consumeByteBudget,
  publishRegularFileExclusive,
  readRegularFileBounded,
  rethrowAfterPathCleanup,
  sha256File,
} from "./backup-artifact.mjs";
import {
  SELF_HOST_RELEASE_BUNDLE_LIMITS,
  verifySelfHostReleaseBundle,
} from "./release-bundle.mjs";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const REVISION = /^[a-f0-9]{40}$/;
const SHA256_LINE = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)\r?\n?$/;
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;

function parseArguments(argv) {
  const options = {
    artifactDirectory: null,
    outputDirectory: null,
    version: null,
    revision: null,
    recordPath: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (
      [
        "--artifact-directory",
        "--output-directory",
        "--version",
        "--revision",
        "--record",
      ].includes(argument)
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      index += 1;
      options[
        {
          "--artifact-directory": "artifactDirectory",
          "--output-directory": "outputDirectory",
          "--version": "version",
          "--revision": "revision",
          "--record": "recordPath",
        }[argument]
      ] = value;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!options.artifactDirectory || !options.outputDirectory) {
    throw new Error("artifact and output directories are required");
  }
  if (!SEMVER.test(options.version ?? "")) {
    throw new Error("--version must be an exact semantic version");
  }
  if (!REVISION.test(options.revision ?? "")) {
    throw new Error("--revision must be an exact lowercase 40-character SHA");
  }
  return options;
}

function defaultRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 10 * 60_000,
    windowsHide: true,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null,
  };
}

function runRequired(runner, command, args, cwd) {
  const result = runner(command, args, { cwd });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} failed while preparing the acceptance release (exit ${String(result.status)})`,
      { cause: result.error },
    );
  }
  return result;
}

async function requireRegularFile(path, maximumBytes) {
  const stat = await fs.lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size <= 0 ||
    stat.size > maximumBytes
  ) {
    throw new Error(`acceptance artifact is not a safe regular file: ${path}`);
  }
}

async function snapshotRegularFile(source, destination, maximumBytes) {
  await copyRegularFileBounded(source, destination, {
    maximumBytes,
    minimumBytes: 1,
    mode: 0o600,
    parentMode: 0o700,
    label: "acceptance release snapshot",
  });
}

async function requireMissing(path) {
  try {
    await fs.lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`acceptance release destination already exists: ${path}`);
}

function validateArchiveEntries(output, bundleName) {
  const entries = output.split(/\r?\n/).filter(Boolean);
  if (!entries.length) throw new Error("release archive is empty");
  if (entries.length > 10_000) throw new Error("release archive is oversized");
  const unique = new Set();
  for (const entry of entries) {
    const canonical = entry.replace(/\/+$/, "");
    const segments = canonical.split("/");
    if (
      entry.includes("\\") ||
      entry.startsWith("/") ||
      entry.includes("\0") ||
      segments.some(
        (part) =>
          !/^[A-Za-z0-9._-]+$/.test(part) ||
          part === "." ||
          part === ".." ||
          part.includes(":") ||
          /[. ]$/.test(part) ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      ) ||
      unique.has(canonical) ||
      !(canonical === bundleName || canonical.startsWith(`${bundleName}/`))
    ) {
      throw new Error(`release archive contains an unsafe path: ${entry}`);
    }
    unique.add(canonical);
  }
  return entries;
}

function archiveEntrySize(verboseEntry, path) {
  if (!["-", "d"].includes(verboseEntry[0])) {
    throw new Error(
      "release archive contains links, special files, or an ambiguous inventory",
    );
  }
  if (!verboseEntry.endsWith(` ${path}`)) {
    throw new Error("release archive has an ambiguous verbose inventory");
  }
  const fields = verboseEntry.slice(0, -path.length).trim().split(/\s+/);
  const sizeIndex = fields[1]?.includes("/") ? 2 : 4;
  if (!/^\d+$/.test(fields[sizeIndex] ?? "")) {
    throw new Error("release archive has an unreadable expanded size");
  }
  const size = Number(fields[sizeIndex]);
  if (!Number.isSafeInteger(size)) {
    throw new Error("release archive has an invalid expanded size");
  }
  return size;
}

function validateArchiveTypes(output, paths) {
  const entries = output.split(/\r?\n/).filter(Boolean);
  if (entries.length !== paths.length) {
    throw new Error(
      "release archive contains links, special files, or an ambiguous inventory",
    );
  }
  const budget = {
    consumedBytes: 0,
    maximumBytes: SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumBundleBytes,
  };
  const inventory = [];
  for (let index = 0; index < entries.length; index += 1) {
    const size = archiveEntrySize(entries[index], paths[index]);
    inventory.push({
      path: paths[index].replace(/\/+$/, ""),
      kind: entries[index][0] === "d" ? "directory" : "file",
    });
    if (entries[index][0] === "d") {
      if (size !== 0) {
        throw new Error("release archive directory has an invalid size");
      }
      continue;
    }
    if (size > SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes) {
      throw new Error("release archive file exceeds its expanded size limit");
    }
    try {
      consumeByteBudget(budget, size);
    } catch (error) {
      throw new Error("release archive exceeds its expanded size limit", {
        cause: error,
      });
    }
  }
  assertPortablePathInventory(inventory, "release archive");
  return budget.consumedBytes;
}

export async function prepareAcceptanceRelease(options, dependencies = {}) {
  const runner = dependencies.runner ?? defaultRunner;
  const verifyBundle = dependencies.verifyBundle ?? verifySelfHostReleaseBundle;
  const artifactDirectory = resolve(options.artifactDirectory);
  const outputDirectory = resolve(options.outputDirectory);
  const bundleName = `trainingload-selfhost-${options.version}`;
  const archivePath = resolve(artifactDirectory, `${bundleName}.tar.gz`);
  const checksumPath = `${archivePath}.sha256`;
  const signaturePath = `${checksumPath}.bundle.json`;
  const releaseRoot = resolve(outputDirectory, bundleName);
  const expectedIdentity = `${supplyChainContract.sourceRepository}/${supplyChainContract.workflow}@refs/tags/v${options.version}`;

  await Promise.all([
    requireRegularFile(archivePath, MAX_ARCHIVE_BYTES),
    requireRegularFile(checksumPath, MAX_METADATA_BYTES),
    requireRegularFile(signaturePath, MAX_METADATA_BYTES),
  ]);
  await fs.mkdir(outputDirectory, { recursive: true });
  const outputStat = await fs.lstat(outputDirectory);
  if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) {
    throw new Error("acceptance release output must be a real directory");
  }
  await requireMissing(releaseRoot);
  const staging = await fs.mkdtemp(
    resolve(outputDirectory, ".acceptance-release-"),
  );
  const snapshotDirectory = resolve(staging, "artifact");
  const extractionDirectory = resolve(staging, "extracted");
  const snapshotArchivePath = resolve(snapshotDirectory, basename(archivePath));
  const snapshotChecksumPath = resolve(
    snapshotDirectory,
    basename(checksumPath),
  );
  const snapshotSignaturePath = resolve(
    snapshotDirectory,
    basename(signaturePath),
  );
  const stagedReleaseRoot = resolve(extractionDirectory, bundleName);

  let result;
  let operationError = null;
  try {
    await fs.chmod(staging, 0o700);
    await fs.mkdir(snapshotDirectory, { mode: 0o700 });
    await fs.mkdir(extractionDirectory, { mode: 0o700 });
    for (const [source, destination, maximumBytes] of [
      [archivePath, snapshotArchivePath, MAX_ARCHIVE_BYTES],
      [checksumPath, snapshotChecksumPath, MAX_METADATA_BYTES],
      [signaturePath, snapshotSignaturePath, MAX_METADATA_BYTES],
    ]) {
      await snapshotRegularFile(source, destination, maximumBytes);
    }
    const checksumText = (
      await readRegularFileBounded(snapshotChecksumPath, {
        maximumBytes: MAX_METADATA_BYTES,
        minimumBytes: 1,
        label: "release archive checksum",
      })
    ).contents.toString("utf8");
    const match = checksumText.match(SHA256_LINE);
    if (!match || match[2] !== basename(snapshotArchivePath)) {
      throw new Error("release archive checksum has a non-portable inventory");
    }
    const actualSha256 = await sha256File(snapshotArchivePath);
    if (actualSha256 !== match[1]) {
      throw new Error("release archive checksum does not match its content");
    }
    const [checksumSha256, signatureBundleSha256] = await Promise.all([
      sha256File(snapshotChecksumPath),
      sha256File(snapshotSignaturePath),
    ]);

    runRequired(
      runner,
      "cosign",
      [
        "verify-blob",
        "--bundle",
        snapshotSignaturePath,
        "--certificate-identity",
        expectedIdentity,
        "--certificate-oidc-issuer",
        supplyChainContract.signature.oidcIssuer,
        snapshotChecksumPath,
      ],
      snapshotDirectory,
    );
    const checksumAfterSignature = (
      await readRegularFileBounded(snapshotChecksumPath, {
        maximumBytes: MAX_METADATA_BYTES,
        minimumBytes: 1,
        label: "release archive checksum after signature verification",
      })
    ).contents.toString("utf8");
    if (checksumAfterSignature !== checksumText) {
      throw new Error(
        "release archive checksum payload changed during signature verification",
      );
    }
    if ((await sha256File(snapshotArchivePath)) !== actualSha256) {
      throw new Error("release archive changed during signature verification");
    }
    if ((await sha256File(snapshotSignaturePath)) !== signatureBundleSha256) {
      throw new Error(
        "release archive signature bundle changed during verification",
      );
    }
    const listing = runRequired(
      runner,
      "tar",
      ["-tzf", snapshotArchivePath],
      snapshotDirectory,
    );
    const archiveEntries = validateArchiveEntries(listing.stdout, bundleName);
    const verboseListing = runRequired(
      runner,
      "tar",
      ["-tvzf", snapshotArchivePath],
      snapshotDirectory,
    );
    validateArchiveTypes(verboseListing.stdout, archiveEntries);
    const archiveEntryCount = archiveEntries.length;
    if ((await sha256File(snapshotArchivePath)) !== actualSha256) {
      throw new Error("release archive changed while inspecting it");
    }

    runRequired(
      runner,
      "tar",
      ["-xzf", snapshotArchivePath, "-C", extractionDirectory],
      snapshotDirectory,
    );
    if ((await sha256File(snapshotArchivePath)) !== actualSha256) {
      throw new Error("release archive changed during extraction");
    }
    const verified = await verifyBundle(stagedReleaseRoot, {
      verifySignature: async ({
        checksumsPath,
        bundlePath,
        identity,
        oidcIssuer,
      }) => {
        runRequired(
          runner,
          "cosign",
          [
            "verify-blob",
            "--bundle",
            bundlePath,
            "--certificate-identity",
            identity,
            "--certificate-oidc-issuer",
            oidcIssuer,
            checksumsPath,
          ],
          stagedReleaseRoot,
        );
      },
    });
    if (
      verified.manifest.releaseVersion !== options.version ||
      verified.manifest.source?.revision !== options.revision
    ) {
      throw new Error(
        "release artifact identity does not match requested inputs",
      );
    }
    await requireMissing(releaseRoot);
    await fs.rename(stagedReleaseRoot, releaseRoot);
    result = {
      schemaVersion: 1,
      kind: "trainingload-selfhost-acceptance-release",
      releaseVersion: options.version,
      sourceRevision: options.revision,
      archiveSha256: actualSha256,
      outerArtifactSha256: {
        archive: actualSha256,
        checksum: checksumSha256,
        signatureBundle: signatureBundleSha256,
      },
      archiveEntryCount,
      outerSignatureVerified: true,
      innerSignatureVerified: true,
      releaseRoot,
    };
  } catch (error) {
    operationError = error;
  }
  await rethrowAfterPathCleanup(operationError, [
    {
      path: staging,
      options: { recursive: true, force: true },
    },
  ]);
  return result;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await prepareAcceptanceRelease(options);
  if (options.recordPath) {
    const recordPath = resolve(options.recordPath);
    await fs.mkdir(dirname(recordPath), { recursive: true });
    await publishRegularFileExclusive(
      recordPath,
      `${JSON.stringify(result, null, 2)}\n`,
      { mode: 0o600 },
    );
  }
  process.stdout.write(
    `${JSON.stringify(result, null, options.json ? 2 : 0)}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
