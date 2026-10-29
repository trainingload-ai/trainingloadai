import { Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { calculateObservedLthrCandidate } from '@/algorithm/fitness-lthr';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';

@Injectable()
export class LthrObservationTask implements MetricsTask {
  key = 'lthrObservation' as const;

  constructor(private readonly persistence: AnalyzePersistenceService) {}

  async pre(ctx: MetricsContext): Promise<MetricsContext> {
    return ctx;
  }

  async exec(ctx: MetricsContext): Promise<MetricsContext> {
    const { activity } = ctx.inputs;
    if (
      activity.sportType !== $Enums.SportType.RUN &&
      activity.sportType !== $Enums.SportType.CYCLING
    ) {
      return ctx;
    }
    if (!activity.startTime) return ctx;
    const rows = ctx.inputs.canonicalRecords ?? [];
    if (!rows.length) return ctx;
    const sampleSeconds = ctx.cache.sampleSec ?? activity.sampleSec ?? 1;
    const startMs = activity.startTime.getTime();
    const samples = rows.map((row) => ({
      seconds: (row.tMs - startMs) / 1000,
      heartRate:
        row.heartRate != null && Number.isFinite(row.heartRate)
          ? row.heartRate
          : null,
    }));
    const candidate = calculateObservedLthrCandidate(samples, sampleSeconds);
    if (!candidate) return ctx;

    const knownPausedSeconds =
      activity.elapsedTime != null && activity.timerTime != null
        ? Math.max(0, activity.elapsedTime - activity.timerTime)
        : null;
    const observation: NonNullable<
      MetricsContext['outputs']['lthrObservation']
    > = {
      ...candidate,
      protocol: 'OBSERVED',
      qualityTier: 'SINGLE_HIGH_QUALITY',
      pausedSeconds: knownPausedSeconds,
      // Whole-activity pause totals cannot prove whether the selected
      // window itself paused. Preserve the evidence without rejecting it.
      pauseEvidence: knownPausedSeconds == null ? 'UNKNOWN' : 'KNOWN',
      sampleSeconds,
    };
    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        lthrObservation: observation,
      },
    };
  }

  async post(ctx: MetricsContext): Promise<MetricsContext> {
    const observation = ctx.outputs.lthrObservation;
    const { activity, userId } = ctx.inputs;
    if (!observation || !userId || !activity.startTime) return ctx;
    await this.persistence.saveActivityLthrObservation({
      activity,
      userId,
      observation,
    });
    return ctx;
  }
}
