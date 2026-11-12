import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  deduplicateNativeAssets,
  thinMacNativeLibraries,
} from "./optimize-runtime.mjs";

test(
  "universal native libraries retain only the host slice without modifying source dependencies",
  { skip: process.platform !== "darwin" },
  () => {
    const root = mkdtempSync(join(tmpdir(), "desktop-native-"));
    try {
      const source = join(root, "library.c");
      writeFileSync(
        source,
        "int desktop_runtime_fixture(void) { return 42; }\n",
      );
      const slices = ["arm64", "x86_64"].map((arch) => {
        const output = join(root, `${arch}.o`);
        execFileSync("xcrun", [
          "clang",
          "-c",
          "-arch",
          arch,
          source,
          "-o",
          output,
        ]);
        return output;
      });
      const original = join(root, "original.node");
      execFileSync("xcrun", [
        "lipo",
        "-create",
        ...slices,
        "-output",
        original,
      ]);
      const before = readFileSync(original);
      const app = join(root, "app");
      mkdirSync(app);
      const target = join(app, "fixture.node");
      cpSync(original, target);
      const report = thinMacNativeLibraries(app);
      assert.equal(report.files, 1);
      assert.ok(report.savedBytes > 0);
      assert.equal(
        execFileSync("xcrun", ["lipo", "-archs", target], {
          encoding: "utf8",
        }).trim(),
        process.arch === "arm64" ? "arm64" : "x86_64",
      );
      assert.deepEqual(readFileSync(original), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test("native asset sharing requires identical content and preserves relative module loading", () => {
  const root = mkdtempSync(join(tmpdir(), "desktop-assets-"));
  const name = "@img/sharp-libvips-fixture";
  const canonical = join(
    root,
    "node_modules/.pnpm/@img+sharp-libvips-fixture@1.0.0_a/node_modules",
    name,
  );
  const duplicate = join(
    root,
    "runtime/client/node_modules/.pnpm/@img+sharp-libvips-fixture@1.0.0/node_modules",
    name,
  );
  try {
    for (const dir of [canonical, duplicate]) {
      mkdirSync(join(dir, "lib"), { recursive: true });
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name, version: "1.0.0" }),
      );
      writeFileSync(
        join(dir, "lib/index.js"),
        'module.exports = require("node:fs").readFileSync(require("node:path").join(__dirname, "asset.dat"), "utf8");',
      );
      writeFileSync(
        join(dir, "lib/asset.dat"),
        dir === canonical ? "native asset" : "different asset",
      );
    }
    assert.equal(deduplicateNativeAssets(root).packages, 0);
    assert.equal(lstatSync(duplicate).isSymbolicLink(), false);
    writeFileSync(join(duplicate, "lib/asset.dat"), "native asset");
    assert.equal(deduplicateNativeAssets(root).packages, 1);
    assert.equal(lstatSync(duplicate).isSymbolicLink(), true);
    assert.equal(
      createRequire(join(root, "package.json"))(
        join(duplicate, "lib/index.js"),
      ),
      "native asset",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
