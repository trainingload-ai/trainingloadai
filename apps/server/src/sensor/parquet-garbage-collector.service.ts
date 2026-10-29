import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import { HealthFileQueryService } from '@/health-data/health-file-query.service';
import { SensorFileQueryService } from './sensor-file-query.service';
import { forEachWithConcurrency } from '@/utils/async-concurrency.util';

const STORAGE_GARBAGE_CONCURRENCY = 4;

export type RetiredStorageObject = {
  activityId?: number | null;
  objectKey: string;
  bucket?: string;
};

type ClaimedStorageGarbage = {
  id: string;
  objectKey: string;
  bucket: string;
  attempts: number;
};

@Injectable()
export class StorageObjectGarbageCollectorService {
  private readonly logger = new Logger(
    StorageObjectGarbageCollectorService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly sensorFiles: SensorFileQueryService,
    private readonly healthFiles: HealthFileQueryService,
  ) {}

  async enqueueObjects(
    objects: readonly RetiredStorageObject[],
    reason: string,
    delayMs = 60 * 60 * 1000,
    client: Pick<PrismaService, 'storageObjectGarbage'> = this.prisma,
  ): Promise<void> {
    const availableAt = new Date(Date.now() + Math.max(0, delayMs));
    const unique = Array.from(
      new Map(
        objects
          .map((object) => ({
            ...object,
            objectKey: String(object.objectKey ?? '').trim(),
            bucket: String(object.bucket ?? 'default').trim() || 'default',
          }))
          .filter((object) => object.objectKey)
          .map((object) => [
            `${object.bucket}\u0000${object.objectKey}`,
            object,
          ]),
      ).values(),
    );

    await Promise.all(
      unique.map((object) =>
        this.sensorFiles.garbage(client).upsert({
          where: {
            bucket_objectKey: {
              bucket: object.bucket,
              objectKey: object.objectKey,
            },
          },
          create: {
            activityId: object.activityId ?? null,
            objectKey: object.objectKey,
            bucket: object.bucket,
            reason,
            availableAt,
          },
          update: {
            activityId: object.activityId ?? null,
            reason,
            availableAt,
            lockedAt: null,
            lastError: null,
          },
        }),
      ),
    );
  }

  @Cron(
    process.env.STORAGE_OBJECT_GARBAGE_CRON ||
      process.env.PARQUET_GARBAGE_CRON ||
      '*/15 * * * *',
  )
  async handleCron(): Promise<void> {
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(
        `[Storage GC] 批次执行失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async runOnce(limit = 25): Promise<{
    claimed: number;
    deleted: number;
    referenced: number;
    failed: number;
  }> {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = await this.claim(safeLimit);
    let deleted = 0;
    let referenced = 0;
    let failed = 0;

    await forEachWithConcurrency(
      rows,
      STORAGE_GARBAGE_CONCURRENCY,
      async (row) => {
        try {
          // 同名 key 在不同 bucket 中是不同对象，只检查该 bucket 对应的 manifest。
          const liveReference =
            row.bucket === 'public'
              ? await this.prisma.activityMapThumbJob.findFirst({
                  where: {
                    OR: [
                      { r2Key: row.objectKey },
                      { r2DarkKey: row.objectKey },
                    ],
                  },
                  select: { id: true },
                })
              : row.bucket === 'default'
                ? (
                    await Promise.all([
                      this.sensorFiles.parquetFiles().findFirst({
                        where: { parquetPath: row.objectKey },
                        select: { id: true },
                      }),
                      this.healthFiles.existsByParquetPath(row.objectKey),
                    ])
                  ).find(Boolean)
                : null;
          if (liveReference) {
            // 事务结果不确定时可能把已经生效的 staging path 放入清单；
            // 引用检查是最后一道安全门，只移除清单，绝不删除对象。
            await this.sensorFiles.garbage().delete({
              where: { id: row.id },
            });
            referenced += 1;
            return;
          }

          await this.storage.deleteFile(
            row.objectKey,
            row.bucket === 'default'
              ? undefined
              : row.bucket === 'public' || row.bucket === 'private'
                ? row.bucket
                : { bucketName: row.bucket },
          );
          await this.sensorFiles.garbage().delete({
            where: { id: row.id },
          });
          deleted += 1;
        } catch (error) {
          failed += 1;
          const attempts = row.attempts + 1;
          const backoffMinutes = Math.min(24 * 60, 2 ** Math.min(attempts, 10));
          await this.sensorFiles
            .garbage()
            .update({
              where: { id: row.id },
              data: {
                attempts,
                lockedAt: null,
                availableAt: new Date(Date.now() + backoffMinutes * 60_000),
                lastError:
                  error instanceof Error ? error.message : String(error),
              },
            })
            .catch(() => undefined);
        }
      },
    );

    if (rows.length > 0) {
      this.logger.log(
        `[Storage GC] claimed=${rows.length} deleted=${deleted} referenced=${referenced} failed=${failed}`,
      );
    }
    return { claimed: rows.length, deleted, referenced, failed };
  }

  private async claim(limit: number): Promise<ClaimedStorageGarbage[]> {
    const staleBefore = new Date(Date.now() - 30 * 60_000);
    return this.prisma.$queryRaw<ClaimedStorageGarbage[]>`
      UPDATE "t_storage_object_garbage" AS garbage
      SET "locked_at" = NOW(), "updated_at" = NOW()
      WHERE garbage."id" IN (
        SELECT candidate."id"
        FROM "t_storage_object_garbage" AS candidate
        WHERE candidate."available_at" <= NOW()
          AND (
            candidate."locked_at" IS NULL
            OR candidate."locked_at" < ${staleBefore}
          )
        ORDER BY candidate."available_at" ASC, candidate."created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING
        garbage."id",
        garbage."object_key" AS "objectKey",
        garbage."bucket",
        garbage."attempts"
    `;
  }
}
