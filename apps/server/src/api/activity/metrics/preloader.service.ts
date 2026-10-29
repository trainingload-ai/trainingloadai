import { Injectable } from '@nestjs/common';
import type { PeakType, ScaleType, SportType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  CanonicalActivityRecord,
  MetricsContext,
  PeakMetricKey,
  PeakMetricListItem,
  PeakMetricListKey,
} from './context';
import { SensorDataService } from '@/sensor/sensor-data.service';
import { detectSampleSec } from '@/algorithm/utils';

@Injectable()
export class ActivityMetricsPreloaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sensorDataService: SensorDataService,
  ) {}

  async ensurePeakMetric(
    ctx: MetricsContext,
    args: {
      type: PeakType;
      scaleType: ScaleType;
      scaleValue: number;
      sport: SportType;
    },
  ): Promise<MetricsContext> {
    const { activity } = ctx.inputs;
    const key =
      `${args.type}:${args.scaleType}:${args.scaleValue}` as PeakMetricKey;
    if (ctx.cache.peakMetrics?.[key] != null) return ctx;

    const peak = await this.prisma.activityPeakMetric.findFirst({
      where: {
        activityId: activity.id,
        sport: args.sport,
        type: args.type,
        scaleType: args.scaleType,
        scaleValue: args.scaleValue,
        value: { not: null },
      },
      select: { value: true },
    });
    const v =
      peak?.value !== null && peak?.value !== undefined
        ? peak.value
        : undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      return ctx;
    }

    return {
      ...ctx,
      cache: {
        ...ctx.cache,
        peakMetrics: { ...(ctx.cache.peakMetrics ?? {}), [key]: v },
      },
    };
  }

  async ensureRecords(
    ctx: MetricsContext,
    fields: Array<
      'speed' | 'enhancedSpeed' | 'heartRate' | 'power' | 'distance'
    >,
  ): Promise<MetricsContext> {
    const { activity } = ctx.inputs;
    const key = fields.join(',');
    if (ctx.cache.records?.[key]) return ctx;

    const rows = await this.sensorDataService.getRecordSeriesMulti(
      activity.id,
      fields,
      activity.timezone,
    );
    const records: CanonicalActivityRecord[] =
      rows?.map((r) => ({
        time: r.time,
        tMs: new Date(r.time).getTime(),
        distance:
          r.distance == null || r.distance === ''
            ? undefined
            : Number(r.distance),
        speed: r.speed,
        enhancedSpeed: r.enhancedSpeed,
        power: r.power,
        heartRate: r.heartRate,
      })) ?? [];

    const sampleSec =
      ctx.cache.sampleSec ??
      (rows && rows.length > 0 ? detectSampleSec(rows) : undefined);

    return {
      ...ctx,
      cache: {
        ...ctx.cache,
        sampleSec,
        records: { ...(ctx.cache.records ?? {}), [key]: records },
      },
    };
  }

  async ensurePeakMetricsList(
    ctx: MetricsContext,
    args: {
      sport: SportType;
      type: PeakType;
      scaleType: ScaleType;
    },
  ): Promise<MetricsContext> {
    const { activity } = ctx.inputs;
    const listKey =
      `list:${args.type}:${args.scaleType}` as PeakMetricListKey;
    const existing = ctx.cache.peakMetricLists?.[listKey];
    if (existing) return ctx;

    const patch = await this.loadPeakMetricsList({
      activityId: activity.id,
      sport: args.sport,
      type: args.type,
      scaleType: args.scaleType,
    });

    if (!patch) return ctx;

    return {
      ...ctx,
      cache: {
        ...ctx.cache,
        peakMetricLists: {
          ...(ctx.cache.peakMetricLists ?? {}),
          ...patch.peakMetricLists,
        },
      },
    };
  }

  /**
   * 获取某个类型的表现列表，通常用于配速/功率等随距离/时间变化的表现曲线
   * @param args
   * @returns
   */
  async loadPeakMetricsList(args: {
    activityId: number;
    sport: SportType;
    type: PeakType;
    scaleType: ScaleType;
  }): Promise<{
    peakMetricLists: Partial<
      Record<PeakMetricListKey, PeakMetricListItem[]>
    >;
  } | null> {
    const rows = await this.prisma.activityPeakMetric.findMany({
      where: {
        activityId: args.activityId,
        sport: args.sport,
        type: args.type,
        scaleType: args.scaleType,
        value: { not: null },
      },
      orderBy: { scaleValue: 'asc' },
      select: { scaleValue: true, value: true },
    });

    const list = rows
      .map((r) => ({ duration: r.scaleValue, value: r.value }))
      .filter(
        (x) =>
          typeof x.value === 'number' &&
          Number.isFinite(x.value) &&
          x.value > 0,
      );

    if (list.length === 0) return null;

    const listKey =
      `list:${args.type}:${args.scaleType}` as PeakMetricListKey;
    return { peakMetricLists: { [listKey]: list } };
  }
}
