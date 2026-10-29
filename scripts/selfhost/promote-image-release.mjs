import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { readRegularFileBounded } from "./backup-artifact.mjs";
import { validateReleaseManifest } from "./release-artifact.mjs";

const MAXIMUM_RELEASE_MANIFEST_BYTES = 32 * 1024 * 1024;

export function validatePromotionState(manifest, existingDigests) {
  const operations = [];
  for (const [role, image] of Object.entries(manifest.images ?? {})) {
    if (!/^sha256:[a-f0-9]{64}$/.test(image.digest)) {
      throw new Error(`${role} has an invalid digest`);
    }
    for (const tag of image.tags ?? []) {
      const reference = `${image.repository}:${tag}`;
      const existing = existingDigests[reference] ?? null;
      if (existing && existing !== image.digest) {
        throw new Error(
          `refusing to overwrite ${reference}: ${existing} != ${image.digest}`,
        );
      }
      if (!existing)
        operations.push({ role, reference, source: image.reference });
    }
  }
  return operations;
}

function inspectDigest(reference) {
  const result = spawnSync(
    "docker",
    [
      "buildx",
      "imagetools",
      "inspect",
      reference,
      "--format",
      "{{json .Manifest.Digest}}",
    ],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status === 0) {
    const digest = JSON.parse(result.stdout.trim());
    if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
      throw new Error(
        `registry returned an invalid digest for ${reference}: ${digest}`,
      );
    }
    return digest;
  }
  const error = `${result.stderr}\n${result.stdout}`;
  if (/not found|manifest unknown|no such manifest/i.test(error)) return null;
  throw new Error(`unable to inspect ${reference}: ${error.trim()}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}`,
    );
  }
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath || process.argv.length !== 3) {
    throw new Error("usage: promote-image-release.mjs <release-manifest.json>");
  }
  const { contents } = await readRegularFileBounded(manifestPath, {
    maximumBytes: MAXIMUM_RELEASE_MANIFEST_BYTES,
    minimumBytes: 1,
    label: "image promotion release manifest",
  });
  const manifest = validateReleaseManifest(
    JSON.parse(contents.toString("utf8")),
  );
  const existingDigests = {};
  for (const image of Object.values(manifest.images ?? {})) {
    for (const tag of image.tags ?? []) {
      const reference = `${image.repository}:${tag}`;
      existingDigests[reference] = inspectDigest(reference);
    }
  }
  const operations = validatePromotionState(manifest, existingDigests);
  for (const operation of operations) {
    run("docker", [
      "buildx",
      "imagetools",
      "create",
      "--tag",
      operation.reference,
      operation.source,
    ]);
  }
  for (const image of Object.values(manifest.images)) {
    for (const tag of image.tags) {
      const reference = `${image.repository}:${tag}`;
      const actual = inspectDigest(reference);
      if (actual !== image.digest) {
        throw new Error(
          `promotion verification failed for ${reference}: ${actual}`,
        );
      }
    }
  }
  process.stdout.write(
    `image promotion: PASS (${operations.length} new tags)\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
