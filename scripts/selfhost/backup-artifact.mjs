import { createHash, randomUUID } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import {
  hardenPrivatePath,
  isFilesystemErrorCode,
  rethrowAfterPrivateHandleCleanup,
  rethrowAfterPrivateTemporaryCleanup,
} from "./private-path.mjs";

const MAX_JSON_METADATA_BYTES = 1024 * 1024;
const MAX_CHECKSUM_BYTES = 16 * 1024 * 1024;
export const BACKUP_ARTIFACT_LIMITS = Object.freeze({
  maximumUploadFiles: 100_000,
  maximumTreeFiles: 100_006,
  maximumTreeDirectories: 100_000,
  maximumTreeDepth: 64,
  maximumJsonMetadataBytes: MAX_JSON_METADATA_BYTES,
  maximumChecksumBytes: MAX_CHECKSUM_BYTES,
});
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ROOT_FILES = new Set([
  "backup-manifest.json",
  "backup-result.json",
  "checksums.txt",
  "configuration.json",
  "database.dump",
  "secret-references.json",
  "uploads",
]);

export async function rethrowAfterPathCleanup(
  originalError,
  cleanups,
  dependencies = {},
) {
  const cleanupErrors = [];
  for (const cleanup of cleanups) {
    try {
      if (dependencies.removePath) {
        await dependencies.removePath(cleanup.path, cleanup.options);
      } else {
        await fs.rm(cleanup.path, cleanup.options);
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length) {
    const failure = new AggregateError(
      [...(originalError ? [originalError] : []), ...cleanupErrors],
      originalError
        ? "operation failed and required path cleanup was incomplete"
        : "required path cleanup was incomplete",
    );
    failure.code =
      cleanupErrors.find((error) => isFilesystemErrorCode(error?.code))?.code ??
      "EIO";
    throw failure;
  }
  if (originalError) throw originalError;
}

function hasExactKeys(value, expected) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expected].sort().join(",")
  );
}

function portableRelative(root, path) {
  return relative(root, path).split(sep).join("/");
}

function assertPortablePath(path) {
  const segments = path.split("/");
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[\0\r\n]/.test(path) ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes(":") ||
        /[. ]$/.test(segment) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
    )
  ) {
    throw new Error(`unsafe backup path: ${JSON.stringify(path)}`);
  }
}

export function assertPortablePathInventory(entries, label = "portable tree") {
  const seen = new Map();
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      !["file", "directory"].includes(entry.kind)
    ) {
      throw new TypeError(`${label} contains an invalid path descriptor`);
    }
    const segments = entry.path.split("/");
    for (let depth = 1; depth <= segments.length; depth += 1) {
      const path = segments.slice(0, depth).join("/");
      const kind = depth === segments.length ? entry.kind : "directory";
      const key = path.normalize("NFKC").toLowerCase().normalize("NFKC");
      const previous = seen.get(key);
      if (previous && (previous.path !== path || previous.kind !== kind)) {
        throw new Error(
          `${label} contains a case-insensitive or structural path collision: ${previous.path} / ${path}`,
        );
      }
      seen.set(key, { path, kind });
    }
  }
  return entries;
}

export async function consumeRegularFileBounded(
  path,
  consumeChunk,
  {
    maximumBytes = Number.MAX_SAFE_INTEGER,
    minimumBytes = 0,
    expectedSizeBytes = null,
    chunkBytes = 1024 * 1024,
    label = "file stream",
  } = {},
) {
  if (
    typeof consumeChunk !== "function" ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 0 ||
    !Number.isSafeInteger(minimumBytes) ||
    minimumBytes < 0 ||
    minimumBytes > maximumBytes ||
    (expectedSizeBytes !== null &&
      (!Number.isSafeInteger(expectedSizeBytes) || expectedSizeBytes < 0)) ||
    !Number.isSafeInteger(chunkBytes) ||
    chunkBytes < 1 ||
    chunkBytes > 16 * 1024 * 1024
  ) {
    throw new TypeError(`${label} has invalid stream bounds`);
  }
  const pathStat = await fs.lstat(path);
  if (
    !pathStat.isFile() ||
    pathStat.isSymbolicLink() ||
    !Number.isSafeInteger(pathStat.size) ||
    pathStat.size < minimumBytes ||
    pathStat.size > maximumBytes ||
    (expectedSizeBytes !== null && pathStat.size !== expectedSizeBytes)
  ) {
    throw new Error(`${label} is not a bounded regular file: ${path}`);
  }
  const handle = await fs.open(path, "r");
  let operationError = null;
  let finalStat;
  try {
    const openedStat = await handle.stat();
    if (
      !openedStat.isFile() ||
      openedStat.dev !== pathStat.dev ||
      openedStat.ino !== pathStat.ino ||
      openedStat.size !== pathStat.size ||
      openedStat.mtimeMs !== pathStat.mtimeMs ||
      openedStat.ctimeMs !== pathStat.ctimeMs
    ) {
      throw new Error(`${label} changed before opening: ${path}`);
    }
    const buffer = Buffer.allocUnsafe(
      Math.min(Math.max(openedStat.size, 1), chunkBytes),
    );
    let position = 0;
    while (position < openedStat.size) {
      const requested = Math.min(buffer.length, openedStat.size - position);
      const { bytesRead } = await handle.read(buffer, 0, requested, position);
      if (bytesRead <= 0) {
        throw new Error(`${label} changed while reading: ${path}`);
      }
      await consumeChunk(buffer.subarray(0, bytesRead), position);
      position += bytesRead;
    }
    const trailing = await handle.read(buffer, 0, 1, openedStat.size);
    finalStat = await handle.stat();
    if (
      trailing.bytesRead !== 0 ||
      finalStat.dev !== openedStat.dev ||
      finalStat.ino !== openedStat.ino ||
      finalStat.size !== openedStat.size ||
      finalStat.mtimeMs !== openedStat.mtimeMs ||
      finalStat.ctimeMs !== openedStat.ctimeMs
    ) {
      throw new Error(`${label} changed while reading: ${path}`);
    }
  } catch (error) {
    operationError = error;
  }
  await rethrowAfterPrivateHandleCleanup(operationError, [handle]);
  return { stat: finalStat };
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  await consumeRegularFileBounded(path, (chunk) => hash.update(chunk), {
    label: "SHA-256 input",
  });
  return hash.digest("hex");
}

function serializedBytes(content) {
  if (typeof content === "string") return Buffer.from(content, "utf8");
  if (Buffer.isBuffer(content) || content instanceof Uint8Array) {
    return Buffer.from(content);
  }
  throw new TypeError(
    "artifact content must be a string, Buffer, or Uint8Array",
  );
}

async function syncDirectory(path) {
  if (process.platform === "win32") return;
  const handle = await fs.open(path, constants.O_RDONLY);
  let operationError = null;
  try {
    await handle.sync();
  } catch (error) {
    operationError = error;
  }
  await rethrowAfterPrivateHandleCleanup(operationError, [handle]);
}

async function syncRegularFile(path) {
  const handle = await fs.open(path, constants.O_RDWR);
  let operationError = null;
  try {
    await handle.sync();
  } catch (error) {
    operationError = error;
  }
  await rethrowAfterPrivateHandleCleanup(operationError, [handle]);
}

async function stageRegularFile(path, content, mode) {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) {
    throw new TypeError("artifact mode must be a POSIX permission mode");
  }
  const output = resolve(path);
  const parent = dirname(output);
  const parentStat = await fs.lstat(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error(`artifact parent is not a real directory: ${parent}`);
  }
  const bytes = serializedBytes(content);
  const temporary = resolve(
    parent,
    `.${basename(output)}.${process.pid}.${randomUUID()}.partial`,
  );
  let handle;
  try {
    handle = await fs.open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      mode,
    );
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await hardenPrivatePath(temporary, { kind: "file", mode });
    await syncRegularFile(temporary);
    const stat = await fs.lstat(temporary);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== bytes.length) {
      throw new Error(
        `staged artifact is not the intended regular file: ${path}`,
      );
    }
    return { output, parent, temporary, stat };
  } catch (error) {
    await rethrowAfterPrivateTemporaryCleanup(error, handle, temporary);
  }
}

function isSamePublishedFile(actual, expected) {
  return (
    actual.isFile() &&
    !actual.isSymbolicLink() &&
    actual.dev === expected.dev &&
    actual.ino === expected.ino &&
    actual.size === expected.size &&
    actual.mtimeMs === expected.mtimeMs
  );
}

export async function publishRegularFilesExclusive(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError("exclusive artifact publication requires files");
  }
  const normalized = entries.map((entry) => {
    if (!entry || typeof entry.path !== "string" || !entry.path) {
      throw new TypeError("exclusive artifact output path is required");
    }
    return {
      path: resolve(entry.path),
      content: entry.content,
      mode: entry.mode ?? 0o600,
    };
  });
  const pathKeys = normalized.map(({ path }) =>
    path.normalize("NFKC").toLowerCase().normalize("NFKC"),
  );
  if (new Set(pathKeys).size !== pathKeys.length) {
    throw new Error("exclusive artifact outputs contain a path collision");
  }
  for (const { path } of normalized) {
    const existing = await fs.lstat(path).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (existing) throw new Error(`artifact output already exists: ${path}`);
  }

  const stagedFiles = [];
  const publishedFiles = [];
  try {
    for (const entry of normalized) {
      stagedFiles.push(
        await stageRegularFile(entry.path, entry.content, entry.mode),
      );
    }
    for (const staged of stagedFiles) {
      await fs.link(staged.temporary, staged.output);
      const published = await fs.lstat(staged.output);
      if (!isSamePublishedFile(published, staged.stat)) {
        throw new Error(
          `published artifact identity changed: ${staged.output}`,
        );
      }
      publishedFiles.push(staged);
    }
    await Promise.all(stagedFiles.map(({ temporary }) => fs.unlink(temporary)));
    await Promise.all(
      [...new Set(stagedFiles.map(({ parent }) => parent))].map(syncDirectory),
    );
    return stagedFiles.map(({ output }) => output);
  } catch (error) {
    const cleanupErrors = [];
    for (const staged of publishedFiles.reverse()) {
      try {
        const current = await fs.lstat(staged.output).catch((lstatError) => {
          if (lstatError?.code === "ENOENT") return null;
          throw lstatError;
        });
        if (current && isSamePublishedFile(current, staged.stat)) {
          await fs.unlink(staged.output);
        }
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    for (const { temporary } of stagedFiles) {
      await fs.unlink(temporary).catch((cleanupError) => {
        if (cleanupError?.code !== "ENOENT") cleanupErrors.push(cleanupError);
      });
    }
    for (const parent of new Set(stagedFiles.map(({ parent }) => parent))) {
      await syncDirectory(parent).catch((cleanupError) => {
        cleanupErrors.push(cleanupError);
      });
    }
    if (cleanupErrors.length) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        "exclusive artifact publication failed and rollback was incomplete",
      );
    }
    throw error;
  }
}

export async function publishRegularFileExclusive(
  path,
  content,
  { mode = 0o600 } = {},
) {
  const [output] = await publishRegularFilesExclusive([
    { path, content, mode },
  ]);
  return output;
}

export async function replaceRegularFileAtomically(
  path,
  content,
  { mode = 0o600 } = {},
) {
  const staged = await stageRegularFile(path, content, mode);
  try {
    const existing = await fs.lstat(staged.output).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
      throw new Error(
        `refusing to replace an unsafe artifact: ${staged.output}`,
      );
    }
    await fs.rename(staged.temporary, staged.output);
    const published = await fs.lstat(staged.output);
    if (!isSamePublishedFile(published, staged.stat)) {
      throw new Error(`replaced artifact identity changed: ${staged.output}`);
    }
    await syncDirectory(staged.parent);
    return staged.output;
  } catch (error) {
    await rethrowAfterPrivateTemporaryCleanup(error, null, staged.temporary);
  }
}

export class DirectoryEntryLimitError extends Error {
  constructor(maximumEntries) {
    super(`directory exceeds the ${maximumEntries} entry scan limit`);
    this.name = "DirectoryEntryLimitError";
    this.maximumEntries = maximumEntries;
  }
}

export class CumulativeByteLimitError extends Error {
  constructor(maximumBytes) {
    super(`scan exceeds the ${maximumBytes} cumulative byte limit`);
    this.name = "CumulativeByteLimitError";
    this.maximumBytes = maximumBytes;
  }
}

export function consumeByteBudget(budget, bytes) {
  if (
    !budget ||
    !Number.isSafeInteger(budget.maximumBytes) ||
    budget.maximumBytes < 0 ||
    !Number.isSafeInteger(budget.consumedBytes) ||
    budget.consumedBytes < 0 ||
    !Number.isSafeInteger(bytes) ||
    bytes < 0
  ) {
    throw new TypeError(
      "byte budget values must be non-negative safe integers",
    );
  }
  if (bytes > budget.maximumBytes - budget.consumedBytes) {
    throw new CumulativeByteLimitError(budget.maximumBytes);
  }
  budget.consumedBytes += bytes;
  return budget.consumedBytes;
}

export async function copyRegularFileBounded(
  source,
  destination,
  {
    maximumBytes = Infinity,
    minimumBytes = 0,
    mode = 0o600,
    parentMode = 0o700,
    expectedSizeBytes = null,
    label = "file copy",
  } = {},
) {
  if (
    (!Number.isSafeInteger(maximumBytes) && maximumBytes !== Infinity) ||
    maximumBytes < 0 ||
    !Number.isSafeInteger(minimumBytes) ||
    minimumBytes < 0 ||
    minimumBytes > maximumBytes ||
    !Number.isSafeInteger(mode) ||
    mode < 0 ||
    !Number.isSafeInteger(parentMode) ||
    parentMode < 0 ||
    (expectedSizeBytes !== null &&
      (!Number.isSafeInteger(expectedSizeBytes) || expectedSizeBytes < 0))
  ) {
    throw new TypeError(`${label} has invalid bounds or modes`);
  }
  const sourceStat = await fs.lstat(source);
  if (
    !sourceStat.isFile() ||
    sourceStat.isSymbolicLink() ||
    sourceStat.size < minimumBytes ||
    sourceStat.size > maximumBytes ||
    (expectedSizeBytes !== null && sourceStat.size !== expectedSizeBytes)
  ) {
    throw new Error(`${label} source is not a bounded regular file: ${source}`);
  }
  await fs.mkdir(dirname(destination), { recursive: true, mode: parentMode });
  const sourceHandle = await fs.open(source, "r");
  let destinationHandle;
  let destinationCreated = false;
  let operationError = null;
  try {
    const openedStat = await sourceHandle.stat();
    if (
      !openedStat.isFile() ||
      openedStat.dev !== sourceStat.dev ||
      openedStat.ino !== sourceStat.ino ||
      openedStat.size !== sourceStat.size ||
      openedStat.mtimeMs !== sourceStat.mtimeMs ||
      openedStat.ctimeMs !== sourceStat.ctimeMs
    ) {
      throw new Error(`${label} source changed before opening: ${source}`);
    }
    destinationHandle = await fs.open(destination, "wx", mode);
    destinationCreated = true;
    const buffer = Buffer.allocUnsafe(
      Math.min(Math.max(openedStat.size, 1), 1024 * 1024),
    );
    let position = 0;
    while (position < openedStat.size) {
      const requested = Math.min(buffer.length, openedStat.size - position);
      let received = 0;
      while (received < requested) {
        const { bytesRead } = await sourceHandle.read(
          buffer,
          received,
          requested - received,
          position + received,
        );
        if (bytesRead <= 0) {
          throw new Error(`${label} source changed while reading: ${source}`);
        }
        received += bytesRead;
      }
      let written = 0;
      while (written < received) {
        const { bytesWritten } = await destinationHandle.write(
          buffer,
          written,
          received - written,
          position + written,
        );
        if (bytesWritten <= 0) {
          throw new Error(
            `${label} destination stopped accepting bytes: ${destination}`,
          );
        }
        written += bytesWritten;
      }
      position += received;
    }
    const trailing = await sourceHandle.read(buffer, 0, 1, openedStat.size);
    const finalSourceStat = await sourceHandle.stat();
    if (
      trailing.bytesRead !== 0 ||
      finalSourceStat.dev !== openedStat.dev ||
      finalSourceStat.ino !== openedStat.ino ||
      finalSourceStat.size !== openedStat.size ||
      finalSourceStat.mtimeMs !== openedStat.mtimeMs ||
      finalSourceStat.ctimeMs !== openedStat.ctimeMs
    ) {
      throw new Error(`${label} source changed while reading: ${source}`);
    }
    await destinationHandle.sync();
  } catch (error) {
    operationError = error;
  }
  try {
    await rethrowAfterPrivateHandleCleanup(operationError, [
      destinationHandle,
      sourceHandle,
    ]);
  } catch (error) {
    operationError = error;
  }
  if (operationError) {
    if (destinationCreated) {
      try {
        await fs.rm(destination, { force: true });
      } catch (cleanupError) {
        throw new AggregateError(
          [operationError, cleanupError],
          `${label} failed and could not remove its partial destination`,
        );
      }
    }
    throw operationError;
  }
  let destinationStat;
  try {
    destinationStat = await fs.lstat(destination);
    if (
      !destinationStat.isFile() ||
      destinationStat.isSymbolicLink() ||
      destinationStat.size !== sourceStat.size ||
      destinationStat.size > maximumBytes
    ) {
      throw new Error(`${label} destination differs from its bounded source`);
    }
  } catch (error) {
    try {
      await fs.rm(destination, { force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `${label} postcondition failed and could not remove its destination`,
      );
    }
    throw error;
  }
  return { destination, sizeBytes: destinationStat.size };
}

export async function readRegularFileBounded(
  path,
  {
    maximumBytes,
    minimumBytes = 0,
    expectedSizeBytes = null,
    label = "file read",
  } = {},
) {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 0 ||
    !Number.isSafeInteger(minimumBytes) ||
    minimumBytes < 0 ||
    minimumBytes > maximumBytes ||
    (expectedSizeBytes !== null &&
      (!Number.isSafeInteger(expectedSizeBytes) || expectedSizeBytes < 0))
  ) {
    throw new TypeError(`${label} has invalid byte bounds`);
  }
  const pathStat = await fs.lstat(path);
  if (
    !pathStat.isFile() ||
    pathStat.isSymbolicLink() ||
    pathStat.size < minimumBytes ||
    pathStat.size > maximumBytes ||
    (expectedSizeBytes !== null && pathStat.size !== expectedSizeBytes)
  ) {
    throw new Error(`${label} is not a bounded regular file: ${path}`);
  }
  const handle = await fs.open(path, "r");
  let operationError = null;
  let contents;
  let finalStat;
  try {
    const openedStat = await handle.stat();
    if (
      !openedStat.isFile() ||
      openedStat.dev !== pathStat.dev ||
      openedStat.ino !== pathStat.ino ||
      openedStat.size !== pathStat.size ||
      openedStat.mtimeMs !== pathStat.mtimeMs ||
      openedStat.ctimeMs !== pathStat.ctimeMs
    ) {
      throw new Error(`${label} changed before opening: ${path}`);
    }
    const buffer = Buffer.allocUnsafe(Math.max(openedStat.size, 1));
    let position = 0;
    while (position < openedStat.size) {
      const { bytesRead } = await handle.read(
        buffer,
        position,
        openedStat.size - position,
        position,
      );
      if (bytesRead <= 0) {
        throw new Error(`${label} changed while reading: ${path}`);
      }
      position += bytesRead;
    }
    const trailing = await handle.read(buffer, 0, 1, openedStat.size);
    finalStat = await handle.stat();
    if (
      trailing.bytesRead !== 0 ||
      finalStat.dev !== openedStat.dev ||
      finalStat.ino !== openedStat.ino ||
      finalStat.size !== openedStat.size ||
      finalStat.mtimeMs !== openedStat.mtimeMs ||
      finalStat.ctimeMs !== openedStat.ctimeMs
    ) {
      throw new Error(`${label} changed while reading: ${path}`);
    }
    contents = buffer.subarray(0, openedStat.size);
  } catch (error) {
    operationError = error;
  }
  await rethrowAfterPrivateHandleCleanup(operationError, [handle]);
  return { contents, stat: finalStat };
}

export async function readDirectoryEntriesBounded(directory, maximumEntries) {
  if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 0) {
    throw new TypeError("maximumEntries must be a non-negative safe integer");
  }
  const entries = [];
  const handle = await fs.opendir(directory);
  for await (const entry of handle) {
    if (entries.length === maximumEntries) {
      throw new DirectoryEntryLimitError(maximumEntries);
    }
    entries.push(entry);
  }
  return entries;
}

export async function directoryIsEmpty(directory) {
  const handle = await fs.opendir(directory);
  let result;
  let operationError = null;
  try {
    result = (await handle.read()) === null;
  } catch (error) {
    operationError = error;
  }
  await rethrowAfterPrivateHandleCleanup(operationError, [handle]);
  return result;
}

async function walkRegularFiles(
  root,
  current,
  files,
  directories,
  limits,
  depth,
) {
  const remainingEntries =
    limits.maximumFiles +
    limits.maximumDirectories -
    files.length -
    directories.length;
  const entries = await readDirectoryEntriesBounded(current, remainingEntries);
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = resolve(current, entry.name);
    const relativePath = portableRelative(root, path);
    assertPortablePath(relativePath);
    const stat = await fs.lstat(path);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `backup tree contains a symbolic link (symlink): ${relativePath}`,
      );
    }
    if (stat.isDirectory()) {
      if (depth === limits.maximumDepth) {
        throw new Error(
          `backup tree exceeds the maximum directory depth: ${relativePath}`,
        );
      }
      if (directories.length === limits.maximumDirectories) {
        throw new DirectoryEntryLimitError(limits.maximumDirectories);
      }
      directories.push(relativePath);
      await walkRegularFiles(root, path, files, directories, limits, depth + 1);
    } else if (stat.isFile()) {
      if (files.length === limits.maximumFiles) {
        throw new DirectoryEntryLimitError(limits.maximumFiles);
      }
      if (!Number.isSafeInteger(stat.size) || stat.size < 0) {
        throw new Error(
          `backup tree contains a file with an unsupported size: ${relativePath}`,
        );
      }
      files.push({
        path,
        relativePath,
        sizeBytes: stat.size,
        mode: stat.mode & 0o777,
      });
    } else {
      throw new Error(
        `backup tree contains a non-regular entry: ${relativePath}`,
      );
    }
  }
}

export async function inspectRegularTree(rootPath, options = {}) {
  const limits = {
    maximumFiles:
      options.maximumFiles ?? BACKUP_ARTIFACT_LIMITS.maximumTreeFiles,
    maximumDirectories:
      options.maximumDirectories ??
      BACKUP_ARTIFACT_LIMITS.maximumTreeDirectories,
    maximumDepth:
      options.maximumDepth ?? BACKUP_ARTIFACT_LIMITS.maximumTreeDepth,
  };
  if (
    !Number.isSafeInteger(limits.maximumFiles) ||
    limits.maximumFiles < 1 ||
    !Number.isSafeInteger(limits.maximumDirectories) ||
    limits.maximumDirectories < 1 ||
    !Number.isSafeInteger(limits.maximumDepth) ||
    limits.maximumDepth < 1
  ) {
    throw new TypeError("portable tree limits must be positive safe integers");
  }
  const root = resolve(rootPath);
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`backup root is not a real directory: ${root}`);
  }
  const files = [];
  const directories = [];
  await walkRegularFiles(root, root, files, directories, limits, 0);
  assertPortablePathInventory(
    [
      ...directories.map((path) => ({ path, kind: "directory" })),
      ...files.map(({ relativePath: path }) => ({ path, kind: "file" })),
    ],
    "regular tree",
  );
  return { root, files, directories };
}

function regularTreeShape(tree) {
  return JSON.stringify({
    directories: [...tree.directories].sort(),
    files: tree.files
      .map(({ relativePath: path, sizeBytes }) => ({ path, sizeBytes }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  });
}

export async function copyRegularTreeBounded(
  sourcePath,
  destinationPath,
  {
    maximumBytes,
    maximumFileBytes = maximumBytes,
    minimumFileBytes = 0,
    maximumFiles = BACKUP_ARTIFACT_LIMITS.maximumTreeFiles,
    maximumDirectories = BACKUP_ARTIFACT_LIMITS.maximumTreeDirectories,
    maximumDepth = BACKUP_ARTIFACT_LIMITS.maximumTreeDepth,
    directoryMode = 0o700,
    fileMode = 0o600,
    validateTree = null,
    label = "regular tree copy",
  } = {},
) {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 0 ||
    !Number.isSafeInteger(maximumFileBytes) ||
    maximumFileBytes < 0 ||
    maximumFileBytes > maximumBytes ||
    !Number.isSafeInteger(minimumFileBytes) ||
    minimumFileBytes < 0 ||
    minimumFileBytes > maximumFileBytes ||
    !Number.isSafeInteger(directoryMode) ||
    directoryMode < 0 ||
    directoryMode > 0o777 ||
    (typeof fileMode !== "function" &&
      (!Number.isSafeInteger(fileMode) || fileMode < 0 || fileMode > 0o777)) ||
    (validateTree !== null && typeof validateTree !== "function")
  ) {
    throw new TypeError(`${label} has invalid bounds, modes, or validator`);
  }
  const limits = { maximumFiles, maximumDirectories, maximumDepth };
  const source = await inspectRegularTree(sourcePath, limits);
  if (validateTree) await validateTree(source, "source");
  const byteBudget = { consumedBytes: 0, maximumBytes };
  for (const file of source.files) {
    if (
      file.sizeBytes < minimumFileBytes ||
      file.sizeBytes > maximumFileBytes
    ) {
      throw new Error(
        `${label} source file is outside its byte bounds: ${file.relativePath}`,
      );
    }
    consumeByteBudget(byteBudget, file.sizeBytes);
  }

  const destination = resolve(destinationPath);
  let destinationCreated = false;
  try {
    await fs.mkdir(destination, { mode: directoryMode });
    destinationCreated = true;
    if (process.platform !== "win32") {
      await fs.chmod(destination, directoryMode);
    }
    const directories = [...source.directories].sort((left, right) => {
      const depth = left.split("/").length - right.split("/").length;
      return depth || left.localeCompare(right);
    });
    for (const directory of directories) {
      const path = resolve(destination, ...directory.split("/"));
      await fs.mkdir(path, { mode: directoryMode });
      if (process.platform !== "win32") await fs.chmod(path, directoryMode);
    }

    const expectedModes = new Map();
    const files = [...source.files].sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath),
    );
    for (const file of files) {
      const mode =
        typeof fileMode === "function" ? await fileMode(file) : fileMode;
      if (!Number.isSafeInteger(mode) || mode < 0 || mode > 0o777) {
        throw new TypeError(
          `${label} selected an invalid mode for ${file.relativePath}`,
        );
      }
      const target = resolve(destination, ...file.relativePath.split("/"));
      await copyRegularFileBounded(file.path, target, {
        maximumBytes: maximumFileBytes,
        minimumBytes: minimumFileBytes,
        expectedSizeBytes: file.sizeBytes,
        mode,
        parentMode: directoryMode,
        label,
      });
      if (process.platform !== "win32") {
        await fs.chmod(target, mode);
        expectedModes.set(file.relativePath, mode);
      }
    }

    const snapshot = await inspectRegularTree(destination, limits);
    if (validateTree) await validateTree(snapshot, "destination");
    if (regularTreeShape(snapshot) !== regularTreeShape(source)) {
      throw new Error(`${label} destination differs from its source inventory`);
    }
    if (
      process.platform !== "win32" &&
      snapshot.files.some(
        (file) => expectedModes.get(file.relativePath) !== file.mode,
      )
    ) {
      throw new Error(`${label} destination mode differs from its policy`);
    }
    if (process.platform !== "win32") {
      const directoryPaths = [
        destination,
        ...snapshot.directories.map((directory) =>
          resolve(destination, ...directory.split("/")),
        ),
      ];
      for (const path of directoryPaths) {
        if (((await fs.lstat(path)).mode & 0o777) !== directoryMode) {
          throw new Error(
            `${label} destination directory mode differs from its policy`,
          );
        }
      }
    }
    return snapshot;
  } catch (error) {
    if (destinationCreated) {
      try {
        await fs.rm(destination, { recursive: true, force: true });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `${label} failed and could not remove its partial destination`,
        );
      }
    }
    throw error;
  }
}

export async function normalizePrivateTree(rootPath) {
  const tree = await inspectRegularTree(rootPath);
  await hardenPrivatePath(tree.root, { kind: "directory" });
  for (const directory of tree.directories) {
    await hardenPrivatePath(resolve(tree.root, ...directory.split("/")), {
      kind: "directory",
    });
  }
  for (const file of tree.files) {
    await hardenPrivatePath(file.path, { kind: "file" });
  }
  return tree;
}

async function readBoundedJson(path) {
  try {
    const { contents } = await readRegularFileBounded(path, {
      maximumBytes: MAX_JSON_METADATA_BYTES,
      label: "backup metadata",
    });
    return JSON.parse(contents.toString("utf8"));
  } catch (error) {
    throw new Error(`invalid backup metadata file: ${path}`, {
      cause: error,
    });
  }
}

function validateManifest(manifest) {
  if (
    !hasExactKeys(manifest, [
      "schemaVersion",
      "kind",
      "backupId",
      "createdAt",
      "release",
      "database",
      "uploads",
      "configuration",
      "integrity",
      "consistency",
      "compatibility",
    ]) ||
    manifest?.schemaVersion !== 1 ||
    manifest.kind !== "trainingload-selfhost-backup" ||
    !UUID.test(manifest.backupId ?? "") ||
    !Number.isFinite(Date.parse(manifest.createdAt ?? "")) ||
    !hasExactKeys(manifest.release, [
      "version",
      "configSchemaVersion",
      "sourceRevision",
    ]) ||
    !SEMVER.test(manifest.release?.version ?? "") ||
    !Number.isInteger(manifest.release?.configSchemaVersion) ||
    manifest.release.configSchemaVersion < 1 ||
    !(
      manifest.release.sourceRevision === null ||
      typeof manifest.release.sourceRevision === "string"
    ) ||
    !hasExactKeys(manifest.database, [
      "engine",
      "format",
      "file",
      "sizeBytes",
      "logicalSizeBytes",
      "sha256",
      "appliedMigrations",
      "recordCounts",
    ]) ||
    manifest.database?.engine !== "postgresql" ||
    manifest.database?.format !== "pg_dump-custom" ||
    manifest.database?.file !== "database.dump" ||
    !Number.isSafeInteger(manifest.database?.sizeBytes) ||
    manifest.database.sizeBytes < 1 ||
    !Number.isSafeInteger(manifest.database?.logicalSizeBytes) ||
    manifest.database.logicalSizeBytes < 1 ||
    !SHA256.test(manifest.database?.sha256 ?? "") ||
    !Array.isArray(manifest.database?.appliedMigrations) ||
    !hasExactKeys(manifest.database?.recordCounts, [
      "selfHostInstance",
      "user",
      "activity",
    ]) ||
    !manifest.database?.recordCounts ||
    !["selfHostInstance", "user", "activity"].every(
      (name) =>
        Number.isSafeInteger(manifest.database.recordCounts[name]) &&
        manifest.database.recordCounts[name] >= 0,
    ) ||
    !hasExactKeys(manifest.uploads, ["root", "fileCount", "sizeBytes"]) ||
    manifest.uploads?.root !== "uploads" ||
    !Number.isSafeInteger(manifest.uploads?.fileCount) ||
    manifest.uploads.fileCount < 0 ||
    manifest.uploads.fileCount > BACKUP_ARTIFACT_LIMITS.maximumUploadFiles ||
    !Number.isSafeInteger(manifest.uploads?.sizeBytes) ||
    manifest.uploads.sizeBytes < 0 ||
    !hasExactKeys(manifest.configuration, [
      "snapshotFile",
      "secretReferencesFile",
    ]) ||
    manifest.configuration?.snapshotFile !== "configuration.json" ||
    manifest.configuration?.secretReferencesFile !== "secret-references.json" ||
    !hasExactKeys(manifest.integrity, ["algorithm", "checksumsFile"]) ||
    manifest.integrity?.algorithm !== "sha256" ||
    manifest.integrity?.checksumsFile !== "checksums.txt" ||
    !hasExactKeys(manifest.consistency, ["method", "quiescedServices"]) ||
    manifest.consistency?.method !== "application-quiesce-plus-pg-dump" ||
    JSON.stringify(manifest.consistency?.quiescedServices) !==
      JSON.stringify(["client", "server"]) ||
    !hasExactKeys(manifest.compatibility, [
      "restoreMode",
      "requiredReleaseVersion",
    ]) ||
    manifest.compatibility?.restoreMode !== "exact-release" ||
    manifest.compatibility?.requiredReleaseVersion !== manifest.release.version
  ) {
    throw new Error("backup manifest is invalid or incompatible");
  }
  const migrationIds = new Set();
  for (const migration of manifest.database.appliedMigrations) {
    if (
      !hasExactKeys(migration, ["id", "checksum"]) ||
      typeof migration?.id !== "string" ||
      !migration.id ||
      typeof migration?.checksum !== "string" ||
      !migration.checksum ||
      migrationIds.has(migration.id)
    ) {
      throw new Error("backup manifest contains an invalid migration record");
    }
    migrationIds.add(migration.id);
  }
  return manifest;
}

function parseChecksumFile(text) {
  const entries = new Map();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line) continue;
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) throw new Error(`invalid checksum line ${index + 1}`);
    assertPortablePath(match[2]);
    if (match[2] === "checksums.txt" || entries.has(match[2])) {
      throw new Error(`duplicate or recursive checksum path: ${match[2]}`);
    }
    if (entries.size === BACKUP_ARTIFACT_LIMITS.maximumTreeFiles - 1) {
      throw new Error("backup checksum inventory exceeds the file limit");
    }
    entries.set(match[2], match[1]);
  }
  if (!entries.size) throw new Error("backup checksums are empty");
  assertPortablePathInventory(
    [...entries.keys()].map((path) => ({ path, kind: "file" })),
    "backup checksum inventory",
  );
  return entries;
}

function validateConfigurationSnapshot(snapshot) {
  if (
    !hasExactKeys(snapshot, ["schemaVersion", "settings"]) ||
    snapshot?.schemaVersion !== 1 ||
    typeof snapshot.settings !== "object" ||
    snapshot.settings === null ||
    Array.isArray(snapshot.settings)
  ) {
    throw new Error("backup configuration snapshot is invalid");
  }
  for (const [name, value] of Object.entries(snapshot.settings)) {
    if (
      !/^[A-Z][A-Z0-9_]*$/.test(name) ||
      /(SECRET|PASSWORD|PRIVATE_KEY|API_KEY|TOKEN|CREDENTIAL|COOKIE)/.test(
        name,
      ) ||
      typeof value !== "string"
    ) {
      throw new Error(
        `backup configuration snapshot contains unsafe setting ${name}`,
      );
    }
  }
}

function validateSecretReferences(payload) {
  if (
    !hasExactKeys(payload, ["schemaVersion", "references"]) ||
    payload?.schemaVersion !== 1 ||
    !Array.isArray(payload.references)
  ) {
    throw new Error("backup secret reference list is invalid");
  }
  const names = new Set();
  for (const reference of payload.references) {
    if (
      !reference ||
      Object.keys(reference).sort().join(",") !== "name,present" ||
      !/^[A-Z][A-Z0-9_]*$/.test(reference.name ?? "") ||
      typeof reference.present !== "boolean" ||
      names.has(reference.name)
    ) {
      throw new Error("backup secret reference list contains an unsafe entry");
    }
    names.add(reference.name);
  }
}

export async function verifyBackupBundle(bundlePath) {
  const tree = await inspectRegularTree(bundlePath);
  const rootEntries = [
    ...tree.files
      .filter((file) => !file.relativePath.includes("/"))
      .map((file) => file.relativePath),
    ...tree.directories.filter((directory) => !directory.includes("/")),
  ].sort();
  const expectedRootEntries = [...SAFE_ROOT_FILES].sort();
  if (
    JSON.stringify(rootEntries) !== JSON.stringify(expectedRootEntries) ||
    !tree.directories.includes("uploads")
  ) {
    throw new Error("backup root entries are incomplete or unexpected");
  }
  const manifest = validateManifest(
    await readBoundedJson(resolve(tree.root, "backup-manifest.json")),
  );
  const checksumsStat = await fs.lstat(resolve(tree.root, "checksums.txt"));
  if (
    !checksumsStat.isFile() ||
    checksumsStat.isSymbolicLink() ||
    checksumsStat.size > MAX_CHECKSUM_BYTES
  ) {
    throw new Error("backup checksum file is invalid");
  }
  let checksumContents;
  try {
    checksumContents = (
      await readRegularFileBounded(resolve(tree.root, "checksums.txt"), {
        maximumBytes: MAX_CHECKSUM_BYTES,
        expectedSizeBytes: checksumsStat.size,
        label: "backup checksum file",
      })
    ).contents;
  } catch (error) {
    throw new Error("backup checksum file is invalid", { cause: error });
  }
  const checksums = parseChecksumFile(checksumContents.toString("utf8"));
  const actualFiles = tree.files
    .map((file) => file.relativePath)
    .filter((path) => path !== "checksums.txt")
    .sort();
  const declaredFiles = [...checksums.keys()].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(declaredFiles)) {
    throw new Error("backup checksum inventory does not match bundle files");
  }
  for (const [path, expected] of checksums) {
    const actual = await sha256File(resolve(tree.root, ...path.split("/")));
    if (actual !== expected)
      throw new Error(`backup checksum mismatch: ${path}`);
  }

  const database = tree.files.find(
    (file) => file.relativePath === manifest.database.file,
  );
  if (
    !database ||
    database.sizeBytes !== manifest.database.sizeBytes ||
    checksums.get(database.relativePath) !== manifest.database.sha256
  ) {
    throw new Error("backup database metadata does not match database.dump");
  }
  const uploads = tree.files.filter((file) =>
    file.relativePath.startsWith("uploads/"),
  );
  const uploadBudget = {
    consumedBytes: 0,
    maximumBytes: Number.MAX_SAFE_INTEGER,
  };
  for (const file of uploads) consumeByteBudget(uploadBudget, file.sizeBytes);
  const uploadBytes = uploadBudget.consumedBytes;
  if (
    uploads.length !== manifest.uploads.fileCount ||
    uploadBytes !== manifest.uploads.sizeBytes
  ) {
    throw new Error("backup upload inventory does not match the manifest");
  }
  validateConfigurationSnapshot(
    await readBoundedJson(resolve(tree.root, "configuration.json")),
  );
  validateSecretReferences(
    await readBoundedJson(resolve(tree.root, "secret-references.json")),
  );
  const result = await readBoundedJson(
    resolve(tree.root, "backup-result.json"),
  );
  if (
    !hasExactKeys(result, [
      "schemaVersion",
      "kind",
      "backupId",
      "status",
      "verified",
    ]) ||
    result?.schemaVersion !== 1 ||
    result.kind !== "trainingload-selfhost-backup-result" ||
    result.backupId !== manifest.backupId ||
    result.status !== "completed" ||
    result.verified !== true
  ) {
    throw new Error("backup creation result is invalid");
  }
  const bundleBudget = {
    consumedBytes: 0,
    maximumBytes: Number.MAX_SAFE_INTEGER,
  };
  for (const file of tree.files) {
    consumeByteBudget(bundleBudget, file.sizeBytes);
  }
  return {
    root: tree.root,
    manifest,
    checksums,
    fileCount: declaredFiles.length,
    sizeBytes: bundleBudget.consumedBytes,
  };
}
