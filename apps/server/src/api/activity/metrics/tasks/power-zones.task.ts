import { Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';
import { fillTimedValuesToZones } from '@/utils/zones';

@Injectable()
export class PowerZonesTask implements MetricsTask {
  key = 'powerZones' as const;

  constructor(private readonly persistence: AnalyzePersistenceService) {}

  async pre(ctx: MetricsContext) {
    return ctx;
  }

  async exec(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const preload = ctx.cache.powerPreload;
    const agg = ctx.cache.powerAggregates;
    const canonical = ctx.inputs.canonicalRecords;
    if (!activity?.id || !preload || !agg || !canonical?.length) return ctx;

    const st = activity.sportType;
    if (st !== $Enums.SportType.RUN && st !== $Enums.SportType.CYCLING) {
      return ctx;
    }

    const { powerZones } = preload;
    const zones = fillTimedValuesToZones(
      canonical.map((record) => ({
        tMs: record.tMs,
        value:
          typeof record.power === 'number' &&
          Number.isFinite(record.power) &&
          record.power >= 0
            ? record.power
            : null,
      })),
      powerZones?.zones ?? [],
    );

    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        powerZoneDistribution: zones,
      },
    };
  }

  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const zones = ctx.outputs.powerZoneDistribution;
    if (!activity?.id || !zones) return ctx;
    await this.persistence.saveActivityPowerZoneRows(activity.id, zones);
    return ctx;
  }
}
