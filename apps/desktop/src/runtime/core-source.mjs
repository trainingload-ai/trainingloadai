import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

/** Runtime manifests keep source provenance inside the owning Core record. */
export function runtimeSourceCommit(manifest, expectedCommit) {
  const commit = manifest?.core?.commit;
  if (
    manifest?.schemaVersion !== 1 ||
    !/^[a-f0-9]{40}$/i.test(commit ?? "") ||
    (expectedCommit !== undefined && commit !== expectedCommit)
  )
    fail(
      "DESKTOP_CORE_COMMIT_MISMATCH",
      "Runtime core.commit must identify the expected Public source commit.",
    );
  return commit;
}

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const corePaths = [
  "apps/client",
  "apps/server",
  "packages",
  "scripts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".npmrc",
  "tsconfig.json",
  "tsconfig.base.json",
  "nest-cli.json",
];
const ignored = new Set([
  "node_modules",
  ".next",
  ".next-dev",
  "dist",
  "dist-selfhost",
  "generated",
  ".generated",
  "build",
  ".git",
]);

/** Desktop and the business application always belong to this Public checkout. */
export function selectCoreSource(desktop, environment = process.env) {
  for (const name of [
    "TRAININGLOAD_DESKTOP_SERVER_ENTRY",
    "TRAININGLOAD_DESKTOP_CLIENT_ENTRY",
    "TRAININGLOAD_DESKTOP_CORE_DIRECTORY",
  ]) {
    if (environment[name])
      fail(
        "DESKTOP_CORE_SPLIT_OVERRIDE",
        `${name} is no longer supported. Build and start Desktop from the intended Public checkout.`,
      );
  }
  const directory = resolve(desktop, "../..");
  return {
    directory,
    release: { version: json(join(directory, "package.json")).version },
  };
}

export function coreSourceFingerprint(directory) {
  let files;
  if (existsSync(join(directory, ".git"))) {
    files = execFileSync(
      "git",
      [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        ...corePaths,
      ],
      { cwd: directory, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    )
      .split("\0")
      .filter(Boolean);
  } else {
    files = [];
    const walk = (path) => {
      if (!existsSync(join(directory, path))) return;
      const stat = lstatSync(join(directory, path));
      if (stat.isDirectory()) {
        for (const item of readdirSync(join(directory, path)))
          if (!ignored.has(item)) walk(`${path}/${item}`);
      } else files.push(path);
    };
    for (const path of corePaths) walk(path);
  }
  const hash = createHash("sha256");
  for (const file of [...new Set(files)].sort()) {
    hash.update(file).update("\0");
    const path = join(directory, file);
    if (existsSync(path)) {
      if (!lstatSync(path).isFile())
        fail(
          "DESKTOP_CORE_SOURCE_INVALID",
          `Core source must be a regular file: ${file}`,
        );
      hash.update(readFileSync(path));
    } else hash.update("<deleted>");
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function readCoreSource(
  desktop,
  { environment = process.env, requireBuild = false } = {},
) {
  const selected = selectCoreSource(desktop, environment);
  const directory = realpathSync(selected.directory);
  const versions = [
    "package.json",
    "apps/client/package.json",
    "apps/server/package.json",
    "packages/prisma/package.json",
    "apps/desktop/package.json",
  ].map((path) => json(join(directory, path)).version);
  if (versions.some((version) => version !== selected.release.version))
    fail(
      "DESKTOP_CORE_VERSION_MISMATCH",
      `Desktop and business package versions differ: ${versions.join(", ")}`,
    );
  const commit = existsSync(join(directory, ".git"))
    ? execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: directory,
        encoding: "utf8",
      }).trim()
    : null;
  const source = {
    directory,
    version: selected.release.version,
    commit,
    fingerprint: coreSourceFingerprint(directory),
  };
  if (requireBuild) {
    const stamp = join(desktop, "build/core-build.json");
    const evidence = existsSync(stamp) ? json(stamp) : null;
    if (
      evidence?.fingerprint !== source.fingerprint ||
      evidence?.version !== source.version ||
      evidence?.platform !== process.platform ||
      evidence?.arch !== process.arch
    )
      fail(
        "DESKTOP_CORE_BUILD_MISSING",
        "Business sources changed or are not built for this platform. Run pnpm desktop:build in this Public checkout.",
      );
  }
  return source;
}

export function assertCoreResources(source, manifest) {
  const built = existsSync(manifest) ? json(manifest) : null;
  if (
    built?.directory !== source.directory ||
    built?.version !== source.version ||
    built?.fingerprint !== source.fingerprint
  )
    fail(
      "DESKTOP_CORE_RESOURCES_MISMATCH",
      "Desktop resources were built from different business sources. Run pnpm desktop:build.",
    );
}

/** Next must never write caches inside a signed application bundle. */
export function assertDesktopClientBuild(clientEntry) {
  const manifest = resolve(clientEntry, "../.next/required-server-files.json");
  const config = existsSync(manifest) ? json(manifest).config : null;
  if (
    config?.experimental?.isrFlushToDisk !== false ||
    config?.images?.maximumDiskCacheSize !== 0
  )
    fail(
      "DESKTOP_CLIENT_MUTABLE_BUILD",
      "The client build writes caches into application resources. Run pnpm desktop:build.",
    );
}

export function resolveCoreMigrationRunner(packageDirectory) {
  const metadata = json(join(packageDirectory, "package.json"));
  const exported = metadata.exports?.["./core-migration-runner"];
  const entry = typeof exported === "string" ? exported : exported?.import;
  if (typeof entry !== "string" || !entry.startsWith("./"))
    fail(
      "DESKTOP_DATABASE_ENTRY_MISSING",
      "The database package does not export its migration runner.",
    );
  const runner = resolve(packageDirectory, entry);
  const local = relative(packageDirectory, runner);
  if (local.startsWith("..") || !existsSync(runner))
    fail(
      "DESKTOP_DATABASE_ENTRY_MISSING",
      `Missing Core migration runner: ${runner}`,
    );
  return runner;
}
