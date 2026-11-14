import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const server = fileURLToPath(new URL("../apps/server/", import.meta.url));
const require = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
);
// PGlite's Emscripten runtime uses dynamic import inside Jest's VM. Keep that
// runtime flag confined to this database suite rather than changing all tests.
const result = spawnSync(
  process.execPath,
  [
    "--experimental-vm-modules",
    require.resolve("jest/bin/jest"),
    "--config",
    "jest.core.config.cjs",
    "--runInBand",
    "--no-watchman",
    "--testMatch",
    "**/*.database-spec.ts",
    "--runTestsByPath",
    "src/athlete-state/updates/spec/athlete-state-update-queue.database-spec.ts",
  ],
  { cwd: server, stdio: "inherit", env: process.env },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
