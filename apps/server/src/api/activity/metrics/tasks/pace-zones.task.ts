import { Injectable } from '@nestjs/common';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';
import { detectSampleSec } from '@/algorithm/utils';
import { fillTimedValuesToZones } from '@/utils/zones';

@Injectable()
export class PaceZonesTask implements MetricsTask {
  key = 'paceZones' as const;

  constructor(private readonly persistence: AnalyzePersistenceService) {}

  async pre(ctx: MetricsContext) {
    const existing = ctx.cache.sampleSec;
    if (existing != null && Number.isFinite(existing) && existing > 0) {
      return ctx;
    }
    const rows = ctx.inputs.canonicalRecords as { time?: string }[] | undefined;
    if (rows && rows.length > 1) {
      const sampleSec = detectSampleSec(rows as { time: string }[]) || 1;
      return {
        ...ctx,
        cache: { ...ctx.cache, sampleSec },
      };
    }
    return {
      ...ctx,
      cache: { ...ctx.cache, sampleSec: 1 },
    };
  }

  async exec(ctx: MetricsContext) {
    const preload = ctx.cache.pacePreload;
    const canonical = ctx.inputs.canonicalRecords;
    if (!preload || !canonical?.length) return ctx;

    const zones = fillTimedValuesToZones(
      canonical.map((record) => {
        const speed = record.enhancedSpeed ?? record.speed;
        return {
          tMs: record.tMs,
          value:
            typeof speed === 'number' && Number.isFinite(speed) && speed > 0
              ? 1 / speed
              : null,
        };
      }),
      preload.paceZones?.zones ?? [],
    );
    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        paceZoneDistribution: zones,
      },
    };
  }

  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const zones = ctx.outputs.paceZoneDistribution;
    if (!activity?.id || !zones) return ctx;
    await this.persistence.saveActivityPaceZoneRows(activity.id, zones);
    return ctx;
  }
}
