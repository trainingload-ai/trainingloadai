import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readLegacyCredentials } from "./legacy-credential-migration.js";

test("legacy migration uses the explicit vault path and private IPC without inheriting application secrets", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-legacy IPC 空格-"));
  const name = "TRAININGLOAD_TEST_NOT_FOR_CHILD";
  const original = process.env[name];
  process.env[name] = "synthetic-parent-only-marker";
  try {
    const reader = join(root, "reader.cjs");
    const vaultPath = join(root, "data/vault.json");
    await writeFile(
      reader,
      `
      const expected = ${JSON.stringify(`--trainingload-legacy-vault=${vaultPath}`)};
      if (process.env.${name} || !process.argv.includes(expected)) process.exit(1);
      process.send({type:'credentials',authSecret:'synthetic-auth',integrationSecret:'synthetic-integration'}, () => process.exit(0));
    `,
    );
    assert.deepEqual(
      await readLegacyCredentials(process.execPath, reader, vaultPath),
      {
        authSecret: "synthetic-auth",
        integrationSecret: "synthetic-integration",
      },
    );
    await assert.rejects(
      readLegacyCredentials("relative-electron", reader, vaultPath),
      /absolute/,
    );
    await assert.rejects(
      readLegacyCredentials(process.execPath, reader, "relative-vault"),
      /absolute/,
    );
  } finally {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
    await rm(root, { recursive: true, force: true });
  }
});
