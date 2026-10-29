import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { computeActivityStatistics } from '@/algorithm/activity-statistics';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';

@Injectable()
export class ActivityStatisticsTask implements MetricsTask {
  key = 'activityStatistics' as const;

  constructor(private readonly prisma: PrismaService) {}

  async pre(ctx: MetricsContext) {
    return ctx;
  }

  async exec(ctx: MetricsContext) {
    const records = ctx.inputs.canonicalRecords;
    if (!records || records.length < 2) return ctx;
    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        activityStatistics: computeActivityStatistics(
          records,
          ctx.inputs.sportType,
        ),
      },
    };
  }

  async post(ctx: MetricsContext) {
    const activityId = ctx.inputs.activity.id;
    const result = ctx.outputs.activityStatistics;
    if (!activityId || !result) return ctx;

    await this.prisma.$transaction(async (tx) => {
      await tx.activityMetricDistribution.deleteMany({
        where: { activityId },
      });
      if (result.distributions.length > 0) {
        await tx.activityMetricDistribution.createMany({
          data: result.distributions.map((item) => ({
            activityId,
            metric: item.metric,
            source: item.source,
            unit: item.unit,
            average: item.average,
            activeAverage: item.activeAverage,
            min: item.min,
            max: item.max,
            q25: item.q25,
            median: item.median,
            q75: item.q75,
            standardDeviation: item.standardDeviation,
            sampleCount: item.sampleCount,
            coveredSeconds: item.coveredSeconds,
            activitySeconds: item.activitySeconds,
            coverageRatio: item.coverageRatio,
            algorithmVersion: item.algorithmVersion,
            parameters: item.parameters as Prisma.InputJsonValue,
          })),
        });
      }

      if (!result.terrain) {
        await tx.activityTerrainSummary.deleteMany({ where: { activityId } });
        return;
      }
      const terrain = result.terrain;
      const data = {
        uphillSeconds: terrain.uphillSeconds,
        flatSeconds: terrain.flatSeconds,
        downhillSeconds: terrain.downhillSeconds,
        uphillDistanceM: terrain.uphillDistanceM,
        flatDistanceM: terrain.flatDistanceM,
        downhillDistanceM: terrain.downhillDistanceM,
        uphillAvgSpeedMps: terrain.uphillAvgSpeedMps,
        flatAvgSpeedMps: terrain.flatAvgSpeedMps,
        downhillAvgSpeedMps: terrain.downhillAvgSpeedMps,
        uphillAvgCadence: terrain.uphillAvgCadence,
        flatAvgCadence: terrain.flatAvgCadence,
        downhillAvgCadence: terrain.downhillAvgCadence,
        ascentSpeedMPerHour: terrain.ascentSpeedMPerHour,
        profile: terrain.profile,
        gradeCoveredSeconds: terrain.gradeCoveredSeconds,
        activitySeconds: terrain.activitySeconds,
        gradeCoverageRatio: terrain.gradeCoverageRatio,
        algorithmVersion: terrain.algorithmVersion,
        parameters: terrain.parameters as Prisma.InputJsonValue,
        calculatedAt: new Date(),
      };
      await tx.activityTerrainSummary.upsert({
        where: { activityId },
        update: data,
        create: { activityId, ...data },
      });
    });
    return ctx;
  }
}
