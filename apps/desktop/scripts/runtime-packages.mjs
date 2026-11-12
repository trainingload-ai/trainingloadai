import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

export function packageManifest(from, name) {
  for (const directory of createRequire(from).resolve.paths(name) ?? []) {
    const candidate = join(directory, name, "package.json");
    if (existsSync(candidate)) return realpathSync(candidate);
  }
  return null;
}

export function directoryBytes(directory) {
  let bytes = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) bytes += directoryBytes(path);
    else if (entry.isFile()) bytes += statSync(path).size;
  }
  return bytes;
}

export function isRuntimeFile(path) {
  const name = path.split(/[\\/]/).at(-1);
  return (
    !name.startsWith(".env") &&
    name !== ".DS_Store" &&
    !/\.(?:map|d\.(?:ts|mts|cts)|tsbuildinfo)$/.test(name) &&
    !/\.(?:test|spec)\.[cm]?js$/.test(name)
  );
}

function copy(source, target) {
  cpSync(source, target, {
    recursive: true,
    // Dependency-internal links are unexpected: do not follow them off-tree.
    filter: (path) =>
      isRuntimeFile(path) &&
      (path === source || !lstatSync(path).isSymbolicLink()),
  });
}

/** Copy only the installed production graph, with relative, package-local links.
 * No install hooks, development dependencies, or workspace files are copied.
 * Each package keeps its own dependency versions and required peer context.
 */
export function collectRuntimePackages(root, overrides = {}) {
  const packages = new Map();
  const optionalPeers = [];
  let sourceBytes = 0;
  function link(target, destination) {
    mkdirSync(dirname(destination), { recursive: true });
    symlinkSync(relative(dirname(destination), target), destination, "dir");
  }
  function collect(manifestPath) {
    manifestPath = realpathSync(manifestPath);
    if (packages.has(manifestPath)) return packages.get(manifestPath);
    const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
    const identity = `${pkg.name.replaceAll("/", "+")}@${pkg.version}_${createHash("sha256").update(manifestPath).digest("hex").slice(0, 10)}`;
    const target = join(
      root,
      "node_modules/.pnpm",
      identity,
      "node_modules",
      pkg.name,
    );
    packages.set(manifestPath, target);
    const source = dirname(manifestPath);
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source)) {
      if (entry === "node_modules" || entry === ".git") continue;
      const input = join(source, entry);
      if (lstatSync(input).isSymbolicLink())
        throw new Error(`Unexpected package symlink: ${pkg.name}/${entry}`);
      // The database workspace package exports only its migration runner. Its
      // generated client is copied separately for exactly the target platform.
      if (
        pkg.name === "@trainingloadai/database" &&
        !["package.json", "core"].includes(entry)
      )
        continue;
      copy(input, join(target, entry));
    }
    // Measure the original production graph, excluding nested node_modules.
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const path = join(source, entry.name);
      sourceBytes += entry.isDirectory()
        ? directoryBytes(path)
        : entry.isFile()
          ? statSync(path).size
          : 0;
    }
    // Some frameworks declare TypeScript as a non-optional peer even though
    // only their decorators' build-time type checking uses it.
    const peers = Object.fromEntries(
      Object.entries(pkg.peerDependencies ?? {}).filter(
        ([name]) =>
          !pkg.peerDependenciesMeta?.[name]?.optional && name !== "typescript",
      ),
    );
    const dependencies = {
      ...peers,
      ...pkg.dependencies,
      ...pkg.optionalDependencies,
    };
    for (const name of Object.keys(pkg.peerDependencies ?? {})) {
      if (
        pkg.peerDependenciesMeta?.[name]?.optional &&
        !(name in dependencies)
      ) {
        optionalPeers.push({
          manifestPath,
          name,
          modules: pkg.name.startsWith("@")
            ? resolve(target, "../..")
            : dirname(target),
        });
      }
    }
    for (const name of Object.keys(dependencies).sort()) {
      const dependency = overrides[name] ?? packageManifest(manifestPath, name);
      if (!dependency) {
        if (name in (pkg.optionalDependencies ?? {}) || isBuiltin(name))
          continue;
        throw new Error(
          `Missing production dependency: ${pkg.name} -> ${name}`,
        );
      }
      const metadata = JSON.parse(readFileSync(dependency, "utf8"));
      const matches = (values, current) =>
        !values ||
        (!values.includes(`!${current}`) &&
          (values.every((v) => v.startsWith("!")) || values.includes(current)));
      if (
        !matches(metadata.os, process.platform) ||
        !matches(metadata.cpu, process.arch)
      ) {
        if (name in (pkg.optionalDependencies ?? {})) continue;
        throw new Error(`Unsupported native dependency: ${name}`);
      }
      // Package dependencies are siblings in a pnpm virtual-store entry.
      const modules = pkg.name.startsWith("@")
        ? resolve(target, "../..")
        : dirname(target);
      link(collect(dependency), join(modules, name));
    }
    return target;
  }
  return {
    addPackage(manifestPath, modules) {
      const metadata = JSON.parse(readFileSync(manifestPath, "utf8"));
      link(collect(manifestPath), join(modules, metadata.name));
    },
    addDependencies(manifestPath, modules) {
      const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
      for (const name of Object.keys(pkg.dependencies ?? {}).sort()) {
        const dependency =
          overrides[name] ?? packageManifest(manifestPath, name);
        if (!dependency)
          throw new Error(
            `Missing production dependency: ${pkg.name} -> ${name}`,
          );
        link(collect(dependency), join(modules, name));
      }
    },
    linkOptionalPeers() {
      // Optional integrations must not expand the graph (e.g. Better Auth's
      // Next/React/Prisma CLI peers). Link peers already used by the app, such
      // as better-call's Zod and Nest's Express adapter.
      for (const { manifestPath, name, modules } of optionalPeers) {
        const dependency =
          overrides[name] ?? packageManifest(manifestPath, name);
        if (dependency && packages.has(dependency))
          link(packages.get(dependency), join(modules, name));
      }
    },
    get sourceBytes() {
      return sourceBytes;
    },
  };
}

export function pruneRuntimePackages(root) {
  const store = join(root, "node_modules/.pnpm");
  for (const entry of readdirSync(store)) {
    if (entry.startsWith("@prisma+client@")) {
      const client = join(store, entry, "node_modules/@prisma/client");
      for (const name of ["generator-build", "scripts"])
        rmSync(join(client, name), { recursive: true, force: true });
      for (const name of readdirSync(join(client, "runtime"))) {
        if (
          /wasm|edge|react-native|^query_(?:compiler|engine)_bg\./.test(name)
        ) {
          rmSync(join(client, "runtime", name), { force: true });
        }
      }
    }
    if (entry.startsWith("geo-tz@")) {
      // The Core uses geo-tz's default (1970) dataset. Keep its historical
      // behavior; omit only the unused /all and /now exports and datasets.
      const geo = join(store, entry, "node_modules/geo-tz");
      const manifestPath = join(geo, "package.json");
      const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (pkg.main !== "dist/find-1970.js")
        throw new Error(
          "geo-tz default dataset changed; review pruning policy",
        );
      for (const name of readdirSync(join(geo, "data"))) {
        if (!name.startsWith("timezones-1970."))
          rmSync(join(geo, "data", name), { force: true });
      }
      for (const name of readdirSync(join(geo, "dist"))) {
        if (!name.startsWith("find-1970."))
          rmSync(join(geo, "dist", name), { force: true });
      }
      pkg.exports = { ".": pkg.exports["."] };
      writeFileSync(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`);
    }
  }
}
