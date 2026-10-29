import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OPTIONAL_WORKSPACE_METADATA = [
  ".npmrc",
  ".husky/install.mjs",
  "patches",
];

export function copyOptionalWorkspaceMetadata(sourceRoot, destinationRoot) {
  const copied = [];
  for (const relativePath of OPTIONAL_WORKSPACE_METADATA) {
    const source = resolve(sourceRoot, relativePath);
    if (!existsSync(source)) continue;
    const destination = resolve(destinationRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
    copied.push(relativePath);
  }
  return copied;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const sourceRoot = resolve(process.argv[2] ?? "");
  const destinationRoot = resolve(process.argv[3] ?? "");
  if (!process.argv[2] || !process.argv[3]) {
    throw new Error(
      "usage: copy-optional-workspace-metadata.mjs <source-root> <destination-root>",
    );
  }
  const copied = copyOptionalWorkspaceMetadata(sourceRoot, destinationRoot);
  process.stdout.write(
    `Optional workspace metadata: ${copied.length ? copied.join(", ") : "none"}\n`,
  );
}
