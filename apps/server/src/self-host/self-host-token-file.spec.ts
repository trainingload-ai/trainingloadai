import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  readBootstrapTokenFile,
  removeBootstrapTokenFile,
  resolveSelfHostOperationsDirectory,
  selfHostBootstrapTokenPath,
  writeBootstrapTokenFile,
} from './self-host-token-file';

describe('self-host bootstrap token file', () => {
  let directory: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    directory = await fs.mkdtemp('/tmp/trainingload-selfhost-token-');
    env = { SELF_HOST_OPERATIONS_PATH: join(directory, 'operations') };
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('writes atomically with owner-only permissions and reads the token', async () => {
    const token = 'a'.repeat(43);
    await writeBootstrapTokenFile(token, env);

    await expect(readBootstrapTokenFile(env)).resolves.toBe(token);
    const stat = await fs.stat(selfHostBootstrapTokenPath(env));
    expect(stat.mode & 0o777).toBe(0o600);
    const directoryStat = await fs.stat(
      resolveSelfHostOperationsDirectory(env),
    );
    expect(directoryStat.mode & 0o777).toBe(0o700);
  });

  it('replaces an earlier token without leaving temporary files', async () => {
    await writeBootstrapTokenFile('a'.repeat(43), env);
    await writeBootstrapTokenFile('b'.repeat(43), env);

    await expect(readBootstrapTokenFile(env)).resolves.toBe('b'.repeat(43));
    await expect(
      fs.readdir(resolveSelfHostOperationsDirectory(env)),
    ).resolves.toEqual(['bootstrap-token']);
  });

  it('refuses to reuse a token whose file or directory became readable by other users', async () => {
    await writeBootstrapTokenFile('a'.repeat(43), env);
    const tokenPath = selfHostBootstrapTokenPath(env);
    const operationsPath = resolveSelfHostOperationsDirectory(env);

    await fs.chmod(tokenPath, 0o644);
    await expect(readBootstrapTokenFile(env)).resolves.toBeNull();

    await fs.chmod(tokenPath, 0o600);
    await fs.chmod(operationsPath, 0o755);
    await expect(readBootstrapTokenFile(env)).resolves.toBeNull();

    await writeBootstrapTokenFile('b'.repeat(43), env);
    await expect(readBootstrapTokenFile(env)).resolves.toBe('b'.repeat(43));
    await expect(fs.stat(operationsPath)).resolves.toMatchObject({
      mode: expect.any(Number),
    });
    expect((await fs.stat(operationsPath)).mode & 0o777).toBe(0o700);
  });

  it('rejects relative and root operations paths', () => {
    expect(() =>
      resolveSelfHostOperationsDirectory({
        SELF_HOST_OPERATIONS_PATH: 'relative/path',
      }),
    ).toThrow('absolute path');
    expect(() =>
      resolveSelfHostOperationsDirectory({ SELF_HOST_OPERATIONS_PATH: '/' }),
    ).toThrow('filesystem root');
  });

  it('removes the token idempotently', async () => {
    await writeBootstrapTokenFile('a'.repeat(43), env);
    await removeBootstrapTokenFile(env);
    await removeBootstrapTokenFile(env);
    await expect(readBootstrapTokenFile(env)).resolves.toBeNull();
  });
});
