import { afterEach, describe, expect, it } from '@jest/globals';
import config from '../config';

const originalStorageStrategy = process.env.STORAGE_STRATEGY;
const originalLocalStoragePath = process.env.LOCAL_STORAGE_PATH;
const originalLocalStorageCachePath = process.env.LOCAL_STORAGE_CACHE_PATH;

afterEach(() => {
  if (originalStorageStrategy === undefined) {
    delete process.env.STORAGE_STRATEGY;
  } else {
    process.env.STORAGE_STRATEGY = originalStorageStrategy;
  }
  if (originalLocalStoragePath === undefined) {
    delete process.env.LOCAL_STORAGE_PATH;
  } else {
    process.env.LOCAL_STORAGE_PATH = originalLocalStoragePath;
  }
  if (originalLocalStorageCachePath === undefined) {
    delete process.env.LOCAL_STORAGE_CACHE_PATH;
  } else {
    process.env.LOCAL_STORAGE_CACHE_PATH = originalLocalStorageCachePath;
  }
});

describe('self-host storage configuration contract', () => {
  it('defaults to local authoritative storage under /data/uploads', () => {
    delete process.env.STORAGE_STRATEGY;
    delete process.env.LOCAL_STORAGE_PATH;
    delete process.env.LOCAL_STORAGE_CACHE_PATH;

    expect(config()).toMatchObject({
      STORAGE_STRATEGY: 'LOCAL',
      LOCAL_STORAGE_PATH: '/data/uploads',
      LOCAL_STORAGE_CACHE_PATH: '/data/cache/storage',
    });
  });

  it('preserves an explicit strategy for deployment-specific validation', () => {
    process.env.STORAGE_STRATEGY = 'REMOTE';
    process.env.LOCAL_STORAGE_PATH = '/srv/trainingload/uploads';

    expect(config()).toMatchObject({
      STORAGE_STRATEGY: 'REMOTE',
      LOCAL_STORAGE_PATH: '/srv/trainingload/uploads',
    });
  });
});
