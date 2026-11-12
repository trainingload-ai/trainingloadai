import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const directory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourcePath = path.resolve(directory, "assets/app-icon-source.svg");
const output = path.join(directory, "assets");
const source = await readFile(sourcePath, "utf8");
// Reuse the canonical artwork. Legacy macOS PNG/ICNS icons need their own
// transparent canvas and rounded silhouette; the Dock does not mask iOS icons.
const macSource =
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs><clipPath id="desktop-shape"><rect x="100" y="100" width="824" height="824" rx="184"/></clipPath></defs>
  <g clip-path="url(#desktop-shape)">
    <g transform="translate(100 100) scale(.8046875)">${source.replace(/<\?xml[^>]*>/g, "")}</g>
  </g>
</svg>`);
await mkdir(path.join(output, "macos"), { recursive: true });
await sharp(Buffer.from(source))
  .resize(512, 512)
  .png()
  .toFile(path.join(output, "icon.png"));
const sizes = [16, 32, 64, 128, 256, 512, 1024];
const pngs = new Map(
  await Promise.all(
    sizes.map(async (size) => [
      size,
      await sharp(macSource).resize(size, size).png().toBuffer(),
    ]),
  ),
);
await Promise.all([
  writeFile(path.join(output, "macos/icon.png"), pngs.get(512)),
  writeFile(path.join(output, "macos/icon@2x.png"), pngs.get(1024)),
]);
const representations = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
  ["ic11", 32],
  ["ic12", 64],
  ["ic13", 256],
  ["ic14", 512],
];
const chunks = representations.map(([type, size]) => {
  const png = pngs.get(size);
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, "ascii");
  header.writeUInt32BE(png.length + 8, 4);
  return Buffer.concat([header, png]);
});
const header = Buffer.alloc(8);
header.write("icns", 0, 4, "ascii");
header.writeUInt32BE(
  8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0),
  4,
);
await writeFile(
  path.join(output, "icon.icns"),
  Buffer.concat([header, ...chunks]),
);
console.log(
  "Generated desktop icons from the canonical Trainingload.ai SVG (macOS artwork: 824/1024 canvas).",
);
