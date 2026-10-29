#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSelfHostReleaseBundle } from "./release-bundle.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2) {
    throw new Error(
      "usage: build-selfhost-release.mjs <image-evidence-directory> <output-directory>",
    );
  }
  const result = await buildSelfHostReleaseBundle({
    repositoryRoot,
    evidenceDirectory: resolve(argv[0]),
    outputDirectory: resolve(argv[1]),
  });
  process.stdout.write(
    `self-host release bundle: BUILT ${result.bundleManifest.releaseVersion} -> ${result.root}\n`,
  );
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
