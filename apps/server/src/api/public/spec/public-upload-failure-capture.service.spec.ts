import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { afterEach, describe, expect, it } from '@jest/globals';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { PublicUploadFailureCaptureService } from '../public-upload-failure-capture.service';

const originalCaptureEnabled = process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED;
const originalOperationsPath = process.env.SELF_HOST_OPERATIONS_PATH;
const temporaryDirectories: string[] = [];

async function temporaryOperationsPath(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'public-upload-failure-'));
  temporaryDirectories.push(path);
  return realpath(path);
}

function testFile(
  contents: Buffer,
  originalname = 'sensitive-athlete-name.fit',
): Pick<Express.Multer.File, 'buffer' | 'originalname' | 'size'> {
  return { buffer: contents, originalname, size: contents.length };
}

afterEach(async () => {
  if (originalCaptureEnabled === undefined) {
    delete process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED;
  } else {
    process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED = originalCaptureEnabled;
  }
  if (originalOperationsPath === undefined) {
    delete process.env.SELF_HOST_OPERATIONS_PATH;
  } else {
    process.env.SELF_HOST_OPERATIONS_PATH = originalOperationsPath;
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('PublicUploadFailureCaptureService', () => {
  it('does not write successful uploads', async () => {
    const operationsPath = await temporaryOperationsPath();
    process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED = 'true';
    process.env.SELF_HOST_OPERATIONS_PATH = operationsPath;
    const service = new PublicUploadFailureCaptureService();

    await expect(
      service.run(
        {
          route: 'POST /public/convert',
          files: [testFile(Buffer.from('<gpx/>'))],
        },
        async () => 'converted',
      ),
    ).resolves.toBe('converted');

    await expect(
      readdir(join(operationsPath, 'public-upload-failures')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('is disabled unless explicitly enabled', async () => {
    const operationsPath = await temporaryOperationsPath();
    delete process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED;
    process.env.SELF_HOST_OPERATIONS_PATH = operationsPath;
    const service = new PublicUploadFailureCaptureService();
    const failure = new Error('converter failed');

    await expect(
      service.run(
        {
          route: 'POST /public/convert',
          files: [testFile(Buffer.from('<gpx/>'))],
        },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);

    await expect(
      readdir(join(operationsPath, 'public-upload-failures')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('expires existing captures after the feature is disabled', async () => {
    const operationsPath = await temporaryOperationsPath();
    process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED = 'false';
    process.env.SELF_HOST_OPERATIONS_PATH = operationsPath;
    const root = join(operationsPath, 'public-upload-failures');
    const expired = join(
      root,
      '20260101T000000000Z-00000000-0000-4000-8000-000000000000',
    );
    await mkdir(expired, { recursive: true });
    const service = new PublicUploadFailureCaptureService();
    try {
      await service.onModuleInit();
      await expect(readdir(root)).resolves.toEqual([]);
    } finally {
      service.onModuleDestroy();
    }
  });

  it.each([
    new BadRequestException({ code: 'TRACK_FILE_FORMAT_UNKNOWN' }),
    Object.assign(new Error('unprocessable input'), { statusCode: 422 }),
  ])('does not retain client input errors', async (failure) => {
    const operationsPath = await temporaryOperationsPath();
    process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED = 'true';
    process.env.SELF_HOST_OPERATIONS_PATH = operationsPath;
    const service = new PublicUploadFailureCaptureService();
    await expect(
      service.run(
        {
          route: 'POST /public/convert',
          files: [testFile(Buffer.from('not a track file'))],
        },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);

    await expect(
      readdir(join(operationsPath, 'public-upload-failures')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('captures business exceptions that result in a server error', async () => {
    const operationsPath = await temporaryOperationsPath();
    process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED = 'true';
    process.env.SELF_HOST_OPERATIONS_PATH = operationsPath;
    const service = new PublicUploadFailureCaptureService();
    const failure = new BusinessException({
      code: BUSINESS_ERROR_CODE.STORAGE_NO_SPACE,
      message: 'server storage full',
    });
    await expect(
      service.run(
        {
          route: 'POST /public/convert',
          files: [testFile(Buffer.from('<gpx/>'))],
        },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
    await expect(
      readdir(join(operationsPath, 'public-upload-failures')),
    ).resolves.toHaveLength(1);
  });

  it('rejects symlinked operations paths without writing into their targets', async () => {
    const operationsPath = await temporaryOperationsPath();
    const outside = await temporaryOperationsPath();
    const link = join(operationsPath, 'alias');
    await symlink(outside, link, 'dir');
    process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED = 'true';
    process.env.SELF_HOST_OPERATIONS_PATH = link;
    const service = new PublicUploadFailureCaptureService();
    const failure = new Error('converter failed');
    await expect(
      service.run(
        {
          route: 'POST /public/convert',
          files: [testFile(Buffer.from('<gpx/>'))],
        },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
    await expect(readdir(outside)).resolves.toEqual([]);
  });

  it('stores a private bounded manifest without request identity or error text', async () => {
    const operationsPath = await temporaryOperationsPath();
    process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED = 'true';
    process.env.SELF_HOST_OPERATIONS_PATH = operationsPath;
    const service = new PublicUploadFailureCaptureService();
    const failure = new InternalServerErrorException({
      code: 'TRACK_FILE_OUTPUT_INVALID',
      message: 'private converter details sensitive-athlete-name.fit',
    });
    const fit = Buffer.concat([
      Buffer.alloc(8),
      Buffer.from('.FIT'),
      Buffer.from('synthetic payload'),
    ]);

    await expect(
      service.run(
        {
          route: 'POST /public/convert',
          files: [testFile(fit)],
          context: { targetFormat: 'gpx', expectedSourceFormat: 'fit' },
        },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);

    const root = join(operationsPath, 'public-upload-failures');
    const captures = await readdir(root);
    expect(captures).toHaveLength(1);
    const capturePath = join(root, captures[0]);
    const captureFiles = (await readdir(capturePath)).sort();
    expect(captureFiles).toEqual(['01.fit', 'manifest.json']);
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(capturePath)).mode & 0o777).toBe(0o700);
    expect((await stat(join(capturePath, '01.fit'))).mode & 0o777).toBe(0o600);
    expect((await stat(join(capturePath, 'manifest.json'))).mode & 0o777).toBe(
      0o600,
    );
    await expect(readFile(join(capturePath, '01.fit'))).resolves.toEqual(fit);

    const manifestText = await readFile(
      join(capturePath, 'manifest.json'),
      'utf8',
    );
    expect(manifestText).not.toContain('sensitive-athlete-name');
    expect(manifestText).not.toContain('private converter details');
    expect(JSON.parse(manifestText)).toMatchObject({
      schemaVersion: 1,
      route: 'POST /public/convert',
      context: { targetFormat: 'gpx', expectedSourceFormat: 'fit' },
      error: {
        code: 'TRACK_FILE_OUTPUT_INVALID',
        name: 'InternalServerErrorException',
      },
      files: [
        {
          storedName: '01.fit',
          byteLength: fit.length,
          detectedFormat: 'fit',
          extension: 'fit',
        },
      ],
    });
  });

  it('deletes captures older than 72 hours before storing a new failure', async () => {
    const operationsPath = await temporaryOperationsPath();
    process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED = 'true';
    process.env.SELF_HOST_OPERATIONS_PATH = operationsPath;
    const root = join(operationsPath, 'public-upload-failures');
    const stale = join(
      root,
      '20260101T000000000Z-00000000-0000-4000-8000-000000000000',
    );
    await mkdir(stale, { recursive: true, mode: 0o700 });
    await chmod(stale, 0o700);
    const service = new PublicUploadFailureCaptureService();

    await expect(
      service.run(
        {
          route: 'POST /public/inspect-activity-file',
          files: [testFile(Buffer.from('<gpx/>'), 'activity.gpx')],
        },
        async () => {
          throw new Error('decode failed');
        },
      ),
    ).rejects.toThrow('decode failed');

    const captures = await readdir(root);
    expect(captures).toHaveLength(1);
    expect(captures).not.toContain(stale.split('/').at(-1));
  });

  it('preserves the API failure when local capture storage is unavailable', async () => {
    const operationsPath = await temporaryOperationsPath();
    const unavailablePath = join(operationsPath, 'not-a-directory');
    await writeFile(unavailablePath, 'occupied');
    process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED = 'true';
    process.env.SELF_HOST_OPERATIONS_PATH = unavailablePath;
    const service = new PublicUploadFailureCaptureService();
    const failure = new Error('original converter failure');

    await expect(
      service.run(
        {
          route: 'POST /public/convert',
          files: [testFile(Buffer.from('<gpx/>'), 'activity.gpx')],
        },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
  });
});
