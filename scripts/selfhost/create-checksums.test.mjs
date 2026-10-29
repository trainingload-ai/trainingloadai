import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createChecksums } from "./create-checksums.mjs";

test("writes deterministic checksums for nested release evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "selfhost-checksums-"));
  try {
    await mkdir(join(directory, "nested"));
    await writeFile(join(directory, "z.json"), "z\n");
    await writeFile(join(directory, "nested", "a.json"), "a\n");
    const lines = await createChecksums(directory);
    assert.deepEqual(
      lines.map((line) => line.split("  ")[1]),
      ["nested/a.json", "z.json"],
    );
    assert.equal(
      await readFile(join(directory, "checksums.txt"), "utf8"),
      `${lines.join("\n")}\n`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses symlinks in release evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "selfhost-checksums-"));
  try {
    await writeFile(join(directory, "target"), "data");
    await symlink("target", join(directory, "link"));
    await assert.rejects(() => createChecksums(directory), /symlink/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
