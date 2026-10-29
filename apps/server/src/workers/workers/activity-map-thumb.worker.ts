import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { PrismaService } from '@/prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import { ActivityMapThumbJobService } from '@/api/activity/activity-map-thumb-job.service';
import { StorageObjectGarbageCollectorService } from '@/sensor/parquet-garbage-collector.service';
import {
  activityPolylineFingerprint,
  normalizeActivityPolylines,
} from '@/utils/activity-polyline.util';
import { WorkerDrainProgress } from '../worker-drain-progress';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { RuntimeJobSupervisor } from '@/runtime-capabilities/runtime-job-supervisor.service';
import { renderLocalRouteThumbnail } from '@/maps/local-route-thumbnail.renderer';
import { resolveActivityMapThumbProvider } from '@/maps/activity-map-thumbnail-provider';
import { renderRemoteRouteThumbnail } from '@/maps/remote-route-thumbnail.port';

type ClaimedJob = {
  id: string;
  userId: string;
  activityId: number;
  activityHashId: string;
  polylineFingerprint: string;
  renderVersion: number;
  mapStyle: string;
  width: number;
  height: number;
  attempts: number;
  maxAttempts: number;
  lockToken: string;
};

type MapThumbVariant = {
  label: 'light' | 'dark';
  mapStyle: string;
  routeColor: string;
  keyTheme?: 'dark';
};

const ACTIVITY_MAP_THUMB_ROUTE_COLOR = 'f97316';

function sampleCoords(
  coords: Array<[number, number]>,
  stride: number,
): Array<[number, number]> {
  if (stride <= 1 || coords.length <= 2) return coords;
  const out: Array<[number, number]> = [];
  out.push(coords[0]!);
  for (let i = stride; i < coords.length - 1; i += stride) {
    out.push(coords[i]!);
  }
  out.push(coords[coords.length - 1]!);
  return out;
}

export async function buildPolylineCandidates(
  value: unknown,
): Promise<string[][]> {
  const polylines = normalizeActivityPolylines(value);
  if (polylines.length === 0) return [];
  try {
    const mapboxPolyline = await import('@mapbox/polyline');
    const decodedSegments = polylines.map(
      (polyline) => mapboxPolyline.decode(polyline) as Array<[number, number]>,
    );

    const seen = new Set<string>();
    const candidates: string[][] = [];
    for (const stride of [
      1, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512,
    ]) {
      const encodedSegments = decodedSegments.map((decoded, index) => {
        if (decoded.length < 2 || stride === 1) return polylines[index]!;
        return mapboxPolyline.encode(sampleCoords(decoded, stride));
      });
      const key = JSON.stringify(encodedSegments);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(encodedSegments);
    }
    return candidates.length > 0 ? candidates : [polylines];
  } catch {
    return [polylines];
  }
}

@Injectable()
export class ActivityMapThumbWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ActivityMapThumbWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private unregister: (() => void) | null = null;
  private stopping = false;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_PORT) private readonly storageService: StoragePort,
    private readonly mapThumbJobService: ActivityMapThumbJobService,
    private readonly storageGarbageCollector: StorageObjectGarbageCollectorService,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
    private readonly jobSupervisor?: RuntimeJobSupervisor,
  ) {}

  private enabled() {
    const maps = this.capabilities?.snapshot().capabilities.maps;
    const workerEnabled =
      this.configService.get<boolean>('activityMapThumbWorker.enabled') ?? true;
    if (!workerEnabled) return false;
    const provider = this.thumbnailProvider();
    if (provider === 'local') return true;
    return (
      provider === 'mapbox' &&
      (maps === undefined ||
        (maps.state === 'enabled' && maps.provider === 'mapbox'))
    );
  }

  private thumbnailProvider() {
    return resolveActivityMapThumbProvider(
      process.env,
      this.configService.get<string>('activityMapThumbWorker.provider') ??
        this.configService.get<string>('ACTIVITY_MAP_THUMB_PROVIDER'),
    );
  }

  private pollMs() {
    const value =
      this.configService.get<number>('activityMapThumbWorker.pollMs') ?? 1000;
    return value > 0 ? value : 1000;
  }

  private batchSize() {
    const value =
      this.configService.get<number>('activityMapThumbWorker.batchSize') ?? 5;
    return value > 0 ? value : 5;
  }

  private concurrency() {
    const value =
      this.configService.get<number>('activityMapThumbWorker.concurrency') ?? 1;
    return value > 0 ? value : 1;
  }

  private leaseMs() {
    const value =
      this.configService.get<number>('activityMapThumbWorker.leaseMs') ??
      60_000;
    return value > 0 ? value : 60_000;
  }

  onModuleInit() {
    this.unregister =
      this.jobSupervisor?.register({
        id: 'maps.activity-thumbnail',
        enabled: () => this.enabled(),
        start: () => this.start(),
        stop: () => this.stop(),
      }) ?? null;
    if (!this.jobSupervisor && this.enabled()) this.start();
  }

  private start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.drain().catch((error) => {
        this.logger.error(
          `[活动地图缩略图][消费] 拉取队列失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, this.pollMs());
    void this.drain();
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  onModuleDestroy() {
    this.stopping = true;
    this.unregister?.();
    this.unregister = null;
    this.stop();
  }

  private async claimBatch(batchSize: number): Promise<ClaimedJob[]> {
    const lockToken = randomUUID();
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        activity_id: number;
        activity_hash_id: string;
        polyline_fingerprint: string;
        render_version: number;
        map_style: string;
        width: number;
        height: number;
        attempts: number;
        max_attempts: number;
      }>
    >`
      WITH picked AS (
        SELECT id
        FROM t_activity_map_thumb_job
        WHERE (
          status IN ('PENDING', 'FAILED')
          AND available_at <= NOW()
        ) OR (
          status = 'RUNNING'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at <= NOW()
        )
        ORDER BY available_at ASC, created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE t_activity_map_thumb_job j
      SET
        status = 'RUNNING',
        lease_expires_at = NOW() + (${this.leaseMs()} * INTERVAL '1 millisecond'),
        lock_token = ${lockToken},
        updated_at = NOW()
      FROM picked
      WHERE j.id = picked.id
      RETURNING
        j.id,
        j.user_id,
        j.activity_id,
        j.activity_hash_id,
        j.polyline_fingerprint,
        j.render_version,
        j.map_style,
        j.width,
        j.height,
        j.attempts,
        j.max_attempts;
    `;

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      activityId: row.activity_id,
      activityHashId: row.activity_hash_id,
      polylineFingerprint: row.polyline_fingerprint,
      renderVersion: row.render_version,
      mapStyle: row.map_style,
      width: row.width,
      height: row.height,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lockToken,
    }));
  }

  private async markSuccess(
    job: ClaimedJob,
    payload: {
      darkR2Key: string;
      darkR2Url: string;
      r2Key: string;
      r2Url: string;
    },
  ): Promise<boolean> {
    const updated = await this.prisma.$executeRaw`
      UPDATE t_activity_map_thumb_job
      SET
        status = 'SUCCEEDED',
        r2_key = ${payload.r2Key},
        r2_url = ${payload.r2Url},
        r2_dark_key = ${payload.darkR2Key},
        r2_dark_url = ${payload.darkR2Url},
        generated_at = NOW(),
        last_error = NULL,
        lease_expires_at = NULL,
        lock_token = NULL,
        updated_at = NOW()
      WHERE id = ${job.id}
        AND lock_token = ${job.lockToken}
    `;
    if (updated > 0) return true;

    // Activity 被删除、primary 被切换或租约被其他 worker 接管时，上传结果不能再挂到 manifest。
    // 这两个对象是当前 worker 刚生成的，必须进入延迟回收，避免 fence 失败造成对象泄漏。
    await this.storageGarbageCollector.enqueueObjects(
      [
        {
          activityId: job.activityId,
          objectKey: payload.r2Key,
          bucket: 'public',
        },
        {
          activityId: job.activityId,
          objectKey: payload.darkR2Key,
          bucket: 'public',
        },
      ],
      'activity_map_thumbnail_fence_rejected',
    );
    this.logger.warn(
      `[活动地图缩略图][提交] fence 失效，上传对象已进入回收队列 jobId=${job.id} activityId=${job.activityId}`,
    );
    return false;
  }

  private async markFailure(job: ClaimedJob, errorMessage: string) {
    const row = await this.prisma.$queryRaw<
      Array<{ attempts: number; max_attempts: number }>
    >`
      UPDATE t_activity_map_thumb_job
      SET
        status = 'FAILED',
        attempts = attempts + 1,
        last_error = ${errorMessage},
        lease_expires_at = NULL,
        lock_token = NULL,
        updated_at = NOW()
      WHERE id = ${job.id}
        AND lock_token = ${job.lockToken}
      RETURNING attempts, max_attempts
    `;
    const updated = row[0];
    if (!updated) {
      this.logger.error(
        `[活动地图缩略图][失败] 未能更新失败状态（可能 lock_token 已失效） jobId=${job.id} activityId=${job.activityId} msg="${errorMessage}"`,
      );
      return;
    }

    if (updated.attempts >= updated.max_attempts) {
      await this.prisma.$executeRaw`
        UPDATE t_activity_map_thumb_job
        SET
          status = 'DEAD',
          available_at = NOW(),
          updated_at = NOW()
        WHERE id = ${job.id}
      `;
      this.logger.error(
        `[活动地图缩略图][失败] 已达最大重试，标记 DEAD jobId=${job.id} activityId=${job.activityId} attempts=${updated.attempts}/${updated.max_attempts} msg="${errorMessage}"`,
      );
      return;
    }

    const delay = this.mapThumbJobService.backoffMs(updated.attempts);
    await this.prisma.$executeRaw`
      UPDATE t_activity_map_thumb_job
      SET
        available_at = NOW() + (${delay} * INTERVAL '1 millisecond'),
        updated_at = NOW()
      WHERE id = ${job.id}
    `;
    this.logger.error(
      `[活动地图缩略图][失败] 将重试 jobId=${job.id} activityId=${job.activityId} attempts=${updated.attempts}/${updated.max_attempts} nextRetryInMs=${delay} msg="${errorMessage}"`,
    );
  }

  private async renderAndUploadVariant(args: {
    candidates: string[][];
    job: ClaimedJob;
    variant: MapThumbVariant;
  }): Promise<{ r2Key: string; r2Url: string }> {
    const { buffer, extension, mimeType } = await renderRemoteRouteThumbnail({
      candidates: args.candidates, height: args.job.height,
      mapStyle: args.variant.mapStyle, routeColor: args.variant.routeColor,
      width: args.job.width,
    });

    return await this.uploadVariant({
      buffer,
      extension,
      job: args.job,
      mimeType,
      variant: args.variant,
    });
  }

  private async uploadVariant(args: {
    buffer: Buffer;
    extension: string;
    job: ClaimedJob;
    mimeType: string;
    variant: MapThumbVariant;
  }): Promise<{ r2Key: string; r2Url: string }> {
    const r2Key = this.mapThumbJobService.buildStorageKey({
      activityHashId: args.job.activityHashId,
      extension: args.extension,
      height: args.job.height,
      polylineFingerprint: args.job.polylineFingerprint,
      renderVersion: args.job.renderVersion,
      style: args.variant.mapStyle,
      theme: args.variant.keyTheme,
      width: args.job.width,
    });
    const file: Express.Multer.File = {
      fieldname: 'file',
      originalname: `activity-map-thumb-${args.variant.label}.${args.extension}`,
      encoding: '7bit',
      mimetype: args.mimeType,
      size: args.buffer.length,
      destination: '',
      filename: '',
      path: '',
      buffer: args.buffer,
      stream: Readable.from(args.buffer),
    };
    const upload = await this.storageService.uploadFileWithCustomKey(
      file,
      r2Key,
      {
        visibility: 'public',
      },
    );
    const r2Url =
      this.mapThumbJobService.resolvePublicUrl({
        r2Key,
        r2Url: upload.url,
      }) ?? '';
    if (!r2Url) {
      throw new Error(`Upload succeeded without URL for ${args.variant.label}`);
    }

    this.logger.log(
      `[活动地图缩略图][${args.variant.label}] 上传完成 activityId=${args.job.activityId} hashId=${args.job.activityHashId} r2Key=${r2Key} bytes=${args.buffer.length}`,
    );
    return { r2Key, r2Url };
  }

  private async processJob(job: ClaimedJob) {
    const startedAt = Date.now();
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ polyline: string | null; state: number | null }>
      >`
        SELECT COALESCE(s.polyline, p.polyline) AS polyline, a.state
        FROM t_activity_map_thumb_job j
        INNER JOIN t_activity a ON a.id = j.activity_id
        LEFT JOIN t_activity_polyline_segment s ON s.activity_id = j.activity_id
        LEFT JOIN t_activity_polyline p
          ON p.activity_id = j.activity_id
          AND s.activity_id IS NULL
        WHERE j.id = ${job.id}
          AND COALESCE(s.polyline, p.polyline) IS NOT NULL
        ORDER BY s.segment_index NULLS FIRST
      `;
      const polylines = normalizeActivityPolylines(
        rows.map((row) => row.polyline),
      );
      if (!rows[0] || rows[0].state !== 1 || polylines.length === 0) {
        await this.markFailure(
          job,
          'Polyline not found or activity unavailable',
        );
        return;
      }

      const currentFingerprint = activityPolylineFingerprint(polylines);
      if (currentFingerprint !== job.polylineFingerprint) {
        await this.mapThumbJobService.enqueueForActivity({
          activityId: job.activityId,
          userId: job.userId,
          hashId: job.activityHashId,
          polylines,
        });
        this.logger.log(
          `[活动地图缩略图][消费] 轨迹已变化，任务已按新 fingerprint 重置 activityId=${job.activityId} segments=${polylines.length}`,
        );
        return;
      }

      const provider = this.thumbnailProvider();
      if (provider === 'invalid') {
        await this.markFailure(job, 'ACTIVITY_MAP_THUMB_PROVIDER is invalid');
        return;
      }

      this.logger.log(
        `[活动地图缩略图][渲染开始] activityId=${job.activityId} hashId=${job.activityHashId} jobId=${job.id} fp=${job.polylineFingerprint.slice(0, 10)}`,
      );

      const variants: MapThumbVariant[] = [
        {
          label: 'light',
          mapStyle: job.mapStyle,
          routeColor: ACTIVITY_MAP_THUMB_ROUTE_COLOR,
        },
        {
          label: 'dark',
          mapStyle: this.mapThumbJobService.darkMapStyle,
          routeColor: ACTIVITY_MAP_THUMB_ROUTE_COLOR,
          keyTheme: 'dark',
        },
      ];
      let uploads: Array<{ r2Key: string; r2Url: string }>;
      if (provider === 'local') {
        uploads = await Promise.all(
          variants.map(async (variant) => {
            const buffer = await renderLocalRouteThumbnail({
              polylines,
              width: job.width,
              height: job.height,
              theme: variant.label,
              routeColor: `#${variant.routeColor}`,
            });
            return await this.uploadVariant({
              buffer,
              extension: 'png',
              job,
              mimeType: 'image/png',
              variant,
            });
          }),
        );
      } else {
        const candidates = await buildPolylineCandidates(polylines);
        const rawLength = polylines.reduce(
          (total, polyline) => total + polyline.length,
          0,
        );
        this.logger.log(
          `[活动地图缩略图][候选路线] activityId=${job.activityId} segments=${polylines.length} candidates=${candidates.length} rawLen=${rawLength} shortestLen=${Math.min(...candidates.map((candidate) => candidate.reduce((total, polyline) => total + polyline.length, 0)))}`,
        );
        uploads = await Promise.all(
          variants.map((variant) =>
            this.renderAndUploadVariant({
              candidates,
              job,
              variant,
            }),
          ),
        );
      }
      const [lightUpload, darkUpload] = uploads;

      const committed = await this.markSuccess(job, {
        darkR2Key: darkUpload.r2Key,
        darkR2Url: darkUpload.r2Url,
        r2Key: lightUpload.r2Key,
        r2Url: lightUpload.r2Url,
      });
      if (!committed) return;
      this.logger.log(
        `[活动地图缩略图][生成完成] activityId=${job.activityId} hashId=${job.activityHashId} jobId=${job.id} lightR2Key=${lightUpload.r2Key} darkR2Key=${darkUpload.r2Key} 耗时=${Date.now() - startedAt}ms`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.markFailure(job, message);
      this.logger.error(
        `[活动地图缩略图][消费] 失败 任务ID=${job.id} 活动ID=${job.activityId} msg="${message}"`,
      );
    }
  }

  private async drain() {
    if (this.stopping || this.draining) return;
    this.draining = true;
    const progress = new WorkerDrainProgress(
      this.logger,
      '活动地图缩略图队列',
      async () => ({
        remaining: await this.prisma.activityMapThumbJob.count({
          where: {
            status: { in: ['PENDING', 'FAILED', 'RUNNING'] },
          },
        }),
      }),
    );
    try {
      while (!this.stopping) {
        const batch = await this.claimBatch(this.batchSize());
        if (!batch.length) return;

        let idx = 0;
        const runners = Array.from(
          { length: Math.min(this.concurrency(), batch.length) },
          async () => {
            while (idx < batch.length && !this.stopping) {
              const current = batch[idx]!;
              const batchPosition = idx + 1;
              idx += 1;
              await progress.run({
                batchPosition,
                batchTotal: batch.length,
                details: `任务ID=${current.id} 活动ID=${current.activityId}`,
                task: () => this.processJob(current),
              });
            }
          },
        );
        await Promise.all(runners);
      }
    } finally {
      this.draining = false;
    }
  }
}
