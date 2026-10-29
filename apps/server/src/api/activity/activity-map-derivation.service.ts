import { HttpException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Activity } from '@prisma/client';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { PrismaService } from '@/prisma/prisma.service';
import { SensorDataService } from '@/sensor/sensor-data.service';
import { normalizeActivityPolylines } from '@/utils/activity-polyline.util';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { ActivityLayerDto } from './dto/activity-layer.dto';
import { ActivityMapThumbJobService } from './activity-map-thumb-job.service';

/**
 * Owns the activity-map derived-data lifecycle: polyline cache materialization
 * and thumbnail scheduling. Query and ingest flows depend on this service
 * instead of reaching into the ActivityService implementation.
 */
@Injectable()
export class ActivityMapDerivationService {
  private readonly logger = new Logger(ActivityMapDerivationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sensorData: SensorDataService,
    private readonly thumbJobs: ActivityMapThumbJobService,
    private readonly i18n: I18nService,
  ) {}

  private async getCachedPolylines(activityId: number): Promise<string[]> {
    const segmentRows = await this.prisma.$queryRaw<
      Array<{ polyline: string | null }>
    >`
      SELECT polyline
      FROM t_activity_polyline_segment
      WHERE activity_id = ${activityId}
      ORDER BY segment_index ASC
    `;
    const segments = normalizeActivityPolylines(
      segmentRows.map((row) => row.polyline),
    );
    if (segments.length > 0) return segments;

    const legacy = await this.prisma.activityPolyline.findFirst({
      where: { activityId },
      select: { polyline: true },
    });
    return normalizeActivityPolylines(legacy?.polyline);
  }

  private async persistPolylines(
    activityId: number,
    value: unknown,
  ): Promise<string[]> {
    const polylines = normalizeActivityPolylines(value);
    if (polylines.length === 0) return [];

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM t_activity_polyline_segment
        WHERE activity_id = ${activityId}
      `;
      for (const [segmentIndex, polyline] of polylines.entries()) {
        await tx.$executeRaw`
          INSERT INTO t_activity_polyline_segment (
            id, activity_id, segment_index, polyline, created_at, updated_at
          ) VALUES (
            ${randomUUID()}, ${activityId}, ${segmentIndex}, ${polyline}, NOW(), NOW()
          )
        `;
      }

      if (polylines.length === 1) {
        await tx.activityPolyline.upsert({
          where: { activityId },
          update: { polyline: polylines[0] },
          create: { activityId, polyline: polylines[0] },
        });
      } else {
        await tx.activityPolyline.deleteMany({ where: { activityId } });
      }
    });
    return polylines;
  }

  private enqueueBestEffort(args: {
    activityId: number;
    userId: string;
    hashId: string;
    polylines: string[];
    logContext?: string;
  }): void {
    const { activityId, userId, hashId, polylines, logContext } = args;
    void this.thumbJobs
      .enqueueForActivity({ activityId, userId, hashId, polylines })
      .catch((error) => {
        this.logger.warn(
          `[活动地图缩略图] 入队失败${logContext ? ` ${logContext}` : ''} activityId=${activityId} hashId=${hashId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  async ensureThumbsBestEffort(
    activityIds: number[],
    userId: string,
  ): Promise<void> {
    const ids = Array.from(
      new Set(
        activityIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );
    if (ids.length === 0) return;

    const activities = await this.prisma.activity.findMany({
      where: {
        id: { in: ids },
        userId,
        state: 1,
        startLat: { not: null },
        startLng: { not: null },
      },
      select: { id: true, userId: true, hashId: true },
    });
    for (const activity of activities) {
      await this.scheduleAfterSensorImport(activity);
    }
  }

  async scheduleAfterCanonicalCommit(
    activityId: number,
    userId: string,
  ): Promise<void> {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, userId, state: 1 },
      select: { id: true, userId: true, hashId: true },
    });
    if (!activity) return;
    await this.scheduleAfterSensorImport(activity);
  }

  async scheduleAfterSensorImport(
    activity: Pick<Activity, 'id' | 'userId' | 'hashId'>,
  ): Promise<void> {
    try {
      let polylines = await this.getCachedPolylines(activity.id);
      if (polylines.length === 0) {
        this.logger.log(
          `[活动图层][导入后] 无 polyline 缓存，Parquet 抽取 activityId=${activity.id}`,
        );
        const layerData = await this.sensorData.getActivitiesLocationData(
          [activity.id],
          100,
        );
        polylines = await this.persistPolylines(
          activity.id,
          layerData.map((row) => row.polyline),
        );
      }
      if (polylines.length === 0) return;

      this.enqueueBestEffort({
        activityId: activity.id,
        userId: activity.userId,
        hashId: activity.hashId,
        polylines,
        logContext: 'parquet提取后',
      });
    } catch (error) {
      this.logger.warn(
        `[活动地图缩略图] parquet 后 schedule 失败 activityId=${activity.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async getActivityLayerByHash(
    hashId: string,
    samplingPercentage = 100,
    options?: { userId?: string; readOnly?: boolean },
  ): Promise<ActivityLayerDto> {
    try {
      if (samplingPercentage <= 0 || samplingPercentage > 100) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: '采样百分比必须在 0-100 之间',
        });
      }

      const entity = await this.prisma.activity.findFirst({
        where: readyActivityWhere({ hashId, userId: options?.userId }),
        select: { id: true, userId: true },
      });
      if (!entity) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: '活动不存在',
        });
      }

      const cachedPolylines = await this.getCachedPolylines(entity.id);
      if (cachedPolylines.length > 0) {
        if (!options?.readOnly) {
          this.enqueueBestEffort({
            activityId: entity.id,
            userId: entity.userId,
            hashId,
            polylines: cachedPolylines,
          });
        }
        return {
          maps: cachedPolylines.map((polyline) => ({ hashId, polyline })),
        };
      }

      const layerData = await this.sensorData.getActivitiesLocationData(
        [entity.id],
        samplingPercentage,
      );
      if (options?.readOnly) return { maps: layerData };
      const persistedPolylines = await this.persistPolylines(
        entity.id,
        layerData.map((row) => row.polyline),
      );
      if (persistedPolylines.length > 0) {
        this.enqueueBestEffort({
          activityId: entity.id,
          userId: entity.userId,
          hashId,
          polylines: persistedPolylines,
        });
      }
      return { maps: layerData };
    } catch (error) {
      this.logger.error(
        `[获取单活动图层] 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (error instanceof HttpException) throw error;
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }
}
