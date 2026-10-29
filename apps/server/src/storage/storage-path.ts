import { constants as fsConstants, promises as fsp } from 'fs';
import * as path from 'path';

export const DEFAULT_LOCAL_STORAGE_PATH = '/data/uploads';
export const LOCAL_PUBLIC_NAMESPACE = 'public';
export const LOCAL_PRIVATE_NAMESPACE = 'private';

export function publicStoragePath(root: string): string {
  return path.join(path.resolve(root), LOCAL_PUBLIC_NAMESPACE);
}

export type LocalStorageVisibility = 'public' | 'private';

/**
 * New local objects are physically partitioned by visibility. Existing
 * unprefixed keys remain readable, but every new write receives a namespace.
 */
export function localStorageKey(
  rawKey: string,
  visibility: LocalStorageVisibility,
): string {
  const key = normalizeStorageKey(rawKey);
  const [namespace] = key.split('/');
  if (
    namespace === LOCAL_PUBLIC_NAMESPACE ||
    namespace === LOCAL_PRIVATE_NAMESPACE
  ) {
    if (namespace !== visibility) {
      throw new StoragePathError(
        `Storage key namespace ${namespace} conflicts with ${visibility} visibility`,
      );
    }
    return key;
  }
  return `${visibility}/${key}`;
}

export function publicStorageUrlPath(rawKey: string): string {
  const namespacedKey = localStorageKey(rawKey, 'public');
  return storageKeyToUrlPath(
    namespacedKey.slice(`${LOCAL_PUBLIC_NAMESPACE}/`.length),
  );
}

export class StoragePathError extends Error {
  readonly code = 'SELF_HOST_STORAGE_INVALID_KEY';

  constructor(message: string) {
    super(message);
    this.name = 'StoragePathError';
  }
}

/**
 * Object keys are portable slash-separated relative paths. They may never
 * select a parent directory or rely on platform-specific absolute syntax.
 */
export function normalizeStorageKey(rawKey: string): string {
  if (typeof rawKey !== 'string') {
    throw new StoragePathError('Storage key must be a string');
  }
  const key = rawKey.trim().replace(/\\/g, '/');
  if (!key || key.includes('\0')) {
    throw new StoragePathError('Storage key is empty or contains NUL');
  }
  if (path.posix.isAbsolute(key) || path.win32.isAbsolute(rawKey)) {
    throw new StoragePathError('Storage key must be relative');
  }
  const segments = key.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new StoragePathError('Storage key contains an invalid path segment');
  }
  return segments.join('/');
}

export function resolveStoragePath(root: string, rawKey: string): string {
  const normalizedRoot = path.resolve(root);
  const key = normalizeStorageKey(rawKey);
  const candidate = path.resolve(normalizedRoot, ...key.split('/'));
  const relative = path.relative(normalizedRoot, candidate);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new StoragePathError('Storage key resolves outside the storage root');
  }
  return candidate;
}

/**
 * Creates each parent directory separately and rejects symlinked components.
 * This keeps a writable data volume from redirecting writes outside its root.
 */
export async function ensureSecureStorageParent(
  root: string,
  targetPath: string,
): Promise<void> {
  const normalizedRoot = path.resolve(root);
  const parent = path.dirname(targetPath);
  const relative = path.relative(normalizedRoot, parent);
  if (relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new StoragePathError(
      'Storage parent resolves outside the storage root',
    );
  }

  let current = normalizedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stat = await fsp.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new StoragePathError(
          `Storage parent is not a real directory: ${current}`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try {
        await fsp.mkdir(current, { mode: 0o750 });
      } catch (mkdirError) {
        // Concurrent uploads can observe the same missing directory and race
        // to create it. EEXIST is safe only after the path is revalidated
        // below; files and symlinks are still rejected.
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw mkdirError;
        }
      }
      const stat = await fsp.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new StoragePathError(
          `Storage parent is not a real directory: ${current}`,
        );
      }
    }
  }
}

export async function assertReadableStoragePath(
  root: string,
  targetPath: string,
): Promise<void> {
  const normalizedRoot = path.resolve(root);
  const relative = path.relative(normalizedRoot, targetPath);
  let current = normalizedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await fsp.lstat(current);
    if (stat.isSymbolicLink()) {
      throw new StoragePathError(`Storage path contains a symlink: ${current}`);
    }
  }
  await fsp.access(targetPath, fsConstants.R_OK);
}

export function storageKeyToUrlPath(rawKey: string): string {
  return normalizeStorageKey(rawKey)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
