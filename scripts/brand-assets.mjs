import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Sharp is a declared desktop development dependency in standalone Public installs.
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const sharp = require("sharp");
export const repositoryDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const sourcePath = path.join(repositoryDirectory, "assets/brand/app-icon-source.png");
export const background = "#080B0B";
export const faviconSizes = [16, 32, 48, 256];

export async function opaqueIcon(size) {
  return sharp(await readFile(sourcePath)).resize(size, size)
    .flatten({ background }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
}

export async function roundedIcon(size) {
  const image = await opaqueIcon(size);
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.224}" fill="white"/></svg>`);
  return sharp(image).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

export async function watchIcon() {
  const source = (await opaqueIcon(1024)).toString("base64");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <defs><clipPath id="watch"><circle cx="512" cy="512" r="480"/></clipPath></defs>
    <rect width="1024" height="1024" fill="#F7FBFA"/>
    <image width="1024" height="1024" href="data:image/png;base64,${source}" clip-path="url(#watch)"/>
  </svg>`)).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
}

export async function createFavicon() {
  const images = await Promise.all(faviconSizes.map(roundedIcon));
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const size = faviconSizes[index];
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  return Buffer.concat([header, ...images]);
}

export async function generateWebAssets() {
  const [icon, favicon, apple] = await Promise.all([
    roundedIcon(256), createFavicon(), opaqueIcon(180),
  ]);
  await Promise.all(["client", "docs"].map(async (app) => {
    const appDirectory = path.join(repositoryDirectory, "apps", app);
    await Promise.all([
      writeFile(path.join(appDirectory, "public/LOGO.png"), icon),
      writeFile(path.join(appDirectory, "src/app/favicon.ico"), favicon),
      writeFile(path.join(appDirectory, "src/app/apple-icon.png"), apple),
    ]);
  }));
}

export async function generateDesktopIcons(output) {
  await mkdir(path.join(output, "macos"), { recursive: true });
  await writeFile(path.join(output, "icon.png"), await opaqueIcon(512));
  const artwork = await roundedIcon(824);
  const mac = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#00000000" } })
    .composite([{ input: artwork, left: 100, top: 100 }]).png().toBuffer();
  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  const images = new Map(await Promise.all(sizes.map(async (size) => [size, await sharp(mac).resize(size, size).png().toBuffer()])));
  await Promise.all([
    writeFile(path.join(output, "macos/icon.png"), images.get(512)),
    writeFile(path.join(output, "macos/icon@2x.png"), images.get(1024)),
  ]);
  const representations = [["icp4", 16], ["icp5", 32], ["icp6", 64], ["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024], ["ic11", 32], ["ic12", 64], ["ic13", 256], ["ic14", 512]];
  const chunks = representations.map(([type, size]) => {
    const image = images.get(size);
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(image.length + 8, 4);
    return Buffer.concat([header, image]);
  });
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  await writeFile(path.join(output, "icon.icns"), Buffer.concat([header, ...chunks]));
}
