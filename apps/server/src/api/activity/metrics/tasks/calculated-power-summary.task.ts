import { Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { round } from 'lodash';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import {
  CALCULATED_POWER_MODEL_VERSION,
  CYCLING_COASTING_CADENCE_RPM,
  CYCLING_CALCULATED_POWER_MODEL,
  DEFAULT_CYCLING_POWER_PARAMETERS,
  measuredPowerCoverage,
  RUNNING_CALCULATED_POWER_MODEL,
} from '@/algorithm/power';

type CalculatedPowerSummary = {
  model: string;
  modelVersion: number;
  avgPower: number;
  maxPower: number;
  sampleCount: number;
  parameters: Record<string, unknown>;
};

@Injectable()
export class CalculatedPowerSummaryTask implements MetricsTask {
  key = 'calculatedPowerSummary' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}

  async pre(ctx: MetricsContext) {
    return ctx;
  }

  async exec(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const records = ctx.inputs.canonicalRecords ?? [];
    if (
      !activity?.id ||
      (activity.sportType !== $Enums.SportType.RUN &&
        activity.sportType !== $Enums.SportType.CYCLING)
    ) {
      return ctx;
    }

    const values = records
      .map((record) => record.calculatedPower)
      .filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value) && value >= 0,
      );
    if (values.length === 0) return ctx;

    const profile = ctx.inputs.userId
      ? await this.userService.getComposedUserProfile(
          ctx.inputs.userId,
          activity.sportType,
          activity.startTime ?? undefined,
        )
      : undefined;
    const gradeSampleCount = records.filter(
      (record) =>
        typeof record.grade === 'number' && Number.isFinite(record.grade),
    ).length;
    const cadenceSampleCount = records.filter(
      (record) =>
        typeof record.cadence === 'number' && Number.isFinite(record.cadence),
    ).length;
    const model =
      activity.sportType === $Enums.SportType.RUN
        ? RUNNING_CALCULATED_POWER_MODEL
        : CYCLING_CALCULATED_POWER_MODEL;
    const summary: CalculatedPowerSummary = {
      model,
      modelVersion: CALCULATED_POWER_MODEL_VERSION,
      avgPower: round(
        values.reduce((sum, value) => sum + value, 0) / values.length,
        2,
      ),
      maxPower: round(Math.max(...values), 2),
      sampleCount: values.length,
      parameters: {
        weightKg: profile?.weight ?? null,
        measuredPowerCoverage: round(
          measuredPowerCoverage(
            records.map((record) => ({
              enhancedSpeed: record.enhancedSpeed,
              speed: record.speed,
              distance: record.distance,
              grade: record.grade,
              power: record.power,
            })),
          ),
          4,
        ),
        ...(activity.sportType === $Enums.SportType.RUN
          ? {
              height: profile?.height ?? null,
              gradeMode: 'record',
              gradeCoverage:
                records.length > 0 ? gradeSampleCount / records.length : 0,
            }
          : {
              ...DEFAULT_CYCLING_POWER_PARAMETERS,
              gradeCoverage:
                records.length > 0 ? gradeSampleCount / records.length : 0,
              cadenceCoverage:
                records.length > 0 ? cadenceSampleCount / records.length : 0,
              coastingCadenceRpm: CYCLING_COASTING_CADENCE_RPM,
            }),
      },
    };

    return {
      ...ctx,
      outputs: { ...ctx.outputs, calculatedPowerSummary: summary },
    };
  }

  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    if (!activity?.id) return ctx;
    const summary = ctx.outputs.calculatedPowerSummary as
      | CalculatedPowerSummary
      | undefined;
    if (!summary) {
      await this.prisma.activityCalculatedPower.deleteMany({
        where: { activityId: activity.id },
      });
      return ctx;
    }

    const data = {
      sport: activity.sportType ?? $Enums.SportType.UNKNOWN,
      model: summary.model,
      modelVersion: summary.modelVersion,
      avgPower: summary.avgPower,
      maxPower: summary.maxPower,
      sampleCount: summary.sampleCount,
      parameters: summary.parameters as Prisma.InputJsonValue,
      calculatedAt: new Date(),
    };
    await this.prisma.activityCalculatedPower.upsert({
      where: { activityId: activity.id },
      create: {
        activity: { connect: { id: activity.id } },
        ...data,
      },
      update: data,
    });
    return ctx;
  }
}
