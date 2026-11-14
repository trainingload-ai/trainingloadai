import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const OPTIONAL_WORKSPACE_METADATA = [".npmrc", ".husky/install.mjs", "patches"];

export function copyOptionalWorkspaceMetadata(sourceRoot, destinationRoot) {
  const manifestPath = resolve(sourceRoot, "package.json");
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : {};
  const patches = [
    ...new Set(Object.values(manifest.pnpm?.patchedDependencies ?? {})),
  ];
  // pnpm hashes every declared patch even when its owning package is filtered out.
  // Resolve and validate required patches before copying any install metadata.
  for (const patch of patches) {
    if (
      typeof patch !== "string" ||
      !patch ||
      isAbsolute(patch) ||
      patch.includes("\\") ||
      patch.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error(
        `Workspace patch must be a relative file path: ${String(patch)}`,
      );
    }
    const source = resolve(sourceRoot, patch);
    const resolved = relative(realpathSync(sourceRoot), realpathSync(source));
    if (
      !lstatSync(source).isFile() ||
      isAbsolute(resolved) ||
      resolved === ".." ||
      resolved.startsWith(`..${sep}`)
    ) {
      throw new Error(
        `Workspace patch must be a regular file within the workspace: ${patch}`,
      );
    }
  }
  const copied = [];
  for (const relativePath of OPTIONAL_WORKSPACE_METADATA) {
    const source = resolve(sourceRoot, relativePath);
    if (!existsSync(source)) continue;
    const destination = resolve(destinationRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
    copied.push(relativePath);
  }
  for (const patch of patches) {
    const destination = resolve(destinationRoot, patch);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(resolve(sourceRoot, patch), destination);
    copied.push(patch);
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
