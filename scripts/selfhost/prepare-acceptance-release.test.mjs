import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  promises as fs,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import { prepareAcceptanceRelease } from "./prepare-acceptance-release.mjs";
import { SELF_HOST_RELEASE_BUNDLE_LIMITS } from "./release-bundle.mjs";

const workspaces = [];
const version = "1.2.3";
const revision = "a".repeat(40);

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((path) => fs.rm(path, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), "selfhost-acceptance-prepare-"));
  workspaces.push(root);
  const artifactDirectory = resolve(root, "artifact");
  const sourceDirectory = resolve(root, "source");
  const bundleName = `trainingload-selfhost-${version}`;
  await fs.mkdir(resolve(sourceDirectory, bundleName), { recursive: true });
  await fs.writeFile(
    resolve(sourceDirectory, bundleName, "payload.txt"),
    "release\n",
  );
  await fs.mkdir(artifactDirectory);
  const archivePath = resolve(artifactDirectory, `${bundleName}.tar.gz`);
  const tar = spawnSync(
    "tar",
    ["-czf", archivePath, "-C", sourceDirectory, bundleName],
    { encoding: "utf8" },
  );
  assert.equal(tar.status, 0, tar.stderr);
  const content = await fs.readFile(archivePath);
  const checksum = createHash("sha256").update(content).digest("hex");
  await fs.writeFile(
    `${archivePath}.sha256`,
    `${checksum}  ${bundleName}.tar.gz\n`,
  );
  await fs.writeFile(`${archivePath}.sha256.bundle.json`, "{}\n");
  return {
    root,
    sourceDirectory,
    bundleName,
    artifactDirectory,
    outputDirectory: resolve(root, "output"),
    archivePath,
  };
}

function runnerWithRealTar(calls) {
  return (command, args, options) => {
    calls.push({ command, args });
    if (command === "cosign") {
      return { status: 0, stdout: "verified\n", stderr: "", error: null };
    }
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      error: result.error ?? null,
    };
  };
}

test("verifies the outer archive before extraction and binds the inner release", async () => {
  const value = await fixture();
  const calls = [];
  const result = await prepareAcceptanceRelease(
    {
      artifactDirectory: value.artifactDirectory,
      outputDirectory: value.outputDirectory,
      version,
      revision,
    },
    {
      runner: runnerWithRealTar(calls),
      verifyBundle: async (releaseRoot, { verifySignature }) => {
        await verifySignature({
          checksumsPath: resolve(releaseRoot, "checksums.txt"),
          bundlePath: resolve(releaseRoot, "checksums.bundle.json"),
          identity: "expected-inner-identity",
          oidcIssuer: "expected-inner-issuer",
        });
        return {
          manifest: { releaseVersion: version, source: { revision } },
        };
      },
    },
  );
  assert.equal(result.outerSignatureVerified, true);
  assert.equal(result.innerSignatureVerified, true);
  assert.equal(result.outerArtifactSha256.archive, result.archiveSha256);
  assert.equal(
    result.outerArtifactSha256.checksum,
    createHash("sha256")
      .update(await fs.readFile(`${value.archivePath}.sha256`))
      .digest("hex"),
  );
  assert.equal(
    result.outerArtifactSha256.signatureBundle,
    createHash("sha256")
      .update(await fs.readFile(`${value.archivePath}.sha256.bundle.json`))
      .digest("hex"),
  );
  assert.equal(
    await fs.readFile(resolve(result.releaseRoot, "payload.txt"), "utf8"),
    "release\n",
  );
  assert.equal(calls[0].command, "cosign");
  assert.equal(calls[1].command, "tar");
  assert.equal(calls[2].command, "tar");
  assert.equal(calls[3].command, "tar");
  assert.equal(calls[4].command, "cosign");
});

test("extracts the authenticated snapshot when the source artifact is replaced", async () => {
  const value = await fixture();
  const calls = [];
  let outerSignatureVerified = false;
  const runner = (command, args, options) => {
    calls.push({ command, args });
    if (command === "cosign") {
      if (!outerSignatureVerified) {
        outerSignatureVerified = true;
        renameSync(value.archivePath, `${value.archivePath}.replaced`);
        writeFileSync(value.archivePath, "untrusted replacement\n");
      }
      return { status: 0, stdout: "verified\n", stderr: "", error: null };
    }
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      error: result.error ?? null,
    };
  };

  const result = await prepareAcceptanceRelease(
    {
      artifactDirectory: value.artifactDirectory,
      outputDirectory: value.outputDirectory,
      version,
      revision,
    },
    {
      runner,
      verifyBundle: async () => ({
        manifest: { releaseVersion: version, source: { revision } },
      }),
    },
  );

  assert.equal(
    await fs.readFile(resolve(result.releaseRoot, "payload.txt"), "utf8"),
    "release\n",
  );
  assert.equal(
    calls
      .filter(({ command }) => command === "tar")
      .every(({ args }) => !args.includes(value.archivePath)),
    true,
  );
  assert.deepEqual(await fs.readdir(value.outputDirectory), [value.bundleName]);
});

test("rejects an archive and checksum replaced during outer signature verification", async () => {
  const value = await fixture();
  const replacementSource = resolve(value.root, "replacement-source");
  const replacementArchive = resolve(value.root, "replacement.tar.gz");
  await fs.mkdir(resolve(replacementSource, value.bundleName), {
    recursive: true,
  });
  await fs.writeFile(
    resolve(replacementSource, value.bundleName, "payload.txt"),
    "replacement\n",
  );
  const tar = spawnSync(
    "tar",
    ["-czf", replacementArchive, "-C", replacementSource, value.bundleName],
    { encoding: "utf8" },
  );
  assert.equal(tar.status, 0, tar.stderr);
  const replacementContents = await fs.readFile(replacementArchive);
  const replacementSha256 = createHash("sha256")
    .update(replacementContents)
    .digest("hex");
  const calls = [];
  const runner = (command, args, options) => {
    calls.push({ command, args });
    if (command === "cosign") {
      const checksumPath = args.at(-1);
      const archivePath = checksumPath.slice(0, -".sha256".length);
      writeFileSync(archivePath, replacementContents);
      writeFileSync(
        checksumPath,
        `${replacementSha256}  ${value.bundleName}.tar.gz\n`,
      );
      return { status: 0, stdout: "verified\n", stderr: "", error: null };
    }
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      error: result.error ?? null,
    };
  };

  await assert.rejects(
    prepareAcceptanceRelease(
      {
        artifactDirectory: value.artifactDirectory,
        outputDirectory: value.outputDirectory,
        version,
        revision,
      },
      { runner },
    ),
    /checksum payload changed during signature verification/,
  );
  assert.equal(
    calls.some(({ command }) => command === "tar"),
    false,
  );
});

test("rejects an archive replaced during tar inspection before extraction", async () => {
  const value = await fixture();
  const replacementSource = resolve(value.root, "inspection-replacement");
  const replacementArchive = resolve(value.root, "inspection-replacement.tgz");
  await fs.mkdir(resolve(replacementSource, value.bundleName), {
    recursive: true,
  });
  await fs.writeFile(
    resolve(replacementSource, value.bundleName, "payload.txt"),
    "replacement\n",
  );
  const replacementTar = spawnSync(
    "tar",
    ["-czf", replacementArchive, "-C", replacementSource, value.bundleName],
    { encoding: "utf8" },
  );
  assert.equal(replacementTar.status, 0, replacementTar.stderr);
  const replacementContents = await fs.readFile(replacementArchive);
  const calls = [];
  const runner = (command, args, options) => {
    calls.push({ command, args });
    if (command === "cosign") {
      return { status: 0, stdout: "verified\n", stderr: "", error: null };
    }
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
    });
    if (command === "tar" && args.includes("-tzf")) {
      writeFileSync(args[1], replacementContents);
    }
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      error: result.error ?? null,
    };
  };

  await assert.rejects(
    prepareAcceptanceRelease(
      {
        artifactDirectory: value.artifactDirectory,
        outputDirectory: value.outputDirectory,
        version,
        revision,
      },
      {
        runner,
        verifyBundle: async () => ({
          manifest: { releaseVersion: version, source: { revision } },
        }),
      },
    ),
    /release archive changed while inspecting it/,
  );
  assert.equal(
    calls.some(
      ({ command, args }) => command === "tar" && args.includes("-xzf"),
    ),
    false,
  );
});

test("rejects an archive changed while tar extracts it", async () => {
  const value = await fixture();
  let verifyBundleCalled = false;
  const runner = (command, args, options) => {
    if (command === "cosign") {
      return { status: 0, stdout: "verified\n", stderr: "", error: null };
    }
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
    });
    if (command === "tar" && args.includes("-xzf")) {
      appendFileSync(args[1], "drift");
    }
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      error: result.error ?? null,
    };
  };

  await assert.rejects(
    prepareAcceptanceRelease(
      {
        artifactDirectory: value.artifactDirectory,
        outputDirectory: value.outputDirectory,
        version,
        revision,
      },
      {
        runner,
        verifyBundle: async () => {
          verifyBundleCalled = true;
          return {
            manifest: { releaseVersion: version, source: { revision } },
          };
        },
      },
    ),
    /release archive changed during extraction/,
  );
  assert.equal(verifyBundleCalled, false);
  assert.deepEqual(await fs.readdir(value.outputDirectory), []);
});

test("does not overwrite or remove a destination created before publication", async () => {
  const value = await fixture();
  const destination = resolve(value.outputDirectory, value.bundleName);
  await assert.rejects(
    prepareAcceptanceRelease(
      {
        artifactDirectory: value.artifactDirectory,
        outputDirectory: value.outputDirectory,
        version,
        revision,
      },
      {
        runner: runnerWithRealTar([]),
        verifyBundle: async () => {
          await fs.mkdir(destination);
          await fs.writeFile(resolve(destination, "owner.txt"), "external\n");
          return {
            manifest: { releaseVersion: version, source: { revision } },
          };
        },
      },
    ),
    /destination already exists/,
  );
  assert.equal(
    await fs.readFile(resolve(destination, "owner.txt"), "utf8"),
    "external\n",
  );
  assert.deepEqual(await fs.readdir(value.outputDirectory), [value.bundleName]);
});

test("rejects archive links before extraction", async () => {
  const value = await fixture();
  await fs.symlink(
    "../../outside",
    resolve(value.sourceDirectory, value.bundleName, "unsafe-link"),
  );
  await fs.rm(value.archivePath);
  const tar = spawnSync(
    "tar",
    ["-czf", value.archivePath, "-C", value.sourceDirectory, value.bundleName],
    { encoding: "utf8" },
  );
  assert.equal(tar.status, 0, tar.stderr);
  const content = await fs.readFile(value.archivePath);
  const checksum = createHash("sha256").update(content).digest("hex");
  await fs.writeFile(
    `${value.archivePath}.sha256`,
    `${checksum}  ${value.bundleName}.tar.gz\n`,
  );
  const calls = [];
  await assert.rejects(
    prepareAcceptanceRelease(
      {
        artifactDirectory: value.artifactDirectory,
        outputDirectory: value.outputDirectory,
        version,
        revision,
      },
      { runner: runnerWithRealTar(calls) },
    ),
    /links, special files, or an ambiguous inventory/,
  );
  assert.equal(
    calls.some(
      ({ command, args }) => command === "tar" && args.includes("-xzf"),
    ),
    false,
  );
});

test("rejects a dot-segment path under the expected archive prefix", async () => {
  const value = await fixture();
  const calls = [];
  const runner = (command, args) => {
    calls.push({ command, args });
    if (command === "cosign") {
      return { status: 0, stdout: "verified\n", stderr: "", error: null };
    }
    if (command === "tar" && args.includes("-tzf")) {
      return {
        status: 0,
        stdout: `${value.bundleName}/\n${value.bundleName}/../escaped\n`,
        stderr: "",
        error: null,
      };
    }
    throw new Error("archive extraction must not be reached");
  };
  await assert.rejects(
    prepareAcceptanceRelease(
      {
        artifactDirectory: value.artifactDirectory,
        outputDirectory: value.outputDirectory,
        version,
        revision,
      },
      { runner },
    ),
    /unsafe path/,
  );
  assert.equal(
    calls.some(
      ({ command, args }) => command === "tar" && args.includes("-xzf"),
    ),
    false,
  );

  const collisionValue = await fixture();
  const collisionCalls = [];
  const collisionRunner = (command, args) => {
    collisionCalls.push({ command, args });
    if (command === "cosign") {
      return { status: 0, stdout: "verified\n", stderr: "", error: null };
    }
    if (command === "tar" && args.includes("-tzf")) {
      return {
        status: 0,
        stdout: [
          `${collisionValue.bundleName}/`,
          `${collisionValue.bundleName}/Config.json`,
          `${collisionValue.bundleName}/config.json`,
          "",
        ].join("\n"),
        stderr: "",
        error: null,
      };
    }
    if (command === "tar" && args.includes("-tvzf")) {
      return {
        status: 0,
        stdout: [
          `drwxr-xr-x 0/0 0 2026-10-18 00:00 ${collisionValue.bundleName}/`,
          `-rw-r--r-- 0/0 1 2026-10-18 00:00 ${collisionValue.bundleName}/Config.json`,
          `-rw-r--r-- 0/0 1 2026-10-18 00:00 ${collisionValue.bundleName}/config.json`,
          "",
        ].join("\n"),
        stderr: "",
        error: null,
      };
    }
    throw new Error("archive extraction must not be reached");
  };
  await assert.rejects(
    prepareAcceptanceRelease(
      {
        artifactDirectory: collisionValue.artifactDirectory,
        outputDirectory: collisionValue.outputDirectory,
        version,
        revision,
      },
      { runner: collisionRunner },
    ),
    /path collision/,
  );
  assert.equal(
    collisionCalls.some(
      ({ command, args }) => command === "tar" && args.includes("-xzf"),
    ),
    false,
  );
});

test("rejects an oversized expanded file before extraction", async () => {
  const value = await fixture();
  const calls = [];
  const runner = (command, args) => {
    calls.push({ command, args });
    if (command === "cosign") {
      return { status: 0, stdout: "verified\n", stderr: "", error: null };
    }
    if (command === "tar" && args.includes("-tzf")) {
      return {
        status: 0,
        stdout: `${value.bundleName}/\n${value.bundleName}/payload.txt\n`,
        stderr: "",
        error: null,
      };
    }
    if (command === "tar" && args.includes("-tvzf")) {
      return {
        status: 0,
        stdout: [
          `drwxr-xr-x 0/0 0 2026-10-18 00:00 ${value.bundleName}/`,
          `-rw-r--r-- 0/0 ${SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes + 1} 2026-10-18 00:00 ${value.bundleName}/payload.txt`,
          "",
        ].join("\n"),
        stderr: "",
        error: null,
      };
    }
    throw new Error("archive extraction must not be reached");
  };
  await assert.rejects(
    prepareAcceptanceRelease(
      {
        artifactDirectory: value.artifactDirectory,
        outputDirectory: value.outputDirectory,
        version,
        revision,
      },
      { runner },
    ),
    /file exceeds its expanded size limit/,
  );
  assert.equal(
    calls.some(
      ({ command, args }) => command === "tar" && args.includes("-xzf"),
    ),
    false,
  );
});

test("rejects an oversized cumulative expansion before extraction", async () => {
  const value = await fixture();
  const paths = Array.from(
    { length: 17 },
    (_, index) => `${value.bundleName}/payload-${index}.txt`,
  );
  const calls = [];
  const runner = (command, args) => {
    calls.push({ command, args });
    if (command === "cosign") {
      return { status: 0, stdout: "verified\n", stderr: "", error: null };
    }
    if (command === "tar" && args.includes("-tzf")) {
      return {
        status: 0,
        stdout: [`${value.bundleName}/`, ...paths, ""].join("\n"),
        stderr: "",
        error: null,
      };
    }
    if (command === "tar" && args.includes("-tvzf")) {
      return {
        status: 0,
        stdout: [
          `drwxr-xr-x 0/0 0 2026-10-18 00:00 ${value.bundleName}/`,
          ...paths.map(
            (path) =>
              `-rw-r--r-- 0/0 ${SELF_HOST_RELEASE_BUNDLE_LIMITS.maximumFileBytes} 2026-10-18 00:00 ${path}`,
          ),
          "",
        ].join("\n"),
        stderr: "",
        error: null,
      };
    }
    throw new Error("archive extraction must not be reached");
  };
  await assert.rejects(
    prepareAcceptanceRelease(
      {
        artifactDirectory: value.artifactDirectory,
        outputDirectory: value.outputDirectory,
        version,
        revision,
      },
      { runner },
    ),
    /archive exceeds its expanded size limit/,
  );
  assert.equal(
    calls.some(
      ({ command, args }) => command === "tar" && args.includes("-xzf"),
    ),
    false,
  );
});

test("rejects archive tampering before signature verification or extraction", async () => {
  const value = await fixture();
  await fs.appendFile(value.archivePath, "tamper");
  let calls = 0;
  await assert.rejects(
    prepareAcceptanceRelease(
      {
        artifactDirectory: value.artifactDirectory,
        outputDirectory: value.outputDirectory,
        version,
        revision,
      },
      { runner: () => (calls += 1) },
    ),
    /checksum does not match/,
  );
  assert.equal(calls, 0);
});

test("rejects a release identity mismatch and removes the extracted tree", async () => {
  const value = await fixture();
  await assert.rejects(
    prepareAcceptanceRelease(
      {
        artifactDirectory: value.artifactDirectory,
        outputDirectory: value.outputDirectory,
        version,
        revision,
      },
      {
        runner: runnerWithRealTar([]),
        verifyBundle: async () => ({
          manifest: {
            releaseVersion: version,
            source: { revision: "b".repeat(40) },
          },
        }),
      },
    ),
    /identity does not match/,
  );
  await assert.rejects(
    fs.lstat(
      resolve(value.outputDirectory, `trainingload-selfhost-${version}`),
    ),
    { code: "ENOENT" },
  );
  assert.deepEqual(await fs.readdir(value.outputDirectory), []);
});
