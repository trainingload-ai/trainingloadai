import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { checkDocsScreenshots } from "../../apps/docs/scripts/docs-screenshots.mjs";

const require = createRequire(
  new URL("../../apps/docs/package.json", import.meta.url),
);
const sharp = require("sharp");
async function fixture(t) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "docs-screenshots-test-"),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "content/docs/en"), { recursive: true });
  await fs.mkdir(path.join(root, "content/screenshots"), { recursive: true });
  await fs.mkdir(path.join(root, "public/images"), { recursive: true });
  const captures = [];
  for (const platform of ["web", "mobile"]) {
    const width = platform === "web" ? 1280 : 390;
    const height = platform === "web" ? 960 : 844;
    for (const theme of ["light", "dark"]) {
      await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: theme === "light" ? "white" : "black",
        },
      })
        .webp()
        .toFile(path.join(root, `public/images/${platform}-${theme}.webp`));
    }
    captures.push({
      id: platform,
      platform,
      status: "ready",
      asset: `images/${platform}-light.webp`,
      darkAsset: `images/${platform}-dark.webp`,
      localizedAssets: { en: `images/${platform}-light.webp` },
      localizedDarkAssets: { en: `images/${platform}-dark.webp` },
      aspectRatio: `${width} / ${height}`,
    });
  }
  captures[0].companionId = "mobile";
  await fs.writeFile(
    path.join(root, "content/docs/en/test.mdx"),
    '<DocsScreenshot id="web" title="Connections" />',
  );
  const write = () =>
    fs.writeFile(
      path.join(root, "content/screenshots/manifest.json"),
      JSON.stringify({ captures }),
    );
  await write();
  return { root, captures, write };
}

test("checks indirect companions without requiring duplicate article references", async (t) => {
  const { root } = await fixture(t);
  const result = await checkDocsScreenshots(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.captures, 2);
  assert.equal(result.images, 4);
});

test("rejects a missing dark companion image", async (t) => {
  const { root } = await fixture(t);
  await fs.unlink(path.join(root, "public/images/mobile-dark.webp"));
  const { errors } = await checkDocsScreenshots(root);
  assert.ok(errors.some((error) => error.includes("mobile-dark.webp")));
});

test("rejects unreadable files and companions that do not exist", async (t) => {
  const { root, captures, write } = await fixture(t);
  await fs.writeFile(path.join(root, "public/images/web-dark.webp"), "not an image");
  captures[1].companionId = "missing";
  await write();
  const { errors } = await checkDocsScreenshots(root);
  assert.ok(errors.some((error) => error.includes("cannot load images/web-dark.webp")));
  assert.ok(errors.some((error) => error.includes("unknown companion missing")));
});

test("rejects themes with different dimensions and same-platform companions", async (t) => {
  const { root, captures, write } = await fixture(t);
  await sharp({
    create: { width: 390, height: 900, channels: 3, background: "black" },
  })
    .webp()
    .toFile(path.join(root, "public/images/mobile-dark.webp"));
  captures[1].platform = "web";
  await write();
  const { errors } = await checkDocsScreenshots(root);
  assert.ok(errors.some((error) => error.includes("other platform")));
  assert.ok(
    errors.some((error) => error.includes("light and dark dimensions")),
  );
});

test("rejects unknown IDs, pending captures and absent localized dark assets", async (t) => {
  const { root, captures, write } = await fixture(t);
  captures[0].status = "pending";
  captures[1].localizedDarkAssets = {};
  await write();
  await fs.appendFile(
    path.join(root, "content/docs/en/test.mdx"),
    '\n\n<DocsScreenshot id="unknown" />',
  );
  const { errors } = await checkDocsScreenshots(root);
  assert.ok(errors.some((error) => error.includes("not ready")));
  assert.ok(errors.some((error) => error.includes("explicit en dark")));
  assert.ok(errors.some((error) => error.includes("no manifest entry")));
});
