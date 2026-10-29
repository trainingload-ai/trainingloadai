import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  inspectRegularTree,
  replaceRegularFileAtomically,
  sha256File,
} from "./backup-artifact.mjs";

export async function createChecksums(directory, outputName = "checksums.txt") {
  const root = resolve(directory);
  const output = resolve(root, outputName);
  const files = (await inspectRegularTree(root)).files
    .filter((file) => file.path !== output)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (files.length === 0)
    throw new Error("no release evidence files to checksum");
  const lines = [];
  for (const file of files) {
    lines.push(`${await sha256File(file.path)}  ${file.relativePath}`);
  }
  await replaceRegularFileAtomically(output, `${lines.join("\n")}\n`);
  return lines;
}

async function main() {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) {
    throw new Error("usage: create-checksums.mjs <directory>");
  }
  const lines = await createChecksums(directory);
  process.stdout.write(
    `checksums: PASS ${lines.length} files -> ${join(directory, "checksums.txt")}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
