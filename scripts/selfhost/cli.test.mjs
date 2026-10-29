import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { releaseVersion } from "./cli.mjs";

test("reads CLI release versions only from bounded regular metadata", async (t) => {
  const root = await fs.mkdtemp(join(tmpdir(), "selfhost-cli-version-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(resolve(root, "package.json"), '{"version":"1.2.3"}\n');
  await fs.writeFile(
    resolve(root, "release-manifest.json"),
    '{"releaseVersion":"1.2.4"}\n',
  );
  assert.equal(await releaseVersion(root), "1.2.4");

  await fs.writeFile(
    resolve(root, "release-manifest.json"),
    `${JSON.stringify({
      releaseVersion: "9.9.9",
      padding: "x".repeat(1024 * 1024),
    })}\n`,
  );
  assert.equal(await releaseVersion(root), "1.2.3");

  await fs.writeFile(
    resolve(root, "release-manifest.json"),
    '{"releaseVersion":{"unexpected":true}}\n',
  );
  assert.equal(await releaseVersion(root), "1.2.3");

  if (process.platform !== "win32") {
    const outside = resolve(root, "outside.json");
    await fs.writeFile(outside, '{"releaseVersion":"9.9.9"}\n');
    await fs.unlink(resolve(root, "release-manifest.json"));
    await fs.symlink(outside, resolve(root, "release-manifest.json"));
    assert.equal(await releaseVersion(root), "1.2.3");
  }

  await fs.unlink(resolve(root, "package.json"));
  assert.equal(await releaseVersion(root), "unknown");
});
