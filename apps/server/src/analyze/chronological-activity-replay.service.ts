import { withAutomaticStateUpdatesSuppressed } from '@/athlete-state/updates/athlete-state-update-scope';
import { withSerializableRetry } from '@/prisma/prisma-transaction-errors';
import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActivityActualLoadSource,
  MetricSource,
  Prisma,
  SportType,
  UserFitnessMetricType,
  type Activity,
  type UserFitnessMetric,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { lockFitnessUser } from '@/prisma/fitness-write-lock';
import {
  readyActivityWhere,
  readyOrScopedActivityWhere,
} from '@/utils/activity-ready-where';
import {
  FitnessTimelineProjector,
  fitnessTimelineFingerprint,
  FITNESS_TIMELINE_PROJECTION_VERSION,
  type FitnessTimelineMetric,
  type FitnessTimelineSport,
  type FitnessTimelineValue,
} from '@/algorithm/fitness-timeline';
import {
  UserService,
  type TimelineFitnessProjection,
} from '@/api/user/user.service';
import { ActivityMetricsPipelineService } from '@/api/activity/metrics/activity-metrics-pipeline.service';
import { FitnessTimelineObservationService } from './fitness-timeline-observation.service';
import { ActivityFitnessContextResolverService } from './activity-fitness-context-resolver.service';
import {
  ActivityAnalysisLeaseService,
  type ActivityAnalysisLeaseHandle,
} from './activity-analysis-lease.service';
import { ActivityImpactResolver } from './activity-impact-resolver';
import { LoadReadoutService } from '@/api/activity/load-readout.service';
import type { LoadSourceKey } from '@/api/activity/load-readout.service';
import {
  UserAnalysisConfigService,
  autoUpdateEnabledAt,
} from '@/api/user/user-analysis-config.service';
import { emitPmcInvalidate } from '@/training-load/events/pmc.events';
import { ImportingJobService } from '@/importing/importing-job.service';
import { localDateKeyToUtcDate } from '@/training-load/activity-local-date';

const REPLAY_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

class FitnessEvidenceRevisionDriftError extends Error {
  constructor() {
    super('FITNESS_EVIDENCE_REVISION_DRIFT');
  }
}

export type ChronologicalReplayRequest = {
  userId: string;
  sourceJobType: 'USER_POST_PROCESS' | 'ACTIVITY_RECOMPUTE';
  sourceJobId: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  priority?: number;
  dataRepair?: boolean;
  includeActivityIds?: readonly number[];
  maxActivities?: number;
  sourceLockToken?: string;
  suppressAthleteStateReassessment?: boolean;
};

export type ChronologicalReplayResult = {
  runId: string;
  processedActivities: number;
  highFrequencyReads: number;
  fingerprintHits: number;
  projectionChanges: number;
  estimatedOnlyChanges: number;
  pmcRecomputeFrom: Date | null;
  completed: boolean;
  nextCheckpoint: {
    schemaVersion: 1;
    nextEffectiveFrom: string;
    lastActivityId: number;
  } | null;
};

type ReplayCheckpointRecord = Record<string, Prisma.JsonValue>;

function replayCheckpointRecord(value: unknown): ReplayCheckpointRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as ReplayCheckpointRecord) };
}

function checkpointDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function pendingPmcWindow(value: unknown) {
  const checkpoint = replayCheckpointRecord(value);
  const startDate = checkpointDate(checkpoint.pendingPmcRecomputeFrom);
  if (!startDate) return null;
  return {
    startDate,
    endDate: checkpointDate(checkpoint.pendingPmcRecomputeTo) ?? startDate,
  };
}

function withoutPendingPmc(value: unknown): ReplayCheckpointRecord {
  const checkpoint = replayCheckpointRecord(value);
  delete checkpoint.pendingPmcRecomputeFrom;
  delete checkpoint.pendingPmcRecomputeTo;
  return checkpoint;
}

type ReplayEvent =
  | { kind: 'EXTERNAL_METRIC'; at: Date; metric: FitnessTimelineValue }
  | { kind: 'ACTIVITY_END'; at: Date; activity: ReplayPageActivity }
  | { kind: 'ACTIVITY_START'; at: Date; activity: Activity };

const EVENT_ORDER: Record<ReplayEvent['kind'], number> = {
  EXTERNAL_METRIC: 0,
  ACTIVITY_END: 1,
  ACTIVITY_START: 2,
};

function eventOrder(left: ReplayEvent, right: ReplayEvent) {
  const time = left.at.getTime() - right.at.getTime();
  if (time !== 0) return time;
  const kind = EVENT_ORDER[left.kind] - EVENT_ORDER[right.kind];
  if (kind !== 0) return kind;
  const leftId = 'activity' in left ? left.activity.id : -1;
  const rightId = 'activity' in right ? right.activity.id : -1;
  return leftId - rightId;
}

type ReplayPageActivity = Pick<
  Activity,
  'id' | 'startTime' | 'endTime' | 'timerTime' | 'elapsedTime'
>;

function activityEnd(activity: ReplayPageActivity) {
  const start = activity.startTime;
  if (!start) return null;
  const seconds = Math.max(activity.timerTime ?? 0, activity.elapsedTime ?? 0);
  return activity.endTime ?? new Date(start.getTime() + seconds * 1000);
}

export function selectCausallyClosedActivityPage<T extends ReplayPageActivity>(
  activities: T[],
  requestedLimit: number | undefined,
  requestedReplayTo: Date,
) {
  const limit = Math.max(1, Math.floor(requestedLimit ?? activities.length));
  if (activities.length <= limit) {
    return {
      activities,
      replayTo: requestedReplayTo,
      nextCheckpoint: null,
    };
  }
  let endIndex = limit;
  let causalCutoff = activities
    .slice(0, endIndex)
    .reduce((latest, activity) => {
      const end = activityEnd(activity) ?? activity.startTime ?? latest;
      return end > latest ? end : latest;
    }, activities[0].startTime ?? requestedReplayTo);
  while (
    endIndex < activities.length &&
    activities[endIndex].startTime &&
    activities[endIndex].startTime! <= causalCutoff
  ) {
    const end = activityEnd(activities[endIndex]);
    if (end && end > causalCutoff) causalCutoff = end;
    endIndex += 1;
  }
  const selected = activities.slice(0, endIndex);
  const next = activities[endIndex];
  if (!next?.startTime) {
    return {
      activities: selected,
      replayTo: requestedReplayTo,
      nextCheckpoint: null,
    };
  }
  return {
    activities: selected,
    replayTo: causalCutoff,
    nextCheckpoint: {
      schemaVersion: 1 as const,
      nextEffectiveFrom: next.startTime.toISOString(),
      lastActivityId: selected.at(-1)!.id,
    },
  };
}

function timelineSport(sport: SportType): FitnessTimelineSport {
  return sport === SportType.RUN ||
    sport === SportType.CYCLING ||
    sport === SportType.SWIM
    ? sport
    : 'UNKNOWN';
}

function supportedMetric(type: UserFitnessMetricType) {
  const supported: readonly UserFitnessMetricType[] = [
    UserFitnessMetricType.FTP,
    UserFitnessMetricType.CP,
    UserFitnessMetricType.W_PRIME,
    UserFitnessMetricType.P_MAX,
    UserFitnessMetricType.MAX_HR,
    UserFitnessMetricType.LTHR,
    UserFitnessMetricType.RESTING_HR,
    UserFitnessMetricType.CS,
    UserFitnessMetricType.TP,
    UserFitnessMetricType.VO2_MAX,
  ];
  return supported.includes(type);
}

function timelineValue(row: UserFitnessMetric): FitnessTimelineValue {
  return {
    metric: row.type as FitnessTimelineMetric,
    sport: timelineSport(row.sport),
    value: row.value,
    value2: row.value2,
    effectiveAt: row.recordedAt,
    origin: row.source === MetricSource.AUTO ? 'AUTO' : 'MANUAL',
    sourceMetricId: row.id,
    evidenceFingerprint:
      row.projectionFingerprint ??
      fitnessTimelineFingerprint({
        id: row.id,
        type: row.type,
        sport: row.sport,
        value: row.value,
        value2: row.value2,
        source: row.source,
        recordedAt: row.recordedAt.toISOString(),
        originChecksum: row.originChecksum,
      }),
  };
}

function metricType(metric: FitnessTimelineMetric): UserFitnessMetricType {
  return metric as UserFitnessMetricType;
}

function sportType(sport: FitnessTimelineSport): SportType {
  return sport as SportType;
}

@Injectable()
export class ChronologicalActivityReplayService {
  private readonly logger = new Logger(ChronologicalActivityReplayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
    private readonly metrics: ActivityMetricsPipelineService,
    private readonly observations: FitnessTimelineObservationService,
    private readonly contexts: ActivityFitnessContextResolverService,
    private readonly leases: ActivityAnalysisLeaseService,
    private readonly impacts: ActivityImpactResolver,
    private readonly loadReadout: LoadReadoutService,
    private readonly analysisConfigs: UserAnalysisConfigService,
    private readonly importJobs: ImportingJobService,
    private readonly events: EventEmitter2,
  ) {}

  /** Retry only transactions PostgreSQL has rolled back; keep computed HEAVY outside. */
  private withReplayTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return withSerializableRetry(
      () => this.prisma.$transaction(work, REPLAY_TRANSACTION_OPTIONS),
      { maxAttempts: 5 },
    );
  }

  async replay(
    request: ChronologicalReplayRequest,
  ): Promise<ChronologicalReplayResult> {
    return withAutomaticStateUpdatesSuppressed(
      request.suppressAthleteStateReassessment === true,
      async () => {
        const startedAt = Date.now();
        this.logger.log(
          `[activity-replay] started ${JSON.stringify({
            userId: request.userId,
            sourceJobType: request.sourceJobType,
            sourceJobId: request.sourceJobId,
            effectiveFrom: request.effectiveFrom.toISOString(),
            effectiveTo: request.effectiveTo?.toISOString() ?? null,
            includeActivityCount: request.includeActivityIds?.length ?? 0,
            maxActivities: request.maxActivities ?? 100,
          })}`,
        );
        const lease = await this.leases.acquire({
          userId: request.userId,
          sourceJobType: request.sourceJobType,
          sourceJobId: request.sourceJobId,
          priority: request.priority ?? 100,
          dataRepair: request.dataRepair ?? false,
        });
        if (!lease) throw new Error('ACTIVITY_ANALYSIS_CAPACITY_UNAVAILABLE');

        let fenced = false;
        const heartbeat = setInterval(() => {
          void this.leases
            .heartbeat(lease)
            .then((owned) => {
              if (!owned) fenced = true;
            })
            .catch((error) => {
              fenced = true;
              this.logger.error(
                `[activity-replay] lease heartbeat failed user=${request.userId}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            });
        }, 60_000);
        heartbeat.unref?.();
        try {
          await this.drainPendingPmcInvalidation(request, lease);
          let lastError: unknown;
          for (let attempt = 1; attempt <= 3; attempt += 1) {
            if (fenced) throw new Error('ACTIVITY_ANALYSIS_LEASE_FENCED');
            try {
              const result = await this.replayOnce(
                request,
                lease,
                () => fenced,
              );
              this.logger.log(
                `[activity-replay] page-completed ${JSON.stringify({
                  userId: request.userId,
                  sourceJobType: request.sourceJobType,
                  sourceJobId: request.sourceJobId,
                  runId: result.runId,
                  durationMs: Date.now() - startedAt,
                  processedActivities: result.processedActivities,
                  highFrequencyReads: result.highFrequencyReads,
                  fingerprintHits: result.fingerprintHits,
                  projectionChanges: result.projectionChanges,
                  estimatedOnlyChanges: result.estimatedOnlyChanges,
                  pmcRecomputeFrom:
                    result.pmcRecomputeFrom?.toISOString() ?? null,
                  completed: result.completed,
                  nextCheckpoint: result.nextCheckpoint,
                })}`,
              );
              return result;
            } catch (error) {
              lastError = error;
              if (!(error instanceof FitnessEvidenceRevisionDriftError))
                throw error;
              this.logger.warn(
                `[activity-replay] evidence revision drift; restarting user=${request.userId} attempt=${attempt}`,
              );
            }
          }
          throw lastError;
        } finally {
          clearInterval(heartbeat);
          await this.leases.release(lease);
        }
      },
    );
  }

  private async replayOnce(
    request: ChronologicalReplayRequest,
    lease: ActivityAnalysisLeaseHandle,
    isFenced: () => boolean,
  ): Promise<ChronologicalReplayResult> {
    const runId = randomUUID();
    const replayTo = request.effectiveTo ?? new Date();
    const initialRevision = await this.readRevision(request.userId);
    const evidenceLookbackStart = new Date(
      request.effectiveFrom.getTime() - 180 * 86_400_000,
    );
    const [metricRows, priorActivities, page, autoUpdateVersions] =
      await Promise.all([
        this.users.listTimelineFitnessMetrics(request.userId, replayTo),
        this.prisma.activity.findMany({
          where: readyActivityWhere({
            userId: request.userId,
            startTime: { lt: request.effectiveFrom },
            OR: [
              { startTime: { gte: evidenceLookbackStart } },
              { endTime: { gte: request.effectiveFrom } },
            ],
          }),
          select: {
            id: true,
            startTime: true,
            endTime: true,
            timerTime: true,
            elapsedTime: true,
          },
        }),
        this.loadCausallyClosedActivityPage(request, replayTo),
        this.analysisConfigs.listAutoUpdateVersions(request.userId, replayTo),
      ]);
    if ((await this.readRevision(request.userId)) !== initialRevision) {
      throw new FitnessEvidenceRevisionDriftError();
    }

    const activities = page.activities;
    const effectiveReplayTo = page.replayTo;
    const projectionReplaceTo = page.nextCheckpoint
      ? new Date(Date.parse(page.nextCheckpoint.nextEffectiveFrom) - 1)
      : effectiveReplayTo;
    const preparedObservations = await this.observations.prepare(
      request.userId,
      [...priorActivities, ...activities].map((activity) => activity.id),
    );
    if ((await this.readRevision(request.userId)) !== initialRevision) {
      throw new FitnessEvidenceRevisionDriftError();
    }
    this.logger.debug(
      `[activity-replay] page-loaded ${JSON.stringify({
        userId: request.userId,
        runId,
        replayFrom: request.effectiveFrom.toISOString(),
        replayTo: effectiveReplayTo.toISOString(),
        pageActivities: activities.length,
        priorEvidenceActivities: priorActivities.length,
        peakEvidenceRows: preparedObservations.peakRows?.length ?? 0,
        lthrEvidenceRows: preparedObservations.lthrRows?.length ?? 0,
        vo2EvidenceRows: preparedObservations.vo2Rows?.length ?? 0,
        hasNextPage: page.nextCheckpoint != null,
      })}`,
    );

    const seeds = metricRows
      .filter(
        (row) =>
          supportedMetric(row.type) && row.recordedAt < request.effectiveFrom,
      )
      .map(timelineValue);
    const projector = new FitnessTimelineProjector(seeds);
    const crossingBoundary = priorActivities.flatMap((activity) => {
      const end = activityEnd(activity);
      return end && end >= request.effectiveFrom && end <= effectiveReplayTo
        ? [{ activity, end }]
        : [];
    });
    const events: ReplayEvent[] = [
      ...metricRows
        .filter(
          (row) =>
            supportedMetric(row.type) &&
            row.source === MetricSource.MANUAL &&
            row.recordedAt >= request.effectiveFrom &&
            row.recordedAt <= effectiveReplayTo,
        )
        .map(
          (row): ReplayEvent => ({
            kind: 'EXTERNAL_METRIC',
            at: row.recordedAt,
            metric: timelineValue(row),
          }),
        ),
      ...crossingBoundary.map(
        ({ activity, end }): ReplayEvent => ({
          kind: 'ACTIVITY_END',
          at: end,
          activity,
        }),
      ),
      ...activities.flatMap((activity): ReplayEvent[] => {
        const end = activityEnd(activity);
        if (!activity.startTime || !end) return [];
        return [
          { kind: 'ACTIVITY_START', at: activity.startTime, activity },
          { kind: 'ACTIVITY_END', at: end, activity },
        ];
      }),
    ].sort(eventOrder);
    const eligibleActivityIds = new Set(
      priorActivities.flatMap((activity) => {
        const end = activityEnd(activity);
        return end && end < request.effectiveFrom ? [activity.id] : [];
      }),
    );
    // Boundary-crossing activities were already READY before this replay. Their
    // observations become visible only at their actual end event.
    const successfullyAnalyzed = new Set<number>(
      crossingBoundary.map(({ activity }) => activity.id),
    );
    const preparedVo2RefreshRequired = new Set<number>();
    const estimatedOnly = new Map<string, TimelineFitnessProjection>();
    const observationProfiles = new Map<string, Record<string, unknown>>();
    let expectedRevision = initialRevision;
    let processedActivities = 0;
    let highFrequencyReads = 0;
    let fingerprintHits = 0;
    let pmcRecomputeFrom: Date | null = null;
    const projectEligibleObservations = async (at: Date) => {
      const maxHr = projector.resolve({
        metric: 'MAX_HR',
        sport: 'UNKNOWN',
        at,
      });
      const restingHr = projector.resolve({
        metric: 'RESTING_HR',
        sport: 'UNKNOWN',
        at,
      });
      const profileKey = at.toISOString();
      let observationProfile = observationProfiles.get(profileKey);
      if (!observationProfile) {
        observationProfile = {
          ...((await this.users.getComposedUserProfile(
            request.userId,
            SportType.UNKNOWN,
            at,
          )) ?? {}),
        };
        observationProfiles.set(profileKey, observationProfile);
      }
      const candidates = await this.observations.calculate({
        userId: request.userId,
        effectiveAt: at,
        eligibleActivityIds: [...eligibleActivityIds],
        profile: observationProfile,
        currentMaxHr: maxHr.value,
        currentRestingHr: restingHr.value,
        prepared: preparedObservations,
      });
      const enabledCandidates = [];
      const disabledCandidates = [];
      for (const candidate of candidates) {
        const type = metricType(candidate.metric);
        const enabled = autoUpdateEnabledAt(autoUpdateVersions, type, at);
        if (enabled) {
          enabledCandidates.push(candidate);
          continue;
        }
        disabledCandidates.push(candidate);
        const estimate: TimelineFitnessProjection = {
          type,
          sport: sportType(candidate.sport),
          value: candidate.value,
          value2: candidate.value2,
          effectiveAt: at,
          projectionVersion: FITNESS_TIMELINE_PROJECTION_VERSION,
          projectionFingerprint: fitnessTimelineFingerprint({
            source: 'ESTIMATED',
            candidate,
          }),
          originPayload: {
            sourceActivityIds: candidate.sourceActivityIds ?? [],
            evidenceFingerprint: candidate.evidenceFingerprint,
          },
        };
        estimatedOnly.set(
          `${estimate.type}:${estimate.sport}:${at.toISOString()}`,
          estimate,
        );
      }
      const changes = projector.applyObservationGroup({
        effectiveAt: at,
        observations: enabledCandidates,
        autoUpdateEnabled: true,
      });
      if (candidates.length > 0 || changes.length > 0) {
        this.logger.debug(
          `[activity-replay] observation-wave ${JSON.stringify({
            userId: request.userId,
            runId,
            effectiveAt: at.toISOString(),
            eligibleActivityCount: eligibleActivityIds.size,
            candidates: candidates.map((candidate) => ({
              metric: candidate.metric,
              sport: candidate.sport,
              value: candidate.value,
              value2: candidate.value2 ?? null,
              sourceActivityIds: candidate.sourceActivityIds ?? [],
            })),
            disabledMetrics: disabledCandidates.map(
              (candidate) => candidate.metric,
            ),
            changes: changes.map((change) => ({
              metric: change.metric,
              sport: change.sport,
              value: change.value,
              value2: change.value2 ?? null,
              sourceActivityIds: change.sourceActivityIds ?? [],
            })),
          })}`,
        );
      }
    };

    for (let index = 0; index < events.length; ) {
      if (isFenced()) throw new Error('ACTIVITY_ANALYSIS_LEASE_FENCED');
      const at = events[index].at;
      const group: ReplayEvent[] = [];
      while (events[index]?.at.getTime() === at.getTime()) {
        group.push(events[index]);
        index += 1;
      }
      for (const event of group) {
        if (event.kind === 'EXTERNAL_METRIC')
          projector.applyExternal(event.metric);
      }

      const newlyEligibleActivityIds: number[] = [];
      for (const event of group) {
        if (
          event.kind === 'ACTIVITY_END' &&
          successfullyAnalyzed.has(event.activity.id) &&
          !eligibleActivityIds.has(event.activity.id)
        ) {
          eligibleActivityIds.add(event.activity.id);
          newlyEligibleActivityIds.push(event.activity.id);
        }
      }
      if (group.some((event) => event.kind === 'ACTIVITY_END')) {
        const refreshIds = newlyEligibleActivityIds.filter((id) =>
          preparedVo2RefreshRequired.delete(id),
        );
        await this.observations.refreshPreparedVo2Rows(
          preparedObservations,
          request.userId,
          refreshIds,
        );
        await projectEligibleObservations(at);
      }

      for (const event of group) {
        if (event.kind !== 'ACTIVITY_START') continue;
        const resolved = await this.contexts.resolve({
          activity: event.activity,
          projector,
        });
        const snapshot =
          await this.prisma.activityFitnessMetricsSnapshot.findUnique({
            where: { activityId: event.activity.id },
            select: {
              calculationFingerprint: true,
              provenanceFingerprint: true,
              provenance: true,
              inputDimensionFingerprints: true,
              analysisConfigFingerprint: true,
              resolvedLoadSources: true,
              actualLoad: true,
              actualLoadSource: true,
              pmcLocalDate: true,
              sport: true,
              ftpValue: true,
              cpValue: true,
              cpValue2: true,
              maxHrValue: true,
              lthrValue: true,
              restHrValue: true,
              csValue: true,
              csValue2: true,
            },
          });
        if (
          snapshot?.calculationFingerprint === resolved.calculationFingerprint
        ) {
          fingerprintHits += 1;
          this.logResolvedActivityContext({
            runId,
            resolved,
            fingerprintHit: true,
            dimensions: [],
          });
          if (
            snapshot.provenanceFingerprint !== resolved.provenanceFingerprint ||
            event.activity.processingStatus !== 'READY'
          ) {
            const committed = await this.commitSnapshotOnly({
              activity: event.activity,
              resolved,
              expectedRevision,
              lease,
              request,
              pmcRecomputeTo: effectiveReplayTo,
            });
            expectedRevision = committed.revision;
            if (
              committed.pmcRecomputeFrom &&
              (!pmcRecomputeFrom ||
                committed.pmcRecomputeFrom < pmcRecomputeFrom)
            ) {
              pmcRecomputeFrom = committed.pmcRecomputeFrom;
            }
          }
          successfullyAnalyzed.add(event.activity.id);
          processedActivities += 1;
          continue;
        }

        const loadSources = resolved.analysisConfig
          .loadSources as LoadSourceKey[];
        const previousLoad =
          (snapshot?.actualLoad == null ? null : Number(snapshot.actualLoad)) ??
          (await this.activityLoad(this.prisma, event.activity.id, loadSources))
            .actualLoad;
        const dimensions = this.impacts.dimensionsForContextChange({
          snapshot,
          resolved,
        });
        this.logResolvedActivityContext({
          runId,
          resolved,
          fingerprintHit: false,
          dimensions,
        });
        const computed = await this.metrics.computeHeavy({
          activity: event.activity,
          userId: request.userId,
          resolvedContext: resolved,
          dimensions,
        });
        if (dimensions.some((dimension) => dimension !== 'LOAD')) {
          highFrequencyReads += 1;
        }
        const committed = await this.commitHeavy({
          computed,
          expectedRevision,
          lease,
          request,
          previousLoad,
          previousPmcLocalDate: snapshot?.pmcLocalDate ?? null,
          previousSport: snapshot?.sport ?? null,
          wasReady: event.activity.processingStatus === 'READY',
          loadSources,
          pmcRecomputeFrom: at,
          pmcRecomputeTo: effectiveReplayTo,
        });
        expectedRevision = committed.revision;
        preparedVo2RefreshRequired.add(event.activity.id);
        if (
          committed.loadChanged &&
          (!pmcRecomputeFrom || committed.pmcRecomputeFrom < pmcRecomputeFrom)
        ) {
          pmcRecomputeFrom = committed.pmcRecomputeFrom;
        }
        successfullyAnalyzed.add(event.activity.id);
        processedActivities += 1;
      }

      // A zero-duration activity has START and END at the same exact instant.
      // END still sorts before START, so its own metrics cannot be visible to
      // its calculation. Once the START calculation commits, publish a second
      // observation wave for later timestamps. Other activities starting at
      // this same instant intentionally retain the same pre-start context.
      const newlyCompletedAtSameInstant = group.filter(
        (event): event is Extract<ReplayEvent, { kind: 'ACTIVITY_END' }> =>
          event.kind === 'ACTIVITY_END' &&
          successfullyAnalyzed.has(event.activity.id) &&
          !eligibleActivityIds.has(event.activity.id),
      );
      if (newlyCompletedAtSameInstant.length > 0) {
        for (const event of newlyCompletedAtSameInstant) {
          eligibleActivityIds.add(event.activity.id);
        }
        const refreshIds = newlyCompletedAtSameInstant
          .map((event) => event.activity.id)
          .filter((id) => preparedVo2RefreshRequired.delete(id));
        await this.observations.refreshPreparedVo2Rows(
          preparedObservations,
          request.userId,
          refreshIds,
        );
        await projectEligibleObservations(at);
      }
    }

    const projections = projector.changePoints().map(
      (change): TimelineFitnessProjection => ({
        type: metricType(change.metric),
        sport: sportType(change.sport),
        value: change.value,
        value2: change.value2,
        effectiveAt: change.effectiveAt,
        projectionVersion: change.projectionVersion,
        projectionFingerprint: change.projectionFingerprint,
        originPayload: {
          sourceActivityIds: change.sourceActivityIds ?? [],
          evidenceFingerprint: change.evidenceFingerprint,
        },
      }),
    );
    expectedRevision = await this.commitProjections({
      request,
      runId,
      projections,
      estimatedOnly: [...estimatedOnly.values()],
      expectedRevision,
      lease,
      replayTo: projectionReplaceTo,
      pageStats: { processedActivities, highFrequencyReads, fingerprintHits },
      nextCheckpoint: page.nextCheckpoint,
      pmcRecomputeFrom,
      pmcRecomputeTo: effectiveReplayTo,
    });
    void expectedRevision;
    await this.drainPendingPmcInvalidation(request, lease);
    return {
      runId,
      processedActivities,
      highFrequencyReads,
      fingerprintHits,
      projectionChanges: projections.length,
      estimatedOnlyChanges: estimatedOnly.size,
      pmcRecomputeFrom,
      completed: page.nextCheckpoint == null,
      nextCheckpoint: page.nextCheckpoint,
    };
  }

  private logResolvedActivityContext(args: {
    runId: string;
    resolved: Awaited<
      ReturnType<ActivityFitnessContextResolverService['resolve']>
    >;
    fingerprintHit: boolean;
    dimensions: readonly string[];
  }) {
    this.logger.debug(
      `[activity-replay] activity-context ${JSON.stringify({
        runId: args.runId,
        activityId: args.resolved.activityId,
        activityStart: args.resolved.activityStart.toISOString(),
        activityEnd: args.resolved.activityEnd.toISOString(),
        sport: args.resolved.sport,
        fingerprintHit: args.fingerprintHit,
        recomputeDimensions: args.dimensions,
        metrics: Object.entries(args.resolved.metrics).flatMap(
          ([metric, value]) =>
            value?.value == null
              ? []
              : [
                  {
                    metric,
                    value: value.value,
                    value2: value.value2,
                    source: value.source,
                    effectiveAt: value.effectiveAt?.toISOString() ?? null,
                    sourceMetricId: value.sourceMetricId ?? null,
                  },
                ],
        ),
      })}`,
    );
  }

  /**
   * Reads one bounded page directly from PostgreSQL. The only case where the
   * page may exceed maxActivities is a real causal overlap chain, which must
   * be committed atomically so a later page cannot observe half of the same
   * timestamp/overlap group.
   */
  private async loadCausallyClosedActivityPage(
    request: ChronologicalReplayRequest,
    requestedReplayTo: Date,
  ) {
    const limit = Math.max(1, Math.floor(request.maxActivities ?? 100));
    const fetchAfter = (
      cursor: { startTime: Date; id: number } | null,
      take: number,
    ) =>
      this.prisma.activity.findMany({
        where: readyOrScopedActivityWhere(
          {
            userId: request.userId,
            startTime: {
              gte: request.effectiveFrom,
              lte: requestedReplayTo,
            },
            ...(cursor
              ? {
                  OR: [
                    { startTime: { gt: cursor.startTime } },
                    { startTime: cursor.startTime, id: { gt: cursor.id } },
                  ],
                }
              : {}),
          },
          request.includeActivityIds,
        ),
        orderBy: [{ startTime: 'asc' as const }, { id: 'asc' as const }],
        take,
      });

    let buffer = [...(await fetchAfter(null, limit + 1))];
    const selected = buffer.splice(0, limit);
    if (selected.length === 0) {
      return {
        activities: selected,
        replayTo: requestedReplayTo,
        nextCheckpoint: null,
      };
    }

    let causalCutoff = selected.reduce((latest, activity) => {
      const end = activityEnd(activity) ?? activity.startTime ?? latest;
      return end > latest ? end : latest;
    }, selected[0].startTime ?? request.effectiveFrom);
    let next = buffer.shift();
    while (next?.startTime && next.startTime <= causalCutoff) {
      selected.push(next);
      const end = activityEnd(next);
      if (end && end > causalCutoff) causalCutoff = end;
      if (buffer.length === 0) {
        buffer = [
          ...(await fetchAfter(
            { startTime: next.startTime, id: next.id },
            limit + 1,
          )),
        ];
      }
      next = buffer.shift();
    }

    if (!next?.startTime) {
      return {
        activities: selected,
        replayTo: requestedReplayTo,
        nextCheckpoint: null,
      };
    }
    return {
      activities: selected,
      replayTo: causalCutoff,
      nextCheckpoint: {
        schemaVersion: 1 as const,
        nextEffectiveFrom: next.startTime.toISOString(),
        lastActivityId: selected.at(-1)!.id,
      },
    };
  }

  private async readRevision(userId: string): Promise<bigint> {
    const row = await this.prisma.fitnessEvidenceRevision.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { revision: true },
    });
    return row.revision;
  }

  private async commitHeavy(args: {
    computed: Awaited<
      ReturnType<ActivityMetricsPipelineService['computeHeavy']>
    >;
    expectedRevision: bigint;
    lease: ActivityAnalysisLeaseHandle;
    request: ChronologicalReplayRequest;
    previousLoad: number | null;
    previousPmcLocalDate: string | null;
    previousSport: SportType | null;
    wasReady: boolean;
    loadSources: LoadSourceKey[];
    pmcRecomputeFrom: Date;
    pmcRecomputeTo: Date;
  }) {
    return this.withReplayTransaction(async (tx) => {
      await lockFitnessUser(tx, args.lease.userId);
      await this.leases.assertOwned(tx, args.lease);
      await this.assertSourceJobOwned(tx, args.request);
      await this.assertRevision(tx, args.lease.userId, args.expectedRevision);
      await this.metrics.commitComputedHeavy(args.computed, tx);
      await tx.activity.update({
        where: { id: args.computed.context.inputs.activity.id },
        data: {
          processingStatus: 'READY',
          processingUpdatedAt: new Date(),
          readyAt: new Date(),
        },
      });
      const nextLoad = await this.activityLoad(
        tx,
        args.computed.context.inputs.activity.id,
        args.loadSources,
      );
      await tx.activityFitnessMetricsSnapshot.update({
        where: { activityId: args.computed.context.inputs.activity.id },
        data: {
          resolvedLoadSources: args.loadSources,
          actualLoad: nextLoad.actualLoad,
          actualLoadSource: this.snapshotLoadSource(nextLoad.actualLoadSource),
        },
      });
      const nextSnapshot =
        await tx.activityFitnessMetricsSnapshot.findUniqueOrThrow({
          where: { activityId: args.computed.context.inputs.activity.id },
          select: { pmcLocalDate: true, sport: true },
        });
      const loadChanged = this.impacts.shouldRecomputePmc({
        previousLoad: args.previousLoad,
        nextLoad: nextLoad.actualLoad,
      });
      const pmcChanged =
        !args.wasReady ||
        loadChanged ||
        args.previousPmcLocalDate !== nextSnapshot.pmcLocalDate ||
        args.previousSport !== nextSnapshot.sport;
      const affectedDateKeys = [
        args.previousPmcLocalDate,
        nextSnapshot.pmcLocalDate,
      ].filter((value): value is string => Boolean(value));
      const pmcRecomputeFrom = affectedDateKeys.length
        ? affectedDateKeys
            .map(localDateKeyToUtcDate)
            .sort((left, right) => left.getTime() - right.getTime())[0]
        : args.pmcRecomputeFrom;
      if (pmcChanged) {
        await this.persistPendingPmc(
          tx,
          args.request,
          pmcRecomputeFrom,
          args.pmcRecomputeTo,
        );
      }
      return {
        revision: await this.revisionIn(tx, args.lease.userId),
        loadChanged: pmcChanged,
        pmcRecomputeFrom,
      };
    });
  }

  private async commitSnapshotOnly(args: {
    activity: Activity;
    resolved: Awaited<
      ReturnType<ActivityFitnessContextResolverService['resolve']>
    >;
    expectedRevision: bigint;
    lease: ActivityAnalysisLeaseHandle;
    request: ChronologicalReplayRequest;
    pmcRecomputeTo: Date;
  }) {
    return this.withReplayTransaction(async (tx) => {
      await lockFitnessUser(tx, args.lease.userId);
      await this.leases.assertOwned(tx, args.lease);
      await this.assertSourceJobOwned(tx, args.request);
      await this.assertRevision(tx, args.lease.userId, args.expectedRevision);
      await this.metrics.commitResolvedSnapshot({
        activity: args.activity,
        userId: args.lease.userId,
        resolvedContext: args.resolved,
        tx,
      });
      let pmcRecomputeFrom: Date | null = null;
      if (args.activity.processingStatus !== 'READY') {
        await tx.activity.update({
          where: { id: args.activity.id },
          data: {
            processingStatus: 'READY',
            processingUpdatedAt: new Date(),
            readyAt: new Date(),
          },
        });
        const snapshot =
          await tx.activityFitnessMetricsSnapshot.findUniqueOrThrow({
            where: { activityId: args.activity.id },
            select: { pmcLocalDate: true },
          });
        pmcRecomputeFrom = snapshot.pmcLocalDate
          ? localDateKeyToUtcDate(snapshot.pmcLocalDate)
          : args.activity.startTime;
        await this.persistPendingPmc(
          tx,
          args.request,
          pmcRecomputeFrom,
          args.pmcRecomputeTo,
        );
      }
      return {
        revision: await this.revisionIn(tx, args.lease.userId),
        pmcRecomputeFrom,
      };
    });
  }

  private async commitProjections(args: {
    request: ChronologicalReplayRequest;
    runId: string;
    projections: TimelineFitnessProjection[];
    estimatedOnly: TimelineFitnessProjection[];
    expectedRevision: bigint;
    lease: ActivityAnalysisLeaseHandle;
    replayTo: Date;
    nextCheckpoint: ChronologicalReplayResult['nextCheckpoint'];
    pmcRecomputeFrom: Date | null;
    pmcRecomputeTo: Date;
    pageStats: {
      processedActivities: number;
      highFrequencyReads: number;
      fingerprintHits: number;
    };
  }) {
    return this.withReplayTransaction(async (tx) => {
      await lockFitnessUser(tx, args.request.userId);
      await this.leases.assertOwned(tx, args.lease);
      await this.assertRevision(tx, args.request.userId, args.expectedRevision);
      await this.users.applyTimelineProjectionBatch(
        {
          userId: args.request.userId,
          projectionRunId: args.runId,
          replacementReason: args.request.dataRepair
            ? 'DATA_REPAIR_REPLAY'
            : 'CHRONOLOGICAL_REPLAY',
          replaceFrom: args.request.effectiveFrom,
          replaceTo: args.replayTo,
          scopes: this.projectionScopes(),
          projections: args.projections,
        },
        tx,
      );
      await this.users.saveTimelineEstimatesBatch(
        {
          userId: args.request.userId,
          projectionRunId: args.runId,
          replacementReason: 'AUTO_UPDATE_DISABLED',
          replaceFrom: args.request.effectiveFrom,
          replaceTo: args.replayTo,
          scopes: this.projectionScopes(),
          projections: args.estimatedOnly,
        },
        tx,
      );
      // Persist both the bounded-page cursor and pending PMC work in the same
      // transaction as activity loads/projections. A crash may repeat PMC,
      // which is idempotent, but can no longer lose the invalidation window.
      const currentCheckpoint = await this.readSourceCheckpoint(
        tx,
        args.request,
      );
      const currentWindow = pendingPmcWindow(currentCheckpoint);
      const checkpoint = withoutPendingPmc(currentCheckpoint);
      const pageStats = replayCheckpointRecord(checkpoint.pageStats);
      pageStats[args.request.effectiveFrom.toISOString()] = args.pageStats;
      checkpoint.pageStats = pageStats;
      delete checkpoint.nextEffectiveFrom;
      delete checkpoint.lastActivityId;
      delete checkpoint.completedAt;
      delete checkpoint.runId;
      Object.assign(
        checkpoint,
        args.nextCheckpoint ?? {
          schemaVersion: 1,
          completedAt: new Date().toISOString(),
          runId: args.runId,
        },
      );
      const pendingFrom = [currentWindow?.startDate, args.pmcRecomputeFrom]
        .filter((value): value is Date => value != null)
        .sort((left, right) => left.getTime() - right.getTime())[0];
      if (pendingFrom) {
        const pendingTo = [currentWindow?.endDate, args.pmcRecomputeTo]
          .filter((value): value is Date => value != null)
          .sort((left, right) => right.getTime() - left.getTime())[0];
        checkpoint.pendingPmcRecomputeFrom = pendingFrom.toISOString();
        checkpoint.pendingPmcRecomputeTo = pendingTo.toISOString();
      }
      await this.writeSourceCheckpoint(tx, args.request, checkpoint);
      return this.revisionIn(tx, args.request.userId);
    });
  }

  private async drainPendingPmcInvalidation(
    request: ChronologicalReplayRequest,
    lease: ActivityAnalysisLeaseHandle,
  ) {
    const checkpoint = await this.readSourceCheckpoint(this.prisma, request);
    const pending = pendingPmcWindow(checkpoint);
    if (!pending) return;

    await emitPmcInvalidate(this.events, request.userId, pending, {
      suppressAthleteStateReassessment:
        request.suppressAthleteStateReassessment === true,
    });
    await this.withReplayTransaction(async (tx) => {
      await this.leases.assertOwned(tx, lease);
      const latest = await this.readSourceCheckpoint(tx, request);
      const latestPending = pendingPmcWindow(latest);
      if (
        latestPending?.startDate.getTime() !== pending.startDate.getTime() ||
        latestPending.endDate.getTime() !== pending.endDate.getTime()
      ) {
        return;
      }
      await this.writeSourceCheckpoint(tx, request, withoutPendingPmc(latest));
    });
  }

  private async persistPendingPmc(
    tx: Prisma.TransactionClient,
    request: ChronologicalReplayRequest,
    startDate: Date,
    endDate: Date,
  ) {
    const current = await this.readSourceCheckpoint(tx, request);
    const currentWindow = pendingPmcWindow(current);
    const checkpoint = replayCheckpointRecord(current);
    checkpoint.schemaVersion = 1;
    checkpoint.pendingPmcRecomputeFrom =
      currentWindow && currentWindow.startDate < startDate
        ? currentWindow.startDate.toISOString()
        : startDate.toISOString();
    checkpoint.pendingPmcRecomputeTo =
      currentWindow && currentWindow.endDate > endDate
        ? currentWindow.endDate.toISOString()
        : endDate.toISOString();
    await this.writeSourceCheckpoint(tx, request, checkpoint);
  }

  private async readSourceCheckpoint(
    client: PrismaService | Prisma.TransactionClient,
    request: ChronologicalReplayRequest,
  ) {
    if (request.sourceJobType === 'ACTIVITY_RECOMPUTE') {
      const row = await client.activityRecomputeJob.findUnique({
        where: { id: request.sourceJobId },
        select: { replayCheckpoint: true },
      });
      return row?.replayCheckpoint ?? null;
    }
    const row = await this.importJobs.postProcessJobs(client).findUnique({
      where: { id: request.sourceJobId },
      select: { replayCheckpoint: true },
    });
    return row?.replayCheckpoint ?? null;
  }

  private async writeSourceCheckpoint(
    tx: Prisma.TransactionClient,
    request: ChronologicalReplayRequest,
    replayCheckpoint: ReplayCheckpointRecord,
  ) {
    const where = {
      id: request.sourceJobId,
      userId: request.userId,
      status: 'RUNNING' as const,
      ...(request.sourceLockToken
        ? { lockToken: request.sourceLockToken }
        : {}),
    };
    const result =
      request.sourceJobType === 'ACTIVITY_RECOMPUTE'
        ? await tx.activityRecomputeJob.updateMany({
            where,
            data: { replayCheckpoint },
          })
        : await this.importJobs.postProcessJobs(tx).updateMany({
            where,
            data: { replayCheckpoint },
          });
    if (result.count !== 1) {
      throw new Error('ACTIVITY_REPLAY_SOURCE_JOB_FENCED');
    }
  }

  /**
   * A user analysis lease prevents concurrent replay for one user, while the
   * source job token fences worker ownership. Both must still be valid in the
   * same transaction that commits activity-derived state; otherwise an old
   * worker could publish a result after its job lease was taken over.
   */
  private async assertSourceJobOwned(
    tx: Prisma.TransactionClient,
    request: ChronologicalReplayRequest,
  ) {
    const where = {
      id: request.sourceJobId,
      userId: request.userId,
      status: 'RUNNING' as const,
      ...(request.sourceLockToken
        ? { lockToken: request.sourceLockToken }
        : {}),
    };
    const row =
      request.sourceJobType === 'ACTIVITY_RECOMPUTE'
        ? await tx.activityRecomputeJob.findFirst({
            where,
            select: { id: true },
          })
        : await this.importJobs.postProcessJobs(tx).findFirst({
            where,
            select: { id: true },
          });
    if (!row) {
      throw new Error('ACTIVITY_REPLAY_SOURCE_JOB_FENCED');
    }
  }

  private projectionScopes() {
    return [
      ...[SportType.RUN, SportType.CYCLING].flatMap((sport) =>
        [
          UserFitnessMetricType.FTP,
          UserFitnessMetricType.CP,
          UserFitnessMetricType.W_PRIME,
          UserFitnessMetricType.P_MAX,
          UserFitnessMetricType.LTHR,
        ].map((type) => ({ type, sport })),
      ),
      ...[SportType.RUN, SportType.CYCLING, SportType.SWIM].flatMap((sport) =>
        [UserFitnessMetricType.CS].map((type) => ({ type, sport })),
      ),
      { type: UserFitnessMetricType.TP, sport: SportType.RUN },
      { type: UserFitnessMetricType.MAX_HR, sport: SportType.UNKNOWN },
      { type: UserFitnessMetricType.VO2_MAX, sport: SportType.UNKNOWN },
    ];
  }

  private async assertRevision(
    tx: Prisma.TransactionClient,
    userId: string,
    expected: bigint,
  ) {
    const row = await tx.fitnessEvidenceRevision.findUnique({
      where: { userId },
      select: { revision: true },
    });
    if ((row?.revision ?? BigInt(0)) !== expected) {
      throw new FitnessEvidenceRevisionDriftError();
    }
  }

  private async revisionIn(tx: Prisma.TransactionClient, userId: string) {
    const row = await tx.fitnessEvidenceRevision.findUniqueOrThrow({
      where: { userId },
      select: { revision: true },
    });
    return row.revision;
  }

  private async activityLoad(
    client: PrismaService | Prisma.TransactionClient,
    activityId: number,
    sources: LoadSourceKey[],
  ) {
    const activity = await client.activity.findUnique({
      where: { id: activityId },
      include: {
        coggan: true,
        trimp: true,
        bikeScore: true,
        govss: true,
        swimScore: true,
        activitySources: {
          where: { isActive: true, isPrimary: true },
          select: { metadata: true },
        },
      },
    });
    return activity
      ? this.loadReadout.loadReadoutForActivity(activity, sources)
      : { actualLoad: null, actualLoadSource: null };
  }

  private snapshotLoadSource(source: LoadSourceKey | null) {
    switch (source) {
      case 'POWER':
        return ActivityActualLoadSource.POWER;
      case 'HEART_RATE':
        return ActivityActualLoadSource.HEART_RATE;
      case 'PACE':
        return ActivityActualLoadSource.PACE;
      case 'SESSIONRPE':
        return ActivityActualLoadSource.SESSION_RPE;
      default:
        return null;
    }
  }
}
