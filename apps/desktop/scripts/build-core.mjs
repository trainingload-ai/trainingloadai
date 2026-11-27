import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { desktop, core, validateCoreSource } from "./core-path.mjs";
import { stageDesktopClientAssets } from "../src/runtime/core-source.mjs";

const before = validateCoreSource();
const build = join(desktop, "build");
const stamp = join(build, "core-build.json");
rmSync(stamp, { force: true });
const run = (args) =>
  execFileSync("pnpm", args, {
    cwd: core,
    stdio: "inherit",
    env: { ...process.env, TRAININGLOAD_DESKTOP_BUILD: "1" },
  });
run(["prisma:generate"]);
run(["build:selfhost"]);
stageDesktopClientAssets(join(core, "apps/client/.next"));
const source = validateCoreSource();
if (before.fingerprint !== source.fingerprint)
  throw new Error("Business sources changed during the build; build again.");
mkdirSync(build, { recursive: true });
writeFileSync(
  stamp,
  JSON.stringify({
    ...source,
    platform: process.platform,
    arch: process.arch,
    builtAt: new Date().toISOString(),
  }) + "\n",
);
