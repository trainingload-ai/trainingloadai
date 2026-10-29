import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CompetitionGoalType,
  MetricSource,
  SportType,
  UserFitnessMetricType,
} from '@prisma/client';
import {
  computeVdotForDistanceTime,
  estimateVdotFromThresholdSpeed,
  isSupportedVdot,
  predictTimeForVdot,
} from '@shared/vdot';
import type {
  PlanTemplateDefinition,
  RunningCapabilitySnapshot,
  RunningGoalRaceSnapshot,
} from '@shared/plan-templates';
import type { RunningPlanBaseline } from '@/api/activity/running-plan-baseline-query.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { CompetitionQueryService } from '@/api/competition/application/competition-query.service';

const DAY_MS = 86_400_000;
const VO2_MAX_MODEL_MIN = 20;
const VO2_MAX_LONG_DISTANCE_WARNING_FLOOR = 25;

export type RunningTemplateEligibility = {
  status:
    | 'ELIGIBLE'
    | 'ELIGIBLE_WITH_WARNING'
    | 'ELIGIBLE_RPE_FALLBACK'
    | 'INPUT_REQUIRED'
    | 'NOT_ELIGIBLE';
  reasonCodes: string[];
  missingInputs: string[];
  reasonDetails: Array<{
    code: string;
    actual: number;
    required: number;
    unit:
      | 'weeks'
      | 'runs_per_week'
      | 'minutes'
      | 'meters'
      | 'meters_per_week'
      | 'ml_kg_min'
      | 'seconds'
      | 'days';
  }>;
};

function isFresh(date: Date, days: number, now: Date) {
  return date.getTime() >= now.getTime() - days * DAY_MS;
}

function goalDistance(template: PlanTemplateDefinition) {
  if (template.goal === '10K') return 10_000;
  if (template.goal === 'HALF_MARATHON') return 21_097.5;
  if (template.goal === 'MARATHON') return 42_195;
  return 5_000;
}

@Injectable()
export class RunningPlanCapabilityService {
  constructor(
    private readonly users: UserQueryService,
    private readonly competitions: CompetitionQueryService,
  ) {}

  async resolve(
    userId: string,
    baseline: RunningPlanBaseline,
    now = new Date(),
  ): Promise<RunningCapabilitySnapshot> {
    const rows = await this.users.fitnessMetrics().findMany({
      where: {
        userId,
        OR: [
          {
            sport: SportType.RUN,
            type: {
              in: [UserFitnessMetricType.TP, UserFitnessMetricType.CS],
            },
          },
          {
            sport: SportType.UNKNOWN,
            type: UserFitnessMetricType.VO2_MAX,
          },
        ],
        source: {
          in: [MetricSource.MANUAL, MetricSource.AUTO, MetricSource.ESTIMATED],
        },
        recordedAt: { lte: now },
      },
      orderBy: { recordedAt: 'desc' },
      take: 30,
    });
    const preferred = (...types: UserFitnessMetricType[]) =>
      rows
        .filter(
          (row) => types.includes(row.type) && isFresh(row.recordedAt, 90, now),
        )
        .sort((left, right) => {
          const rank = (source: MetricSource) =>
            source === MetricSource.MANUAL
              ? 0
              : source === MetricSource.AUTO
                ? 1
                : 2;
          return (
            rank(left.source) - rank(right.source) ||
            right.recordedAt.getTime() - left.recordedAt.getTime()
          );
        })[0];
    const vo2MaxRow = preferred(UserFitnessMetricType.VO2_MAX);
    const vo2MaxAnchorRow = vo2MaxRow;
    const tpRow = preferred(UserFitnessMetricType.TP);
    const csRow = preferred(UserFitnessMetricType.CS);
    const tpEquivalentVdot = tpRow
      ? estimateVdotFromThresholdSpeed(tpRow.value)
      : null;
    const csEquivalentVdot = csRow
      ? estimateVdotFromThresholdSpeed(csRow.value)
      : null;
    const supportedTpEquivalentVdot =
      tpEquivalentVdot != null && isSupportedVdot(tpEquivalentVdot)
        ? tpEquivalentVdot
        : null;
    const supportedCsEquivalentVdot =
      csEquivalentVdot != null && isSupportedVdot(csEquivalentVdot)
        ? csEquivalentVdot
        : null;
    const reportedVo2Max =
      vo2MaxAnchorRow &&
      Number.isFinite(vo2MaxAnchorRow.value) &&
      vo2MaxAnchorRow.value > 0
        ? vo2MaxAnchorRow.value
        : null;
    const vo2MaxAnchor =
      vo2MaxAnchorRow && isSupportedVdot(vo2MaxAnchorRow.value)
        ? vo2MaxAnchorRow.value
        : null;
    const race = baseline.recentRaceEffort;
    const raceVdot =
      race && isFresh(new Date(race.recordedAt), 180, now)
        ? computeVdotForDistanceTime(race.distanceMeters, race.durationSeconds)
        : null;
    const conflicts: string[] = [];
    if (
      vo2MaxAnchorRow &&
      raceVdot &&
      Math.abs(vo2MaxAnchorRow.value - raceVdot) /
        Math.min(vo2MaxAnchorRow.value, raceVdot) >
        0.05
    ) {
      conflicts.push('VO2_MAX_RACE_ANCHORS_DIFFER_OVER_5_PERCENT');
    }
    const metricRefs: Array<
      NonNullable<RunningCapabilitySnapshot['metricRefs']>[number]
    > = [];
    if (vo2MaxRow && Number.isFinite(vo2MaxRow.value) && vo2MaxRow.value > 0)
      metricRefs.push({
        id: vo2MaxRow.id,
        type: 'VO2_MAX',
        value: vo2MaxRow.value,
        source: vo2MaxRow.source,
        recordedAt: vo2MaxRow.recordedAt.toISOString(),
      });
    if (tpRow)
      metricRefs.push({
        id: tpRow.id,
        type: 'TP',
        value: tpRow.value,
        source: tpRow.source,
        recordedAt: tpRow.recordedAt.toISOString(),
      });
    if (csRow)
      metricRefs.push({
        id: csRow.id,
        type: 'CS',
        value: csRow.value,
        source: csRow.source,
        recordedAt: csRow.recordedAt.toISOString(),
      });
    if (race && raceVdot)
      metricRefs.push({
        id: race.activityId,
        type: 'RACE_RESULT',
        value: raceVdot,
        source: 'ACTIVITY',
        recordedAt: race.recordedAt,
      });
    const primaryVdot =
      vo2MaxAnchor ??
      raceVdot ??
      supportedTpEquivalentVdot ??
      supportedCsEquivalentVdot;
    const primarySource = vo2MaxAnchor
      ? 'VO2_MAX'
      : raceVdot
        ? 'RECENT_RACE'
        : supportedTpEquivalentVdot
          ? 'TP'
          : supportedCsEquivalentVdot
            ? 'CS'
            : null;
    const primaryId =
      (vo2MaxAnchor ? vo2MaxAnchorRow?.id : null) ??
      (raceVdot ? race?.activityId : null) ??
      (supportedTpEquivalentVdot ? tpRow?.id : null) ??
      (supportedCsEquivalentVdot ? csRow?.id : null) ??
      null;
    const primaryDate =
      (vo2MaxAnchor ? vo2MaxAnchorRow?.recordedAt.toISOString() : null) ??
      (raceVdot ? race?.recordedAt : null) ??
      (supportedTpEquivalentVdot ? tpRow?.recordedAt.toISOString() : null) ??
      (supportedCsEquivalentVdot ? csRow?.recordedAt.toISOString() : null) ??
      null;
    const hasAnyHistorical = rows.length > 0 || Boolean(race);
    return {
      // A recent performance split is useful corroborating evidence, but it
      // must not invalidate a fresh physiological anchor. ActivityPerformanceTT
      // rows are generated from ordinary training activities as well as races,
      // so disagreement remains diagnostic only. The approved resolver order
      // is VO2_MAX first, then recent performance, TP and CS fallbacks.
      state: primaryVdot ? 'AVAILABLE' : hasAnyHistorical ? 'STALE' : 'MISSING',
      resolvedAt: now.toISOString(),
      vdot: primaryVdot,
      vo2Max: reportedVo2Max ?? raceVdot ?? null,
      // TP/CS remain raw speed anchors; vdot above is only their internal pace-model equivalent.
      thresholdPaceSecPerKm: tpRow ? 1_000 / tpRow.value : null,
      criticalSpeedMetersPerSecond: csRow?.value ?? null,
      source: primarySource,
      sourceId: primaryId,
      sourceRecordedAt: primaryDate,
      conflicts,
      metricRefs,
      durability: {
        validWeeks: baseline.validWeeks,
        medianRunsPerWeek: baseline.medianRunsPerWeek,
        medianDistanceMetersPerWeek: baseline.medianDistanceMetersPerWeek,
        medianDurationMinutesPerWeek: baseline.medianDurationMinutesPerWeek,
        latestWeekDurationMinutes: baseline.latestWeekDurationMinutes,
        longestRunDistanceMeters: baseline.longestRunDistanceMeters,
        longestContinuousRunMinutes: baseline.longestContinuousRunMinutes,
      },
    };
  }

  async resolveGoalRace(
    userId: string,
    template: PlanTemplateDefinition,
    eventId?: string,
  ): Promise<RunningGoalRaceSnapshot | null> {
    if (!eventId) return null;
    const event = await this.competitions.findPlannedGoalRaceById(
      userId,
      eventId,
    );
    if (!event) throw new BadRequestException('TARGET_RACE_EVENT_NOT_FOUND');
    const expected = goalDistance(template);
    const distance = event.distanceMeters ?? 0;
    if (
      event.sportType !== SportType.RUN ||
      Math.abs(distance - expected) / expected > 0.02
    ) {
      throw new BadRequestException('TARGET_RACE_DISTANCE_MISMATCH');
    }
    if (
      event.goalType !== CompetitionGoalType.TARGET_TIME ||
      !event.targetTimeSeconds
    ) {
      throw new BadRequestException('TARGET_RACE_TIME_REQUIRED');
    }
    return {
      eventId: event.id,
      distanceMeters: distance,
      targetTimeSeconds: event.targetTimeSeconds,
      raceDate: event.startDate.toISOString().slice(0, 10),
      qualified: false,
    };
  }

  evaluate(args: {
    template: PlanTemplateDefinition;
    baseline: RunningPlanBaseline;
    capability: RunningCapabilitySnapshot;
    targetRace?: RunningGoalRaceSnapshot | null;
    startDate?: string;
  }): {
    eligibility: RunningTemplateEligibility;
    targetRace: RunningGoalRaceSnapshot | null;
  } {
    const { template, baseline, capability } = args;
    const reasons: string[] = [];
    const missing: string[] = [];
    const reasonDetails: RunningTemplateEligibility['reasonDetails'] = [];
    const addReason = (
      code: string,
      actual: number,
      required: number,
      unit: RunningTemplateEligibility['reasonDetails'][number]['unit'],
    ) => {
      reasons.push(code);
      reasonDetails.push({ code, actual, required, unit });
    };
    const longestRunDistance = baseline.longestRunDistanceMeters ?? 0;
    if (template.goal === 'HALF_MARATHON' && longestRunDistance < 10_000)
      addReason(
        'HALF_MARATHON_BASELINE_REQUIRED',
        longestRunDistance,
        10_000,
        'meters',
      );
    if (template.goal === 'MARATHON' && longestRunDistance < 20_000)
      addReason(
        'MARATHON_LONG_RUN_REQUIRED',
        longestRunDistance,
        20_000,
        'meters',
      );
    const reportedVo2Max = capability.vo2Max ?? capability.vdot ?? null;
    if (
      (template.goal === 'HALF_MARATHON' || template.goal === 'MARATHON') &&
      reportedVo2Max != null
    ) {
      if (reportedVo2Max < VO2_MAX_MODEL_MIN)
        addReason(
          'VO2_MAX_BELOW_SUPPORTED_RANGE',
          reportedVo2Max,
          VO2_MAX_MODEL_MIN,
          'ml_kg_min',
        );
      else if (reportedVo2Max < VO2_MAX_LONG_DISTANCE_WARNING_FLOOR)
        addReason(
          'VO2_MAX_LOW_FOR_LONG_DISTANCE',
          reportedVo2Max,
          VO2_MAX_LONG_DISTANCE_WARNING_FLOOR,
          'ml_kg_min',
        );
    }
    let targetRace = args.targetRace ?? null;
    if (template.outcome === 'TARGET') {
      if (capability.state !== 'AVAILABLE' || !capability.vdot)
        missing.push('currentCapability');
      if (targetRace && capability.vdot) {
        const current = predictTimeForVdot(
          goalDistance(template),
          capability.vdot,
        );
        const limit = template.goal === 'MARATHON' ? 0.03 : 0.05;
        if (!current) reasons.push('GOAL_NOT_SUPPORTED');
        else if (targetRace.targetTimeSeconds < current * (1 - limit)) {
          addReason(
            'GOAL_NOT_SUPPORTED',
            targetRace.targetTimeSeconds,
            current * (1 - limit),
            'seconds',
          );
        } else targetRace = { ...targetRace, qualified: true };
      }
      if (targetRace && args.startDate) {
        const requiredMs = template.variants[0].periodWeeks * 7 * DAY_MS;
        const availableMs =
          new Date(`${targetRace.raceDate}T00:00:00Z`).getTime() -
          new Date(`${args.startDate}T00:00:00Z`).getTime() +
          DAY_MS;
        if (availableMs < requiredMs)
          addReason(
            'PLAN_PERIOD_TOO_SHORT',
            availableMs / DAY_MS,
            requiredMs / DAY_MS,
            'days',
          );
      }
    }
    const hardReasons = reasons.filter(
      (reason) =>
        reason === 'GOAL_NOT_SUPPORTED' || reason === 'PLAN_PERIOD_TOO_SHORT',
    );
    const status: RunningTemplateEligibility['status'] =
      missing.length > 0
        ? 'INPUT_REQUIRED'
        : hardReasons.length > 0
          ? 'NOT_ELIGIBLE'
          : reasons.length > 0
            ? 'ELIGIBLE_WITH_WARNING'
            : capability.state === 'AVAILABLE'
              ? 'ELIGIBLE'
              : 'ELIGIBLE_RPE_FALLBACK';
    return {
      eligibility: {
        status,
        reasonCodes: reasons,
        missingInputs: [...new Set(missing)],
        reasonDetails,
      },
      targetRace,
    };
  }
}
