import { Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import {
  calculateObservedLthrCandidate,
  lthrActivityDurationSeconds,
  lthrObservationWithinActivity,
} from '@/algorithm/fitness-lthr';
import {
  observedHeartRateSamples,
  observedSampleSeconds,
} from '@/algorithm/time-series-metrics';
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
    const channel = observedHeartRateSamples(rows);
    const sampleSeconds = observedSampleSeconds(channel);
    const startMs = activity.startTime.getTime();
    const duration = lthrActivityDurationSeconds(activity);
    if (duration == null) return ctx;
    const samples = channel
      .map((row) => ({
        seconds: (row.tMs - startMs) / 1000,
        heartRate: row.value,
      }))
      .filter((row) => row.seconds >= 0 && row.seconds <= duration);
    const candidate = calculateObservedLthrCandidate(samples, sampleSeconds);
    if (!candidate || !lthrObservationWithinActivity(candidate, duration))
      return ctx;

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
    if (!userId || !activity.id) return ctx;
    await this.persistence.saveActivityLthrObservation({
      activity,
      userId,
      observation,
    });
    return ctx;
  }
}
