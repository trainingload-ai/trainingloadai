import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import {
  activityPolylineFingerprint,
  normalizeActivityPolylines,
} from '@/utils/activity-polyline.util';
import { resolveActivityMapThumbProvider } from '@/maps/activity-map-thumbnail-provider';

type MapThumbJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'DEAD';

type ActivityMapPolylineRow = {
  activityId: number;
  userId: string;
  hashId: string;
  polylines: string[];
};

type ActivityMapPolylineCacheRow = Omit<ActivityMapPolylineRow, 'polylines'> & {
  polyline: string | null;
};

type ActivityMapThumbRow = {
  id: string;
  status: MapThumbJobStatus;
  polyline_fingerprint: string;
  render_version: number;
  r2_url: string | null;
  r2_dark_url: string | null;
};

export type ActivityMapThumbUrls = {
  lightUrl: string | null;
  darkUrl: string | null;
};

@Injectable()
export class ActivityMapThumbJobService {
  private readonly logger = new Logger(ActivityMapThumbJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_PORT) private readonly storageService: StoragePort,
  ) {}

  get renderVersion() {
    const defaultVersion = this.thumbnailProvider === 'local' ? '3' : '2';
    const value = Number(
      this.configService.get<string>('ACTIVITY_MAP_THUMB_RENDER_VERSION') ??
        defaultVersion,
    );
    return Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : Number(defaultVersion);
  }

  private get thumbnailProvider() {
    return resolveActivityMapThumbProvider(
      process.env,
      this.configService.get<string>('activityMapThumbWorker.provider') ??
        this.configService.get<string>('ACTIVITY_MAP_THUMB_PROVIDER'),
    );
  }

  get mapStyle() {
    if (this.thumbnailProvider === 'local') return 'route-only-v1';
    return (
      this.configService.get<string>('ACTIVITY_MAP_THUMB_STYLE') ??
      'mapbox/outdoors-v12'
    );
  }

  get darkMapStyle() {
    if (this.thumbnailProvider === 'local') return 'route-only-v1';
    return (
      this.configService.get<string>('ACTIVITY_MAP_THUMB_DARK_STYLE') ??
      'mapbox/dark-v11'
    );
  }

  get width() {
    const value = Number(
      this.configService.get<string>('ACTIVITY_MAP_THUMB_WIDTH') ?? '320',
    );
    return Number.isFinite(value) && value >= 64 ? Math.floor(value) : 320;
  }

  get height() {
    const value = Number(
      this.configService.get<string>('ACTIVITY_MAP_THUMB_HEIGHT') ?? '180',
    );
    return Number.isFinite(value) && value >= 64 ? Math.floor(value) : 180;
  }

  get maxAttempts() {
    const value = Number(
      this.configService.get<string>('ACTIVITY_MAP_THUMB_MAX_ATTEMPTS') ?? '3',
    );
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 3;
  }
  /**
   * 根据活动 ID 查找地图缩略图任务。
   */
  private async findJobByActivityId(activityId: number) {
    const rows = await this.prisma.$queryRaw<ActivityMapThumbRow[]>`
      SELECT id, status, polyline_fingerprint, render_version, r2_url, r2_dark_url
      FROM t_activity_map_thumb_job
      WHERE activity_id = ${activityId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
  /**
   * 地图缩略图入队（不阻塞请求）。ActivityMapThumbJobService 内按 polyline fingerprint 与任务状态去重。
   */
  async enqueueForActivity(args: ActivityMapPolylineRow): Promise<void> {
    const polylines = normalizeActivityPolylines(args.polylines);
    if (polylines.length === 0) {
      this.logger.log(
        `[活动地图缩略图][入队] 跳过：无可用 polyline activityId=${args.activityId} hashId=${args.hashId}`,
      );
      return;
    }

    const fp = activityPolylineFingerprint(polylines);
    const fpShort = fp.slice(0, 10);
    const existing = await this.findJobByActivityId(args.activityId);

    if (!existing) {
      await this.prisma.$executeRaw`
        INSERT INTO t_activity_map_thumb_job (
          id, user_id, activity_id, activity_hash_id, polyline_fingerprint,
          render_version, map_style, width, height, status, available_at,
          attempts, max_attempts, updated_at
        ) VALUES (
          ${randomUUID()},
          ${args.userId},
          ${args.activityId},
          ${args.hashId},
          ${fp},
          ${this.renderVersion},
          ${this.mapStyle},
          ${this.width},
          ${this.height},
          'PENDING',
          NOW(),
          0,
          ${this.maxAttempts},
          NOW()
        )
        ON CONFLICT (activity_id) DO NOTHING
      `;
      const afterInsert = await this.findJobByActivityId(args.activityId);
      if (afterInsert && afterInsert.status === 'PENDING') {
        this.logger.log(
          `[活动地图缩略图][入队] 新建行 PENDING activityId=${args.activityId} hashId=${args.hashId} segments=${polylines.length} fp=${fpShort}`,
        );
        return;
      }
    }

    const latest =
      existing ?? (await this.findJobByActivityId(args.activityId));
    if (!latest) {
      this.logger.warn(
        `[活动地图缩略图][入队] 无任务行（可能并发 INSERT 冲突） activityId=${args.activityId} hashId=${args.hashId}`,
      );
      return;
    }

    const sameFingerprint = latest.polyline_fingerprint === fp;
    const sameRenderVersion = latest.render_version === this.renderVersion;
    if (
      sameFingerprint &&
      sameRenderVersion &&
      (latest.status === 'RUNNING' || latest.status === 'PENDING')
    ) {
      this.logger.log(
        `[活动地图缩略图][入队] 跳过：同 fingerprint 且任务进行中 activityId=${args.activityId} hashId=${args.hashId} status=${latest.status} fp=${fpShort}`,
      );
      return;
    }
    if (
      sameFingerprint &&
      sameRenderVersion &&
      latest.status === 'SUCCEEDED' &&
      typeof latest.r2_url === 'string' &&
      latest.r2_url.length > 0 &&
      typeof latest.r2_dark_url === 'string' &&
      latest.r2_dark_url.length > 0
    ) {
      this.logger.log(
        `[活动地图缩略图][入队] 跳过：缩略图已成功 activityId=${args.activityId} hashId=${args.hashId} fp=${fpShort}`,
      );
      return;
    }

    await this.prisma.$executeRaw`
      UPDATE t_activity_map_thumb_job
      SET
        user_id = ${args.userId},
        activity_hash_id = ${args.hashId},
        polyline_fingerprint = ${fp},
        render_version = ${this.renderVersion},
        map_style = ${this.mapStyle},
        width = ${this.width},
        height = ${this.height},
        status = 'PENDING',
        available_at = NOW(),
        lease_expires_at = NULL,
        lock_token = NULL,
        attempts = 0,
        max_attempts = ${this.maxAttempts},
        last_error = NULL,
        r2_key = NULL,
        r2_url = NULL,
        r2_dark_key = NULL,
        r2_dark_url = NULL,
        generated_at = NULL,
        updated_at = NOW()
      WHERE id = ${latest.id}
    `;
    this.logger.log(
      `[活动地图缩略图][入队] 已重置为 PENDING（待 Worker 生成） activityId=${args.activityId} hashId=${args.hashId} segments=${polylines.length} fp=${fpShort} prevStatus=${latest.status}`,
    );
  }

  async enqueueForActivities(
    activityIds: number[],
    userId: string,
  ): Promise<void> {
    const ids = [...new Set(activityIds.filter((v) => Number.isFinite(v)))];
    if (ids.length === 0) return;

    const rows = await this.prisma.$queryRaw<ActivityMapPolylineCacheRow[]>`
      SELECT
        a.id AS "activityId",
        a.user_id AS "userId",
        a.hash_id AS "hashId",
        COALESCE(s.polyline, p.polyline) AS "polyline"
      FROM t_activity a
      LEFT JOIN t_activity_polyline_segment s ON s.activity_id = a.id
      LEFT JOIN t_activity_polyline p
        ON p.activity_id = a.id
        AND s.activity_id IS NULL
      WHERE a.user_id = ${userId}
        AND a.id IN (${Prisma.join(ids)})
        AND a.state = 1
        AND COALESCE(s.polyline, p.polyline) IS NOT NULL
      ORDER BY a.id, s.segment_index NULLS FIRST
    `;

    const grouped = new Map<number, ActivityMapPolylineRow>();
    for (const row of rows) {
      const current = grouped.get(Number(row.activityId)) ?? {
        activityId: Number(row.activityId),
        userId: row.userId,
        hashId: row.hashId,
        polylines: [],
      };
      if (row.polyline) current.polylines.push(row.polyline);
      grouped.set(current.activityId, current);
    }
    for (const row of grouped.values()) {
      await this.enqueueForActivity(row);
    }
  }

  resolvePublicUrl(args: { r2Key?: string | null; r2Url?: string | null }) {
    if (args.r2Key) {
      const baseUrl =
        this.configService.get<string>('ACTIVITY_MAP_THUMB_PUBLIC_BASE_URL') ||
        null;
      return (
        this.storageService.publicAssetUrl(args.r2Key, baseUrl) ??
        args.r2Url ??
        null
      );
    }
    return args.r2Url ?? null;
  }

  async getSucceededThumbUrlMap(
    activityIds: number[],
  ): Promise<Map<number, string>> {
    const variants = await this.getSucceededThumbUrlVariantMap(activityIds);
    const result = new Map<number, string>();
    for (const [activityId, urls] of variants) {
      if (urls.lightUrl) result.set(activityId, urls.lightUrl);
    }
    return result;
  }

  async getSucceededThumbUrlVariantMap(
    activityIds: number[],
  ): Promise<Map<number, ActivityMapThumbUrls>> {
    const ids = [...new Set(activityIds.filter((v) => Number.isFinite(v)))];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      Array<{
        activity_id: number;
        r2_key: string | null;
        r2_url: string | null;
        r2_dark_key: string | null;
        r2_dark_url: string | null;
      }>
    >`
      SELECT activity_id, r2_key, r2_url, r2_dark_key, r2_dark_url
      FROM t_activity_map_thumb_job
      WHERE activity_id IN (${Prisma.join(ids)})
        AND status = 'SUCCEEDED'
        AND (r2_key IS NOT NULL OR r2_url IS NOT NULL)
    `;
    const result = new Map<number, ActivityMapThumbUrls>();
    if (rows.length === 0 && ids.length > 0) {
      this.logger.debug(
        `[活动地图缩略图] 无可用缩略图记录 activityIds=${ids.slice(0, 20).join(',')}${ids.length > 20 ? '…' : ''}`,
      );
    }
    for (const row of rows) {
      const url = this.resolvePublicUrl({
        r2Key: row.r2_key,
        r2Url: row.r2_url,
      });
      const darkUrl = this.resolvePublicUrl({
        r2Key: row.r2_dark_key,
        r2Url: row.r2_dark_url,
      });
      if (!url && !darkUrl) continue;
      result.set(Number(row.activity_id), {
        lightUrl: url,
        darkUrl,
      });
    }
    return result;
  }

  buildStorageKey(args: {
    activityHashId: string;
    polylineFingerprint: string;
    style: string;
    width: number;
    height: number;
    extension: string;
    renderVersion: number;
    theme?: 'light' | 'dark';
  }) {
    const styleSlug = args.style.replace(/[^a-zA-Z0-9_-]+/g, '_');
    const themePrefix = args.theme === 'dark' ? 'dark_' : '';
    return `activity-map-thumbs/${args.activityHashId}/v${args.renderVersion}/${args.polylineFingerprint}_${themePrefix}${styleSlug}_${args.width}x${args.height}.${args.extension}`;
  }

  backoffMs(attempts: number) {
    const base = 20_000;
    const max = 30 * 60_000;
    const pow = Math.min(10, Math.max(0, attempts));
    return Math.min(max, base * Math.pow(2, pow));
  }
}
