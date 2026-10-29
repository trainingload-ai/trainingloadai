import { Injectable } from '@nestjs/common';
import { $Enums, PeakType, ScaleType } from '@prisma/client';
import { calculateCp } from '@/algorithm/fitness-cp';
import type { MetricsContext, PeakMetricListKey } from '../context';
import type { MetricsTask } from '../task';
import { ActivityMetricsPreloaderService } from '../preloader.service';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class EstimatedPowerMetricsTask implements MetricsTask {
  key = 'estimatedPowerMetrics' as const;

  constructor(
    private readonly preloader: ActivityMetricsPreloaderService,
    private readonly prisma: PrismaService,
  ) {}

  async pre(ctx: MetricsContext): Promise<MetricsContext> {
    const { activity } = ctx.inputs;
    if (!activity?.id) return ctx;

    const listKey = `list:${PeakType.power}:${ScaleType.TIME}` as PeakMetricListKey;
    const existing = ctx.cache.peakMetricLists?.[listKey];
    if (existing) return ctx;

    const patch = await this.preloader.loadPeakMetricsList({
      activityId: activity.id,
      sport: activity.sportType ?? $Enums.SportType.UNKNOWN,
      type: PeakType.power,
      scaleType: ScaleType.TIME,
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

  async exec(ctx: MetricsContext): Promise<MetricsContext> {
    const listKey = `list:${PeakType.power}:${ScaleType.TIME}` as PeakMetricListKey;
    const list = ctx.cache.peakMetricLists?.[listKey];
    // MMP 数据点太少的话，估算结果不可靠，不予计算
    if (!list || list.length < 10) return ctx;

    const points = list
      .map((m) => ({ duration: m.duration, power: m.value }))
      .filter((p) => p.duration > 0 && p.power > 0)
      .sort((a, b) => a.duration - b.duration);

    const result = calculateCp(
      points.map(({ duration, power }) => ({
        seconds: duration,
        value: power,
      })),
    );
    if (!result.valid) return ctx;

    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        estimatedPowerMetrics: {
          ecp: result.cp ?? null,
          eftp: result.ftp ?? 0,
          ewPrime: result.wPrime ?? null,
          epmax: result.pMax ?? null,
        },
      },
    };
  }

  async post(ctx: MetricsContext): Promise<MetricsContext> {
    const { activity } = ctx.inputs;
    const out = ctx.outputs.estimatedPowerMetrics;
    if (!out) return ctx;

    await this.prisma.activity.update({
      where: { id: activity.id },
      data: {
        ecp: out.ecp,
        eftp: out.eftp,
        ewPrime: out.ewPrime,
        epmax: out.epmax,
      },
    });
    return ctx;
  }
}
