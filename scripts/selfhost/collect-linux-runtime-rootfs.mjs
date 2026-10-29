import {
  chmodSync,
  chownSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function parseLddOutput(output) {
  const dependencies = new Set();
  for (const line of output.split("\n")) {
    if (/=>\s+not found\b/.test(line)) {
      throw new Error(`unresolved dynamic library: ${line.trim()}`);
    }
    const mapped = line.match(/=>\s+(\/\S+)/)?.[1];
    const direct = line.match(/^\s*(\/\S+)/)?.[1];
    const path = mapped ?? direct;
    if (path) dependencies.add(path);
  }
  return [...dependencies];
}

export function selectDpkgStatus(status, packageNames) {
  const selected = [];
  const wanted = new Set(packageNames);
  for (const paragraph of status.trim().split(/\n\n+/)) {
    const name = paragraph.match(/^Package:\s*(\S+)$/m)?.[1];
    if (name && wanted.has(name)) selected.push(paragraph);
  }
  return selected.length ? `${selected.join("\n\n")}\n` : "";
}

function copyAbsoluteFile(outputRoot, source) {
  if (!existsSync(source)) return;
  const destination = resolve(outputRoot, source.slice(1));
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  chmodSync(destination, statSync(source).mode);
}

function collectDynamicLibraries(outputRoot, binary) {
  const result = spawnSync("ldd", [binary], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `ldd failed for ${binary}: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  for (const dependency of parseLddOutput(result.stdout)) {
    copyAbsoluteFile(outputRoot, dependency);
  }
}

function walkNativeFiles(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walkNativeFiles(path, files);
    else if (
      entry.isFile() &&
      (entry.name.endsWith(".node") ||
        entry.name.endsWith(".so") ||
        entry.name.includes(".so."))
    ) {
      files.push(path);
    }
  }
  return files;
}

function copyOptionalDirectory(outputRoot, source) {
  if (!existsSync(source)) return;
  cpSync(source, resolve(outputRoot, source.slice(1)), {
    dereference: true,
    recursive: true,
  });
}

function writeIdentityFiles(outputRoot) {
  const etc = resolve(outputRoot, "etc");
  mkdirSync(etc, { recursive: true });
  writeFileSync(
    resolve(etc, "passwd"),
    "trainingload:x:10001:10001:trainingload:/nonexistent:/sbin/nologin\n",
  );
  writeFileSync(resolve(etc, "group"), "trainingload:x:10001:\n");
  for (const source of ["/etc/nsswitch.conf", "/etc/os-release"]) {
    copyAbsoluteFile(outputRoot, source);
  }
}

function containsBasename(directory, name) {
  if (!existsSync(directory)) return false;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === name) return true;
    if (
      entry.isDirectory() &&
      containsBasename(resolve(directory, entry.name), name)
    ) {
      return true;
    }
  }
  return false;
}

function writeDpkgInventory(outputRoot) {
  const packages = new Set([
    "base-files",
    "ca-certificates",
    "libc6",
    "tzdata",
  ]);
  if (containsBasename(resolve(outputRoot, "lib"), "libgcc_s.so.1")) {
    packages.add("libgcc-s1");
  }
  if (containsBasename(resolve(outputRoot, "lib"), "libstdc++.so.6")) {
    packages.add("libstdc++6");
  }
  if (containsBasename(resolve(outputRoot, "lib"), "libssl.so.3")) {
    packages.add("libssl3");
  }
  if (existsSync(resolve(outputRoot, "usr/bin/openssl"))) {
    packages.add("openssl");
  }

  const sourceStatus = "/var/lib/dpkg/status";
  if (!existsSync(sourceStatus)) return;
  const status = selectDpkgStatus(readFileSync(sourceStatus, "utf8"), packages);
  const destination = resolve(outputRoot, "var/lib/dpkg/status");
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, status);

  for (const packageName of packages) {
    const copyright = `/usr/share/doc/${packageName}/copyright`;
    if (existsSync(copyright)) {
      copyAbsoluteFile(outputRoot, copyright);
    }
  }
}

function main() {
  if (process.platform !== "linux") {
    throw new Error("minimal runtime rootfs can only be collected on Linux");
  }

  const outputRoot = resolve(process.argv[2] ?? "");
  const scanRoots = process.argv.slice(3).map((path) => resolve(path));
  if (!outputRoot || scanRoots.length === 0) {
    throw new Error(
      "usage: collect-linux-runtime-rootfs.mjs <output> <scan-root...>",
    );
  }

  mkdirSync(outputRoot, { recursive: true });
  const nodeSource = "/usr/local/bin/node";
  copyAbsoluteFile(outputRoot, nodeSource);
  const nodeDestination = resolve(outputRoot, "usr/local/bin/node");
  const strip = spawnSync("strip", ["--strip-unneeded", nodeDestination], {
    encoding: "utf8",
  });
  if (strip.status !== 0) {
    throw new Error(`failed to strip Node: ${strip.stderr.trim()}`);
  }
  collectDynamicLibraries(outputRoot, nodeSource);

  const openssl = "/usr/bin/openssl";
  if (existsSync(openssl)) {
    copyAbsoluteFile(outputRoot, openssl);
    collectDynamicLibraries(outputRoot, openssl);
  }

  let nativeFiles = 0;
  for (const scanRoot of scanRoots) {
    for (const file of walkNativeFiles(scanRoot)) {
      collectDynamicLibraries(outputRoot, file);
      nativeFiles += 1;
    }
  }

  for (const source of [
    "/etc/ssl/certs/ca-certificates.crt",
    "/etc/ssl/openssl.cnf",
    "/usr/local/LICENSE",
  ]) {
    copyAbsoluteFile(outputRoot, source);
  }
  copyOptionalDirectory(outputRoot, "/usr/share/zoneinfo");
  writeIdentityFiles(outputRoot);
  writeDpkgInventory(outputRoot);

  for (const directory of ["tmp", "nonexistent"]) {
    const path = resolve(outputRoot, directory);
    mkdirSync(path, { recursive: true });
    chmodSync(path, directory === "tmp" ? 0o1777 : 0o755);
  }
  for (const directory of (process.env.RUNTIME_DATA_DIRS ?? "")
    .split(":")
    .filter(Boolean)) {
    const path = resolve(outputRoot, directory.replace(/^\/+/, ""));
    mkdirSync(path, { recursive: true });
    chownSync(path, 10001, 10001);
    chmodSync(path, directory.endsWith("/operations") ? 0o700 : 0o755);
  }

  process.stdout.write(
    `Minimal Linux runtime rootfs: PASS (${nativeFiles} native files scanned)\n`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main();
}
