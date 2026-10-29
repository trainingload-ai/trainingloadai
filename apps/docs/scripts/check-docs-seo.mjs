import fs from "node:fs";
import path from "node:path";

const docsRoot = process.cwd();
const contentRoot = path.join(docsRoot, "content", "docs");
const errors = [];

const priorityPages = new Set([
  "index.mdx",
  "guide/product-terms-and-statuses.mdx",
  "workflow/index.mdx",
  "workflow/first-training-cycle.mdx",
  "workflow/when-training-changes.mdx",
  "workflow/weekly-review.mdx",
  "workflow/data-and-load-problems.mdx",
  "self-host/index.mdx",
  "self-host/self-host-vs-cloud.mdx",
  "self-host/installation.mdx",
]);

const cjkOrFullwidth =
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u;

function displayUnits(value) {
  return [...value].reduce(
    (total, character) => total + (cjkOrFullwidth.test(character) ? 2 : 1),
    0,
  );
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory()
      ? walk(absolute)
      : absolute.endsWith(".mdx")
        ? [absolute]
        : [];
  });
}

function readFrontmatter(file) {
  const source = fs.readFileSync(file, "utf8");
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = match?.[1] ?? "";
  const value = (key) => {
    const line = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return line?.[1]?.replace(/^['"]|['"]$/g, "").trim() ?? "";
  };
  const keywordLine = frontmatter.match(
    /^keywords:\s*(\[[\s\S]*?\])(?:\n|$)/m,
  )?.[1];
  let keywords = [];
  if (keywordLine) {
    try {
      keywords = JSON.parse(keywordLine.replace(/,\s*]/g, "]"));
    } catch {
      errors.push(
        `${path.relative(docsRoot, file)} has invalid inline keywords`,
      );
    }
  }

  return {
    title: value("title"),
    description: value("description"),
    seoTitle: value("seoTitle"),
    seoDescription: value("seoDescription"),
    keywords,
  };
}

function duplicates(pages, field) {
  const values = new Map();
  for (const page of pages) {
    const value = page[field];
    if (!value) continue;
    const files = values.get(value) ?? [];
    files.push(page.file);
    values.set(value, files);
  }
  return [...values.entries()].filter(([, files]) => files.length > 1);
}

let totalPages = 0;
let priorityCount = 0;

for (const locale of ["en", "zh"]) {
  const localeRoot = path.join(contentRoot, locale);
  const pages = walk(localeRoot).map((file) => ({
    file,
    relative: path.relative(localeRoot, file).split(path.sep).join("/"),
    ...readFrontmatter(file),
  }));
  totalPages += pages.length;

  for (const page of pages) {
    const relativeFile = path.relative(docsRoot, page.file);
    if (!page.title || !page.description) {
      errors.push(`${relativeFile} needs title and description frontmatter`);
    }
    if (Boolean(page.seoTitle) !== Boolean(page.seoDescription)) {
      errors.push(
        `${relativeFile} must define seoTitle and seoDescription together`,
      );
    }
    if (page.seoTitle) {
      const units = displayUnits(page.seoTitle);
      if (units < 35 || units > 70) {
        errors.push(`${relativeFile} seoTitle is ${units} display units`);
      }
    }
    if (page.seoDescription) {
      const units = displayUnits(page.seoDescription);
      if (units < 70 || units > 190) {
        errors.push(`${relativeFile} seoDescription is ${units} display units`);
      }
    }
    if (priorityPages.has(page.relative)) {
      priorityCount += 1;
      if (!page.seoTitle || !page.seoDescription) {
        errors.push(`${relativeFile} needs explicit SEO title and description`);
      }
      if (page.keywords.length < 3 || page.keywords.length > 8) {
        errors.push(`${relativeFile} needs 3-8 intent keywords`);
      }
    }
  }

  for (const field of ["title", "description", "seoTitle", "seoDescription"]) {
    for (const [value, files] of duplicates(pages, field)) {
      errors.push(
        `${locale} duplicate ${field} ${JSON.stringify(value)}: ${files
          .map((file) => path.relative(docsRoot, file))
          .join(", ")}`,
      );
    }
  }
}

const appRoot = path.join(docsRoot, "src", "app");
for (const file of walkSourceFiles(appRoot)) {
  const source = fs.readFileSync(file, "utf8");
  if (
    source.includes('from "next/script"') &&
    source.includes('type="application/ld+json"')
  ) {
    errors.push(
      `${path.relative(docsRoot, file)} must render JSON-LD with a native script element`,
    );
  }
}

const jsonLdComponent = fs.readFileSync(
  path.join(docsRoot, "src", "components", "JsonLd.tsx"),
  "utf8",
);
if (
  !jsonLdComponent.includes("<script") ||
  !jsonLdComponent.includes('.replace(/</g, "\\\\u003c")')
) {
  errors.push("JsonLd.tsx must render and sanitize a native script element");
}

if (errors.length > 0) {
  console.error(`docs SEO check failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `docs SEO check passed: ${totalPages} reviewed pages, ${priorityCount} priority locale pages`,
);

function walkSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory()
      ? walkSourceFiles(absolute)
      : /\.(ts|tsx)$/.test(entry.name)
        ? [absolute]
        : [];
  });
}
