import { createHash } from 'crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportingJobService } from './importing-job.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import { importJsonValue } from './import-item-job.types';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import type { RuntimeCapabilityName } from '@/runtime-capabilities/runtime-capability.types';

export type DownloadedActivityFile = {
  buffer: Buffer;
  fileName: string;
  contentType?: string | null;
  endpoint?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class RemoteActivityFileService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly importJobs: ImportingJobService,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  async resolve(args: {
    sourceObject: {
      id: string;
      fileKey?: string | null;
      fileName?: string | null;
      rawStorageKey?: string | null;
    };
    fallbackFileName: string;
    metadata?: Record<string, unknown>;
    capability?: RuntimeCapabilityName;
    download: () => Promise<DownloadedActivityFile>;
  }) {
    const existingKey = args.sourceObject.fileKey ?? undefined;
    const existingBuffer = existingKey
      ? await this.storage.getFileWithKey(existingKey)
      : undefined;
    if (existingKey && existingBuffer) {
      const sourceChecksum = createHash('sha256')
        .update(existingBuffer)
        .digest('hex');
      return {
        buffer: existingBuffer,
        fileKey: existingKey,
        fileName: args.sourceObject.fileName ?? args.fallbackFileName,
        rawStorageKey: args.sourceObject.rawStorageKey ?? existingKey,
        sourceChecksum,
      };
    }

    this.capabilities?.require(args.capability ?? 'third-party-sync');
    const downloaded = await args.download();
    if (!downloaded.buffer.length)
      throw new Error('Downloaded activity file is empty');
    const uploaded = await this.storage.uploadFile({
      buffer: downloaded.buffer,
      originalname: downloaded.fileName,
      mimetype: downloaded.contentType ?? 'application/octet-stream',
      size: downloaded.buffer.length,
    } as Express.Multer.File);
    await this.importJobs.sourceObjects().update({
      where: { id: args.sourceObject.id },
      data: {
        fileName: downloaded.fileName,
        fileKey: uploaded.fileKey,
        rawStorageKey: uploaded.fileKey,
        rawChecksum: createHash('sha256')
          .update(downloaded.buffer)
          .digest('hex'),
        metadata: importJsonValue({
          ...(args.metadata ?? {}),
          ...(downloaded.metadata ?? {}),
          downloadedFileEndpoint: downloaded.endpoint ?? null,
          downloadedFileContentType: downloaded.contentType ?? null,
          downloadedFileName: downloaded.fileName,
        }),
      },
    });
    return {
      buffer: downloaded.buffer,
      fileKey: uploaded.fileKey,
      fileName: downloaded.fileName,
      rawStorageKey: uploaded.fileKey,
      sourceChecksum: createHash('sha256')
        .update(downloaded.buffer)
        .digest('hex'),
    };
  }
}
