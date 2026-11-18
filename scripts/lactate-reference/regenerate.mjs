import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const commit = "2cd3709f6442447b3b9128e325f13fa38570eb17";
const cache = resolve(
  process.env.LACTATE_REFERENCE_CACHE ?? `${tmpdir()}/lactate-reference-v1`,
);
const archives = [
  {
    name: "lactater.tgz",
    algorithm: "sha256",
    url: `https://codeload.github.com/fmmattioni/lactater/tar.gz/${commit}`,
    checksum:
      "e36a9b40ca1f01cd8e5780d62b5f018ba979ee28b74e8e41d477b079924d3fe2",
    directory: "source",
  },
  {
    name: "webr.tgz",
    algorithm: "sha512",
    url: "https://registry.npmjs.org/webr/-/webr-0.5.4.tgz",
    checksum:
      "7acf2fb029a1ea8eb5beed44cd3d36e06040e6bb9424612c49920ecf3e2edcb5c61fbed08b0f7fc737daf4c4d0211f37a08ea2fd1f9fad27f678fc415fb30343",
    directory: "runtime",
  },
];

await mkdir(cache, { recursive: true });
for (const archive of archives) {
  const path = resolve(cache, archive.name);
  try {
    await access(path);
  } catch {
    const response = await fetch(archive.url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    await writeFile(path, new Uint8Array(await response.arrayBuffer()));
  }
  const digest = createHash(archive.algorithm)
    .update(await readFile(path))
    .digest("hex");
  if (digest !== archive.checksum)
    throw new Error(`Checksum mismatch: ${archive.name}`);
  const directory = resolve(cache, archive.directory);
  await mkdir(directory, { recursive: true });
  execFileSync("tar", ["-xzf", path, "--strip-components=1", "-C", directory]);
}

// The worker receives only the seven original method files and the generator.
// R has an in-memory filesystem; no host filesystem is mounted into WebAssembly.
const { WebR } = createRequire(import.meta.url)(
  resolve(cache, "runtime/dist/webr.cjs"),
);
const webR = new WebR({
  baseUrl: `${resolve(cache, "runtime/dist")}/`,
  repoUrl: "http://127.0.0.1:1/",
  interactive: false,
  REnv: { LACTATER_SOURCE: "/reference" },
});
try {
  await webR.init();
  if ((await webR.evalRString("as.character(getRversion())")) !== "4.5.1")
    throw new Error("Unexpected R version");
  await webR.FS.mkdir("/reference");
  await webR.FS.mkdir("/reference/R");
  for (const name of [
    "fit.R",
    "breakpoints.R",
    "retrieve-values.R",
    "method-obla.R",
    "method-bsln-plus.R",
    "method-loglog.R",
    "method-dmax.R",
  ]) {
    await webR.FS.writeFile(
      `/reference/R/${name}`,
      await readFile(resolve(cache, "source/R", name)),
    );
  }
  await webR.FS.writeFile(
    "/generate.R",
    await readFile(resolve(root, "scripts/lactate-reference/generate.R")),
  );
  const raw = await webR.evalRString(
    'paste(capture.output(source("/generate.R")), collapse="\\n")',
  );
  const fixture = JSON.parse(raw);
  fixture.runtime = {
    name: "webr",
    version: "0.5.4",
    isolation: "WebAssembly worker with an in-memory filesystem",
  };
  const output = `${JSON.stringify(fixture, null, 2)}\n`;
  const destination = resolve(
    root,
    "packages/shared/lactate-analysis/fixtures.json",
  );
  if (process.argv.includes("--check")) {
    if ((await readFile(destination, "utf8")) !== output)
      throw new Error("Reference fixture differs; review before regeneration");
    console.log("Pinned R reference matches the committed fixture");
  } else {
    await writeFile(destination, output);
    console.log(
      `Generated ${fixture.cases.length} reference cases using R ${fixture.rVersion}`,
    );
  }
} finally {
  await webR.close();
}
