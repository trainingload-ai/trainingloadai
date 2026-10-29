import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderErrorCatalogMarkdown } from "./error-catalog.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const outputPath = resolve(
  repositoryRoot,
  "docs/self-hosting/error-catalog.zh.md",
);

export async function generateErrorCatalog({ check = false } = {}) {
  const expected = renderErrorCatalogMarkdown();
  if (check) {
    const current = await fs.readFile(outputPath, "utf8");
    if (current !== expected) {
      throw new Error(
        "self-host error catalog documentation is stale; run node scripts/selfhost/generate-error-catalog.mjs",
      );
    }
    return outputPath;
  }
  await fs.writeFile(outputPath, expected);
  return outputPath;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const check = process.argv.slice(2).includes("--check");
  if (process.argv.length > (check ? 3 : 2)) {
    throw new Error("usage: generate-error-catalog.mjs [--check]");
  }
  const path = await generateErrorCatalog({ check });
  process.stdout.write(
    `self-host error catalog: ${check ? "PASS" : "WROTE"} ${path}\n`,
  );
}
