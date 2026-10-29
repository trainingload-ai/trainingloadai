import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { copyOptionalWorkspaceMetadata } from "./copy-optional-workspace-metadata.mjs";

test("copies only available private workspace install metadata", () => {
  const root = mkdtempSync(resolve(tmpdir(), "selfhost-workspace-metadata-"));
  const source = resolve(root, "source");
  const destination = resolve(root, "destination");
  mkdirSync(resolve(source, ".husky"), { recursive: true });
  mkdirSync(resolve(source, "patches"), { recursive: true });
  writeFileSync(resolve(source, ".npmrc"), "node-linker=isolated\n");
  writeFileSync(resolve(source, ".husky/install.mjs"), "export {};\n");
  writeFileSync(resolve(source, "patches/example.patch"), "example\n");

  try {
    assert.deepEqual(copyOptionalWorkspaceMetadata(source, destination), [
      ".npmrc",
      ".husky/install.mjs",
      "patches",
    ]);
    assert.equal(existsSync(resolve(destination, ".npmrc")), true);
    assert.equal(existsSync(resolve(destination, ".husky/install.mjs")), true);
    assert.equal(existsSync(resolve(destination, "patches/example.patch")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts a public candidate without optional private metadata", () => {
  const root = mkdtempSync(resolve(tmpdir(), "selfhost-workspace-metadata-"));
  const source = resolve(root, "source");
  const destination = resolve(root, "destination");
  mkdirSync(source, { recursive: true });

  try {
    assert.deepEqual(copyOptionalWorkspaceMetadata(source, destination), []);
    assert.equal(existsSync(destination), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
