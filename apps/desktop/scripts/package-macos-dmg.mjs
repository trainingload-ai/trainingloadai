import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  constants,
  cpSync,
  createReadStream,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin")
  throw new Error("Build the macOS disk image on macOS");
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = resolve(process.argv[2] ?? join(desktop, "build/release"));
const app = join(
  release,
  `mac${process.arch === "arm64" ? "-arm64" : ""}`,
  "Trainingload.ai.app",
);
const resources = join(app, "Contents/Resources/app");
const metadata = JSON.parse(
  readFileSync(join(resources, "package.json"), "utf8"),
);
const runtime = JSON.parse(
  readFileSync(join(resources, "runtime-size.json"), "utf8"),
);
if (runtime.platform !== process.platform || runtime.arch !== process.arch)
  throw new Error(
    "Pack the application for the current platform and architecture first",
  );
const minimum = execFileSync(
  "/usr/libexec/PlistBuddy",
  ["-c", "Print :LSMinimumSystemVersion", join(app, "Contents/Info.plist")],
  { encoding: "utf8" },
)
  .trim()
  .split(".")
  .map(Number);
// ULMO needs macOS 10.15+. Electron 45 already requires macOS 13.
if (minimum[0] < 10 || (minimum[0] === 10 && minimum[1] < 15))
  throw new Error("The application minimum macOS version must support ULMO");

const temporary = mkdtempSync(join(desktop, "build/.dmg-"));
const destination = join(
  release,
  `Trainingload.ai-${metadata.version}-mac-${process.arch}.dmg`,
);
try {
  const contents = join(temporary, "contents");
  mkdirSync(contents);
  cpSync(app, join(contents, "Trainingload.ai.app"), {
    recursive: true,
    verbatimSymlinks: true,
    mode: constants.COPYFILE_FICLONE,
  });
  symlinkSync("/Applications", join(contents, "Applications"), "dir");
  const image = join(temporary, "installer.dmg");
  execFileSync(
    "hdiutil",
    [
      "create",
      "-srcfolder",
      contents,
      "-volname",
      "Trainingload.ai",
      "-fs",
      "HFS+",
      "-format",
      "ULMO",
      image,
    ],
    { stdio: "inherit" },
  );
  execFileSync("hdiutil", ["verify", image], { stdio: "inherit" });
  renameSync(image, destination);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(destination)) hash.update(chunk);
  writeFileSync(
    `${destination}.sha256`,
    `${hash.digest("hex")}  ${destination.split("/").at(-1)}\n`,
  );
  const report = {
    ok: true,
    format: "ULMO",
    bytes: statSync(destination).size,
    runtimeBytes: runtime.bytes,
    file: destination,
  };
  writeFileSync(`${destination}.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
