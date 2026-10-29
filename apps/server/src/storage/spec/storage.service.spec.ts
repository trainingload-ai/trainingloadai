import { describe, expect, it, jest } from '@jest/globals';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StorageService } from '../storage.service';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import type { RemoteObjectStoragePort } from '../remote-object-storage.port';

function remoteStorageMock(): jest.Mocked<RemoteObjectStoragePort> {
  return {
    upload: jest.fn(async () => undefined),
    createMultipart: jest.fn(async () => 'remote-upload'),
    uploadPart: jest.fn(async () => undefined),
    listParts: jest.fn(async () => []),
    completeMultipart: jest.fn(async () => undefined),
    abortMultipart: jest.fn(async () => undefined),
    storedFileSize: jest.fn(async () => null),
    openReadStream: jest.fn(),
    delete: jest.fn(async () => undefined),
    publicAssetUrl: jest.fn(() => null),
    objectUrl: jest.fn(() => 'https://storage.invalid/object'),
  };
}

async function createService(fileKey: string) {
  const localStoragePath = await fsp.mkdtemp(
    path.join(os.tmpdir(), 'storage-service-'),
  );
  const service = Object.create(StorageService.prototype) as Record<
    string,
    unknown
  >;
  const remoteStorage = remoteStorageMock();
  service.usesRemoteStorage = true;
  service.localStoragePath = localStoragePath;
  service.remoteStorage = remoteStorage;
  service.logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  service.generateFileKey = jest.fn(() => fileKey);

  return {
    service: service as unknown as StorageService,
    remoteStorage,
    localStoragePath,
    cleanup: () => fsp.rm(localStoragePath, { recursive: true, force: true }),
  };
}

async function createLocalMultipartService(fileKey: string) {
  const localStoragePath = await fsp.mkdtemp(
    path.join(os.tmpdir(), 'storage-multipart-'),
  );
  const service = Object.create(StorageService.prototype) as Record<
    string,
    unknown
  >;
  service.usesRemoteStorage = false;
  service.localStoragePath = localStoragePath;
  service.generateFileKey = jest.fn(() => fileKey);
  return {
    service: service as unknown as StorageService,
    localStoragePath,
    cleanup: () => fsp.rm(localStoragePath, { recursive: true, force: true }),
  };
}

async function createLocalService(fileKey: string) {
  const fixture = await createLocalMultipartService(fileKey);
  const internal = fixture.service as unknown as Record<string, unknown>;
  internal.logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  internal.i18n = { t: jest.fn(() => 'internal error') };
  return fixture;
}

const parquetFile = {
  buffer: Buffer.from('parquet-data'),
  originalname: 'activity_1785_records.parquet',
  mimetype: 'application/octet-stream',
  size: 12,
} as Express.Multer.File;

describe('StorageService remote durability boundary', () => {
  it('returns the generated key only after remote upload is durable', async () => {
    const fileKey = '2026/08/03/activity_1785_records.parquet';
    const { service, remoteStorage, localStoragePath, cleanup } =
      await createService(fileKey);
    let finishUpload!: () => void;
    const uploadFinished = new Promise<void>((resolve) => {
      finishUpload = resolve;
    });
    remoteStorage.upload.mockImplementationOnce(() => uploadFinished);

    try {
      let settled = false;
      const upload = service.uploadFile(parquetFile).finally(() => {
        settled = true;
      });
      await new Promise((resolve) => setImmediate(resolve));

      expect(settled).toBe(false);
      await expect(
        fsp.stat(path.join(localStoragePath, fileKey)),
      ).rejects.toMatchObject({ code: 'ENOENT' });

      finishUpload();
      await expect(upload).resolves.toMatchObject({ fileKey });
      await expect(
        fsp.readFile(path.join(localStoragePath, fileKey)),
      ).resolves.toEqual(parquetFile.buffer);
    } finally {
      await cleanup();
    }
  });

  it('propagates remote failures and does not return a key', async () => {
    const fileKey = '2026/08/03/failed.parquet';
    const { service, remoteStorage, localStoragePath, cleanup } =
      await createService(fileKey);
    const uploadError = new Error('remote unavailable');
    remoteStorage.upload.mockRejectedValueOnce(uploadError);

    try {
      await expect(service.uploadFile(parquetFile)).rejects.toBe(uploadError);
      await expect(
        fsp.stat(path.join(localStoragePath, fileKey)),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await cleanup();
    }
  });

  it('keeps the previous local cache when a custom-key upload fails', async () => {
    const fileKey = 'canonical/activity_1785_records.parquet';
    const { service, remoteStorage, localStoragePath, cleanup } =
      await createService(fileKey);
    const localPath = path.join(localStoragePath, fileKey);
    const previousContent = Buffer.from('previous-parquet');
    await fsp.mkdir(path.dirname(localPath), { recursive: true });
    await fsp.writeFile(localPath, previousContent);
    const uploadError = new Error('remote unavailable');
    remoteStorage.upload.mockRejectedValueOnce(uploadError);

    try {
      await expect(
        service.uploadFileWithCustomKey(parquetFile, fileKey),
      ).rejects.toBe(uploadError);
      await expect(fsp.readFile(localPath)).resolves.toEqual(previousContent);
    } finally {
      await cleanup();
    }
  });
});

describe('StorageService local multipart uploads', () => {
  it('stores replaceable chunks and assembles them in part order', async () => {
    const fileKey = '2026/09/14/garmin.zip';
    const { service, localStoragePath, cleanup } =
      await createLocalMultipartService(fileKey);
    const firstPath = path.join(localStoragePath, 'first.chunk');
    const secondPath = path.join(localStoragePath, 'second.chunk');
    await fsp.writeFile(firstPath, 'first-');
    await fsp.writeFile(secondPath, 'second');

    try {
      const multipart = await service.createMultipartUpload(
        'garmin.zip',
        'private',
      );
      await service.uploadMultipartPartFromPath({
        ...multipart,
        partNumber: 2,
        filePath: secondPath,
        size: 6,
      });
      await service.uploadMultipartPartFromPath({
        ...multipart,
        partNumber: 1,
        filePath: firstPath,
        size: 6,
      });

      const parts = await service.listMultipartParts(multipart);
      expect(parts).toEqual([
        { partNumber: 1, size: 6 },
        { partNumber: 2, size: 6 },
      ]);
      await service.completeMultipartUpload({ ...multipart, parts });

      await expect(
        fsp.readFile(path.join(localStoragePath, multipart.fileKey), 'utf8'),
      ).resolves.toBe('first-second');
      expect(multipart.fileKey).toBe(`private/${fileKey}`);
      await expect(service.storedFileSize(multipart.fileKey)).resolves.toBe(12);
    } finally {
      await cleanup();
    }
  });
});

describe('StorageService local path boundary', () => {
  it.each(['../escape.bin', '/tmp/escape.bin', '..\\escape.bin'])(
    'rejects a custom key outside the configured root: %s',
    async (fileKey) => {
      const { service, cleanup } = await createLocalService('unused');

      try {
        await expect(
          service.uploadFileWithCustomKey(parquetFile, fileKey),
        ).rejects.toThrow();
      } finally {
        await cleanup();
      }
    },
  );

  it('rejects writes through a symlinked parent directory', async () => {
    const { service, localStoragePath, cleanup } =
      await createLocalService('unused');
    const outside = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'storage-outside-'),
    );
    await fsp.mkdir(path.join(localStoragePath, 'private'));
    await fsp.symlink(
      outside,
      path.join(localStoragePath, 'private', 'redirect'),
    );

    try {
      await expect(
        service.uploadFileWithCustomKey(
          parquetFile,
          'redirect/escaped.parquet',
        ),
      ).rejects.toThrow();
      await expect(
        fsp.stat(path.join(outside, 'escaped.parquet')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await cleanup();
      await fsp.rm(outside, { recursive: true, force: true });
    }
  });

  it('rejects reads through a symlinked file', async () => {
    const { service, localStoragePath, cleanup } =
      await createLocalService('unused');
    const outside = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'storage-outside-'),
    );
    const outsideFile = path.join(outside, 'private.txt');
    await fsp.writeFile(outsideFile, 'private');
    await fsp.symlink(outsideFile, path.join(localStoragePath, 'linked.txt'));

    try {
      await expect(service.getFileWithKey('linked.txt')).rejects.toMatchObject({
        response: { code: BUSINESS_ERROR_CODE.STORAGE_INVALID_PATH },
      });
    } finally {
      await cleanup();
      await fsp.rm(outside, { recursive: true, force: true });
    }
  });

  it.each([
    ['ENOSPC', BUSINESS_ERROR_CODE.STORAGE_NO_SPACE],
    ['EDQUOT', BUSINESS_ERROR_CODE.STORAGE_NO_SPACE],
    ['EACCES', BUSINESS_ERROR_CODE.STORAGE_NOT_WRITABLE],
    ['EROFS', BUSINESS_ERROR_CODE.STORAGE_NOT_WRITABLE],
  ])(
    'reports %s with a stable storage error code',
    async (errno, expectedCode) => {
      const { service, cleanup } = await createLocalService('unused');
      const internal = service as unknown as Record<string, unknown>;
      internal.writeLocalFileAtomically = jest.fn(async () => {
        throw Object.assign(new Error(errno), { code: errno });
      });

      try {
        await expect(service.uploadFile(parquetFile)).rejects.toMatchObject({
          response: { code: expectedCode },
        });
      } finally {
        await cleanup();
      }
    },
  );

  it('stores default uploads privately without publishing a static URL', async () => {
    const fileKey = '2026/10/17/activity.parquet';
    const { service, localStoragePath, cleanup } =
      await createLocalService(fileKey);
    try {
      const result = await service.uploadFile(parquetFile);
      expect(result).toMatchObject({
        fileKey: `private/${fileKey}`,
        url: '',
      });
      await expect(
        fsp.readFile(path.join(localStoragePath, result.fileKey)),
      ).resolves.toEqual(parquetFile.buffer);
      await expect(service.getFileWithKey(fileKey)).resolves.toEqual(
        parquetFile.buffer,
      );
    } finally {
      await cleanup();
    }
  });

  it('publishes only explicit public uploads from the public namespace', async () => {
    const { service, localStoragePath, cleanup } =
      await createLocalService('unused');
    try {
      const result = await service.uploadFileWithCustomKey(
        parquetFile,
        'maps/activity 42.png',
        'public',
      );
      expect(result).toMatchObject({
        fileKey: 'public/maps/activity 42.png',
        url: '/uploads/maps/activity%2042.png',
      });
      expect(service.publicAssetUrl('maps/activity 42.png')).toBe(
        '/uploads/maps/activity%2042.png',
      );
      expect(
        service.publicAssetUrl(
          'maps/activity 42.png',
          'https://stale-r2.example',
        ),
      ).toBe('/uploads/maps/activity%2042.png');
      expect(service.publicAssetUrl('private/activity.fit')).toBeNull();
      await expect(
        fsp.readFile(path.join(localStoragePath, result.fileKey)),
      ).resolves.toEqual(parquetFile.buffer);
      await expect(
        service.getFileWithKey('maps/activity 42.png', 'public'),
      ).resolves.toEqual(parquetFile.buffer);
      await service.deleteFile('maps/activity 42.png', 'public');
      await expect(
        fsp.stat(path.join(localStoragePath, result.fileKey)),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await cleanup();
    }
  });

  it('keeps legacy unprefixed local objects readable during upgrades', async () => {
    const { service, localStoragePath, cleanup } =
      await createLocalService('unused');
    const legacyKey = '2025/01/01/legacy.fit';
    const legacyPath = path.join(localStoragePath, legacyKey);
    await fsp.mkdir(path.dirname(legacyPath), { recursive: true });
    await fsp.writeFile(legacyPath, 'legacy');
    try {
      await expect(service.getFileWithKey(legacyKey)).resolves.toEqual(
        Buffer.from('legacy'),
      );
    } finally {
      await cleanup();
    }
  });
});

describe('StorageService provider initialization', () => {
  it('does not require a remote adapter in LOCAL mode', async () => {
    const localStoragePath = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'storage-constructor-'),
    );
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_STRATEGY') return 'LOCAL';
        if (key === 'LOCAL_STORAGE_PATH') return localStoragePath;
        return undefined;
      }),
    };

    try {
      const service = new StorageService(
        configService as never,
        { t: jest.fn(() => 'internal error') } as never,
      );
      expect(
        (service as unknown as Record<string, unknown>).remoteStorage,
      ).toBeUndefined();
      await expect(
        fsp.stat(path.join(localStoragePath, 'public')),
      ).resolves.toMatchObject({});
      await expect(
        fsp.stat(path.join(localStoragePath, 'private')),
      ).resolves.toMatchObject({});
      await service.onModuleDestroy();
    } finally {
      await fsp.rm(localStoragePath, { recursive: true, force: true });
    }
  });

  it('fails fast when external storage lacks a Managed adapter', () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'STORAGE_STRATEGY') return 'REMOTE';
        return undefined;
      }),
    };

    expect(
      () =>
        new StorageService(
          configService as never,
          { t: jest.fn(() => 'internal error') } as never,
        ),
    ).toThrow('requires a Managed storage adapter');
  });
});
