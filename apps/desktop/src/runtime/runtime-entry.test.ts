import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { resolveDesktopRuntimeEntries } from "./runtime-entry.js";

test("packaged runtime resolves only bundled entries, including paths with spaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop runtime 测试-"));
  try {
    const server = join(
      root,
      "runtime/server/dist/apps/server/src/main.self-host.js",
    );
    const client = join(root, "runtime/client/apps/client/server.js");
    const database = join(root, "node_modules/@trainingloadai/database");
    const databaseRunner = join(database, "core/runner.mjs");
    for (const path of [server, client, databaseRunner]) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "");
    }
    await writeFile(
      join(database, "package.json"),
      JSON.stringify({
        exports: { "./core-migration-runner": { import: "./core/runner.mjs" } },
      }),
    );
    assert.deepEqual(
      await resolveDesktopRuntimeEntries("/missing-workspace", root),
      { server, client, databaseRunner },
    );
    await rm(server);
    await assert.rejects(
      resolveDesktopRuntimeEntries("/missing-workspace", root),
      (error: { code?: string }) =>
        error.code === "DESKTOP_SERVER_ENTRY_MISSING",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
