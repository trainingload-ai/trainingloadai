import {
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join, parse } from 'node:path';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { businessErrorHttpStatus } from '@/filters/business-exception/business-exception.filter';
import { httpStatusForException } from '@/filters/http-exception/http-exception.filter';
import { resolveSelfHostOperationsDirectory } from '@/self-host/self-host-token-file';
import { ensureSecureStorageParent } from '@/storage/storage-path';

const RETENTION_MS = 72 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_CAPTURE_COUNT = 100;
const MAX_PENDING_CAPTURES = 4;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const CAPTURE_DIRECTORY_PATTERN =
  /^\d{8}T\d{9}Z-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicUploadFailureRoute =
  | 'POST /public/estimate-cp'
  | 'POST /public/convert'
  | 'POST /public/inspect-activity-file'
  | 'POST /public/encode-course';

export type PublicUploadFailureContext = {
  targetFormat?: 'gpx' | 'tcx' | 'fit';
  expectedSourceFormat?: 'gpx' | 'tcx' | 'fit';
};

type CaptureFile = Pick<Express.Multer.File, 'buffer'>;

type CaptureRequest = {
  route: PublicUploadFailureRoute;
  files: Array<CaptureFile | null | undefined>;
  context?: PublicUploadFailureContext;
};

type StoredCaptureEntry = {
  path: string;
  expiresAt: number;
  size: number;
};

function serverFailure(error: unknown): boolean {
  if (error instanceof BusinessException) {
    const { code } = error.getResponse() as { code: number };
    return businessErrorHttpStatus(code) >= 500;
  }
  return httpStatusForException(error) >= 500;
}

function captureExpiry(directory: string): number {
  const date = directory.slice(0, 8);
  const time = directory.slice(9, 18);
  return (
    Date.parse(
      [date.slice(0, 4), date.slice(4, 6), date.slice(6, 8)].join('-') +
        'T' +
        [time.slice(0, 2), time.slice(2, 4), time.slice(4, 6)].join(':') +
        '.' +
        time.slice(6) +
        'Z',
    ) + RETENTION_MS
  );
}

function safeErrorCode(error: unknown): string {
  const direct = (error as { code?: unknown } | null)?.code;
  const response = error instanceof HttpException ? error.getResponse() : null;
  const responseCode =
    response && typeof response === 'object' && !Array.isArray(response)
      ? (response as { code?: unknown }).code
      : undefined;
  const candidate = [responseCode, direct].find(
    (value) =>
      typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(value),
  );
  return typeof candidate === 'string' ? candidate : 'UNCLASSIFIED_ERROR';
}

function safeErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  return /^[A-Za-z][A-Za-z0-9]{0,80}$/.test(name) ? name : 'UnknownError';
}

function detectedTrackFormat(
  buffer: Buffer,
): 'gpx' | 'tcx' | 'fit' | 'unknown' {
  if (buffer.length >= 12 && buffer.toString('ascii', 8, 12) === '.FIT') {
    return 'fit';
  }
  const prefix = buffer
    .toString('utf8', 0, Math.min(buffer.length, 4096))
    .replace(/^\uFEFF/, '');
  if (/<gpx\b/i.test(prefix)) return 'gpx';
  if (/<TrainingCenterDatabase\b/i.test(prefix)) return 'tcx';
  return 'unknown';
}

async function directorySize(path: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) total += await directorySize(child);
    else if (entry.isFile()) total += (await stat(child)).size;
  }
  return total;
}

@Injectable()
export class PublicUploadFailureCaptureService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PublicUploadFailureCaptureService.name);
  private readonly enabled =
    process.env.PUBLIC_FAILED_UPLOAD_CAPTURE_ENABLED?.trim().toLowerCase() ===
    'true';
  private readonly rootDirectory = join(
    resolveSelfHostOperationsDirectory(),
    'public-upload-failures',
  );
  private cleanupTimer?: NodeJS.Timeout;
  private stopping = false;
  private taskTail: Promise<void> = Promise.resolve();
  private pendingCaptures = 0;
  private pendingBytes = 0;

  onModuleInit(): Promise<void> {
    return this.enqueue(() => this.cleanup()).catch((error) =>
      this.logStorageFailure('startup-cleanup', error),
    );
  }

  onModuleDestroy(): void {
    this.stopping = true;
    clearTimeout(this.cleanupTimer);
  }

  async run<T>(
    request: CaptureRequest,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.enabled && serverFailure(error)) {
        const files = request.files.filter((file): file is CaptureFile =>
          Buffer.isBuffer(file?.buffer),
        );
        const bytes = files.reduce((sum, file) => sum + file.buffer.length, 0);
        if (
          bytes > 0 &&
          this.pendingCaptures < MAX_PENDING_CAPTURES &&
          this.pendingBytes + bytes < MAX_TOTAL_BYTES
        ) {
          this.pendingCaptures++;
          this.pendingBytes += bytes;
          try {
            await this.enqueue(() =>
              this.capture(request, files, bytes, error),
            );
          } catch (storageError) {
            this.logStorageFailure('capture', storageError);
          } finally {
            this.pendingCaptures--;
            this.pendingBytes -= bytes;
          }
        }
      }
      throw error;
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const current = this.taskTail.then(operation);
    this.taskTail = current.catch(() => undefined);
    return current;
  }

  private async capture(
    request: CaptureRequest,
    files: CaptureFile[],
    bytes: number,
    error: unknown,
  ): Promise<void> {
    const capturedAt = new Date();
    const captureId = randomUUID();
    const timestamp = capturedAt.toISOString().replace(/[-:.]/g, '');
    const captureDirectory = join(
      this.rootDirectory,
      `${timestamp}-${captureId}`,
    );
    const storedFiles = files.map(({ buffer }, index) => {
      const detectedFormat = detectedTrackFormat(buffer);
      const extension = detectedFormat === 'unknown' ? 'bin' : detectedFormat;
      return {
        storedName: `${String(index + 1).padStart(2, '0')}.${extension}`,
        byteLength: buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        detectedFormat,
        extension,
      };
    });
    const manifest = {
      schemaVersion: 1,
      captureId,
      capturedAt: capturedAt.toISOString(),
      expiresAt: new Date(capturedAt.getTime() + RETENTION_MS).toISOString(),
      route: request.route,
      context: request.context ?? {},
      error: { code: safeErrorCode(error), name: safeErrorName(error) },
      files: storedFiles,
    };
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    const reservation = bytes + Buffer.byteLength(manifestText);
    if (reservation > MAX_TOTAL_BYTES) return;

    await ensureSecureStorageParent(
      parse(this.rootDirectory).root,
      captureDirectory,
    );
    await chmod(this.rootDirectory, 0o700);
    await this.cleanup(reservation);
    await mkdir(captureDirectory, { mode: 0o700 });
    try {
      for (const [index, file] of files.entries()) {
        await writeFile(
          join(captureDirectory, storedFiles[index].storedName),
          file.buffer,
          { flag: 'wx', mode: 0o600 },
        );
      }
      const pendingManifest = join(captureDirectory, '.manifest.json.tmp');
      await writeFile(pendingManifest, manifestText, {
        flag: 'wx',
        mode: 0o600,
      });
      await rename(pendingManifest, join(captureDirectory, 'manifest.json'));
    } catch (storageError) {
      await rm(captureDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      );
      throw storageError;
    }
    this.logger.warn(
      `[public-upload-failure] captured id=${captureId} route=${request.route} code=${manifest.error.code} files=${storedFiles.length} bytes=${bytes} retentionHours=72`,
    );
  }

  private async cleanup(reservedBytes = 0): Promise<void> {
    let nextDelay = CLEANUP_INTERVAL_MS;
    try {
      const root = await lstat(this.rootDirectory).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
          return null;
        },
      );
      if (!root) return;
      if (
        !root.isDirectory() ||
        (await realpath(this.rootDirectory)) !== this.rootDirectory
      ) {
        throw new Error('Failed-upload capture path must use real directories');
      }
      const now = Date.now();
      const entries: StoredCaptureEntry[] = [];
      for (const entry of await readdir(this.rootDirectory, {
        withFileTypes: true,
      })) {
        if (!entry.isDirectory() || !CAPTURE_DIRECTORY_PATTERN.test(entry.name))
          continue;
        const expiresAt = captureExpiry(entry.name);
        if (!Number.isFinite(expiresAt)) continue;
        const path = join(this.rootDirectory, entry.name);
        if (expiresAt <= now) {
          await rm(path, { recursive: true, force: true });
        } else {
          entries.push({ path, expiresAt, size: await directorySize(path) });
        }
      }
      entries.sort((left, right) => left.expiresAt - right.expiresAt);
      let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
      const limit = reservedBytes ? MAX_CAPTURE_COUNT - 1 : MAX_CAPTURE_COUNT;
      while (
        entries.length > limit ||
        totalBytes + reservedBytes > MAX_TOTAL_BYTES
      ) {
        const oldest = entries.shift();
        if (!oldest) break;
        await rm(oldest.path, { recursive: true, force: true });
        totalBytes -= oldest.size;
      }
      if (entries[0]) {
        nextDelay = Math.min(
          nextDelay,
          Math.max(1, entries[0].expiresAt - Date.now()),
        );
      }
    } finally {
      if (!this.stopping) {
        clearTimeout(this.cleanupTimer);
        this.cleanupTimer = setTimeout(() => {
          void this.enqueue(() => this.cleanup()).catch((error) =>
            this.logStorageFailure('scheduled-cleanup', error),
          );
        }, nextDelay);
        this.cleanupTimer.unref();
      }
    }
  }

  private logStorageFailure(stage: string, error: unknown): void {
    const code = safeErrorCode(error);
    this.logger.error(
      `[public-upload-failure] storage stage=${stage} code=${code}`,
    );
  }
}
