import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";

import type { DesktopDataRoot } from "./data-root.js";
import { assertEmptyDirectory } from "./data-root.js";

const BACKUP_MANIFEST = "manifest.json";
const DATABASE_BACKUP = "database.pglite.gz";
const UPLOADS_DIRECTORY = "uploads";
const BACKUP_SCHEMA_VERSION = 1;

interface BackupFile {
  path: string;
  size: number;
  sha256: string;
}

interface DesktopBackupManifest {
  product: "trainingload-desktop";
  schemaVersion: 1;
  createdAt: string;
  credentialPolicy: "re-enter-external-api-keys";
  files: BackupFile[];
}

interface CreateDesktopBackupOptions {
  source: DesktopDataRoot;
  destination: string;
  backupDatabase: (destination: string) => Promise<void>;
}

interface RestoreDesktopBackupOptions {
  source: string;
  target: DesktopDataRoot;
  restoreDatabase: (
    backupPath: string,
    databaseDirectory: string,
  ) => Promise<void>;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(path: string): Promise<BackupFile> {
  const details = await stat(path);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return {
    path: "",
    size: details.size,
    sha256: hash.digest("hex"),
  };
}

function archivePath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function resolveArchivePath(root: string, path: string): string {
  if (
    path.includes("\\") ||
    posix.isAbsolute(path) ||
    posix.normalize(path) !== path ||
    path === "." ||
    path.startsWith("../")
  ) {
    throw Object.assign(new Error(`Unsafe desktop backup path: ${path}`), {
      code: "DESKTOP_BACKUP_PATH_INVALID",
    });
  }
  const resolved = resolve(root, ...path.split("/"));
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    throw Object.assign(new Error(`Unsafe desktop backup path: ${path}`), {
      code: "DESKTOP_BACKUP_PATH_INVALID",
    });
  }
  return resolved;
}

async function copyRegularTree(
  source: string,
  destination: string,
  archiveRoot: string,
  files: BackupFile[],
): Promise<void> {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const entries = await readdir(source, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyRegularTree(from, to, archiveRoot, files);
      continue;
    }
    if (!entry.isFile()) {
      throw Object.assign(
        new Error(`Desktop backup refuses non-regular upload: ${from}`),
        { code: "DESKTOP_BACKUP_UNSUPPORTED_FILE" },
      );
    }
    await mkdir(dirname(to), { recursive: true, mode: 0o700 });
    await copyFile(from, to);
    const record = await hashFile(to);
    record.path = archivePath(archiveRoot, to);
    files.push(record);
  }
}

async function listBundleFiles(
  root: string,
  directory = root,
): Promise<string[]> {
  const result: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listBundleFiles(root, path)));
    } else if (entry.isFile()) {
      result.push(archivePath(root, path));
    } else {
      throw Object.assign(new Error(`Unsupported backup entry: ${path}`), {
        code: "DESKTOP_BACKUP_UNSUPPORTED_FILE",
      });
    }
  }
  return result;
}

async function readAndValidateManifest(
  source: string,
): Promise<DesktopBackupManifest> {
  let manifest: DesktopBackupManifest;
  try {
    manifest = JSON.parse(
      await readFile(join(source, BACKUP_MANIFEST), "utf8"),
    ) as DesktopBackupManifest;
  } catch (error) {
    throw Object.assign(new Error("Desktop backup manifest is invalid"), {
      code: "DESKTOP_BACKUP_MANIFEST_INVALID",
      cause: error,
    });
  }
  if (
    manifest.product !== "trainingload-desktop" ||
    manifest.schemaVersion !== BACKUP_SCHEMA_VERSION ||
    manifest.credentialPolicy !== "re-enter-external-api-keys" ||
    !Array.isArray(manifest.files)
  ) {
    throw Object.assign(new Error("Unsupported desktop backup manifest"), {
      code: "DESKTOP_BACKUP_MANIFEST_UNSUPPORTED",
    });
  }
  const paths = new Set<string>();
  for (const file of manifest.files) {
    resolveArchivePath(source, file.path);
    if (
      paths.has(file.path) ||
      (!file.path.startsWith(`${UPLOADS_DIRECTORY}/`) &&
        file.path !== DATABASE_BACKUP) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw Object.assign(
        new Error("Desktop backup file manifest is invalid"),
        {
          code: "DESKTOP_BACKUP_MANIFEST_INVALID",
        },
      );
    }
    paths.add(file.path);
  }
  if (!paths.has(DATABASE_BACKUP)) {
    throw Object.assign(new Error("Desktop backup database is missing"), {
      code: "DESKTOP_BACKUP_DATABASE_MISSING",
    });
  }
  const actualFiles = (await listBundleFiles(source)).filter(
    (path) => path !== BACKUP_MANIFEST,
  );
  const expectedFiles = [...paths].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw Object.assign(
      new Error("Desktop backup contents do not match manifest"),
      {
        code: "DESKTOP_BACKUP_CONTENT_MISMATCH",
      },
    );
  }
  for (const file of manifest.files) {
    const path = resolveArchivePath(source, file.path);
    const details = await lstat(path);
    const actual = await hashFile(path);
    if (
      !details.isFile() ||
      actual.size !== file.size ||
      actual.sha256 !== file.sha256
    ) {
      throw Object.assign(
        new Error(`Desktop backup checksum failed: ${file.path}`),
        {
          code: "DESKTOP_BACKUP_CHECKSUM_MISMATCH",
        },
      );
    }
  }
  return manifest;
}

export async function createDesktopBackupBundle({
  source,
  destination,
  backupDatabase,
}: CreateDesktopBackupOptions): Promise<void> {
  const bundle = resolve(destination);
  if (await exists(bundle)) {
    throw Object.assign(
      new Error("Desktop backup destination already exists"),
      {
        code: "DESKTOP_BACKUP_DESTINATION_EXISTS",
      },
    );
  }
  await mkdir(bundle, { recursive: false, mode: 0o700 });
  try {
    const files: BackupFile[] = [];
    const databasePath = join(bundle, DATABASE_BACKUP);
    await backupDatabase(databasePath);
    const databaseRecord = await hashFile(databasePath);
    databaseRecord.path = DATABASE_BACKUP;
    files.push(databaseRecord);
    await copyRegularTree(
      source.uploads,
      join(bundle, UPLOADS_DIRECTORY),
      bundle,
      files,
    );
    files.sort((left, right) => left.path.localeCompare(right.path));
    const manifest: DesktopBackupManifest = {
      product: "trainingload-desktop",
      schemaVersion: BACKUP_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      credentialPolicy: "re-enter-external-api-keys",
      files,
    };
    await writeFile(
      join(bundle, BACKUP_MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
  } catch (error) {
    await rm(bundle, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreDesktopBackupBundle({
  source,
  target,
  restoreDatabase,
}: RestoreDesktopBackupOptions): Promise<void> {
  const bundle = resolve(source);
  const bundleDetails = await stat(bundle);
  if (!bundleDetails.isDirectory()) {
    throw Object.assign(new Error("Desktop backup must be a directory"), {
      code: "DESKTOP_BACKUP_NOT_DIRECTORY",
    });
  }
  const manifest = await readAndValidateManifest(bundle);
  await Promise.all([
    assertEmptyDirectory(target.database, "DESKTOP_RESTORE_TARGET_NOT_EMPTY"),
    assertEmptyDirectory(target.uploads, "DESKTOP_RESTORE_TARGET_NOT_EMPTY"),
  ]);

  const staging = join(target.root, `.restore-${randomUUID()}`);
  const stagingDatabase = join(staging, "database");
  const stagingUploads = join(staging, "uploads");
  await mkdir(stagingUploads, { recursive: true, mode: 0o700 });
  try {
    await restoreDatabase(join(bundle, DATABASE_BACKUP), stagingDatabase);
    for (const file of manifest.files) {
      if (!file.path.startsWith(`${UPLOADS_DIRECTORY}/`)) continue;
      const relativeUpload = file.path.slice(UPLOADS_DIRECTORY.length + 1);
      const destination = resolveArchivePath(stagingUploads, relativeUpload);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await copyFile(resolveArchivePath(bundle, file.path), destination);
    }
    await rm(target.database, { recursive: true });
    await rm(target.uploads, { recursive: true });
    await rename(stagingDatabase, target.database);
    await rename(stagingUploads, target.uploads);
    await rm(staging, { recursive: true, force: true });
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
