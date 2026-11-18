import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkMacSigning, notaryArguments } from "./macos-signing.mjs";
import { runtimeSourceCommit } from "../src/runtime/core-source.mjs";
import { runMacStapler } from "./macos-ticket.mjs";
import { checkMacCredentialAccess } from "./macos-credential-check.mjs";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const signing = checkMacSigning();
const environment = {
  ...process.env,
  TRAININGLOAD_MAC_SIGNING_IDENTITY: signing.identity,
};
// Only public identity metadata goes to the builder. Key material stays in
// Keychain; there is no certificate export or plaintext password parameter.
const run = (command, args, capture = false) =>
  execFileSync(command, args, {
    cwd: desktop,
    env: environment,
    stdio: capture ? "pipe" : "inherit",
    encoding: capture ? "utf8" : undefined,
    maxBuffer: 16 * 1024 * 1024,
  });
const step = (name) => console.log(JSON.stringify({ step: name }));
const version = JSON.parse(
  readFileSync(join(desktop, "package.json"), "utf8"),
).version;
mkdirSync(join(desktop, "build"), { recursive: true });
const staging = mkdtempSync(join(desktop, "build/.signed-macos-"));
const submissions = [];

function notarize(file, label) {
  step(`notarize ${label}`);
  const result = JSON.parse(
    run(
      "xcrun",
      [
        "notarytool",
        "submit",
        file,
        ...notaryArguments(signing),
        "--output-format",
        "json",
      ],
      true,
    ),
  );
  const submission = { artifact: label, id: result.id, status: "Submitted" };
  submissions.push(submission);
  writeFileSync(
    join(staging, "notarization.json"),
    JSON.stringify(submissions, null, 2) + "\n",
  );
  // Persist the submission ID before waiting, including on runner timeout.
  step(`Apple submission ${result.id}`);
  const completed = JSON.parse(
    run(
      "xcrun",
      [
        "notarytool",
        "wait",
        result.id,
        ...notaryArguments(signing),
        "--timeout",
        "30m",
        "--output-format",
        "json",
      ],
      true,
    ),
  );
  submission.status = completed.status;
  writeFileSync(
    join(staging, "notarization.json"),
    JSON.stringify(submissions, null, 2) + "\n",
  );
  if (completed.status !== "Accepted")
    throw new Error(
      `Apple notarization ${completed.status}; submission ${result.id}. See ${join(staging, "notarization.json")}`,
    );
}

async function checksum(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  writeFileSync(file + ".sha256", `${sha256}  ${file.split("/").at(-1)}\n`);
  return { file: file.split("/").at(-1), bytes: statSync(file).size, sha256 };
}

try {
  step("prepare and smoke-test runtime");
  run("pnpm", ["run", "runtime:prepare"]);
  // Reject missing or stale provenance before signing or Apple submissions.
  const sourceCommit = runtimeSourceCommit(
    JSON.parse(
      readFileSync(join(desktop, "build/app/runtime-size.json"), "utf8"),
    ),
    environment.GITHUB_ACTIONS === "true"
      ? (environment.GITHUB_SHA ?? "")
      : undefined,
  );
  run("pnpm", ["run", "runtime:smoke"]);
  step("sign application");
  run("pnpm", [
    "exec",
    "electron-builder",
    "--config",
    "electron-builder.macos-signed.config.cjs",
    `--config.directories.output=${staging}`,
    "--dir",
    "--publish",
    "never",
  ]);
  const app = join(
    staging,
    `mac${process.arch === "arm64" ? "-arm64" : ""}`,
    "Trainingload.ai.app",
  );
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  step("verify signed Keychain access without user interaction");
  const credentials = await checkMacCredentialAccess(app, signing);
  const submissionZip = join(staging, "application-for-notarization.zip");
  run("ditto", [
    "-c",
    "-k",
    "--sequesterRsrc",
    "--keepParent",
    app,
    submissionZip,
  ]);
  notarize(submissionZip, "application");
  await runMacStapler("staple", app);
  await runMacStapler("validate", app);
  run("spctl", ["--assess", "--type", "execute", "--verbose=2", app]);
  rmSync(submissionZip);
  step("create compressed DMG and ZIP");
  run(process.execPath, ["scripts/package-macos-dmg.mjs", staging]);
  const prefix = `Trainingload.ai-${version}-mac-${process.arch}`;
  const dmg = join(staging, `${prefix}.dmg`);
  const zip = join(staging, `${prefix}.zip`);
  run("codesign", [
    "--force",
    "--sign",
    signing.identity,
    "--keychain",
    signing.keychain,
    "--timestamp",
    dmg,
  ]);
  notarize(dmg, "dmg");
  await runMacStapler("staple", dmg);
  await runMacStapler("validate", dmg);
  run("hdiutil", ["verify", dmg]);
  run("spctl", [
    "--assess",
    "--type",
    "open",
    "--context",
    "context:primary-signature",
    "--verbose=2",
    dmg,
  ]);
  run("ditto", [
    "-c",
    "-k",
    "--sequesterRsrc",
    "--keepParent",
    "--zlibCompressionLevel",
    "9",
    app,
    zip,
  ]);
  run("unzip", ["-tq", zip]);
  step("verify distributed application copies");
  const mounted = join(staging, "verification-mount");
  const extracted = join(staging, "verification-zip");
  mkdirSync(mounted);
  let attached = false;
  try {
    run("hdiutil", [
      "attach",
      "-readonly",
      "-nobrowse",
      "-mountpoint",
      mounted,
      dmg,
    ]);
    attached = true;
    run("codesign", [
      "--verify",
      "--deep",
      "--strict",
      join(mounted, "Trainingload.ai.app"),
    ]);
    await runMacStapler("validate", join(mounted, "Trainingload.ai.app"));
  } finally {
    if (attached) run("hdiutil", ["detach", mounted]);
  }
  run("ditto", ["-x", "-k", zip, extracted]);
  run("codesign", [
    "--verify",
    "--deep",
    "--strict",
    join(extracted, "Trainingload.ai.app"),
  ]);
  await runMacStapler("validate", join(extracted, "Trainingload.ai.app"));
  rmSync(mounted, { recursive: true });
  rmSync(extracted, { recursive: true });
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  // Hash after stapling: stapling changes the distributed disk image bytes.
  const artifacts = [await checksum(dmg), await checksum(zip)];
  const dmgReport = JSON.parse(readFileSync(dmg + ".json", "utf8"));
  const output = join(
    desktop,
    "build/release-signed",
    new Date().toISOString().replaceAll(/[:.]/g, "-"),
  );
  writeFileSync(
    dmg + ".json",
    JSON.stringify(
      {
        ...dmgReport,
        file: join(output, `${prefix}.dmg`),
        bytes: artifacts[0].bytes,
        sha256: artifacts[0].sha256,
        signed: true,
        notarized: true,
      },
      null,
      2,
    ) + "\n",
  );
  const report = {
    ok: true,
    version,
    sourceCommit: runtimeSourceCommit(
      JSON.parse(
        readFileSync(
          join(app, "Contents/Resources/app/runtime-size.json"),
          "utf8",
        ),
      ),
      sourceCommit,
    ),
    platform: "darwin",
    arch: process.arch,
    teamId: signing.teamId,
    signed: true,
    notarized: true,
    credentials,
    submissions,
    artifacts,
    directory: output,
  };
  writeFileSync(
    join(staging, "release.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  mkdirSync(dirname(output), { recursive: true });
  renameSync(staging, output);
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(
    `DESKTOP_MAC_RELEASE_FAILED: ${error.message}\nRetained build evidence: ${staging}`,
  );
  process.exitCode = 1;
}
