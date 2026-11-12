import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export const DESKTOP_DATA_ROOT_MARKER = ".trainingload-desktop.json";
export const DESKTOP_DATA_ROOT_SCHEMA_VERSION = 1;

export interface DesktopDataRoot {
  root: string;
  database: string;
  uploads: string;
  cache: string;
  backups: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveDefaultDataRoot(
  applicationRoot: string,
): Promise<string> {
  const legacyRoot = join(applicationRoot, "data");
  const targetRoot = join(applicationRoot, "user", "data");
  let legacyStat;
  try {
    legacyStat = await lstat(legacyRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return targetRoot;
    throw error;
  }

  const invalidLegacyRoot = () =>
    Object.assign(
      new Error("Refusing to migrate an unknown desktop data directory"),
      { code: "DESKTOP_LEGACY_DATA_ROOT_INVALID" },
    );
  if (!legacyStat.isDirectory() || legacyStat.isSymbolicLink()) {
    throw invalidLegacyRoot();
  }
  let marker;
  try {
    marker = JSON.parse(
      await readFile(join(legacyRoot, DESKTOP_DATA_ROOT_MARKER), "utf8"),
    );
  } catch {
    throw invalidLegacyRoot();
  }
  if (
    marker.product !== "trainingload-desktop" ||
    marker.schemaVersion !== DESKTOP_DATA_ROOT_SCHEMA_VERSION
  ) {
    throw invalidLegacyRoot();
  }
  try {
    await lstat(targetRoot);
    throw Object.assign(
      new Error(
        "Both desktop data directories exist; refusing to overwrite either",
      ),
      {
        code: "DESKTOP_DATA_ROOT_CONFLICT",
      },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  // The single-instance lock is held before startup. Rename preserves all data
  // on the same filesystem without creating a second, partially copied database.
  await mkdir(dirname(targetRoot), { recursive: true });
  await rename(legacyRoot, targetRoot);
  return targetRoot;
}

export async function initializeDataRoot(
  input: string,
): Promise<DesktopDataRoot> {
  const root = resolve(input);
  await mkdir(root, { recursive: true });
  const markerPath = join(root, DESKTOP_DATA_ROOT_MARKER);
  const entries = await readdir(root);

  if (!(await exists(markerPath)) && entries.length > 0) {
    const error = new Error(
      "Refusing to initialize an unknown non-empty desktop data directory",
    );
    Object.assign(error, { code: "DESKTOP_DATA_ROOT_NOT_EMPTY" });
    throw error;
  }

  if (await exists(markerPath)) {
    const marker = JSON.parse(await readFile(markerPath, "utf8")) as {
      schemaVersion?: number;
    };
    if (marker.schemaVersion !== DESKTOP_DATA_ROOT_SCHEMA_VERSION) {
      const error = new Error("Unsupported desktop data root marker");
      Object.assign(error, { code: "DESKTOP_DATA_ROOT_MARKER_UNSUPPORTED" });
      throw error;
    }
  } else {
    await writeFile(
      markerPath,
      `${JSON.stringify(
        {
          product: "trainingload-desktop",
          schemaVersion: DESKTOP_DATA_ROOT_SCHEMA_VERSION,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
  }

  const dataRoot = {
    root,
    database: join(root, "database"),
    uploads: join(root, "uploads"),
    cache: join(root, "cache"),
    backups: join(root, "backups"),
  };
  await Promise.all(
    Object.values(dataRoot)
      .filter((path) => path !== root)
      .map((path) => mkdir(path, { recursive: true })),
  );
  return dataRoot;
}

export async function assertEmptyDirectory(
  path: string,
  code: string,
): Promise<void> {
  await mkdir(path, { recursive: true });
  if ((await readdir(path)).length > 0) {
    const error = new Error("Desktop restore target is not empty");
    Object.assign(error, { code });
    throw error;
  }
}

export async function assertEmptyDatabaseDirectory(
  path: string,
): Promise<void> {
  return assertEmptyDirectory(path, "DESKTOP_RESTORE_TARGET_NOT_EMPTY");
}
