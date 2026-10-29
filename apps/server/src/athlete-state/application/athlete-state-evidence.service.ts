import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { HealthDataQueryService } from '@/health-data/health-data-query.service';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { LoadReadoutService } from '@/api/activity/load-readout.service';
import { PMCService } from '@/training-load/pmc.service';
import { AthleteMemoryQueryService } from '@/athlete-memory/application/athlete-memory-query.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import {
  ATHLETE_STATE_POLICY,
  ATHLETE_STATE_POLICY_VERSION,
} from '../athlete-state-policy';
import type {
  AthleteStateEvidenceSnapshot,
  BuiltAthleteStateEvidence,
  RecordedMetricPoint,
} from '../domain/athlete-state.contracts';
import { buildRobustBaseline, median } from '../domain/robust-baseline';

const PHYSIOLOGY_METRICS = new Set([
  'RESTING_HEART_RATE_BPM',
  'HRV_SDNN_MS',
  'HRV_RMSSD_MS',
  'SLEEP_ASLEEP_SECONDS',
  'SLEEP_SCORE',
  'STRESS_LEVEL_AVG',
]);

const SUBJECTIVE_CATEGORIES = [
  'sleep_quality',
  'sleep_duration',
  'fatigue',
  'recovery',
  'pain',
  'illness',
  'stress',
  'mood',
  'nutrition',
  'hydration',
  'subjective_effort',
] as const;

function localDateKey(value: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function latestIso(values: Array<Date | string | null | undefined>) {
  const dates = values
    .flatMap((value) => (value ? [new Date(value)] : []))
    .filter((value) => Number.isFinite(value.getTime()));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((value) => value.getTime())));
}

function sourceBoundary(source: Date | null, hours: number) {
  return source ? new Date(source.getTime() + hours * 60 * 60 * 1000) : null;
}

@Injectable()
export class AthleteStateEvidenceService {
  constructor(
    private readonly health: HealthDataQueryService,
    private readonly activities: ActivityReadService,
    private readonly loadReadout: LoadReadoutService,
    private readonly pmc: PMCService,
    private readonly memory: AthleteMemoryQueryService,
  ) {}

  async build(input: {
    userId: string;
    asOf?: Date;
    timezone: string;
    scopedAnswers?: Array<Record<string, unknown>>;
  }): Promise<BuiltAthleteStateEvidence> {
    const asOf = input.asOf ?? new Date();
    const localDate = localDateKey(asOf, input.timezone);
    const baselineEndDate = shiftDateKey(
      localDate,
      -ATHLETE_STATE_POLICY.recentPhysiologyDays,
    );
    const recentStartDate = shiftDateKey(
      localDate,
      -(ATHLETE_STATE_POLICY.recentPhysiologyDays - 1),
    );
    const performanceStart = new Date(asOf);
    performanceStart.setUTCDate(
      performanceStart.getUTCDate() - ATHLETE_STATE_POLICY.performanceDays,
    );
    const pmcStart = new Date(asOf);
    pmcStart.setUTCDate(
      pmcStart.getUTCDate() -
        (ATHLETE_STATE_POLICY.recentLoadDays +
          ATHLETE_STATE_POLICY.comparisonLoadDays),
    );
    const subjectiveStart = new Date(asOf);
    subjectiveStart.setUTCDate(
      subjectiveStart.getUTCDate() - ATHLETE_STATE_POLICY.subjectiveDays,
    );

    const unavailableSources = new Set<string>();
    const [health, pmcRows, activityRows, subjective] = await Promise.all([
      this.health
        .getOverview(
          input.userId,
          ATHLETE_STATE_POLICY.physiologyDays,
          localDate,
        )
        .catch(() => {
          unavailableSources.add('HEALTH_DATA_SOURCE');
          return { days: [] };
        }),
      this.pmc
        .listRange(input.userId, pmcStart, asOf, {
          orderBy: 'asc',
          select: {
            date: true,
            dailyValue: true,
            CTL: true,
            ATL: true,
            TSB: true,
            updatedAt: true,
          },
        })
        .catch(() => {
          unavailableSources.add('TRAINING_LOAD_SOURCE');
          return [];
        }),
      this.activities
        .findMany({
          where: readyActivityWhere({
            userId: input.userId,
            startTime: { gte: performanceStart, lte: asOf },
          }),
          orderBy: { startTime: 'desc' },
          take: 60,
          select: {
            id: true,
            startTime: true,
            updatedAt: true,
            sportType: true,
            sportDefinitionCode: true,
            timerTime: true,
            elapsedTime: true,
            distance: true,
            avgPower: true,
            avgSpeed: true,
            avgHeartRate: true,
            sessionRpe: true,
          },
        })
        .catch(() => {
          unavailableSources.add('ACTIVITY_SOURCE');
          return [];
        }),
      this.memory
        .search({
          userId: input.userId,
          intent: 'Assess current recovery, safety, fatigue and readiness',
          query:
            'sleep fatigue recovery pain illness stress mood nutrition hydration effort',
          categories: [...SUBJECTIVE_CATEGORIES],
          eventTo: asOf,
          mode: 'CURRENT',
          limit: 20,
          asOf,
        })
        .catch(() => {
          unavailableSources.add('ATHLETE_MEMORY_SOURCE');
          return { items: [] };
        }),
    ]);

    const actualLoads = await this.loadReadout
      .batchGetActualLoad(activityRows.map((activity) => activity.id))
      .catch(() => {
        unavailableSources.add('ACTIVITY_LOAD_SOURCE');
        return new Map();
      });
    const physiology: Record<string, RecordedMetricPoint[]> = {};
    for (const day of health.days) {
      for (const metric of day.metrics) {
        if (!PHYSIOLOGY_METRICS.has(metric.type) || !metric.provider) continue;
        (physiology[metric.type] ??= []).push({
          date: day.date,
          value: metric.value,
          unit: metric.unit,
          provider: metric.provider,
        });
      }
    }
    const baselines = Object.entries(physiology)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([metric, points]) =>
        buildRobustBaseline({
          metric,
          points,
          baselineEndDate,
          recentStartDate,
          minimumSamples: ATHLETE_STATE_POLICY.minimumBaselineSamples,
        }),
      );

    const pmcFacts = pmcRows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      dailyLoad: row.dailyValue,
      updatedAt: row.updatedAt.toISOString(),
    }));
    const modeledPmc = pmcRows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      ctl: row.CTL,
      atl: row.ATL,
      tsb: row.TSB,
    }));
    const recentLoadStart = shiftDateKey(
      localDate,
      -(ATHLETE_STATE_POLICY.recentLoadDays - 1),
    );
    const comparisonLoadStart = shiftDateKey(
      recentLoadStart,
      -ATHLETE_STATE_POLICY.comparisonLoadDays,
    );
    const recentLoadRows = pmcFacts.filter(
      (row) => row.date >= recentLoadStart,
    );
    const comparisonLoadRows = pmcFacts.filter(
      (row) => row.date >= comparisonLoadStart && row.date < recentLoadStart,
    );
    const recentLoad = recentLoadRows.length
      ? recentLoadRows.reduce((sum, row) => sum + row.dailyLoad, 0)
      : null;
    const comparisonLoad = comparisonLoadRows.length
      ? comparisonLoadRows.reduce((sum, row) => sum + row.dailyLoad, 0)
      : null;
    const priorWeeklyAverage =
      comparisonLoad === null ? null : comparisonLoad / 4;
    const loadRatio =
      recentLoad !== null &&
      priorWeeklyAverage !== null &&
      priorWeeklyAverage > 0
        ? recentLoad / priorWeeklyAverage
        : null;

    const activities = activityRows.map((activity) => {
      const load = actualLoads.get(activity.id);
      return {
        startTime: activity.startTime?.toISOString() ?? null,
        sport: activity.sportType ?? 'UNKNOWN',
        sportDefinition: activity.sportDefinitionCode,
        durationSeconds: activity.timerTime ?? activity.elapsedTime,
        distanceMeters: finite(activity.distance),
        averagePowerWatts: finite(activity.avgPower),
        averageSpeedMetersPerSecond: finite(activity.avgSpeed),
        averageHeartRateBpm: finite(activity.avgHeartRate),
        sessionRpe: finite(activity.sessionRpe),
        actualLoad: load?.actualLoad ?? null,
        actualLoadSource: load?.actualLoadSource ?? null,
      };
    });
    const chronological = activityRows
      .flatMap((activity) => (activity.startTime ? [activity.startTime] : []))
      .sort((a, b) => a.getTime() - b.getTime());
    const recoveryCutoff = new Date(asOf);
    recoveryCutoff.setUTCDate(
      recoveryCutoff.getUTCDate() - ATHLETE_STATE_POLICY.recoverySpacingDays,
    );
    const recoveryStarts = chronological.filter(
      (start) => start >= recoveryCutoff,
    );
    const gapsHours = recoveryStarts
      .slice(1)
      .map((start, index) =>
        Number(
          (
            (start.getTime() - recoveryStarts[index].getTime()) /
            3_600_000
          ).toFixed(2),
        ),
      );

    const performanceResponse = this.performanceResponse(activities);
    const safetySubjectiveStart = new Date(asOf);
    safetySubjectiveStart.setUTCDate(
      safetySubjectiveStart.getUTCDate() -
        ATHLETE_STATE_POLICY.safetySubjectiveDays,
    );
    const applicableSubjective = subjective.items.filter((item) => {
      const eventTime = latestIso([
        item.eventEnd as string | null,
        item.eventStart as string | null,
        item.assertedAt as string | null,
      ]);
      if (['pain', 'illness'].includes(String(item.category))) {
        return Boolean(eventTime && eventTime >= safetySubjectiveStart);
      }
      const validFrom = latestIso([item.validFrom as string | null]);
      const validUntil = latestIso([item.validUntil as string | null]);
      const withinMemoryValidity =
        Boolean(validFrom && validFrom <= asOf) &&
        (!validUntil || validUntil >= asOf);
      return Boolean(
        (eventTime && eventTime >= subjectiveStart) || withinMemoryValidity,
      );
    });
    const subjectiveItems = applicableSubjective.map((item) => ({
      memoryFactId: item.id,
      memoryFactVersion: item.version,
      claimHash: createHash('sha256')
        .update(String(item.claim ?? ''))
        .digest('hex'),
      category: item.category,
      value: item.value ?? null,
      eventStart: item.eventStart,
      eventEnd: item.eventEnd,
      assertedAt: item.assertedAt,
      epistemicStatus: item.epistemicStatus,
      lifecycle: item.lifecycle,
      directImpact: item.directImpact,
    }));
    const modelSubjectiveItems = applicableSubjective.map((item, index) => ({
      ...subjectiveItems[index],
      claim: String(item.claim ?? '').slice(0, 320),
    }));

    const missingEvidence: AthleteStateEvidenceSnapshot['missingEvidence'] = [];
    for (const kind of [...unavailableSources].sort()) {
      missingEvidence.push({
        kind,
        reason:
          'The evidence source was unavailable for this assessment; missing values were preserved as unknown.',
        requiredForDecision: false,
      });
    }
    const sleepBaseline = baselines.find((baseline) =>
      baseline.metric.startsWith('SLEEP_'),
    );
    if (!sleepBaseline || sleepBaseline.sampleCount < 14) {
      missingEvidence.push({
        kind: 'RECENT_SLEEP',
        reason:
          'Recent sleep evidence is missing or has no stable provider baseline.',
        requiredForDecision: subjectiveItems.some((item) =>
          ['fatigue', 'recovery', 'sleep_quality', 'sleep_duration'].includes(
            String(item.category),
          ),
        ),
      });
    }
    if (!baselines.some((baseline) => baseline.sampleCount >= 14)) {
      missingEvidence.push({
        kind: 'PHYSIOLOGY_BASELINE',
        reason: 'No physiological metric has 14 comparable samples.',
        requiredForDecision: false,
      });
    }
    if (!pmcRows.length) {
      missingEvidence.push({
        kind: 'TRAINING_LOAD',
        reason: 'No recent modeled training-load series is available.',
        requiredForDecision: false,
      });
    }

    const healthSource = latestIso(
      Object.values(physiology).flatMap((points) =>
        points.map((point) => `${point.date}T00:00:00.000Z`),
      ),
    );
    const pmcSource = latestIso(pmcRows.map((row) => row.updatedAt));
    const activitySource = latestIso(activityRows.map((row) => row.updatedAt));
    const memorySource = latestIso(
      subjectiveItems.map((item) => item.assertedAt as string | null),
    );
    const latestSourceAt = latestIso([
      healthSource,
      pmcSource,
      activitySource,
      memorySource,
    ]);
    const staleSources = [
      ['STALE_HEALTH_DATA', healthSource],
      ['STALE_TRAINING_LOAD', pmcSource],
      ['STALE_ACTIVITY_DATA', activitySource],
    ] as const;
    for (const [kind, source] of staleSources) {
      const boundary = sourceBoundary(source, 48);
      if (boundary && boundary <= asOf) {
        missingEvidence.push({
          kind,
          reason: 'The latest source data is older than its freshness window.',
          requiredForDecision: false,
        });
      }
    }

    const snapshot: AthleteStateEvidenceSnapshot = {
      schemaVersion: 1,
      policyVersion: ATHLETE_STATE_POLICY_VERSION,
      asOf: asOf.toISOString(),
      localDate,
      timezone: input.timezone,
      recordedFacts: {
        physiology,
        training: { activities, pmc: pmcFacts },
        subjective: subjectiveItems,
        scopedAnswers: input.scopedAnswers ?? [],
      },
      deterministicFeatures: {
        physiology: baselines,
        trainingLoad: {
          recent7DayLoad:
            recentLoad === null ? null : Number(recentLoad.toFixed(2)),
          previous28DayLoad:
            comparisonLoad === null ? null : Number(comparisonLoad.toFixed(2)),
          previousWeeklyAverage:
            priorWeeklyAverage === null
              ? null
              : Number(priorWeeklyAverage.toFixed(2)),
          recentToPriorWeeklyRatio:
            loadRatio === null ? null : Number(loadRatio.toFixed(4)),
        },
        recoverySpacing: {
          windowDays: ATHLETE_STATE_POLICY.recoverySpacingDays,
          sessionCount: recoveryStarts.length,
          gapsHours,
          minimumGapHours: gapsHours.length ? Math.min(...gapsHours) : null,
          gapsUnder24Hours: gapsHours.filter((gap) => gap < 24).length,
        },
        performanceResponse,
      },
      modeledMetrics: { pmc: modeledPmc },
      missingEvidence,
      freshness: {
        latestSourceAt: latestSourceAt?.toISOString() ?? null,
        sourceDates: {
          health: healthSource?.toISOString() ?? null,
          trainingLoad: pmcSource?.toISOString() ?? null,
          activities: activitySource?.toISOString() ?? null,
          subjective: memorySource?.toISOString() ?? null,
        },
      },
    };
    const modelSnapshot: AthleteStateEvidenceSnapshot = {
      ...snapshot,
      recordedFacts: {
        ...snapshot.recordedFacts,
        subjective: modelSubjectiveItems,
      },
    };
    const hashInput = {
      policyVersion: snapshot.policyVersion,
      localDate: snapshot.localDate,
      timezone: snapshot.timezone,
      recordedFacts: snapshot.recordedFacts,
      deterministicFeatures: snapshot.deterministicFeatures,
      modeledMetrics: snapshot.modeledMetrics,
      missingEvidence: snapshot.missingEvidence,
    };
    const evidenceHash = createHash('sha256')
      .update(stable(hashInput))
      .digest('hex');
    const maxExpiry = new Date(
      asOf.getTime() + ATHLETE_STATE_POLICY.assessmentMaxAgeHours * 3_600_000,
    );
    const freshnessBoundaries = [
      sourceBoundary(healthSource, 48),
      sourceBoundary(pmcSource, 48),
      sourceBoundary(activitySource, 48),
    ].filter((value): value is Date => Boolean(value));
    const expiresAt = freshnessBoundaries.reduce(
      (earliest, boundary) =>
        boundary < earliest && boundary > asOf ? boundary : earliest,
      maxExpiry,
    );
    return {
      snapshot,
      modelSnapshot,
      evidenceHash,
      latestSourceAt,
      expiresAt,
    };
  }

  private performanceResponse(
    activities: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const activity of activities) {
      const sport = String(activity.sport ?? 'UNKNOWN');
      const definition = String(activity.sportDefinition ?? 'default');
      const duration = finite(activity.durationSeconds);
      // Sport + definition + a coarse duration bucket prevents a short easy
      // session from being treated as comparable to a long workout merely
      // because both are runs or rides.
      const durationBucket =
        duration === null ? 'unknown' : String(Math.round(duration / 900));
      const key = `${sport}:${definition}:${durationBucket}`;
      const rows = groups.get(key) ?? [];
      if (rows.length < ATHLETE_STATE_POLICY.comparablePerformanceLimit) {
        rows.push(activity);
      }
      groups.set(key, rows);
    }
    return [...groups.values()]
      .flatMap((rows) => {
        if (rows.length < 2) return [];
        const metric = rows.some(
          (row) => finite(row.averagePowerWatts) !== null,
        )
          ? 'averagePowerWatts'
          : 'averageSpeedMetersPerSecond';
        const latest = finite(rows[0][metric]);
        const prior = median(
          rows.slice(1).flatMap((row) => {
            const value = finite(row[metric]);
            return value === null ? [] : [value];
          }),
        );
        return [
          {
            sport: String(rows[0].sport ?? 'UNKNOWN'),
            sportDefinition: rows[0].sportDefinition ?? null,
            metric,
            comparableSessions: rows.length,
            latest,
            priorMedian: prior,
            relativeChange:
              latest !== null && prior !== null && prior !== 0
                ? Number(((latest - prior) / prior).toFixed(4))
                : null,
          },
        ];
      })
      .slice(0, ATHLETE_STATE_POLICY.comparablePerformanceLimit);
  }
}
