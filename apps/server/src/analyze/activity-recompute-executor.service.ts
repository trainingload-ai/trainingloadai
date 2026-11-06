import { Injectable } from '@nestjs/common';
import type { ActivityFitnessMetricsSnapshot, SportType } from '@prisma/client';
import { ChronologicalActivityReplayService } from './chronological-activity-replay.service';

export function heartRateThresholdSnapshotMatches(
  snapshot: Pick<
    ActivityFitnessMetricsSnapshot,
    'maxHrValue' | 'restHrValue' | 'lthrValue'
  >,
  current: {
    maxHeartRate: number | null;
    restingHeartRate: number | null;
    lactateThresholdHeartRate: number | null;
  } | null,
) {
  return (
    snapshot.maxHrValue === (current?.maxHeartRate ?? null) &&
    snapshot.restHrValue === (current?.restingHeartRate ?? null) &&
    snapshot.lthrValue === (current?.lactateThresholdHeartRate ?? null)
  );
}

/**
 * 兼容现有调度器的入口。所有指标变更复算统一进入因果时间线 Replay，
 * lookbackDays 只保留为任务审计字段，不再截断已经接受的数据变更。
 */
@Injectable()
export class ActivityRecomputeExecutorService {
  constructor(
    private readonly replayService: ChronologicalActivityReplayService,
  ) {}

  executeMetricChangeRecompute(params: {
    sourceJobId: string;
    userId: string;
    metricType:
      | 'LTHR'
      | 'MHR'
      | 'RHR'
      | 'FTP'
      | 'CP'
      | 'CS'
      | 'ZONE_HEART_RATE'
      | 'ZONE_POWER'
      | 'ZONE_PACE'
      | 'PROFILE'
      | 'ACTIVITY_INPUT'
      | 'DATA_REPAIR';
    sportType?: SportType;
    effectiveFrom: Date;
    effectiveTo?: Date;
    lookbackDays: number;
    priority?: number;
    dataRepair?: boolean;
    maxActivities?: number;
    includeActivityIds?: readonly number[];
    sourceLockToken?: string;
  }) {
    return this.replayService.replay({
      userId: params.userId,
      sourceJobType: 'ACTIVITY_RECOMPUTE',
      sourceJobId: params.sourceJobId,
      effectiveFrom: params.effectiveFrom,
      effectiveTo: params.effectiveTo,
      priority: params.priority ?? 100,
      dataRepair: params.dataRepair ?? params.metricType === 'DATA_REPAIR',
      maxActivities: params.maxActivities,
      includeActivityIds: params.includeActivityIds,
      sourceLockToken: params.sourceLockToken,
      suppressAthleteStateReassessment: params.metricType === 'DATA_REPAIR',
    });
  }
}
