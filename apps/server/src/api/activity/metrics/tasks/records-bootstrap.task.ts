import { Injectable, Logger } from '@nestjs/common';
import type { CanonicalActivityRecord, MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { SensorDataService } from '@/sensor/sensor-data.service';
import { detectSampleSec } from '@/algorithm/utils';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * 统一拉取并归一化活动 records（canonical 形式）。
 * 目标：避免每个 task 各自打 parquet IO；后续 task 只做 map/filter 纯计算。
 */
@Injectable()
export class RecordsBootstrapTask implements MetricsTask {
  key = 'recordsBootstrap' as const;

  private readonly logger = new Logger(RecordsBootstrapTask.name);

  constructor(
    private readonly sensorDataService: SensorDataService,
    private readonly prisma: PrismaService,
  ) {}

  async pre(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    if (!activity?.id) return ctx;
    if (ctx.inputs.canonicalRecords) {
      const sampleSec =
        ctx.cache.sampleSec ??
        (ctx.inputs.canonicalRecords.length > 0
          ? detectSampleSec(ctx.inputs.canonicalRecords)
          : undefined);
      return {
        ...ctx,
        cache: {
          ...ctx.cache,
          sampleSec,
        },
      };
    }

    try {
      const fields = [
        'distance',
        'speed',
        'enhancedSpeed',
        'heartRate',
        'power',
        'calculatedPower',
        'cadence',
        'grade',
        'altitude',
        'enhancedAltitude',
        'gap',
        'aePace',
      ] as const;

      const rows = await this.sensorDataService.getRecordSeriesMulti(
        activity.id,
        [...fields],
        activity.timezone,
      );

      const canonical: CanonicalActivityRecord[] =
        rows?.map((r) => ({
          time: r.time,
          tMs: new Date(r.time).getTime(),
          distance:
            r.distance == null || r.distance === ''
              ? undefined
              : Number(r.distance),
          speed: r.speed ?? undefined,
          enhancedSpeed: r.enhancedSpeed ?? undefined,
          heartRate: r.heartRate ?? undefined,
          power: r.power ?? undefined,
          calculatedPower: r.calculatedPower ?? undefined,
          cadence: r.cadence ?? undefined,
          grade: r.grade ?? undefined,
          altitude: r.altitude ?? undefined,
          enhancedAltitude: r.enhancedAltitude ?? undefined,
          gap: r.gap ?? undefined,
          aePace: r.aePace ?? undefined,
        })) ?? [];

      // 计算采样间隔（单位：秒）
      const sampleSec =
        ctx.cache.sampleSec ??
        (rows && rows.length > 0 ? detectSampleSec(rows) : undefined);

      return {
        ...ctx,
        inputs: {
          ...ctx.inputs,
          canonicalRecords: canonical,
        },
        cache: {
          ...ctx.cache,
          sampleSec,
        },
      };
    } catch (e) {
      this.logger.warn(
        `[recordsBootstrap] 引导记录失败，活动ID=${activity.id}：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw e;
    }
  }

  async exec(ctx: MetricsContext) {
    return ctx;
  }

  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const sampleSec = ctx.cache.sampleSec;
    if (
      !activity?.id ||
      sampleSec == null ||
      !Number.isFinite(sampleSec) ||
      sampleSec <= 0
    ) {
      return ctx;
    }

    try {
      await this.prisma.$executeRaw`
        UPDATE "t_activity"
        SET "sample_sec" = ${sampleSec}
        WHERE "id" = ${activity.id}
      `;
    } catch (e) {
      this.logger.warn(
        `[recordsBootstrap] 保存 sampleSec 失败，活动ID=${activity.id}，sampleSec=${sampleSec}：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    return ctx;
  }
}
