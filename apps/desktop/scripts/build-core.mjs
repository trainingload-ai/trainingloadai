import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { desktop, core, validateCoreSource } from "./core-path.mjs";

const before = validateCoreSource();
const run = (args) =>
  execFileSync("pnpm", args, { cwd: core, stdio: "inherit" });
run(["prisma:generate"]);
run(["build:selfhost"]);
const source = validateCoreSource();
if (before.fingerprint !== source.fingerprint)
  throw new Error("Business sources changed during the build; build again.");
mkdirSync(join(desktop, "build"), { recursive: true });
writeFileSync(
  join(desktop, "build/core-build.json"),
  JSON.stringify({
    ...source,
    platform: process.platform,
    arch: process.arch,
    builtAt: new Date().toISOString(),
  }) + "\n",
);
