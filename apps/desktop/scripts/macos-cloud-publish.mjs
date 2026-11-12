import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertMacCloudContext } from "./macos-ci-credentials.mjs";

assertMacCloudContext();
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(desktop, "build/release-signed");
const directories = existsSync(root)
  ? readdirSync(root).filter((name) =>
      existsSync(join(root, name, "release.json")),
    )
  : [];
if (directories.length !== 1)
  throw new Error(
    "Require exactly one verified signed release from this fresh runner",
  );
const directory = realpathSync(join(root, directories[0]));
const reportFile = join(directory, "release.json");
const report = JSON.parse(readFileSync(reportFile, "utf8"));
if (
  report.ok !== true ||
  report.signed !== true ||
  report.notarized !== true ||
  report.sourceCommit !== process.env.GITHUB_SHA ||
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(report.version) ||
  report.arch !== "arm64" ||
  report.artifacts?.length !== 2
)
  throw new Error(
    "Release evidence does not match this exact public source commit",
  );
const files = [];
for (const artifact of report.artifacts) {
  if (
    artifact.file !== basename(artifact.file) ||
    !/\.(dmg|zip)$/.test(artifact.file)
  )
    throw new Error("Unexpected release asset path");
  const file = join(directory, artifact.file);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest("hex") !== artifact.sha256)
    throw new Error("Release asset checksum mismatch");
  files.push(file, `${file}.sha256`);
}
const tag = `desktop-v${report.version}`;
const repository = process.env.GITHUB_REPOSITORY;
const existing = JSON.parse(
  execFileSync("gh", ["api", `repos/${repository}/releases?per_page=100`], {
    encoding: "utf8",
  }),
);
if (existing.some((release) => release.tag_name === tag))
  throw new Error(
    `Release ${tag} already exists; existing releases are never overwritten`,
  );
const notes = join(process.env.RUNNER_TEMP, "desktop-release-notes.md");
writeFileSync(
  notes,
  `macOS arm64 Developer ID signed and notarized installers.\n\nSource: ${process.env.GITHUB_SHA}\nBuild: ${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}\n\nDMG and ZIP checksums are computed after stapling. This is a draft; publication remains a maintainer action.\n`,
);
execFileSync(
  "gh",
  [
    "release",
    "create",
    tag,
    "--repo",
    repository,
    "--target",
    process.env.GITHUB_SHA,
    "--draft",
    "--title",
    `Trainingload.ai Desktop ${report.version} · macOS arm64`,
    "--notes-file",
    notes,
    ...files,
    reportFile,
    join(directory, "notarization.json"),
  ],
  { stdio: "inherit" },
);
