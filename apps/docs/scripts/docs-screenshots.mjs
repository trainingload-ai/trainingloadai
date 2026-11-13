import fs from "node:fs/promises";
import path from "node:path";
import { remark } from "remark";
import remarkMdx from "remark-mdx";
import remarkMath from "remark-math";
import sharp from "sharp";

async function filesIn(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory()
          ? filesIn(file)
          : file.endsWith(".mdx")
            ? [file]
            : [];
      }),
    )
  ).flat();
}

function screenshotNodes(node) {
  return [
    ...(node.type === "mdxJsxFlowElement" &&
      ["DocsScreenshot", "DocsTaskCard"].includes(node.name)
      ? [node]
      : []),
    ...(node.children ?? []).flatMap(screenshotNodes),
  ];
}

/** Validate the files readers will actually see, including indirect companions. */
export async function checkDocsScreenshots(docsRoot) {
  const publicRoot = path.join(docsRoot, "public");
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(docsRoot, "content/screenshots/manifest.json"),
      "utf8",
    ),
  );
  const captures = new Map();
  const errors = [];
  for (const capture of manifest.captures) {
    if (captures.has(capture.id))
      errors.push(`Duplicate screenshot ID: ${capture.id}`);
    captures.set(capture.id, capture);
  }
  for (const capture of captures.values()) {
    if (!capture.companionId) continue;
    const companion = captures.get(capture.companionId);
    if (!companion)
      errors.push(`${capture.id}: unknown companion ${capture.companionId}`);
    else if (
      companion.id === capture.id ||
      companion.platform === capture.platform
    ) {
      errors.push(`${capture.id}: companion must use the other platform`);
    }
  }

  const referenced = new Set();
  const checked = new Map();
  const validated = new Set();
  let references = 0;
  async function metadata(asset, prefix) {
    const resolved = path.resolve(publicRoot, asset ?? "");
    if (!asset || !resolved.startsWith(`${publicRoot}${path.sep}`)) {
      errors.push(`${prefix}: invalid public asset path`);
      return;
    }
    try {
      if (!checked.has(resolved)) {
        checked.set(
          resolved,
          (async () => {
            const image = sharp(await fs.readFile(resolved));
            const dimensions = await image.metadata();
            await image.stats(); // Decode pixels as well as the file header.
            return dimensions;
          })(),
        );
      }
      return await checked.get(resolved);
    } catch {
      errors.push(`${prefix}: cannot load ${asset}`);
    }
  }
  async function validate(capture, locale, prefix) {
    referenced.add(capture.id);
    if (capture.status !== "ready")
      errors.push(`${prefix}: published capture is not ready`);
    const key = `${capture.id}:${locale}`;
    if (validated.has(key)) return;
    validated.add(key);
    const dimensions = String(capture.aspectRatio ?? "")
      .split("/")
      .map(Number);
    const ratioValid =
      dimensions.length === 2 &&
      dimensions.every((value) => Number.isFinite(value) && value > 0);
    const variants = [
      ["light", capture.localizedAssets?.[locale] ?? capture.asset],
      ["dark", capture.localizedDarkAssets?.[locale] ?? capture.darkAsset],
    ];
    const sizes = [];
    for (const [theme, asset] of variants) {
      const localized =
        theme === "light"
          ? capture.localizedAssets
          : capture.localizedDarkAssets;
      if (["en", "zh"].includes(locale) && !localized?.[locale]) {
        errors.push(`${prefix}: needs an explicit ${locale} ${theme} asset`);
      }
      const image = await metadata(asset, `${prefix} (${theme})`);
      if (!image) continue;
      sizes.push([image.width, image.height]);
      if (
        !image.width ||
        !image.height ||
        !ratioValid ||
        Math.abs(image.width / image.height - dimensions[0] / dimensions[1]) >
          0.01
      ) {
        errors.push(
          `${prefix} (${theme}): aspect ratio does not match the image`,
        );
      }
      if (
        capture.platform === "web" &&
        (image.width < 1000 || image.height < 700)
      ) {
        errors.push(
          `${prefix} (${theme}): must retain the app viewport and navigation`,
        );
      }
    }
    if (
      sizes.length === 2 &&
      sizes[0].some((value, index) => value !== sizes[1][index])
    ) {
      errors.push(`${prefix}: light and dark dimensions must match`);
    }
  }

  const contentRoot = path.join(docsRoot, "content/docs");
  for (const file of await filesIn(contentRoot)) {
    const relative = path.relative(contentRoot, file);
    const locale = relative.split(path.sep)[0];
    const tree = remark()
      .use(remarkMath)
      .use(remarkMdx)
      .parse(await fs.readFile(file, "utf8"));
    for (const node of screenshotNodes(tree)) {
      references++;
      const id = node.attributes.find(
        (attribute) =>
          attribute.name === (node.name === "DocsTaskCard" ? "screenshotId" : "id"),
      )?.value;
      const capture = captures.get(id);
      const prefix = `${relative}: ${id ?? "missing ID"}`;
      if (!capture) {
        errors.push(`${prefix}: no manifest entry`);
        continue;
      }
      await validate(capture, locale, prefix);
      const companion = captures.get(capture.companionId);
      if (companion)
        await validate(
          companion,
          locale,
          `${prefix} companion ${companion.id}`,
        );
    }
  }
  for (const id of captures.keys()) {
    if (!referenced.has(id)) errors.push(`Unused screenshot entry: ${id}`);
  }
  return {
    errors,
    captures: referenced.size,
    images: checked.size,
    references,
  };
}
