import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { repositoryDirectory as root, sourcePath, faviconSizes } from "./brand-assets.mjs";

const sharp = createRequire(new URL("../apps/desktop/package.json", import.meta.url))("sharp");
const source = await sharp(sourcePath).metadata();
assert.equal(source.width, 1024);
assert.equal(source.height, 1024);
assert.equal(source.hasAlpha, false, "production master must be opaque");
const corners = await sharp(sourcePath).resize(1, 1, { fit: "fill", kernel: "nearest" }).raw().toBuffer();
const corner = await sharp(sourcePath).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
assert.ok(Math.max(...corner) < 64, "production master must not contain the pale studio backdrop");
assert.ok(Math.max(...corners) > 0, "production master must contain artwork");

for (const app of ["client", "docs"]) {
  const directory = path.join(root, "apps", app);
  const icon = await sharp(path.join(directory, "public/LOGO.png")).metadata();
  assert.equal(icon.width, 256);
  assert.equal(icon.height, 256);
  assert.equal(icon.hasAlpha, true, "web icon must retain transparent rounded corners");
  const apple = await sharp(path.join(directory, "src/app/apple-icon.png")).metadata();
  assert.equal(apple.width, 180);
  assert.equal(apple.hasAlpha, false);
  for (const appearance of ["DARK", "LIGHT"]) {
    const wordmark = await readFile(path.join(directory, `public/LOGO_${appearance}.svg`));
    const original = await readFile(path.join(root, `assets/brand/legacy/LOGO_${appearance}.svg`));
    assert.deepEqual(wordmark, original, "text wordmarks must remain unchanged");
  }
  const favicon = await readFile(path.join(directory, "src/app/favicon.ico"));
  assert.equal(favicon.readUInt16LE(2), 1);
  assert.equal(favicon.readUInt16LE(4), faviconSizes.length);
  for (const [index, size] of faviconSizes.entries()) {
    const entry = 6 + index * 16;
    const length = favicon.readUInt32LE(entry + 8);
    const offset = favicon.readUInt32LE(entry + 12);
    const image = await sharp(favicon.subarray(offset, offset + length)).metadata();
    assert.equal(image.width, size);
    assert.equal(image.height, size);
  }
}
for (const file of ["public/LOGO.png", "public/LOGO_DARK.svg", "public/LOGO_LIGHT.svg", "src/app/favicon.ico", "src/app/apple-icon.png"]) {
  assert.deepEqual(await readFile(path.join(root, "apps/client", file)), await readFile(path.join(root, "apps/docs", file)), `${file} must match across Web and Docs`);
}
for (const [file, size] of [["icon.png", 512], ["macos/icon.png", 512], ["macos/icon@2x.png", 1024]]) {
  const buffer = await readFile(path.join(root, "apps/desktop/assets", file));
  const metadata = await sharp(buffer).metadata();
  assert.equal(metadata.width, size);
  assert.equal(metadata.height, size);
  if (file.startsWith("macos/")) {
    const pixel = await sharp(buffer).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.equal(pixel[3], 0, "Mac icon must retain transparent outer margins");
  }
}
const icns = await readFile(path.join(root, "apps/desktop/assets/icon.icns"));
assert.equal(icns.toString("ascii", 0, 4), "icns");
assert.equal(icns.readUInt32BE(4), icns.length);
console.log("Brand assets verified: opaque master, matching Web/Docs exports, complete favicon sizes and Mac transparency.");
