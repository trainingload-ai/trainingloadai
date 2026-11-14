import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  cpSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { copyOptionalWorkspaceMetadata } from "./copy-optional-workspace-metadata.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

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
    assert.equal(
      existsSync(resolve(destination, "patches/example.patch")),
      true,
    );
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

test("copies patches outside the top-level patches directory without copying their workspace package", () => {
  const root = mkdtempSync(resolve(tmpdir(), "selfhost-filtered-patches-"));
  const source = resolve(root, "source");
  const destination = resolve(root, "destination");
  const patch = "apps/desktop/patches/osx-sign.patch";
  mkdirSync(resolve(source, "apps/desktop/patches"), { recursive: true });
  writeFileSync(
    resolve(source, "package.json"),
    JSON.stringify({
      pnpm: { patchedDependencies: { "example@1.0.0": patch } },
    }),
  );
  writeFileSync(resolve(source, patch), "required patch\n");
  writeFileSync(resolve(source, "apps/desktop/package.json"), "{}");
  try {
    assert.deepEqual(copyOptionalWorkspaceMetadata(source, destination), [
      patch,
    ]);
    assert.equal(
      readFileSync(resolve(destination, patch), "utf8"),
      "required patch\n",
    );
    assert.equal(
      existsSync(resolve(destination, "apps/desktop/package.json")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails before copying metadata when a required patch is missing", () => {
  const root = mkdtempSync(resolve(tmpdir(), "selfhost-missing-patch-"));
  const source = resolve(root, "source");
  const destination = resolve(root, "destination");
  mkdirSync(source);
  writeFileSync(
    resolve(source, "package.json"),
    JSON.stringify({
      pnpm: { patchedDependencies: { "example@1.0.0": "missing.patch" } },
    }),
  );
  writeFileSync(resolve(source, ".npmrc"), "node-linker=isolated\n");
  try {
    assert.throws(
      () => copyOptionalWorkspaceMetadata(source, destination),
      /ENOENT/,
    );
    assert.equal(existsSync(destination), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects escaping patch paths and patch symlinks", () => {
  const root = mkdtempSync(resolve(tmpdir(), "selfhost-invalid-patch-"));
  const source = resolve(root, "source");
  const destination = resolve(root, "destination");
  mkdirSync(source);
  writeFileSync(resolve(root, "outside.patch"), "outside\n");
  symlinkSync(resolve(root, "outside.patch"), resolve(source, "linked.patch"));
  try {
    for (const patch of [
      "../outside.patch",
      resolve(root, "outside.patch"),
      "linked.patch",
      "windows\\patch.patch",
    ]) {
      writeFileSync(
        resolve(source, "package.json"),
        JSON.stringify({
          pnpm: { patchedDependencies: { "example@1.0.0": patch } },
        }),
      );
      assert.throws(() => copyOptionalWorkspaceMetadata(source, destination));
      assert.equal(existsSync(destination), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const { name, manifests, filters } of [
  {
    name: "server",
    manifests: ["apps/server/package.json", "packages/prisma/package.json"],
    filters: [
      "--filter=@trainingloadai/server...",
      "--filter=@trainingloadai/database...",
    ],
  },
  {
    name: "client",
    manifests: [
      "apps/client/package.json",
      "packages/design-tokens/package.json",
    ],
    filters: ["--filter=./apps/client"],
  },
]) {
  test(`validates frozen pnpm installation in the partial ${name} image workspace`, () => {
    const root = mkdtempSync(
      resolve(tmpdir(), `selfhost-${name}-install-metadata-`),
    );
    try {
      for (const file of [
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        ...manifests,
      ]) {
        const destination = resolve(root, file);
        mkdirSync(dirname(destination), { recursive: true });
        cpSync(resolve(repositoryRoot, file), destination);
      }
      copyOptionalWorkspaceMetadata(repositoryRoot, root);
      const result = spawnSync(
        "pnpm",
        [
          "install",
          "--offline",
          "--lockfile-only",
          "--ignore-scripts",
          "--frozen-lockfile",
          ...filters,
        ],
        { cwd: root, encoding: "utf8", timeout: 30_000 },
      );
      assert.equal(
        result.status,
        0,
        `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`,
      );
      assert.equal(
        existsSync(resolve(root, "apps/desktop/package.json")),
        false,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
