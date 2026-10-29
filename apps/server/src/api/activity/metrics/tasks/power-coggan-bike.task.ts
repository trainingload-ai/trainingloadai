import { Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type { MetricsContext } from '../context';
import { toSensorData } from '../context';
import type { MetricsTask } from '../task';
import { PowerEngineService } from '@/analyze/power/power-engine.service';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';

@Injectable()
export class PowerCogganBikeTask implements MetricsTask {
  key = 'powerCogganBike' as const;

  constructor(
    private readonly powerEngine: PowerEngineService,
    private readonly persistence: AnalyzePersistenceService,
  ) {}

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

    const { context } = preload;
    const ftp = context.FTP ?? 0;
    const cp = context.CP ?? 0;

    const coggan = this.powerEngine.computeCogganMetrics(agg, ftp, st);
    const bikeScore = this.powerEngine.computeBikeScoreMetrics(
      toSensorData(canonical),
      agg,
      cp,
    );

    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        powerCoggan: coggan,
        powerBikeScore: bikeScore,
      },
    };
  }

  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const coggan = ctx.outputs.powerCoggan;
    const bikeScore = ctx.outputs.powerBikeScore;
    if (!activity?.id) return ctx;

    const st = activity.sportType;
    if (st !== $Enums.SportType.RUN && st !== $Enums.SportType.CYCLING) {
      return ctx;
    }

    const sportType = st as $Enums.SportType;

    if (coggan) {
      await this.persistence.saveActivityPowerCogganRow(
        activity.id,
        sportType,
        coggan,
      );
    }
    if (bikeScore) {
      await this.persistence.saveActivityPowerBikeScoreRow(
        activity.id,
        sportType,
        bikeScore,
      );
    }
    return ctx;
  }
}
