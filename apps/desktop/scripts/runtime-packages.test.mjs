import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectRuntimePackages } from "./runtime-packages.mjs";

function fixture(directory, metadata, code = "") {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify(metadata));
  writeFileSync(join(directory, "index.js"), code);
}

test("production graph preserves conflicting transitive versions and works after source removal", () => {
  const root = mkdtempSync(join(tmpdir(), "desktop-packages-"));
  try {
    const source = join(root, "source");
    const target = join(root, "app");
    fixture(source, {
      name: "app",
      dependencies: { left: "1", right: "1" },
      devDependencies: { compiler: "1" },
    });
    for (const [name, version] of [
      ["left", "1.0.0"],
      ["right", "2.0.0"],
    ]) {
      const dependency = join(source, "node_modules", name);
      fixture(
        dependency,
        { name, version: "1.0.0", dependencies: { shared: version } },
        'module.exports = require("shared");',
      );
      fixture(
        join(dependency, "node_modules/shared"),
        { name: "shared", version },
        `module.exports = ${JSON.stringify(version)};`,
      );
    }
    fixture(join(source, "node_modules/compiler"), {
      name: "compiler",
      version: "1.0.0",
    });
    fixture(target, { name: "app" });
    collectRuntimePackages(target).addDependencies(
      join(source, "package.json"),
      join(target, "node_modules"),
    );
    rmSync(source, { recursive: true });
    const require = createRequire(join(target, "package.json"));
    assert.equal(require("left"), "1.0.0");
    assert.equal(require("right"), "2.0.0");
    assert.throws(() => require.resolve("compiler"), /Cannot find module/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("packaging refuses a missing required dependency instead of shipping a broken graph", () => {
  const root = mkdtempSync(join(tmpdir(), "desktop-packages-"));
  try {
    const source = join(root, "source");
    fixture(source, { name: "app", dependencies: { missing: "1" } });
    assert.throws(
      () =>
        collectRuntimePackages(join(root, "app")).addDependencies(
          join(source, "package.json"),
          join(root, "app/node_modules"),
        ),
      /Missing production dependency/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Linux native optional packages match the runtime libc, retaining no foreign links", () => {
  for (const libc of ["glibc", "musl"]) {
    const root = mkdtempSync(join(tmpdir(), "desktop-native-libc-"));
    try {
      const source = join(root, "source"),
        target = join(root, "app");
      fixture(source, { name: "shell", dependencies: { image: "1" } });
      fixture(
        join(source, "node_modules/image"),
        {
          name: "image",
          version: "1.0.0",
          optionalDependencies: { "native-glibc": "1", "native-musl": "1" },
        },
        `module.exports = require("native-${libc}");`,
      );
      for (const family of ["glibc", "musl"])
        fixture(
          join(source, `node_modules/image/node_modules/native-${family}`),
          {
            name: `native-${family}`,
            version: "1.0.0",
            os: ["linux"],
            cpu: ["x64"],
            libc: [family],
          },
          `module.exports = ${JSON.stringify(family)};`,
        );
      fixture(target, { name: "shell" });
      collectRuntimePackages(
        target,
        {},
        { platform: "linux", arch: "x64", libc },
      ).addDependencies(
        join(source, "package.json"),
        join(target, "node_modules"),
      );
      rmSync(source, { recursive: true });
      const require = createRequire(join(target, "package.json"));
      assert.equal(require("image"), libc);
      const imageRequire = createRequire(require.resolve("image"));
      assert.throws(
        () =>
          imageRequire.resolve(`native-${libc === "glibc" ? "musl" : "glibc"}`),
        /Cannot find module/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("an incompatible required native libc fails packaging rather than omitting the dependency", () => {
  const root = mkdtempSync(join(tmpdir(), "desktop-required-libc-"));
  try {
    const source = join(root, "source");
    fixture(source, { name: "shell", dependencies: { image: "1" } });
    fixture(join(source, "node_modules/image"), {
      name: "image",
      version: "1.0.0",
      dependencies: { native: "1" },
    });
    fixture(join(source, "node_modules/image/node_modules/native"), {
      name: "native",
      version: "1.0.0",
      os: ["linux"],
      cpu: ["x64"],
      libc: ["musl"],
    });
    assert.throws(
      () =>
        collectRuntimePackages(
          join(root, "app"),
          {},
          { platform: "linux", arch: "x64", libc: "glibc" },
        ).addDependencies(
          join(source, "package.json"),
          join(root, "app/node_modules"),
        ),
      /Unsupported native dependency/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the selected workspace database replaces a stale installed dependency throughout the graph", () => {
  const root = mkdtempSync(join(tmpdir(), "desktop-core-release-"));
  try {
    const source = join(root, "source");
    const target = join(root, "app");
    const pinned = join(root, "pinned");
    fixture(source, {
      name: "shell",
      dependencies: { database: "link:old", adapter: "1" },
    });
    fixture(
      join(source, "node_modules/database"),
      { name: "database", version: "1.1.21" },
      'module.exports = "old"',
    );
    fixture(
      join(source, "node_modules/adapter"),
      { name: "adapter", version: "1.0.0", dependencies: { database: "1" } },
      'module.exports = require("database")',
    );
    fixture(
      pinned,
      { name: "database", version: "1.1.22" },
      'module.exports = "1.1.22"',
    );
    fixture(target, { name: "shell" });
    collectRuntimePackages(target, {
      database: join(pinned, "package.json"),
    }).addDependencies(
      join(source, "package.json"),
      join(target, "node_modules"),
    );
    rmSync(source, { recursive: true });
    rmSync(pinned, { recursive: true });
    const require = createRequire(join(target, "package.json"));
    assert.equal(require("database"), "1.1.22");
    assert.equal(require("adapter"), "1.1.22");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("links optional peers already in the production graph without pulling in unused integrations", () => {
  const root = mkdtempSync(join(tmpdir(), "desktop-peers-"));
  try {
    const source = join(root, "source");
    const target = join(root, "app");
    fixture(source, {
      name: "app",
      dependencies: { adapter: "1", schema: "1" },
    });
    fixture(
      join(source, "node_modules/adapter"),
      {
        name: "adapter",
        version: "1.0.0",
        peerDependencies: { schema: "1", framework: "1" },
        peerDependenciesMeta: {
          schema: { optional: true },
          framework: { optional: true },
        },
      },
      'module.exports = require("schema");',
    );
    fixture(
      join(source, "node_modules/schema"),
      { name: "schema", version: "1.0.0" },
      'module.exports = "validation works";',
    );
    fixture(join(source, "node_modules/framework"), {
      name: "framework",
      version: "1.0.0",
    });
    fixture(target, { name: "app" });
    const graph = collectRuntimePackages(target);
    graph.addDependencies(
      join(source, "package.json"),
      join(target, "node_modules"),
    );
    graph.linkOptionalPeers();
    rmSync(source, { recursive: true });
    const require = createRequire(join(target, "package.json"));
    assert.equal(require("adapter"), "validation works");
    assert.throws(() => require.resolve("framework"), /Cannot find module/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
