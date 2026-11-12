import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { directoryBytes } from "./runtime-packages.mjs";

const fatMagic = new Set(["cafebabe", "bebafeca", "cafebabf", "bfbafeca"]);

export function thinMacNativeLibraries(root) {
  const report = { files: 0, savedBytes: 0 };
  if (process.platform !== "darwin") return report;
  const arch = { arm64: "arm64", x64: "x86_64" }[process.arch];
  if (!arch) throw new Error(`Unsupported macOS architecture: ${process.arch}`);
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && /\.(?:node|dylib)$/.test(entry.name)) {
        const header = Buffer.alloc(4);
        const file = openSync(path, "r");
        try {
          readSync(file, header, 0, 4, 0);
        } finally {
          closeSync(file);
        }
        if (!fatMagic.has(header.toString("hex"))) continue;
        const architectures = execFileSync("xcrun", ["lipo", "-archs", path], {
          encoding: "utf8",
        })
          .trim()
          .split(/\s+/);
        if (!architectures.includes(arch))
          throw new Error(
            `Native library lacks ${arch}: ${relative(root, path)}`,
          );
        const before = statSync(path);
        const temporary = `${path}.thin-${process.pid}`;
        try {
          execFileSync("xcrun", [
            "lipo",
            path,
            "-thin",
            arch,
            "-output",
            temporary,
          ]);
          chmodSync(temporary, before.mode & 0o777);
          renameSync(temporary, path);
        } finally {
          rmSync(temporary, { force: true });
        }
        report.files++;
        report.savedBytes += before.size - statSync(path).size;
      }
    }
  }
  walk(root);
  return report;
}

function matchesSubset(source, canonical) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const a = join(source, entry.name);
    const b = join(canonical, entry.name);
    if (!existsSync(b) || lstatSync(b).isSymbolicLink()) return false;
    if (entry.isDirectory()) {
      if (!statSync(b).isDirectory() || !matchesSubset(a, b)) return false;
    } else if (
      !entry.isFile() ||
      !statSync(b).isFile() ||
      !readFileSync(a).equals(readFileSync(b))
    )
      return false;
  }
  return true;
}

export function deduplicateNativeAssets(root) {
  const report = { packages: 0, savedBytes: 0 };
  const store = join(root, "node_modules/.pnpm");
  const clientStore = join(root, "runtime/client/node_modules/.pnpm");
  const canonical = new Map();
  // Only share dependency-free libvips packages. Deduplicating arbitrary JS
  // with symlinks would change Node's relative import and dependency context.
  function candidates(directory) {
    return readdirSync(directory)
      .filter((name) => name.startsWith("@img+sharp-libvips-"))
      .map((name) => {
        const scope = join(directory, name, "node_modules/@img");
        return join(
          scope,
          readdirSync(scope).find((name) => name.startsWith("sharp-libvips-")),
        );
      });
  }
  for (const path of candidates(store)) {
    const pkg = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
    if (
      Object.keys({
        ...pkg.dependencies,
        ...pkg.optionalDependencies,
        ...pkg.peerDependencies,
      }).length
    )
      continue;
    canonical.set(`${pkg.name}@${pkg.version}`, path);
  }
  for (const path of candidates(clientStore)) {
    const pkg = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
    const target = canonical.get(`${pkg.name}@${pkg.version}`);
    if (!target || !matchesSubset(path, target)) continue;
    report.savedBytes += directoryBytes(path);
    rmSync(path, { recursive: true });
    symlinkSync(relative(dirname(path), target), path, "dir");
    report.packages++;
  }
  return report;
}

export function pruneStandaloneBuildTools(client) {
  const before = directoryBytes(client);
  const store = join(client, "node_modules/.pnpm");
  for (const name of readdirSync(store)) {
    if (name.startsWith("typescript@")) {
      rmSync(join(store, name), { recursive: true });
    }
  }
  return { savedBytes: before - directoryBytes(client) };
}
