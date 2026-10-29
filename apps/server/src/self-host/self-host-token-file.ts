import { constants, promises as fs } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SELF_HOST_BOOTSTRAP_TOKEN_FILE } from './self-host-bootstrap.types';

const DEFAULT_OPERATIONS_DIRECTORY = '/data/operations';
const MAX_TOKEN_FILE_BYTES = 512;

export function resolveSelfHostOperationsDirectory(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured =
    env.SELF_HOST_OPERATIONS_PATH?.trim() || DEFAULT_OPERATIONS_DIRECTORY;
  if (!isAbsolute(configured)) {
    throw new Error('SELF_HOST_OPERATIONS_PATH must be an absolute path');
  }
  const directory = resolve(configured);
  if (directory === '/') {
    throw new Error(
      'SELF_HOST_OPERATIONS_PATH must not be the filesystem root',
    );
  }
  return directory;
}

export function selfHostBootstrapTokenPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(
    resolveSelfHostOperationsDirectory(env),
    SELF_HOST_BOOTSTRAP_TOKEN_FILE,
  );
}

async function ensureSecureDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('SELF_HOST_OPERATIONS_PATH must be a real directory');
  }
  await fs.chmod(directory, 0o700);
}

function isOwnedByCurrentProcess(uid: number): boolean {
  return typeof process.getuid !== 'function' || uid === process.getuid();
}

export async function readBootstrapTokenFile(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const directory = resolveSelfHostOperationsDirectory(env);
  const filePath = selfHostBootstrapTokenPath(env);
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    const directoryStat = await fs.lstat(directory);
    if (
      !directoryStat.isDirectory() ||
      directoryStat.isSymbolicLink() ||
      (directoryStat.mode & 0o077) !== 0 ||
      !isOwnedByCurrentProcess(directoryStat.uid)
    ) {
      return null;
    }
    handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.size > MAX_TOKEN_FILE_BYTES ||
      (stat.mode & 0o077) !== 0 ||
      !isOwnedByCurrentProcess(stat.uid)
    ) {
      return null;
    }
    const token = (await handle.readFile('utf8')).trim();
    return token || null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function writeBootstrapTokenFile(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const directory = resolveSelfHostOperationsDirectory(env);
  const filePath = selfHostBootstrapTokenPath(env);
  const temporaryPath = join(
    directory,
    `.${SELF_HOST_BOOTSTRAP_TOKEN_FILE}.${process.pid}.${randomUUID()}.tmp`,
  );
  await ensureSecureDirectory(directory);

  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(
      temporaryPath,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile(`${token}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporaryPath, filePath);
    await fs.chmod(filePath, 0o600);

    const directoryHandle = await fs.open(directory, constants.O_RDONLY);
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function removeBootstrapTokenFile(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  try {
    await fs.unlink(selfHostBootstrapTokenPath(env));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
