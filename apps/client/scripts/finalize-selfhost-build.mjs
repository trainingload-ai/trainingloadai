import { promises as fs } from "node:fs";
import { resolve, relative } from "node:path";

const appRoot = process.cwd();
const nextRoot = resolve(appRoot, ".next");
const deliverableRoots = [
  resolve(nextRoot, "standalone"),
  resolve(nextRoot, "static"),
  resolve(nextRoot, "selfhost-public"),
];
const standaloneManifestPath = resolve(nextRoot, "standalone/package.json");
const standalonePnpmRoot = resolve(nextRoot, "standalone/node_modules/.pnpm");
const selfHostPublicRoot = resolve(nextRoot, "selfhost-public");
const managedPublicAssets = new Set([
  "PolarIcon.png",
  "logo/coros_black.png",
  "logo/coros_white.png",
  "logo/garmin.svg",
  "logo/garmin_white.png",
  "logo/polar-logo.svg",
  "logo/provider-favicons/coros.ico",
  "logo/provider-favicons/garmin.png",
  "logo/provider-favicons/liftosaur.ico",
  "logo/provider-favicons/polar.ico",
  "logo/provider-favicons/strava.ico",
  "logo/provider-favicons/suunto.ico",
  "logo/provider-favicons/wahoo.png",
  "logo/strava-badge-alt.svg",
  "logo/strava.svg",
  "logo/suunto.svg",
  "logo/wahoo.svg",
  "logo/whoop.svg",
]);

// This file is intentionally exempt from the source marker scan: it is the
// build-time policy that rejects those private implementation identifiers.
const forbiddenMarkers = [
  "@better-auth/expo",
  "@better-auth/oauth-provider",
  "@creem_io/better-auth",
  "@waffo/pancake-ts",
  "CREEM_PRODUCT_",
  "WAFFO_PRODUCT_",
  "REVENUECAT_SECRET_API_KEY",
  "MembershipGiftService",
  "NewUserGiftService",
  "CreditPack",
  "credit-packs",
  "PostHog",
  "posthog",
  "OperationsController",
  "@langfuse/",
  "@modelcontextprotocol/",
  "@openrouter/sdk",
];

const PLATFORM_PACKAGE_PREFIXES = [
  "@esbuild+",
  "@img+sharp-",
  "@img+sharp-libvips-",
  "@next+swc-",
  "@parcel+watcher-",
  "@rollup+rollup-",
  "@swc+core-",
  "@unrs+resolver-binding-",
  "lightningcss-",
];

// These packages are needed by Next/Webpack while compiling, not by the
// already-emitted standalone server. Next's conservative file tracer follows
// conditional build-time requires, so remove the compiler toolchain from the
// runtime artifact explicitly and cover the result with a startup smoke test.
const BUILD_ONLY_PACKAGES = new Set([
  "@swc+core",
  "ajv",
  "ajv-keywords",
  "babel-plugin-react-compiler",
  "browserslist",
  "caniuse-lite",
  "enhanced-resolve",
  "esbuild",
  "schema-utils",
  "terser",
  "terser-webpack-plugin",
  "uglify-js",
  "webpack",
  "webpack-sources",
]);
const BUILD_ONLY_PACKAGE_PREFIXES = ["@esbuild+", "@swc+core-"];

function runtimeTarget() {
  const platform = (process.env.SELF_HOST_RUNTIME_PLATFORM || process.platform)
    .trim()
    .toLowerCase();
  const rawArch = (process.env.SELF_HOST_RUNTIME_ARCH || process.arch)
    .trim()
    .toLowerCase();
  const arch = rawArch === "amd64" ? "x64" : rawArch;
  if (!["linux", "darwin", "win32"].includes(platform)) {
    throw new Error(`Unsupported standalone runtime platform: ${platform}`);
  }
  if (!["x64", "arm64"].includes(arch)) {
    throw new Error(`Unsupported standalone runtime architecture: ${arch}`);
  }
  return { platform, arch };
}

function packageNameFromPnpmDirectory(directory) {
  const versionSeparator = directory.indexOf(
    "@",
    directory.startsWith("@") ? 1 : 0,
  );
  return versionSeparator > 0
    ? directory.slice(0, versionSeparator)
    : directory;
}

function isPlatformPackage(packageName) {
  return PLATFORM_PACKAGE_PREFIXES.some((prefix) =>
    packageName.startsWith(prefix),
  );
}

function matchesRuntimeTarget(packageName, target) {
  if (target.platform === "linux") {
    if (!packageName.includes(`linux-${target.arch}`)) return false;
    return !packageName.includes("musl");
  }
  return packageName.includes(`${target.platform}-${target.arch}`);
}

async function pruneForeignPlatformPackages() {
  const target = runtimeTarget();
  const entries = await fs.readdir(standalonePnpmRoot, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packageName = packageNameFromPnpmDirectory(entry.name);
    if (!isPlatformPackage(packageName)) continue;
    if (matchesRuntimeTarget(packageName, target)) continue;
    await fs.rm(resolve(standalonePnpmRoot, entry.name), {
      recursive: true,
      force: true,
    });
    removed += 1;
  }
  return { ...target, removed };
}

async function pruneBuildToolPackages() {
  const entries = await fs.readdir(standalonePnpmRoot, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packageName = packageNameFromPnpmDirectory(entry.name);
    if (
      !BUILD_ONLY_PACKAGES.has(packageName) &&
      !BUILD_ONLY_PACKAGE_PREFIXES.some((prefix) =>
        packageName.startsWith(prefix),
      )
    )
      continue;
    await fs.rm(resolve(standalonePnpmRoot, entry.name), {
      recursive: true,
      force: true,
    });
    removed += 1;
  }
  return removed;
}

async function pruneNextBuildOnlyInternals() {
  const entries = await fs.readdir(standalonePnpmRoot, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (packageNameFromPnpmDirectory(entry.name) !== "next") continue;
    const nextRoot = resolve(
      standalonePnpmRoot,
      entry.name,
      "node_modules/next",
    );
    const buildOnlyPaths = [
      "dist/compiled/@typescript/vfs",
      "dist/server/typescript",
      "dist/esm/server/typescript",
    ];
    for (const path of buildOnlyPaths) {
      const target = resolve(nextRoot, path);
      try {
        await fs.access(target);
      } catch {
        continue;
      }
      await fs.rm(target, { recursive: true, force: true });
      removed += 1;
    }
  }
  return removed;
}

async function walk(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function removeSourceMaps() {
  let removed = 0;
  for (const root of deliverableRoots) {
    for (const file of await walk(root)) {
      if (!file.endsWith(".map")) continue;
      await fs.rm(file, { force: true });
      removed += 1;
    }
  }
  return removed;
}

async function writeRuntimeManifest() {
  const appManifest = JSON.parse(
    await fs.readFile(resolve(appRoot, "package.json"), "utf8"),
  );
  const runtimeManifest = {
    name: "trainingload-selfhost-client-runtime",
    version: appManifest.version,
    private: true,
    license: "AGPL-3.0-only",
    type: "commonjs",
    engines: {
      node: ">=20",
    },
  };
  await fs.writeFile(
    standaloneManifestPath,
    `${JSON.stringify(runtimeManifest, null, 2)}\n`,
  );
}

async function writeSelfHostPublicAssets() {
  const sourceRoot = resolve(appRoot, "public");
  await fs.rm(selfHostPublicRoot, { recursive: true, force: true });
  await fs.cp(sourceRoot, selfHostPublicRoot, {
    recursive: true,
    filter: (source) => {
      const path = relative(sourceRoot, source).replaceAll("\\", "/");
      return !managedPublicAssets.has(path);
    },
  });
}

async function verifyDeliverable() {
  const findings = [];
  for (const root of deliverableRoots) {
    for (const file of await walk(root)) {
      const content = await fs.readFile(file);
      for (const marker of forbiddenMarkers) {
        if (content.includes(Buffer.from(marker))) {
          findings.push(
            `${relative(appRoot, file)} contains forbidden marker ${marker}`,
          );
        }
      }
    }
  }
  if (findings.length > 0) {
    throw new Error(
      `Self-host client artifact contains private implementation markers:\n${findings.join("\n")}`,
    );
  }
}

async function verifyRouteManifest() {
  const manifest = JSON.parse(
    await fs.readFile(
      resolve(nextRoot, "server/app-paths-manifest.json"),
      "utf8",
    ),
  );
  const forbiddenRoute =
    /(?:checkout|membership|gift|credit|billing|oauth\/callback)/i;
  const findings = Object.keys(manifest).filter((route) =>
    forbiddenRoute.test(route),
  );
  if (findings.length > 0) {
    throw new Error(
      `Self-host client route manifest contains Managed routes:\n${findings.join("\n")}`,
    );
  }
}

async function verifyArtifactSize() {
  const configured = Number.parseInt(
    process.env.SELF_HOST_CLIENT_ARTIFACT_MAX_BYTES || "",
    10,
  );
  const maximum =
    Number.isSafeInteger(configured) && configured > 0
      ? configured
      : 180 * 1024 * 1024;
  let bytes = 0;
  for (const root of deliverableRoots) {
    for (const file of await walk(root)) {
      bytes += (await fs.stat(file)).size;
    }
  }
  if (bytes > maximum) {
    throw new Error(
      `Self-host client artifact is ${bytes} bytes; limit is ${maximum} bytes`,
    );
  }
  return { bytes, maximum };
}

await writeRuntimeManifest();
await writeSelfHostPublicAssets();
const platformPrune = await pruneForeignPlatformPackages();
const removedBuildTools = await pruneBuildToolPackages();
const removedNextBuildInternals = await pruneNextBuildOnlyInternals();
const removedSourceMaps = await removeSourceMaps();
await verifyDeliverable();
await verifyRouteManifest();
const artifactSize = await verifyArtifactSize();
process.stdout.write(
  `Self-host client artifact: PASS (${artifactSize.bytes}/${artifactSize.maximum} bytes, ${removedSourceMaps} source maps removed, ${platformPrune.removed} foreign native packages removed for ${platformPrune.platform}/${platformPrune.arch}, ${removedBuildTools} build-only packages and ${removedNextBuildInternals} Next build-only internals removed)\n`,
);
