import { describe, expect, it } from '@jest/globals';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ensureSecureStorageParent,
  localStorageKey,
  normalizeStorageKey,
  publicStoragePath,
  publicStorageUrlPath,
  resolveStoragePath,
  storageKeyToUrlPath,
} from '../storage-path';

describe('local storage path contract', () => {
  it('normalizes portable object keys without changing hierarchy', () => {
    expect(normalizeStorageKey('activity/42/record.parquet')).toBe(
      'activity/42/record.parquet',
    );
    expect(storageKeyToUrlPath('活动/晨跑 1.fit')).toBe(
      '%E6%B4%BB%E5%8A%A8/%E6%99%A8%E8%B7%91%201.fit',
    );
  });

  it.each([
    '',
    '.',
    '..',
    '../secret',
    'safe/../secret',
    '/absolute/path',
    'C:\\absolute\\path',
    'double//separator',
  ])('rejects unsafe key %j', (key) => {
    expect(() => normalizeStorageKey(key)).toThrow();
  });

  it('resolves a valid key beneath the configured root', () => {
    expect(resolveStoragePath('/data/uploads', 'activity/42.fit')).toBe(
      path.resolve('/data/uploads/activity/42.fit'),
    );
  });

  it('partitions new local objects by visibility', () => {
    expect(localStorageKey('activity/42.fit', 'private')).toBe(
      'private/activity/42.fit',
    );
    expect(localStorageKey('maps/42.png', 'public')).toBe('public/maps/42.png');
    expect(localStorageKey('public/maps/42.png', 'public')).toBe(
      'public/maps/42.png',
    );
    expect(() => localStorageKey('private/activity/42.fit', 'public')).toThrow(
      /conflicts/,
    );
  });

  it('maps only the public namespace to the static asset tree', () => {
    expect(publicStoragePath('/data/uploads')).toBe(
      path.resolve('/data/uploads/public'),
    );
    expect(publicStorageUrlPath('public/maps/活动 42.png')).toBe(
      'maps/%E6%B4%BB%E5%8A%A8%2042.png',
    );
    expect(publicStorageUrlPath('maps/42.png')).toBe('maps/42.png');
    expect(() => publicStorageUrlPath('private/42.fit')).toThrow(/conflicts/);
  });

  it('creates the same missing parent safely for concurrent local writes', async () => {
    const root = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'storage-path-concurrency-'),
    );
    const target = path.join(root, 'private', '2026', '10', '25', 'file.fit');

    try {
      await expect(
        Promise.all(
          Array.from({ length: 32 }, () =>
            ensureSecureStorageParent(root, target),
          ),
        ),
      ).resolves.toHaveLength(32);
      await expect(fsp.lstat(path.dirname(target))).resolves.toMatchObject({});
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
});
