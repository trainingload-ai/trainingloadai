import { Injectable, Optional } from '@nestjs/common';
import { CompetitionEventService } from '@/api/competition/competition-event.service';
import { CompetitionImpactService } from '@/api/competition/competition-impact.service';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import type { AiToolContext } from './tool.types';
import type { UnifiedActivityAnalysisInput } from '../dto/ai.type';
import {
  BodyMetricType,
  CompetitionEventSource,
  CompetitionGoalType,
  CompetitionImportance,
  CompetitionStatus,
  AiUsageKind,
  MetricSource,
  SportType,
  UserFitnessMetricType,
  type PMCData,
  type Prisma,
} from '@prisma/client';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import isoWeek = require('dayjs/plugin/isoWeek');
import { round } from 'lodash';
import { ActivityService } from '@/api/activity/activity.service';
import { ActivityQueryService } from '@/api/activity/activity-query.service';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { UserQueryService } from '@/api/user/user-query.service';
import type { UserProfileResponse } from '@/api/user/user.interface';
import type { UserZoneSetting } from '@/utils/zones';
import {
  describeCoachZoneBasis,
  type CoachZoneBasis,
} from './coach-zone-basis';
import type { UpdateCompetitionEventDto } from '@/api/competition/dto/update-competition-event.dto';
import { PaceService } from '@/api/pace/pace.service';
import { getCoachDocByRef, searchCoachDocs } from './docs-index';
import { resolveEffectiveActivityVo2Max } from '@/analyze/vo2max/vo2max-source';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import {
  buildUnifiedActivityAnalysisInput,
  type ActivityForCoachUnifiedInput,
} from '../activity-coach-unified-input';
import { localDateYmd } from './ai-common.util';
import type { TrainingAnalysisQuery } from '@shared/training-visualization';
import { readTrainingMetricHistory } from './training-metric-history';
import {
  MAX_TRAINING_ANALYSIS_ACTIVITIES,
  MAX_TRAINING_ANALYSIS_DAYS,
  assertTrainingAnalysisQuery,
  buildActivityTrainingDataset,
  buildPmcTrainingDataset,
} from './training-analytics';
import { TrainingInsightQueryService } from '@/training-insights/training-insight-query.service';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek['default'] || isoWeek);

type BodyMetricSpec = {
  metric: 'weight';
  category: 'body';
  bodyType: BodyMetricType;
  source: 'body';
  unit: string;
  decimals: number;
  requiresSportType: false;
};

type FitnessMetricSpec = {
  metric:
    | 'vo2Max'
    | 'ftp'
    | 'eftp'
    | 'cp'
    | 'ecp'
    | 'lthr'
    | 'maxHr'
    | 'restingHr'
    | 'pMax'
    | 'tp'
    | 'cs';
  category: 'fitness';
  fitnessType: UserFitnessMetricType;
  source: 'manual' | 'auto';
  sourceLocked: boolean;
  unit: string;
  decimals: number;
  requiresSportType: boolean;
};

type MetricHistorySpec = BodyMetricSpec | FitnessMetricSpec;
type CurrentMetricSpec =
  | BodyMetricSpec
  | (FitnessMetricSpec & {
      compareKey:
        | 'vo2Max'
        | 'ftp'
        | 'cp'
        | 'lthr'
        | 'maxHr'
        | 'restingHr'
        | 'pMax'
        | 'tp'
        | 'cs';
    });
type ZoneFocusMetric = 'pace' | 'heartRate' | 'power';
type ZonePriority = [ZoneFocusMetric, ZoneFocusMetric, ZoneFocusMetric];
type WorkoutIntensityExpression = 'zone' | 'fixed' | 'duration_only';
type WorkoutIntensityCoverageStatus = 'none' | 'sparse' | 'usable' | 'strong';
type WorkoutIntensityGoal =
  | 'recovery'
  | 'endurance'
  | 'tempo'
  | 'threshold'
  | 'vo2'
  | 'anaerobic'
  | 'race'
  | 'mixed'
  | 'unknown';

type PmcLoadField =
  | 'runningValue'
  | 'cyclingValue'
  | 'swimmingValue'
  | 'dailyValue';

type IntensityActivityRow = {
  startTime?: Date | string | null;
  timerTime?: number | null;
  elapsedTime?: number | null;
  distance?: number | null;
  avgSpeed?: number | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  avgPower?: number | null;
  maxPower?: number | null;
  minPower?: number | null;
  work?: number | null;
  NGP?: number | null;
  xPace?: number | null;
  xGap?: number | null;
};

type ActivityDurationRow = {
  hashId: string;
  sportType?: string | null;
  activityName?: string | null;
  startTime?: Date | string | null;
  timerTime?: number | null;
  elapsedTime?: number | null;
  distance?: number | null;
  avgHeartRate?: number | null;
  avgPower?: number | null;
  coggan?: { bikeStress?: number | null } | null;
  trimp?: { trimp100?: number | null } | null;
};

type ZoneTotals = {
  name: string;
  duration_s: number;
  percent: number;
};

type WorkoutIntensityMetricCoverage = {
  activityCount: number;
  ratio: number;
  status: WorkoutIntensityCoverageStatus;
  lastObservedAt?: string;
};

type WorkoutIntensityCandidate = {
  metric: ZoneFocusMetric;
  dslToken: 'pace' | 'hr' | 'power';
  sportPriorityIndex: number;
  hasZones: boolean;
  zoneCount: number;
  benchmark?: string | null;
  hasFixedAnchor: boolean;
  fixedAnchorSource?: string | null;
  recentCoverage: WorkoutIntensityMetricCoverage;
  expressionOptions: WorkoutIntensityExpression[];
  reliabilityScore: number;
  recommendationHint: 'prefer_zone' | 'prefer_fixed' | 'fallback_only';
  reasons: string[];
  cautions: string[];
  exampleZoneTargets: string[];
};

type WorkoutIntensityStrategyOutput = {
  kind: 'workout_intensity_strategy';
  sportType: string;
  workoutGoal: WorkoutIntensityGoal;
  anchorDate: string;
  range: {
    from: string;
    to: string;
    weeks: number;
  };
  recentData: {
    activityCount: number;
    metrics: Record<ZoneFocusMetric, WorkoutIntensityMetricCoverage>;
  };
  thresholds: {
    pace: {
      tp?: number | null;
      cs?: number | null;
      vo2max?: number | null;
    };
    heartRate: {
      lthr?: number | null;
      maxHeartRate?: number | null;
      restingHeartRate?: number | null;
    };
    power: {
      ftp?: number | null;
      cp?: number | null;
    };
  };
  zoneHintsByGoal: {
    easy: string[];
    moderate: string[];
    hard: string[];
  };
  selectedZoneRanges: {
    metric: ZoneFocusMetric;
    benchmark?: string | null;
    unit: 'sec_per_meter' | 'bpm' | 'watt';
    zones: Array<{
      order: number;
      name?: string;
      min?: number;
      max?: number;
    }>;
  } | null;
  candidates: WorkoutIntensityCandidate[];
  recommendation: {
    primaryMetric: ZoneFocusMetric | null;
    expression: WorkoutIntensityExpression;
    fallbackOrder: ZoneFocusMetric[];
    dslExamples: string[];
    reasons: string[];
    notesGuidance: string[];
  };
  decisionRubric: string[];
};

/**
 * AI Coach 工具实现层（业务逻辑集中在这里）
 *
 * 设计目标：
 * - tool 文件只负责暴露 name/parameters 给模型（类似“接口定义”）
 * - 具体 DB 查询、聚合、校验、异常统一放到该 Service，方便复用/测试/打日志
 */
@Injectable()
export class CoachToolsService {
  constructor(
    private readonly activityService: ActivityService,
    private readonly activityQuery: ActivityQueryService,
    private readonly userQuery: UserQueryService,
    private readonly activityRead: ActivityReadService,
    private readonly paceService: PaceService,
    private readonly competitionEventService: CompetitionEventService,
    private readonly competitionImpactService: CompetitionImpactService,
    @Optional()
    private readonly trainingInsights?: TrainingInsightQueryService,
  ) {}

  private activities(ctx: AiToolContext) {
    return ctx.activities ?? this.activityRead;
  }

  private users(ctx: AiToolContext) {
    return ctx.users ?? this.userQuery;
  }

  async competitionEventsList(
    ctx: AiToolContext,
    input: {
      startDate: string;
      endDate: string;
      status?: 'PLANNED' | 'COMPLETED' | 'CANCELLED';
    },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) throw new Error('UNAUTHORIZED');
    return this.competitionEventService.list({
      userId,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status as CompetitionStatus | undefined,
    });
  }

  async competitionImpactResolve(
    ctx: AiToolContext,
    input: {
      scopeType:
        | 'PLAN_DRAFT'
        | 'PLAN_EXECUTION'
        | 'CALENDAR_RANGE'
        | 'DAY_DECISION'
        | 'WORKOUT_DECISION'
        | 'COACH_CONVERSATION';
      scopeStartDate: string;
      scopeEndDate: string;
      anchorDate: string;
    },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) throw new Error('UNAUTHORIZED');
    const aiUsageKind =
      input.scopeType === 'PLAN_DRAFT'
        ? AiUsageKind.PLAN_GENERATION
        : input.scopeType === 'PLAN_EXECUTION' ||
            input.scopeType === 'DAY_DECISION' ||
            input.scopeType === 'WORKOUT_DECISION'
          ? AiUsageKind.PLAN_ADJUSTMENT
          : (ctx.aiUsageKind ?? AiUsageKind.COACH_CHAT);
    return this.competitionImpactService.resolve({
      userId,
      ...input,
      aiOperationId: ctx.aiOperationId,
      aiUsageKind,
    });
  }

  async competitionEventMutate(
    ctx: AiToolContext,
    input: {
      action: 'CREATE' | 'UPDATE' | 'CANCEL' | 'RESTORE' | 'DELETE';
      eventId?: string;
      expectedVersion?: number;
      title?: string;
      sportType?: SportType;
      sportDefinitionCode?: string | null;
      distanceMeters?: number | null;
      startDate?: string;
      endDate?: string | null;
      startTimeMinute?: number | null;
      timezone?: string | null;
      importance?: CompetitionImportance;
      goalType?: CompetitionGoalType;
      targetTimeSeconds?: number | null;
      location?: string | null;
      notes?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) throw new Error('UNAUTHORIZED');
    if (input.action === 'CREATE') {
      return this.competitionEventService.create(
        userId,
        {
          input: {
            title: input.title!,
            sportType: input.sportType!,
            sportDefinitionCode: input.sportDefinitionCode,
            distanceMeters: input.distanceMeters,
            startDate: input.startDate!,
            endDate: input.endDate,
            startTimeMinute: input.startTimeMinute,
            timezone: input.timezone,
            importance: input.importance!,
            goalType: input.goalType!,
            targetTimeSeconds: input.targetTimeSeconds,
            location: input.location,
            notes: input.notes,
          },
          source: CompetitionEventSource.AI,
          actorType: 'AI_CONFIRMED',
          idempotencyKey: ctx.currentToolCallId
            ? `ai:${ctx.currentToolCallId}`
            : null,
          requestId: ctx.currentToolCallId,
        },
        tx,
      );
    }
    if (!input.eventId || !input.expectedVersion) {
      throw new Error('COMPETITION_EVENT_ID_AND_VERSION_REQUIRED');
    }
    if (input.action === 'UPDATE') {
      const { action: _action, eventId, ...update } = input;
      return this.competitionEventService.update({
        userId,
        eventId,
        input: {
          expectedVersion: input.expectedVersion,
          title: update.title,
          sportType: update.sportType,
          sportDefinitionCode: update.sportDefinitionCode,
          distanceMeters: update.distanceMeters,
          startDate: update.startDate,
          endDate: update.endDate,
          startTimeMinute: update.startTimeMinute,
          timezone: update.timezone,
          importance: update.importance,
          goalType: update.goalType,
          targetTimeSeconds: update.targetTimeSeconds,
          location: update.location,
          notes: update.notes,
        } satisfies UpdateCompetitionEventDto,
        actorType: 'AI_CONFIRMED',
        requestId: ctx.currentToolCallId,
        tx,
      });
    }
    if (input.action === 'DELETE') {
      return this.competitionEventService.softDelete({
        userId,
        eventId: input.eventId,
        expectedVersion: input.expectedVersion,
        actorType: 'AI_CONFIRMED',
        requestId: ctx.currentToolCallId,
        tx,
      });
    }
    return this.competitionEventService.cancelOrRestore({
      userId,
      eventId: input.eventId,
      expectedVersion: input.expectedVersion,
      restore: input.action === 'RESTORE',
      actorType: 'AI_CONFIRMED',
      requestId: ctx.currentToolCallId,
      tx,
    });
  }

  private readonly metricHistoryDefaults = {
    defaultLimit: 24,
    maxLimit: 120,
    maxRangeDays: 365 * 5,
  } as const;

  private normalizeSportType(input?: string): SportType | undefined {
    const value = String(input ?? '')
      .trim()
      .toUpperCase();
    if (!value) return undefined;
    if (value === 'RUN' || value === 'RUNNING') return SportType.RUN;
    if (value === 'CYCLING' || value === 'CYCLE' || value === 'BIKE')
      return SportType.CYCLING;
    if (value === 'SWIM' || value === 'SWIMMING') return SportType.SWIM;
    return undefined;
  }

  private getPmcLoadField(sportType?: SportType): PmcLoadField {
    if (sportType === SportType.RUN) return 'runningValue' as const;
    if (sportType === SportType.CYCLING) return 'cyclingValue' as const;
    if (sportType === SportType.SWIM) return 'swimmingValue' as const;
    return 'dailyValue' as const;
  }

  private getZonePriorityForSport(sportType: SportType): ZonePriority {
    if (sportType === SportType.CYCLING) {
      return ['power', 'heartRate', 'pace'];
    }
    if (sportType === SportType.SWIM) {
      return ['pace', 'heartRate', 'power'];
    }
    return ['pace', 'heartRate', 'power'];
  }

  private normalizeWorkoutIntensityGoal(input?: string): WorkoutIntensityGoal {
    const value = String(input ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
    if (!value) return 'unknown';

    if (
      [
        'recovery',
        'restoration',
        'easy',
        'activeRecovery',
        'activerecovery',
        'easyday',
        '恢复',
        '轻松',
      ].includes(value)
    ) {
      return 'recovery';
    }
    if (
      [
        'base',
        'endurance',
        'aerobic',
        'long',
        'longrun',
        'longride',
        '耐力',
        '有氧',
        '长距离',
      ].includes(value)
    ) {
      return 'endurance';
    }
    if (['tempo', 'steady', 'marathonpace', '节奏', '稳态'].includes(value)) {
      return 'tempo';
    }
    if (
      ['threshold', 'lactatethreshold', 'lt', 'ftp', 'cp', '阈值'].includes(
        value,
      )
    ) {
      return 'threshold';
    }
    if (['vo2', 'vo2max', 'interval', 'intervals', '间歇'].includes(value)) {
      return 'vo2';
    }
    if (
      [
        'anaerobic',
        'sprint',
        'neuromuscular',
        'speed',
        '冲刺',
        '无氧',
      ].includes(value)
    ) {
      return 'anaerobic';
    }
    if (
      ['race', 'racepace', 'simulation', '比赛', '比赛配速'].includes(value)
    ) {
      return 'race';
    }
    if (['mixed', 'blend', 'varied', '综合', '混合'].includes(value)) {
      return 'mixed';
    }
    return 'unknown';
  }

  private getIntensityDslToken(
    metric: ZoneFocusMetric,
  ): 'pace' | 'hr' | 'power' {
    if (metric === 'heartRate') return 'hr';
    return metric;
  }

  private getZoneHintsByGoal(goal: WorkoutIntensityGoal) {
    switch (goal) {
      case 'recovery':
        return { easy: ['z1'], moderate: ['z2'], hard: [] };
      case 'endurance':
        return { easy: ['z1', 'z2'], moderate: ['z2'], hard: ['z3'] };
      case 'tempo':
        return { easy: ['z2'], moderate: ['z3'], hard: ['z4'] };
      case 'threshold':
        return { easy: ['z2'], moderate: ['z3'], hard: ['z4'] };
      case 'vo2':
        return { easy: ['z1', 'z2'], moderate: ['z3'], hard: ['z5'] };
      case 'anaerobic':
        return { easy: ['z1', 'z2'], moderate: ['z4'], hard: ['z5', 'z6'] };
      case 'race':
        return { easy: ['z1', 'z2'], moderate: ['z3'], hard: ['z4'] };
      case 'mixed':
      case 'unknown':
      default:
        return { easy: ['z1', 'z2'], moderate: ['z3'], hard: ['z4', 'z5'] };
    }
  }

  private getMetricCoverageStatus(
    metricCount: number,
    activityCount: number,
  ): WorkoutIntensityCoverageStatus {
    if (metricCount <= 0 || activityCount <= 0) return 'none';
    const ratio = metricCount / activityCount;
    if (metricCount >= 4 && ratio >= 0.6) return 'strong';
    if (metricCount >= 2 && ratio >= 0.25) return 'usable';
    return 'sparse';
  }

  private getWorkoutIntensityCoverage(
    activities: IntensityActivityRow[],
    metric: ZoneFocusMetric,
  ): WorkoutIntensityMetricCoverage {
    const hasMetric = (row: IntensityActivityRow) => {
      if (metric === 'pace') {
        const hasDistanceAndTime =
          Number(row?.distance ?? 0) > 0 &&
          (Number(row?.timerTime ?? 0) > 0 ||
            Number(row?.elapsedTime ?? 0) > 0);
        return (
          hasDistanceAndTime ||
          Number(row?.avgSpeed ?? 0) > 0 ||
          Number(row?.NGP ?? 0) > 0 ||
          Number(row?.xPace ?? 0) > 0 ||
          Number(row?.xGap ?? 0) > 0
        );
      }
      if (metric === 'heartRate') {
        return (
          Number(row?.avgHeartRate ?? 0) > 0 ||
          Number(row?.maxHeartRate ?? 0) > 0
        );
      }
      return (
        Number(row?.avgPower ?? 0) > 0 ||
        Number(row?.maxPower ?? 0) > 0 ||
        Number(row?.minPower ?? 0) > 0 ||
        Number(row?.work ?? 0) > 0
      );
    };

    const observed = activities.filter(hasMetric);
    return {
      activityCount: observed.length,
      ratio:
        activities.length > 0
          ? round(observed.length / activities.length, 2)
          : 0,
      status: this.getMetricCoverageStatus(observed.length, activities.length),
      lastObservedAt: observed[0]?.startTime
        ? dayjs(observed[0].startTime).format('YYYY-MM-DD')
        : undefined,
    };
  }

  private getFixedAnchorSource(
    profile: UserProfileResponse | null | undefined,
    metric: ZoneFocusMetric,
  ): string | null {
    if (metric === 'pace') {
      if (typeof profile?.tp === 'number') return 'profile.tp';
      if (typeof profile?.cs === 'number') return 'profile.cs';
      if (typeof profile?.vo2max === 'number') return 'profile.vo2max';
      return null;
    }
    if (metric === 'heartRate') {
      if (typeof profile?.lthr === 'number') return 'profile.lthr';
      if (typeof profile?.maxHeartRate === 'number') {
        return 'profile.maxHeartRate';
      }
      return null;
    }
    if (typeof profile?.ftp === 'number') return 'profile.ftp';
    if (typeof profile?.cp === 'number') return 'profile.cp';
    return null;
  }

  private getCoverageScore(status: WorkoutIntensityCoverageStatus) {
    if (status === 'strong') return 30;
    if (status === 'usable') return 22;
    if (status === 'sparse') return 8;
    return 0;
  }

  private async getActivityThumbUrlMap(
    userId: string,
    rows: Array<{ id: number }>,
  ) {
    return this.activityService.getMapThumbnailUrlsForAi({
      userId,
      activityIds: rows.map((row) => row.id),
    });
  }

  private mapActivityListItem(
    a: {
      id?: number;
      hashId: string;
      sportType?: string | null;
      activityName?: string | null;
      description?: string | null;
      startTime?: Date | string | null;
      timerTime?: number | null;
      elapsedTime?: number | null;
      distance?: number | null;
      avgHeartRate?: number | null;
      avgPower?: number | null;
      aiLoad?: number | null;
      aiLoadSource?: string | null;
      coggan?: { bikeStress?: number | null } | null;
      trimp?: { trimp100?: number | null } | null;
      vo2max?: unknown;
    },
    extras?: {
      mapThumbnailUrl?: string;
      variant?: 'summary' | 'search';
      vo2MaxPreference?: string | null;
      vo2MaxCorrectionFactor?: number | null;
    },
  ) {
    const durationMin =
      typeof a.timerTime === 'number'
        ? round(a.timerTime / 60, 1)
        : typeof a.elapsedTime === 'number'
          ? round(a.elapsedTime / 60, 1)
          : undefined;
    const distanceKm =
      typeof a.distance === 'number' ? round(a.distance / 1000, 2) : undefined;
    const avgHr =
      typeof a.avgHeartRate === 'number' ? round(a.avgHeartRate) : undefined;
    const avgPower =
      typeof a.avgPower === 'number' ? round(a.avgPower) : undefined;
    if (extras?.variant === 'search') {
      return {
        hashId: a.hashId,
        activityName: a.activityName ?? undefined,
        description: a.description ?? undefined,
        sportType: a.sportType ? String(a.sportType) : undefined,
        startTime: a.startTime ? dayjs(a.startTime).toISOString() : undefined,
        durationMin,
        distanceKm,
        avgHr,
        avgPower,
        load: typeof a.aiLoad === 'number' ? round(a.aiLoad, 1) : null,
        loadSource: a.aiLoadSource ?? null,
        heartRateAvailable:
          typeof a.avgHeartRate === 'number' && a.avgHeartRate > 0,
        averagePaceSecPerKm:
          a.sportType === 'RUN' &&
          typeof a.distance === 'number' &&
          a.distance > 0 &&
          (a.timerTime ?? a.elapsedTime ?? 0) > 0
            ? round(((a.timerTime ?? a.elapsedTime)! * 1000) / a.distance, 1)
            : null,
      };
    }
    const vo2 = resolveEffectiveActivityVo2Max(
      a.vo2max as never,
      extras?.vo2MaxPreference,
      extras?.vo2MaxCorrectionFactor,
    )?.value;
    return {
      hashId: a.hashId,
      sportType: String(a.sportType),
      mapThumbnailUrl: extras?.mapThumbnailUrl,
      startTime: a.startTime ? dayjs(a.startTime).toISOString() : undefined,
      durationMin,
      distanceKm,
      avgHr,
      avgPower,
      load: typeof a.aiLoad === 'number' ? round(a.aiLoad) : undefined,
      loadSource: a.aiLoadSource ?? undefined,
      tss:
        typeof a.coggan?.bikeStress === 'number'
          ? round(a.coggan.bikeStress)
          : undefined,
      trimp:
        typeof a.trimp?.trimp100 === 'number'
          ? round(a.trimp.trimp100)
          : undefined,
      vo2max: vo2 == null ? undefined : round(vo2, 1),
    };
  }

  private async getResolvedZoneStatus(
    ctx: AiToolContext,
    userId: string,
    sportType: SportType,
    profile: Awaited<ReturnType<typeof ctx.userService.getComposedUserProfile>>,
  ) {
    return ctx.userService.getZoneSourceStatus(
      userId,
      sportType,
      profile ?? undefined,
    );
  }

  private parseHistoryRange(
    ctx: AiToolContext,
    input: { from?: string; to?: string },
  ) {
    const from = input?.from ? dayjs(input.from).startOf('day') : undefined;
    const to = input?.to ? dayjs(input.to).endOf('day') : undefined;

    if (
      (from && !from.isValid()) ||
      (to && !to.isValid()) ||
      (from && to && to.isBefore(from))
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.invalid_date_range') ?? 'Invalid date range',
      });
    }

    if (from && to) {
      const days = to.diff(from.startOf('day'), 'day') + 1;
      if (days > this.metricHistoryDefaults.maxRangeDays) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message:
            ctx.i18n.t('common.error.date_range_too_large') ??
            `Date range too large (max ${this.metricHistoryDefaults.maxRangeDays} days)`,
        });
      }
    }

    return { from, to };
  }

  private clampHistoryLimit(limit?: number) {
    const raw =
      typeof limit === 'number'
        ? limit
        : this.metricHistoryDefaults.defaultLimit;
    return Math.max(
      1,
      Math.min(this.metricHistoryDefaults.maxLimit, Math.floor(raw)),
    );
  }

  private resolveMetricHistorySpec(
    metricRaw?: string,
  ): MetricHistorySpec | null {
    const normalized = String(metricRaw ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');

    switch (normalized) {
      case 'weight':
      case 'bodyweight':
      case 'mass':
        return {
          metric: 'weight',
          category: 'body' as const,
          bodyType: BodyMetricType.WEIGHT,
          source: 'body' as const,
          unit: 'kg',
          decimals: 1,
          requiresSportType: false,
        };
      case 'vo2max':
      case 'vdot':
        return {
          metric: 'vo2Max',
          category: 'fitness' as const,
          fitnessType: UserFitnessMetricType.VO2_MAX,
          source: 'auto' as const,
          sourceLocked: true,
          unit: 'ml/kg/min',
          decimals: 1,
          requiresSportType: false,
        };
      case 'ftp':
        return {
          metric: 'ftp',
          category: 'fitness' as const,
          fitnessType: UserFitnessMetricType.FTP,
          source: 'manual' as const,
          sourceLocked: false,
          unit: 'W',
          decimals: 0,
          requiresSportType: true,
        };
      case 'eftp':
      case 'estimatedftp':
        return {
          metric: 'eftp',
          category: 'fitness' as const,
          fitnessType: UserFitnessMetricType.FTP,
          source: 'auto' as const,
          sourceLocked: true,
          unit: 'W',
          decimals: 0,
          requiresSportType: true,
        };
      case 'cp':
      case 'criticalpower':
        return {
          metric: 'cp',
          category: 'fitness' as const,
          fitnessType: UserFitnessMetricType.CP,
          source: 'manual' as const,
          sourceLocked: false,
          unit: 'W',
          decimals: 0,
          requiresSportType: true,
        };
      case 'ecp':
      case 'estimatedcp':
        return {
          metric: 'ecp',
          category: 'fitness' as const,
          fitnessType: UserFitnessMetricType.CP,
          source: 'auto' as const,
          sourceLocked: true,
          unit: 'W',
          decimals: 0,
          requiresSportType: true,
        };
      case 'lthr':
        return {
          metric: 'lthr',
          category: 'fitness' as const,
          fitnessType: UserFitnessMetricType.LTHR,
          source: 'auto' as const,
          sourceLocked: false,
          unit: 'bpm',
          decimals: 0,
          requiresSportType: true,
        };
      case 'maxhr':
      case 'mhr':
        return {
          metric: 'maxHr',
          category: 'fitness' as const,
          fitnessType: UserFitnessMetricType.MAX_HR,
          source: 'auto' as const,
          sourceLocked: false,
          unit: 'bpm',
          decimals: 0,
          requiresSportType: true,
        };
      case 'restinghr':
      case 'resthr':
      case 'rhr':
        return {
          metric: 'restingHr',
          category: 'fitness' as const,
          fitnessType: UserFitnessMetricType.RESTING_HR,
          source: 'auto' as const,
          sourceLocked: false,
          unit: 'bpm',
          decimals: 0,
          requiresSportType: true,
        };
      case 'pmax':
      case 'maxpower':
        return {
          metric: 'pMax',
          category: 'fitness' as const,
          fitnessType: UserFitnessMetricType.P_MAX,
          source: 'auto' as const,
          sourceLocked: false,
          unit: 'W',
          decimals: 0,
          requiresSportType: true,
        };
      case 'tp':
      case 'thresholdpace':
        return {
          metric: 'tp',
          category: 'fitness' as const,
          fitnessType: UserFitnessMetricType.TP,
          source: 'auto' as const,
          sourceLocked: false,
          unit: 'm/s',
          decimals: 2,
          requiresSportType: true,
        };
      case 'cs':
      case 'criticalspeed':
        return {
          metric: 'cs',
          category: 'fitness' as const,
          fitnessType: UserFitnessMetricType.CS,
          source: 'auto' as const,
          sourceLocked: false,
          unit: 'm/s',
          decimals: 2,
          requiresSportType: true,
        };
      default:
        return null;
    }
  }

  private resolveCurrentMetricSpec(
    metricRaw?: string,
  ): CurrentMetricSpec | null {
    const spec = this.resolveMetricHistorySpec(metricRaw);
    if (!spec) return null;
    if (spec.category === 'body') return spec;

    const compareKey =
      spec.metric === 'eftp'
        ? 'ftp'
        : spec.metric === 'ecp'
          ? 'cp'
          : spec.metric;

    return {
      ...spec,
      compareKey,
    };
  }

  private buildSeriesSummary(
    points: Array<{ date: string; value: number }>,
    decimals: number,
  ) {
    if (!points.length) {
      return { count: 0 } as {
        count: number;
        start?: { date: string; value: number };
        latest?: { date: string; value: number };
        previous?: { date: string; value: number };
        deltaFromStart?: number;
        deltaFromStartPct?: number;
        deltaFromPrevious?: number;
        deltaFromPreviousPct?: number;
        min?: number;
        max?: number;
        avg?: number;
      };
    }

    const start = points[0];
    const latest = points.at(-1);
    const previous = points.length > 1 ? points.at(-2) : undefined;
    const values = points.map((point) => point.value);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deltaFromStart =
      latest && start ? round(latest.value - start.value, decimals) : undefined;
    const deltaFromPrevious =
      latest && previous
        ? round(latest.value - previous.value, decimals)
        : undefined;

    return {
      count: points.length,
      start,
      latest,
      previous,
      deltaFromStart,
      deltaFromStartPct:
        deltaFromStart !== undefined && start.value !== 0
          ? round((deltaFromStart / start.value) * 100, 1)
          : undefined,
      deltaFromPrevious,
      deltaFromPreviousPct:
        deltaFromPrevious !== undefined && previous && previous.value !== 0
          ? round((deltaFromPrevious / previous.value) * 100, 1)
          : undefined,
      min: round(Math.min(...values), decimals),
      max: round(Math.max(...values), decimals),
      avg: round(avg, decimals),
    };
  }

  /**
   * time.current
   * 获取服务器当前时间，并在可用时附带用户时区对应的当前时间
   */
  async currentTime(ctx: AiToolContext) {
    const serverTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      process.env.TZ ||
      'UTC';
    const instant = new Date();
    const now = dayjs(instant);
    const userId = ctx.session?.user?.id;
    let userTimezone: string | undefined;
    if (userId) {
      try {
        userTimezone =
          (await ctx.userService.getPreferredTimezone(userId)) ?? undefined;
      } catch {
        userTimezone = undefined;
      }
    }
    const athleteTimezone = userTimezone || 'UTC';
    const athleteLocalToday =
      localDateYmd(instant, athleteTimezone) ??
      localDateYmd(instant, 'UTC') ??
      instant.toISOString().slice(0, 10);
    const userNow = userTimezone ? now.tz(userTimezone) : undefined;

    return {
      unixMs: instant.getTime(),
      athleteTimezone,
      athleteLocalToday,
      serverTimezone,
      server: {
        iso: instant.toISOString(),
        date: now.utc().format('YYYY-MM-DD'),
        time: now.utc().format('HH:mm:ss'),
        weekday: now.utc().format('dddd'),
        offset: '+00:00',
      },
      userTimezone: userTimezone ?? null,
      user: userNow
        ? {
            iso: userNow.toISOString(),
            date: athleteLocalToday,
            time: userNow.format('HH:mm:ss'),
            weekday: userNow.format('dddd'),
            offset: userNow.format('Z'),
          }
        : {
            iso: instant.toISOString(),
            date: athleteLocalToday,
            time: now.utc().format('HH:mm:ss'),
            weekday: now.utc().format('dddd'),
            offset: '+00:00',
          },
    };
  }

  /**
   * profile.current
   * 获取当前用户画像与训练基线
   */
  async profileCurrent(ctx: AiToolContext, input: { sportType?: string }) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    const sportType =
      this.normalizeSportType(input?.sportType) ?? SportType.RUN;
    const profile = await ctx.userService.getComposedUserProfile(
      userId,
      sportType,
    );
    const zoneStatus = await this.getResolvedZoneStatus(
      ctx,
      userId,
      sportType,
      profile,
    );

    return {
      sportType,
      timezone: profile?.timezone ?? null,
      demographics: {
        age: typeof profile?.age === 'number' ? profile.age : null,
        gender: profile?.gender ?? null,
      },
      body: {
        heightCm:
          typeof profile?.height === 'number' ? round(profile.height, 1) : null,
        weightKg:
          typeof profile?.weight === 'number' ? round(profile.weight, 1) : null,
      },
      zones: {
        heartRateModel:
          profile?.heartRateZoneModel ??
          (zoneStatus.heartRate.configured ? 'CUSTOM' : null),
        paceModel:
          profile?.paceZoneModel ??
          (zoneStatus.pace.configured ? 'CUSTOM' : null),
        powerModel:
          profile?.powerZoneModel ??
          (zoneStatus.power.configured ? 'CUSTOM' : null),
      },
      zoneAvailability: {
        hasHeartRateZones: zoneStatus.heartRate.configured,
        hasPaceZones: zoneStatus.pace.configured,
        hasPowerZones: zoneStatus.power.configured,
      },
      zoneStatus,
      loadSources: profile?.loadSources ?? [],
      altitude: {
        model: profile?.altitudeOptimizationModel ?? null,
        threshold:
          typeof profile?.altitudeThreshold === 'number'
            ? round(profile.altitudeThreshold, 0)
            : null,
      },
      runSpecific:
        sportType === SportType.RUN
          ? {
              aerobicThresholdPaceSec:
                typeof profile?.aerobicThresholdPaceSec === 'number'
                  ? round(profile.aerobicThresholdPaceSec, 1)
                  : null,
              defaultVdotSource: profile?.defaultVdotSource ?? null,
              vo2maxCorrectionFactor:
                typeof profile?.vo2maxCorrectionFactor === 'number'
                  ? round(profile.vo2maxCorrectionFactor, 2)
                  : null,
            }
          : null,
    };
  }

  /**
   * metric.current
   * 获取用户当前关键指标快照
   */
  async metricCurrent(
    ctx: AiToolContext,
    input: {
      sportType?: string;
      metrics?: string[];
    },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    const sportType =
      this.normalizeSportType(input?.sportType) ?? SportType.RUN;
    const [profile, pairs, autoUpdateConfigs] = await Promise.all([
      ctx.userService.getComposedUserProfile(userId, sportType),
      ctx.userService.getFitnessMetricPairs({ userId, sportType }),
      ctx.userService.listAutoUpdateConfigs(userId),
    ]);
    const autoUpdateEnabled = new Map(
      autoUpdateConfigs.map((config) => [config.metric, config.enabled]),
    );

    const metricNames = (
      input?.metrics?.length
        ? input.metrics
        : [
            'weight',
            'ftp',
            'eftp',
            'cp',
            'ecp',
            'vo2Max',
            'lthr',
            'maxHr',
            'restingHr',
          ]
    )
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);

    const uniqueMetricNames = [...new Set(metricNames)];

    const items = uniqueMetricNames
      .map((metricName) => {
        const spec = this.resolveCurrentMetricSpec(metricName);
        if (!spec) return null;

        if (spec.category === 'body') {
          return {
            metric: spec.metric,
            source: 'body' as const,
            unit: spec.unit,
            value:
              spec.metric === 'weight'
                ? round(profile?.weight ?? 0, spec.decimals) || null
                : null,
          };
        }

        const type = spec.fitnessType;
        const manual = pairs.manual?.[type] ?? null;
        const estimated = pairs.estimated?.[type] ?? null;
        const automatic = pairs.automatic?.[type] ?? null;
        const selected = pairs.effectiveDetails?.[type] ?? null;
        const estimatedOnly =
          spec.sourceLocked === true && spec.source === 'auto';
        const effective = estimatedOnly
          ? estimated
          : (pairs.effective?.[type] ?? null);
        const effectiveSource = estimatedOnly
          ? estimated !== null
            ? MetricSource.ESTIMATED
            : null
          : selected?.source === MetricSource.MANUAL ||
              selected?.source === MetricSource.AUTO
            ? selected.source
            : null;

        const hasManual = typeof manual === 'number' && Number.isFinite(manual);
        const hasEstimated =
          typeof estimated === 'number' && Number.isFinite(estimated);
        const hasAutomatic =
          typeof automatic === 'number' && Number.isFinite(automatic);
        const hasEffective =
          typeof effective === 'number' && Number.isFinite(effective);
        const supportsAutoUpdate =
          ctx.userService.isAutoUpdateMetricSupported(type);

        return {
          metric: spec.metric,
          compareKey: spec.compareKey,
          unit: spec.unit,
          manual: hasManual ? round(Number(manual), spec.decimals) : null,
          estimated: hasEstimated
            ? round(Number(estimated), spec.decimals)
            : null,
          automatic: hasAutomatic
            ? round(Number(automatic), spec.decimals)
            : null,
          effectiveCurrent: hasEffective
            ? round(Number(effective), spec.decimals)
            : null,
          effectiveSource,
          effectiveRecordedAt:
            !estimatedOnly && selected?.recordedAt
              ? dayjs(selected.recordedAt).format('YYYY-MM-DD')
              : null,
          autoUpdateSupported: supportsAutoUpdate,
          autoUpdateEnabled: supportsAutoUpdate
            ? (autoUpdateEnabled.get(type) ?? true)
            : null,
          estimatedOnly,
        };
      })
      .filter(Boolean);

    return {
      sportType,
      timezone: profile?.timezone ?? null,
      asOf: dayjs().toISOString(),
      selectionPolicy: {
        effectiveSources: [MetricSource.MANUAL, MetricSource.AUTO],
        precedence: 'NEWEST_RECORDED_AT' as const,
        tieBreaker: MetricSource.MANUAL,
        estimatedBehavior:
          'ESTIMATED is advisory; when auto-update is enabled it is also written to AUTO, which can become effective.',
      },
      items,
    };
  }

  /**
   * metric.compare
   * 对比手动设定值与估算值的当前差异
   */
  async metricCompare(
    ctx: AiToolContext,
    input: {
      metric: string;
      sportType?: string;
    },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    const spec = this.resolveCurrentMetricSpec(input?.metric);
    if (!spec || spec.category !== 'fitness') {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: `Unsupported compare metric: ${String(input?.metric ?? '').trim() || 'unknown'}`,
      });
    }

    const sportType =
      spec.fitnessType === UserFitnessMetricType.VO2_MAX
        ? SportType.UNKNOWN
        : this.normalizeSportType(input?.sportType);

    if (spec.requiresSportType && !sportType) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.query_condition_error') ??
          'Missing sport type',
      });
    }

    const autoUpdateSupported = ctx.userService.isAutoUpdateMetricSupported(
      spec.fitnessType,
    );
    const [
      manualMetric,
      estimatedMetric,
      automaticMetric,
      effectiveMetric,
      autoUpdateEnabled,
    ] = await Promise.all([
      ctx.userService.getUserFitnessMetric(
        userId,
        spec.fitnessType,
        undefined,
        sportType,
        MetricSource.MANUAL,
      ),
      ctx.userService.getUserFitnessMetric(
        userId,
        spec.fitnessType,
        undefined,
        sportType,
        MetricSource.ESTIMATED,
      ),
      ctx.userService.getUserFitnessMetric(
        userId,
        spec.fitnessType,
        undefined,
        sportType,
        MetricSource.AUTO,
      ),
      ctx.userService.getEffectiveUserFitnessMetric(
        userId,
        spec.fitnessType,
        undefined,
        sportType,
      ),
      autoUpdateSupported
        ? ctx.userService.checkAutoUpdatePermission(userId, spec.fitnessType)
        : Promise.resolve(null),
    ]);

    const manualValue =
      typeof manualMetric?.value === 'number'
        ? round(manualMetric.value, spec.decimals)
        : null;
    const estimatedValue =
      typeof estimatedMetric?.value === 'number'
        ? round(estimatedMetric.value, spec.decimals)
        : null;
    const automaticValue =
      typeof automaticMetric?.value === 'number'
        ? round(automaticMetric.value, spec.decimals)
        : null;
    const estimatedOnly = spec.sourceLocked === true && spec.source === 'auto';
    const effectiveValue = estimatedOnly
      ? estimatedValue
      : typeof effectiveMetric?.value === 'number'
        ? round(effectiveMetric.value, spec.decimals)
        : null;

    const delta =
      manualValue !== null && estimatedValue !== null
        ? round(estimatedValue - manualValue, spec.decimals)
        : null;

    return {
      metric: spec.metric,
      compareKey: spec.compareKey,
      unit: spec.unit,
      sportType: sportType === SportType.UNKNOWN ? null : sportType,
      estimatedOnly,
      manualCurrent:
        manualValue !== null
          ? {
              value: manualValue,
              recordedAt: manualMetric?.recordedAt
                ? dayjs(manualMetric.recordedAt).format('YYYY-MM-DD')
                : null,
            }
          : null,
      estimatedCurrent:
        estimatedValue !== null
          ? {
              value: estimatedValue,
              recordedAt: estimatedMetric?.recordedAt
                ? dayjs(estimatedMetric.recordedAt).format('YYYY-MM-DD')
                : null,
            }
          : null,
      automaticCurrent:
        automaticValue !== null
          ? {
              value: automaticValue,
              recordedAt: automaticMetric?.recordedAt
                ? dayjs(automaticMetric.recordedAt).format('YYYY-MM-DD')
                : null,
            }
          : null,
      delta,
      deltaPct:
        delta !== null && manualValue !== null && manualValue !== 0
          ? round((delta / manualValue) * 100, 1)
          : null,
      effectiveCurrent: effectiveValue,
      effectiveSource: estimatedOnly
        ? estimatedValue !== null
          ? MetricSource.ESTIMATED
          : null
        : effectiveMetric?.source === MetricSource.MANUAL ||
            effectiveMetric?.source === MetricSource.AUTO
          ? effectiveMetric.source
          : null,
      effectiveRecordedAt: estimatedOnly
        ? estimatedMetric?.recordedAt
          ? dayjs(estimatedMetric.recordedAt).format('YYYY-MM-DD')
          : null
        : effectiveMetric?.recordedAt
          ? dayjs(effectiveMetric.recordedAt).format('YYYY-MM-DD')
          : null,
      autoUpdate: {
        supported: autoUpdateSupported,
        enabled: autoUpdateEnabled,
        behavior: autoUpdateSupported
          ? 'When enabled, a valid estimate is copied to AUTO. The newest AUTO or MANUAL record is effective; MANUAL wins only a same-timestamp tie.'
          : 'This metric does not support automatic updates.',
      },
    };
  }

  /**
   * activity.byHashId
   * 获取“已处理”的活动摘要（包含分区、负荷、关键指标等），供模型回答时引用
   */
  async activityByHashId(
    ctx: AiToolContext,
    input: { hashId: string },
  ): Promise<UnifiedActivityAnalysisInput> {
    const activityHashId = String(input?.hashId ?? '').trim();
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }
    if (!activityHashId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: ctx.i18n.t('common.error.missing_activity_id'),
      });
    }

    // 统一走 ActivityService，复用权限与 include 约定，避免 AI 模块散落 Prisma 查询细节
    const activity = await this.activityQuery.getActivityByHashIdForAi(
      activityHashId,
      userId,
    );

    const profile = await ctx.userService.getComposedUserProfile(
      userId,
      activity.sportType,
    );

    return buildUnifiedActivityAnalysisInput(
      activity as ActivityForCoachUnifiedInput,
      userId,
      profile,
      ctx.pmc,
    );
  }

  /**
   * profile.zones
   * 获取用户画像中的“区间/阈值基础信息”（时区、心率区间模型、阈值与体重等）
   */
  async zonesProfile(ctx: AiToolContext, input: { sportType?: string } = {}) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }
    const sportType = Object.values(SportType).includes(
      input.sportType as SportType,
    )
      ? (input.sportType as SportType)
      : SportType.RUN;
    const profile = await ctx.userService.getComposedUserProfile(
      userId,
      sportType,
    );
    const zoneStatus = await this.getResolvedZoneStatus(
      ctx,
      userId,
      sportType,
      profile,
    );
    return {
      sportType,
      timezone: profile?.timezone ?? null,
      heartRateZoneModel:
        (zoneStatus.heartRate.source === 'custom'
          ? 'CUSTOM'
          : profile?.heartRateZoneModel) ??
        (zoneStatus.heartRate.configured ? 'CUSTOM' : null),
      maxHeartRate: profile?.maxHeartRate ?? null,
      restingHeartRate: profile?.restingHeartRate ?? null,
      lthr: profile?.lthr ?? null,
      ftp: profile?.ftp ?? null,
      cp: profile?.cp ?? null,
      weight: profile?.weight ?? null,
      zoneAvailability: {
        hasHeartRateZones: zoneStatus.heartRate.configured,
        hasPaceZones: zoneStatus.pace.configured,
        hasPowerZones: zoneStatus.power.configured,
      },
      zoneStatus,
      basisLookup:
        'Use profile.zone_ranges with this sportType for actual boundaries, benchmark value/source and auto-update state. Never infer a model from zone count.',
    };
  }

  async zoneRangesProfile(
    ctx: AiToolContext,
    input: { sportType?: string },
  ): Promise<{
    sportType: string;
    pace: {
      basis?: CoachZoneBasis;
      configured: boolean;
      benchmark?: string | null;
      zones: Array<{
        order: number;
        name?: string;
        min?: number;
        max?: number;
        color?: string;
      }>;
    };
    heartRate: {
      basis?: CoachZoneBasis;
      configured: boolean;
      benchmark?: string | null;
      zones: Array<{
        order: number;
        name?: string;
        min?: number;
        max?: number;
        color?: string;
      }>;
    };
    power: {
      basis?: CoachZoneBasis;
      configured: boolean;
      benchmark?: string | null;
      zones: Array<{
        order: number;
        name?: string;
        min?: number;
        max?: number;
        color?: string;
      }>;
    };
    priority: ZonePriority;
    availablePriority: ZoneFocusMetric[];
    recommendedMetric?: ZoneFocusMetric | null;
    unitHints: {
      pace: 'sec_per_meter';
      heartRate: 'bpm';
      power: 'watt';
    };
  }> {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }
    const sportType =
      this.normalizeSportType(input?.sportType) ?? SportType.RUN;
    const profile = await ctx.userService.getComposedUserProfile(
      userId,
      sportType,
    );

    const [pace, heartRate, power, metricSnapshot] = await Promise.all([
      ctx.userService.getPaceZoneSettingResolved(userId, sportType, {
        vo2max: profile?.vo2max,
        tp: profile?.tp,
        cs: profile?.cs,
        paceZoneModel: profile?.paceZoneModel,
      }),
      ctx.userService.getHeartRateZoneSetting(userId, sportType, {
        maxHeartRate: profile?.maxHeartRate,
        restingHeartRate: profile?.restingHeartRate,
        lthr: profile?.lthr,
        heartRateZoneModel: profile?.heartRateZoneModel,
      }),
      ctx.userService.getPowerZoneSettingResolved(userId, sportType, {
        FTP: profile?.ftp,
        CP: profile?.cp,
        powerZoneModel: profile?.powerZoneModel,
      }),
      this.metricCurrent(ctx, {
        sportType,
        metrics: [
          'ftp',
          'cp',
          'tp',
          'cs',
          'vo2Max',
          'lthr',
          'maxHr',
          'restingHr',
        ],
      }),
    ]);

    const normalize = (setting?: UserZoneSetting | null) => {
      const zones = Array.isArray(setting?.zones)
        ? setting!.zones.map((z, idx) => ({
            order:
              Number.isFinite(z?.order) && Number(z.order) > 0
                ? Number(z.order)
                : idx + 1,
            name: z?.name != null ? String(z.name) : undefined,
            min:
              z?.min != null && Number.isFinite(Number(z.min))
                ? Number(z.min)
                : undefined,
            max:
              z?.max != null && Number.isFinite(Number(z.max))
                ? Number(z.max)
                : undefined,
            color: z?.color != null ? String(z.color) : undefined,
          }))
        : [];
      return {
        configured: zones.length > 0,
        basis: describeCoachZoneBasis(
          setting,
          profile ?? {},
          metricSnapshot.items,
        ),
        benchmark:
          setting?.benchmark != null ? String(setting.benchmark) : undefined,
        zones,
      };
    };

    const normalized = {
      pace: normalize(pace),
      heartRate: normalize(heartRate),
      power: normalize(power),
    };
    const priority = this.getZonePriorityForSport(sportType);
    const availablePriority = priority.filter(
      (metric) => normalized[metric].configured,
    );

    return {
      sportType,
      ...normalized,
      priority,
      availablePriority,
      recommendedMetric: availablePriority[0] ?? null,
      unitHints: {
        pace: 'sec_per_meter',
        heartRate: 'bpm',
        power: 'watt',
      },
    };
  }

  /**
   * workout.intensity_strategy
   * Give the model the evidence it needs to choose zone vs fixed targets and
   * pace vs HR vs power for generated workout DSL.
   */
  async workoutIntensityStrategy(
    ctx: AiToolContext,
    input: {
      sportType?: string;
      workoutGoal?: string;
      asOf?: string;
      weeks?: number;
    },
  ): Promise<WorkoutIntensityStrategyOutput> {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    const sportType =
      this.normalizeSportType(input?.sportType) ?? SportType.RUN;
    const workoutGoal = this.normalizeWorkoutIntensityGoal(input?.workoutGoal);
    const anchor = input?.asOf
      ? dayjs(input.asOf).startOf('day')
      : dayjs().startOf('day');
    if (!anchor.isValid()) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.invalid_date_range') ?? 'Invalid date range',
      });
    }

    const weeks = Math.max(
      2,
      Math.min(12, Math.floor(Number(input?.weeks ?? 8) || 8)),
    );
    const rangeStart = anchor.subtract(weeks, 'week').startOf('day');
    const rangeEnd = anchor.endOf('day');

    const [profile, zoneRanges, activities] = await Promise.all([
      ctx.userService.getComposedUserProfile(userId, sportType),
      this.zoneRangesProfile(ctx, { sportType }),
      this.activities(ctx).findMany({
        where: readyActivityWhere({
          userId,
          sportType,
          startTime: {
            gte: rangeStart.toDate(),
            lte: rangeEnd.toDate(),
          },
        }),
        orderBy: { startTime: 'desc' },
        select: {
          startTime: true,
          timerTime: true,
          elapsedTime: true,
          distance: true,
          avgSpeed: true,
          avgHeartRate: true,
          maxHeartRate: true,
          minHeartRate: true,
          avgPower: true,
          maxPower: true,
          minPower: true,
          work: true,
          NGP: true,
          xPace: true,
          xGap: true,
        },
      }),
    ]);

    const coverage = {
      pace: this.getWorkoutIntensityCoverage(activities, 'pace'),
      heartRate: this.getWorkoutIntensityCoverage(activities, 'heartRate'),
      power: this.getWorkoutIntensityCoverage(activities, 'power'),
    };
    const priority = this.getZonePriorityForSport(sportType);
    const zoneHintsByGoal = this.getZoneHintsByGoal(workoutGoal);
    const zoneHintPool = [
      ...zoneHintsByGoal.easy,
      ...zoneHintsByGoal.moderate,
      ...zoneHintsByGoal.hard,
    ].filter((item, index, arr) => arr.indexOf(item) === index);

    const thresholds = {
      pace: {
        tp: typeof profile?.tp === 'number' ? profile.tp : null,
        cs: typeof profile?.cs === 'number' ? profile.cs : null,
        vo2max: typeof profile?.vo2max === 'number' ? profile.vo2max : null,
      },
      heartRate: {
        lthr: typeof profile?.lthr === 'number' ? profile.lthr : null,
        maxHeartRate:
          typeof profile?.maxHeartRate === 'number'
            ? profile.maxHeartRate
            : null,
        restingHeartRate:
          typeof profile?.restingHeartRate === 'number'
            ? profile.restingHeartRate
            : null,
      },
      power: {
        ftp: typeof profile?.ftp === 'number' ? profile.ftp : null,
        cp: typeof profile?.cp === 'number' ? profile.cp : null,
      },
    };

    const candidates = priority.map(
      (metric, index): WorkoutIntensityCandidate => {
        const zones = zoneRanges[metric].zones;
        const hasZones = zoneRanges[metric].configured;
        const metricCoverage = coverage[metric];
        const fixedAnchorSource = this.getFixedAnchorSource(profile, metric);
        const hasFixedAnchor = Boolean(fixedAnchorSource);
        const canPreferZone =
          hasZones &&
          (activities.length === 0 ||
            metricCoverage.status === 'usable' ||
            metricCoverage.status === 'strong');
        const canPreferFixed =
          !hasZones &&
          hasFixedAnchor &&
          (metricCoverage.status === 'usable' ||
            metricCoverage.status === 'strong');
        const recommendationHint = canPreferZone
          ? 'prefer_zone'
          : canPreferFixed
            ? 'prefer_fixed'
            : 'fallback_only';
        const expressionOptions: WorkoutIntensityExpression[] = [];
        if (hasZones) expressionOptions.push('zone');
        if (hasFixedAnchor) expressionOptions.push('fixed');
        if (expressionOptions.length === 0)
          expressionOptions.push('duration_only');

        const sportPriorityBonus = (priority.length - index - 1) * 3;
        const reliabilityScore =
          (hasZones ? 40 : 0) +
          (canPreferFixed ? 28 : hasFixedAnchor ? 10 : 0) +
          this.getCoverageScore(metricCoverage.status) +
          sportPriorityBonus -
          (hasZones && activities.length > 0 && metricCoverage.status === 'none'
            ? 24
            : 0);

        const dslToken = this.getIntensityDslToken(metric);
        const exampleZoneTargets = hasZones
          ? zoneHintPool
              .filter((hint) => {
                const order = Number(hint.replace(/^z/i, ''));
                return Number.isFinite(order) && order <= zones.length;
              })
              .slice(0, 4)
              .map((hint) => `${dslToken} ${hint}`)
          : [];
        const reasons = [
          hasZones
            ? `${metric} zones configured (${zones.length})`
            : `${metric} zones not configured`,
          `recent ${metric} coverage ${metricCoverage.activityCount}/${activities.length} (${metricCoverage.status})`,
        ];
        if (fixedAnchorSource)
          reasons.push(`fixed anchor available: ${fixedAnchorSource}`);

        const cautions: string[] = [];
        if (
          hasZones &&
          activities.length > 0 &&
          metricCoverage.status === 'none'
        ) {
          cautions.push(
            `Zones exist, but no recent ${metric} data was observed; prefer another executable metric if available.`,
          );
        }
        if (!hasZones && hasFixedAnchor) {
          cautions.push(
            `No zones for ${metric}; fixed targets must be conservative and derived from ${fixedAnchorSource}.`,
          );
        }
        if (!hasZones && !hasFixedAnchor) {
          cautions.push(
            `No zones or threshold anchor for ${metric}; do not invent ${metric} targets.`,
          );
        }

        return {
          metric,
          dslToken,
          sportPriorityIndex: index,
          hasZones,
          zoneCount: zones.length,
          benchmark: zoneRanges[metric].benchmark ?? null,
          hasFixedAnchor,
          fixedAnchorSource,
          recentCoverage: metricCoverage,
          expressionOptions,
          reliabilityScore,
          recommendationHint,
          reasons,
          cautions,
          exampleZoneTargets,
        };
      },
    );

    const rankedCandidates = [...candidates].sort((a, b) => {
      const scoreDelta = b.reliabilityScore - a.reliabilityScore;
      if (scoreDelta !== 0) return scoreDelta;
      return a.sportPriorityIndex - b.sportPriorityIndex;
    });
    const preferred =
      rankedCandidates.find(
        (item) =>
          item.recommendationHint === 'prefer_zone' ||
          item.recommendationHint === 'prefer_fixed',
      ) ??
      rankedCandidates.find((item) => item.hasZones) ??
      rankedCandidates.find(
        (item) => item.hasFixedAnchor && item.recentCoverage.status !== 'none',
      ) ??
      null;

    const expression: WorkoutIntensityExpression = preferred?.hasZones
      ? 'zone'
      : preferred?.hasFixedAnchor && preferred.recentCoverage.status !== 'none'
        ? 'fixed'
        : 'duration_only';
    const primaryMetric =
      expression === 'duration_only' ? null : (preferred?.metric ?? null);
    const dslExamples =
      primaryMetric && expression === 'zone'
        ? [
            `work 30m ${this.getIntensityDslToken(primaryMetric)} ${
              zoneHintsByGoal.easy[zoneHintsByGoal.easy.length - 1] ?? 'z2'
            }`,
            `work 6m ${this.getIntensityDslToken(primaryMetric)} ${
              zoneHintsByGoal.hard[0] ?? 'z4'
            }`,
          ]
        : expression === 'duration_only'
          ? ['work 30m', 'recovery 5m']
          : [
              `Use profile.current / metric.current / bests.summary to derive conservative fixed ${this.getIntensityDslToken(
                primaryMetric ?? 'pace',
              )} values before writing DSL.`,
            ];

    const recommendationReasons =
      preferred && expression !== 'duration_only'
        ? [
            ...preferred.reasons,
            `selected expression: ${expression}`,
            `fallback order: ${rankedCandidates
              .map((item) => item.metric)
              .join(' -> ')}`,
          ]
        : [
            'No metric has both a reliable zone/fixed anchor and executable recent evidence.',
            'Keep machine DSL duration-only and put effort/RPE cues in notes.',
          ];

    const selectedZoneRanges =
      preferred?.hasZones && primaryMetric
        ? {
            metric: primaryMetric,
            benchmark: zoneRanges[primaryMetric].benchmark ?? null,
            unit:
              primaryMetric === 'pace'
                ? ('sec_per_meter' as const)
                : primaryMetric === 'heartRate'
                  ? ('bpm' as const)
                  : ('watt' as const),
            zones: zoneRanges[primaryMetric].zones.map((zone) => ({
              order: zone.order,
              ...(zone.name ? { name: zone.name } : {}),
              ...(zone.min != null ? { min: zone.min } : {}),
              ...(zone.max != null ? { max: zone.max } : {}),
            })),
          }
        : null;

    return {
      kind: 'workout_intensity_strategy',
      sportType,
      workoutGoal,
      anchorDate: anchor.format('YYYY-MM-DD'),
      range: {
        from: rangeStart.format('YYYY-MM-DD'),
        to: rangeEnd.format('YYYY-MM-DD'),
        weeks,
      },
      recentData: {
        activityCount: activities.length,
        metrics: coverage,
      },
      thresholds,
      zoneHintsByGoal,
      selectedZoneRanges,
      candidates,
      recommendation: {
        primaryMetric,
        expression,
        fallbackOrder: rankedCandidates.map((item) => item.metric),
        dslExamples,
        reasons: recommendationReasons,
        notesGuidance:
          expression === 'duration_only'
            ? [
                'Use RPE, talk-test, breathing, or relaxed/controlled effort cues in notes.',
                'Tell the athlete personalization improves after syncing data or setting zones.',
              ]
            : [
                'Keep human execution cues in notes; keep workouts[].text parseable DSL only.',
                'For easy/recovery work, prefer the low zone hints; for quality intervals, use the hard zone hints only for work reps.',
              ],
      },
      decisionRubric: [
        'Choose the metric the athlete can execute, not only the sport default.',
        'Prefer zone DSL when the chosen metric has configured zones and recent coverage is usable/strong, or when no recent activities exist but zones are explicitly configured.',
        'If a sport-default metric has zones but no recent data while another metric has usable data, choose the usable metric.',
        'Use fixed bpm/W/pace only when zones are missing but a concrete threshold/best/current metric exists; derive values conservatively from profile.current, metric.current, or bests.summary.',
        'If no reliable HR/power/pace anchor exists, keep workout text duration-only and put RPE/talk-test guidance in notes.',
      ],
    };
  }

  /**
   * activity.recent
   * 获取最近活动的简要摘要列表（供模型快速了解近期训练概况）
   */
  async recentActivities(
    ctx: AiToolContext,
    input: { limit?: number; sportType?: string },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }
    const limitRaw = typeof input?.limit === 'number' ? input.limit : 10;
    const limit = Math.max(1, Math.min(20, Math.floor(limitRaw)));
    const sportType = String(input?.sportType ?? '').trim() || undefined;

    const [activities, profile] = await Promise.all([
      this.activityQuery.getRecentActivitiesForAi({
        userId,
        limit,
        sportType,
      }),
      ctx.userService.getComposedUserProfile(userId, SportType.RUN),
    ]);
    const thumbUrlMap = await this.getActivityThumbUrlMap(userId, activities);

    return {
      items: activities.map((a) =>
        this.mapActivityListItem(a, {
          mapThumbnailUrl: thumbUrlMap.get(a.id) ?? undefined,
          vo2MaxPreference: profile?.defaultVdotSource,
          vo2MaxCorrectionFactor: profile?.vo2maxCorrectionFactor,
        }),
      ),
    };
  }

  /**
   * activity.day_view — 单日已完成活动摘要（与 activity.recent 字段对齐）
   */
  async activitiesDayView(
    ctx: AiToolContext,
    input: { date: string; sportType?: string },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }
    const day = dayjs(input.date).startOf('day');
    if (!day.isValid()) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.invalid_date_range') ?? 'Invalid date',
      });
    }
    const dateStr = day.format('YYYY-MM-DD');
    const from = day.toDate();
    const to = day.endOf('day').toDate();
    const sportType = String(input?.sportType ?? '').trim() || undefined;

    const [rows, profile] = await Promise.all([
      this.activityQuery.searchActivitiesForAi({
        userId,
        limit: 20,
        sportType,
        from,
        to,
        sortBy: 'startTime',
        order: 'asc',
      }),
      ctx.userService.getComposedUserProfile(userId, SportType.RUN),
    ]);
    const thumbUrlMap = await this.getActivityThumbUrlMap(userId, rows);

    const items = rows.map((a) =>
      this.mapActivityListItem(a, {
        mapThumbnailUrl: thumbUrlMap.get(a.id) ?? undefined,
        vo2MaxPreference: profile?.defaultVdotSource,
        vo2MaxCorrectionFactor: profile?.vo2maxCorrectionFactor,
      }),
    );

    return {
      kind: 'activity_day_view' as const,
      date: dateStr,
      items,
    };
  }

  /**
   * activity.search
   * 根据用户口语里的时间/关键词先定位训练，再交给 activity.byHashId 深挖
   */
  async activitySearch(
    ctx: AiToolContext,
    input: {
      text?: string;
      sportType?: string;
      from?: string;
      to?: string;
      limit?: number;
      sortBy?: 'startTime' | 'distance' | 'duration' | 'load';
      order?: 'asc' | 'desc';
    },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    const from = input?.from ? dayjs(input.from).startOf('day') : undefined;
    const to = input?.to ? dayjs(input.to).endOf('day') : undefined;
    if (
      (from && !from.isValid()) ||
      (to && !to.isValid()) ||
      (from && to && to.isBefore(from))
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.invalid_date_range') ?? 'Invalid date range',
      });
    }

    const limit = Math.max(1, Math.min(20, Math.floor(input?.limit ?? 8)));
    const rows = await this.activityQuery.searchActivitiesForAi({
      userId,
      limit,
      sportType: input?.sportType,
      search: input?.text,
      from: from?.toDate(),
      to: to?.toDate(),
      sortBy: input?.sortBy,
      order: input?.order,
    });

    return {
      items: rows.map((a) =>
        this.mapActivityListItem(a, { variant: 'search' }),
      ),
    };
  }

  /**
   * metric.history
   * 查询用户 body / fitness 指标的历史变化，如体重、VO2max、FTP、CP 等
   */
  async metricHistory(
    ctx: AiToolContext,
    input: {
      metric: string;
      source?: 'auto' | 'manual';
      sportType?: string;
      from?: string;
      to?: string;
      limit?: number;
    },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    const spec = this.resolveMetricHistorySpec(input?.metric);
    if (!spec) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: `Unsupported metric: ${String(input?.metric ?? '').trim() || 'unknown'}`,
      });
    }

    const { from, to } = this.parseHistoryRange(ctx, input);
    const limit = this.clampHistoryLimit(input?.limit);

    if (spec.category === 'body') {
      const rows = await this.users(ctx)
        .bodyMetrics()
        .findMany({
          where: {
            userId,
            type: spec.bodyType,
            ...(from || to
              ? {
                  effectiveDate: {
                    ...(from ? { gte: from.toDate() } : {}),
                    ...(to ? { lte: to.toDate() } : {}),
                  },
                }
              : {}),
          },
          orderBy: { effectiveDate: 'desc' },
          take: limit + 1,
          select: { id: true, effectiveDate: true, value: true },
        });

      const truncated = rows.length > limit;
      const points = rows
        .slice(0, limit)
        .reverse()
        .map((row) => {
          const value = Number(row.value);
          return Number.isFinite(value)
            ? {
                id: row.id,
                date: dayjs(row.effectiveDate).format('YYYY-MM-DD'),
                value: round(value, spec.decimals),
              }
            : null;
        })
        .filter(Boolean) as Array<{ id: string; date: string; value: number }>;

      return {
        metric: spec.metric,
        category: spec.category,
        resolvedMetricType: spec.bodyType,
        source: spec.source,
        unit: spec.unit,
        range: {
          from: from?.format('YYYY-MM-DD'),
          to: to?.format('YYYY-MM-DD'),
        },
        truncated,
        summary: this.buildSeriesSummary(points, spec.decimals),
        points,
      };
    }

    const sportType =
      spec.fitnessType === UserFitnessMetricType.VO2_MAX
        ? SportType.UNKNOWN
        : this.normalizeSportType(input?.sportType);

    if (spec.requiresSportType && !sportType) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.query_condition_error') ??
          'Missing sport type',
      });
    }

    const desiredSource = spec.sourceLocked
      ? spec.source
      : input?.source === 'auto' || input?.source === 'manual'
        ? input.source
        : spec.source;
    const source =
      desiredSource === 'manual' ? MetricSource.MANUAL : MetricSource.ESTIMATED;

    const rows = await this.users(ctx)
      .fitnessMetrics()
      .findMany({
        where: {
          userId,
          type: spec.fitnessType,
          source,
          sport: sportType,
          ...(from || to
            ? {
                recordedAt: {
                  ...(from ? { gte: from.toDate() } : {}),
                  ...(to ? { lte: to.toDate() } : {}),
                },
              }
            : {}),
        },
        orderBy: { recordedAt: 'desc' },
        take: limit + 1,
        select: { id: true, recordedAt: true, value: true },
      });

    const truncated = rows.length > limit;
    const points = rows
      .slice(0, limit)
      .reverse()
      .map((row) => ({
        id: row.id,
        date: dayjs(row.recordedAt).format('YYYY-MM-DD'),
        value: round(row.value, spec.decimals),
      }));

    const normalizedSource: 'auto' | 'manual' =
      source === MetricSource.MANUAL ? 'manual' : 'auto';

    return {
      metric: spec.metric,
      category: spec.category,
      resolvedMetricType: spec.fitnessType,
      source: normalizedSource,
      sportType: sportType === SportType.UNKNOWN ? undefined : sportType,
      unit: spec.unit,
      range: {
        from: from?.format('YYYY-MM-DD'),
        to: to?.format('YYYY-MM-DD'),
      },
      truncated,
      summary: this.buildSeriesSummary(points, spec.decimals),
      points,
    };
  }

  /**
   * docs.search
   * 检索官方文档，用于指标解释/方法说明/FAQ
   */
  async docsSearch(
    ctx: AiToolContext,
    input: {
      query: string;
      locale?: 'zh' | 'en';
      topK?: number;
      section?: string;
    },
  ) {
    const query = String(input?.query ?? '').trim();
    if (!query) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: ctx.i18n.t('common.error.missing_prompt') ?? 'Missing query',
      });
    }

    const locale: 'zh' | 'en' =
      input?.locale === 'en' || ctx.lang === 'en' ? 'en' : 'zh';
    const topK = Math.max(1, Math.min(8, Math.floor(input?.topK ?? 5)));
    return {
      query,
      locale,
      items: await searchCoachDocs({
        query,
        locale,
        topK,
        section: input?.section,
      }),
    };
  }

  /**
   * docs.get
   * 获取单篇官方文档正文（纯文本）
   */
  async docsGet(
    ctx: AiToolContext,
    input: { ref: string; locale?: 'zh' | 'en'; maxChars?: number },
  ) {
    const ref = String(input?.ref ?? '').trim();
    if (!ref) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.missing_prompt') ?? 'Missing docs ref',
      });
    }

    const locale: 'zh' | 'en' =
      input?.locale === 'en' || ctx.lang === 'en' ? 'en' : 'zh';
    return await getCoachDocByRef({
      ref,
      locale,
      maxChars: input?.maxChars,
    });
  }

  /**
   * training.readiness
   * 聚合当前训练新鲜度/疲劳判断最常用的“事实快照”
   */
  async trainingReadiness(
    ctx: AiToolContext,
    input: { asOf?: string; sportType?: string },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    if (this.trainingInsights) {
      return this.trainingInsights.getSnapshot({ userId, ...input });
    }

    const asOf = input?.asOf
      ? dayjs(input.asOf).startOf('day')
      : dayjs().startOf('day');
    if (!asOf.isValid()) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.invalid_date_range') ?? 'Invalid date range',
      });
    }

    const sportType = this.normalizeSportType(input?.sportType);
    const loadField = this.getPmcLoadField(sportType);
    const fetchFrom = asOf.subtract(55, 'day').startOf('day');

    const pmcRecords = await ctx.pmc.listRange(
      userId,
      fetchFrom.toDate(),
      asOf.endOf('day').toDate(),
      { orderBy: 'asc' },
    );

    const records = pmcRecords.map((r) => {
      const load = Number(r[loadField] ?? 0);
      return {
        date: dayjs(r.date).startOf('day'),
        load: Number.isFinite(load) ? load : 0,
        ATL: typeof r.ATL === 'number' ? r.ATL : undefined,
        CTL: typeof r.CTL === 'number' ? r.CTL : undefined,
        TSB: typeof r.TSB === 'number' ? r.TSB : undefined,
      };
    });

    const sumWindow = (days: number, offsetDays = 0) => {
      const end = asOf.subtract(offsetDays, 'day').startOf('day');
      const start = end.subtract(days - 1, 'day').startOf('day');
      const items = records.filter(
        (r) => !r.date.isBefore(start) && !r.date.isAfter(end),
      );
      const totalLoad = items.reduce((sum, item) => sum + item.load, 0);
      const activeDays = items.filter((item) => item.load >= 10).length;
      return {
        totalLoad: round(totalLoad, 1),
        avgDailyLoad: round(totalLoad / Math.max(days, 1), 1),
        activeDays,
      };
    };

    const lastRecord = records.at(-1);
    const currentWeekStart = asOf.startOf('isoWeek');
    const previousWeekStart = currentWeekStart.subtract(1, 'week');
    const previousWeekEnd = currentWeekStart.subtract(1, 'day').endOf('day');
    const currentWeekLoad = round(
      records
        .filter(
          (r) =>
            !r.date.isBefore(currentWeekStart) &&
            !r.date.isAfter(asOf.endOf('day')),
        )
        .reduce((sum, r) => sum + r.load, 0),
      1,
    );
    const previousWeekLoad = round(
      records
        .filter(
          (r) =>
            !r.date.isBefore(previousWeekStart) &&
            !r.date.isAfter(previousWeekEnd),
        )
        .reduce((sum, r) => sum + r.load, 0),
      1,
    );

    const recentActivities = await this.activityQuery.getRecentActivitiesForAi({
      userId,
      limit: 3,
      sportType,
    });

    return {
      asOf: asOf.format('YYYY-MM-DD'),
      sportType,
      loadField,
      latestAvailableDate: lastRecord?.date?.format('YYYY-MM-DD'),
      current: {
        ATL:
          typeof lastRecord?.ATL === 'number'
            ? round(lastRecord.ATL, 1)
            : undefined,
        CTL:
          typeof lastRecord?.CTL === 'number'
            ? round(lastRecord.CTL, 1)
            : undefined,
        TSB:
          typeof lastRecord?.TSB === 'number'
            ? round(lastRecord.TSB, 1)
            : undefined,
        AC_ratio:
          typeof lastRecord?.ATL === 'number' &&
          typeof lastRecord?.CTL === 'number' &&
          lastRecord.CTL > 0
            ? round(lastRecord.ATL / lastRecord.CTL, 2)
            : undefined,
      },
      windows: {
        last7: sumWindow(7),
        last14: sumWindow(14),
        last28: sumWindow(28),
      },
      deltas: {
        load7VsPrev7: round(
          sumWindow(7).totalLoad - sumWindow(7, 7).totalLoad,
          1,
        ),
        load14VsPrev14: round(
          sumWindow(14).totalLoad - sumWindow(14, 14).totalLoad,
          1,
        ),
        load28VsPrev28: round(
          sumWindow(28).totalLoad - sumWindow(28, 28).totalLoad,
          1,
        ),
      },
      week: {
        currentLoad: currentWeekLoad,
        previousLoad: previousWeekLoad,
        delta: round(currentWeekLoad - previousWeekLoad, 1),
        deltaPct:
          previousWeekLoad > 0
            ? round(
                ((currentWeekLoad - previousWeekLoad) / previousWeekLoad) * 100,
                1,
              )
            : undefined,
      },
      recentActivities: recentActivities.map((a) => ({
        hashId: a.hashId,
        sportType: String(a.sportType),
        startTime: a.startTime ? dayjs(a.startTime).toISOString() : undefined,
        durationMin:
          typeof a.timerTime === 'number'
            ? round(a.timerTime / 60, 1)
            : typeof a.elapsedTime === 'number'
              ? round(a.elapsedTime / 60, 1)
              : undefined,
        distanceKm:
          typeof a.distance === 'number'
            ? round(a.distance / 1000, 2)
            : undefined,
        avgHr:
          typeof a.avgHeartRate === 'number'
            ? round(a.avgHeartRate)
            : undefined,
        avgPower:
          typeof a.avgPower === 'number' ? round(a.avgPower) : undefined,
        load:
          typeof a.coggan?.bikeStress === 'number'
            ? round(a.coggan.bikeStress)
            : typeof a.trimp?.trimp100 === 'number'
              ? round(a.trimp.trimp100)
              : undefined,
      })),
    };
  }

  /**
   * training.baseline
   * 给计划生成使用的最近多周训练基线，默认排除当前未完成 ISO 周。
   */
  async trainingBaseline(
    ctx: AiToolContext,
    input: {
      asOf?: string;
      sportType?: string;
      weeks?: number;
      excludeCurrentWeek?: boolean;
    },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    const anchor = input?.asOf
      ? dayjs(input.asOf).startOf('day')
      : dayjs().startOf('day');
    if (!anchor.isValid()) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.invalid_date_range') ?? 'Invalid date range',
      });
    }

    const weeks = Math.max(
      2,
      Math.min(8, Math.floor(Number(input?.weeks ?? 4) || 4)),
    );
    const excludedCurrentWeek = input?.excludeCurrentWeek !== false;
    const sportType = this.normalizeSportType(input?.sportType);
    const loadField = this.getPmcLoadField(sportType);
    const lastWeekStart = excludedCurrentWeek
      ? anchor.startOf('isoWeek').subtract(1, 'week')
      : anchor.startOf('isoWeek');
    const rangeStart = lastWeekStart
      .subtract(weeks - 1, 'week')
      .startOf('isoWeek');
    const rangeEnd = lastWeekStart.endOf('isoWeek');
    const weekRanges = Array.from({ length: weeks }, (_, index) => {
      const start = rangeStart.add(index, 'week').startOf('isoWeek');
      return {
        start,
        end: start.endOf('isoWeek'),
      };
    });

    const [pmcRows, activities] = await Promise.all([
      ctx.pmc.listRange(userId, rangeStart.toDate(), rangeEnd.toDate(), {
        orderBy: 'asc',
      }),
      this.activities(ctx).findMany({
        where: readyActivityWhere({
          userId,
          startTime: {
            gte: rangeStart.toDate(),
            lte: rangeEnd.toDate(),
          },
          ...(sportType ? { sportType } : {}),
        }),
        orderBy: { startTime: 'desc' },
        include: { trimp: true, coggan: true },
      }),
    ]);

    const activityDurationMin = (row: ActivityDurationRow) => {
      const seconds =
        typeof row?.timerTime === 'number'
          ? row.timerTime
          : typeof row?.elapsedTime === 'number'
            ? row.elapsedTime
            : 0;
      return seconds / 60;
    };
    const activityDistanceKm = (row: ActivityDurationRow) =>
      Number(row?.distance ?? 0) / 1000;

    const summarizeWeek = (range: { start: dayjs.Dayjs; end: dayjs.Dayjs }) => {
      const startMs = range.start.valueOf();
      const endMs = range.end.valueOf();
      const weekPmcRows = pmcRows.filter((row) => {
        const time = dayjs(row?.date).valueOf();
        return time >= startMs && time <= endMs;
      });
      const weekActivities = activities.filter((row) => {
        const time = dayjs(row?.startTime).valueOf();
        return time >= startMs && time <= endMs;
      });
      const totalLoad = weekPmcRows.reduce(
        (sum, row) => sum + Number(row[loadField] ?? row.dailyValue ?? 0),
        0,
      );
      const activeDays = weekPmcRows.filter(
        (row) => Number(row[loadField] ?? row.dailyValue ?? 0) >= 10,
      ).length;
      const totalDurationMin = weekActivities.reduce(
        (sum, row) => sum + activityDurationMin(row),
        0,
      );
      const totalDistanceKm = weekActivities.reduce(
        (sum, row) => sum + activityDistanceKm(row),
        0,
      );

      return {
        from: range.start.format('YYYY-MM-DD'),
        to: range.end.format('YYYY-MM-DD'),
        isoWeek: range.start.isoWeek(),
        isoWeekYear: range.start.isoWeekYear(),
        totalLoad: round(totalLoad, 1),
        activeDays,
        activityCount: weekActivities.length,
        totalDurationMin: round(totalDurationMin, 1),
        totalDistanceKm: round(totalDistanceKm, 2),
        longestSessionMin: round(
          weekActivities.reduce(
            (max, row) => Math.max(max, activityDurationMin(row)),
            0,
          ),
          1,
        ),
        longestDistanceKm: round(
          weekActivities.reduce(
            (max, row) => Math.max(max, activityDistanceKm(row)),
            0,
          ),
          2,
        ),
      };
    };

    const weekSummaries = weekRanges.map(summarizeWeek);
    const activeWeeks = weekSummaries.filter(
      (week) => week.activityCount > 0 || week.totalLoad > 0,
    );
    const weeksWithLoad = weekSummaries.filter(
      (week) => week.totalLoad > 0,
    ).length;
    const weeksWithActivities = weekSummaries.filter(
      (week) => week.activityCount > 0,
    ).length;

    const averageWeeks = (items: typeof weekSummaries) => {
      const divisor = Math.max(items.length, 1);
      return {
        totalLoad: round(
          items.reduce((sum, week) => sum + week.totalLoad, 0) / divisor,
          1,
        ),
        activeDays: round(
          items.reduce((sum, week) => sum + week.activeDays, 0) / divisor,
          1,
        ),
        activityCount: round(
          items.reduce((sum, week) => sum + week.activityCount, 0) / divisor,
          1,
        ),
        totalDurationMin: round(
          items.reduce((sum, week) => sum + week.totalDurationMin, 0) / divisor,
          1,
        ),
        totalDistanceKm: round(
          items.reduce((sum, week) => sum + week.totalDistanceKm, 0) / divisor,
          2,
        ),
      };
    };

    const peakWeek = weekSummaries.reduce<
      (typeof weekSummaries)[number] | null
    >((best, week) => {
      if (!best) return week;
      return week.totalLoad > best.totalLoad ? week : best;
    }, null);
    const longestActivity = activities.reduce<ActivityDurationRow | null>(
      (best, row) => {
        if (!best) return row;
        return activityDurationMin(row) > activityDurationMin(best)
          ? row
          : best;
      },
      null,
    );
    const midpoint = Math.floor(weekSummaries.length / 2);
    const firstHalf = weekSummaries.slice(0, midpoint);
    const secondHalf = weekSummaries.slice(midpoint);
    const avgLoad = (items: typeof weekSummaries) =>
      items.length > 0
        ? round(
            items.reduce((sum, week) => sum + week.totalLoad, 0) / items.length,
            1,
          )
        : 0;
    const firstHalfAvgLoad = avgLoad(firstHalf);
    const secondHalfAvgLoad = avgLoad(secondHalf);
    const loadDelta = round(secondHalfAvgLoad - firstHalfAvgLoad, 1);

    const personalizationReadiness: 'none' | 'sparse' | 'adequate' =
      activities.length === 0 || weeksWithActivities === 0
        ? 'none'
        : weeksWithActivities <= 1
          ? 'sparse'
          : 'adequate';

    return {
      sportType,
      loadField,
      anchorDate: anchor.format('YYYY-MM-DD'),
      range: {
        from: rangeStart.format('YYYY-MM-DD'),
        to: rangeEnd.format('YYYY-MM-DD'),
        weeks,
        excludedCurrentWeek,
      },
      coverage: {
        pmcDays: pmcRows.length,
        activityCount: activities.length,
        weeksWithLoad,
        weeksWithActivities,
      },
      personalizationReadiness,
      averageWeek: averageWeeks(weekSummaries),
      activeWeekAverage:
        activeWeeks.length > 0 ? averageWeeks(activeWeeks) : null,
      peakWeek:
        peakWeek && (peakWeek.totalLoad > 0 || peakWeek.activityCount > 0)
          ? peakWeek
          : null,
      longestSession: longestActivity
        ? {
            durationMin: round(activityDurationMin(longestActivity), 1),
            distanceKm: round(activityDistanceKm(longestActivity), 2),
            date: longestActivity.startTime
              ? dayjs(longestActivity.startTime).format('YYYY-MM-DD')
              : undefined,
            activityName: longestActivity.activityName ?? undefined,
          }
        : null,
      trend:
        firstHalf.length > 0 && secondHalf.length > 0
          ? {
              firstHalfAvgLoad,
              secondHalfAvgLoad,
              loadDelta,
              loadDeltaPct:
                firstHalfAvgLoad > 0
                  ? round((loadDelta / firstHalfAvgLoad) * 100, 1)
                  : undefined,
            }
          : null,
      weeks: weekSummaries,
    };
  }

  /**
   * training.weekSummary
   * 给出某一周的训练摘要，方便回答“这周练得怎么样”
   */
  async trainingWeekSummary(
    ctx: AiToolContext,
    input: { asOf?: string; sportType?: string; weekOffset?: number },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    const anchor = input?.asOf
      ? dayjs(input.asOf).startOf('day')
      : dayjs().startOf('day');
    if (!anchor.isValid()) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.invalid_date_range') ?? 'Invalid date range',
      });
    }

    const weekOffset = Math.max(
      0,
      Math.floor(Number(input?.weekOffset ?? 0) || 0),
    );
    const sportType = this.normalizeSportType(input?.sportType);
    const loadField = this.getPmcLoadField(sportType);
    const weekStart = anchor.subtract(weekOffset, 'week').startOf('isoWeek');
    const weekEnd = weekStart.endOf('isoWeek');
    const previousWeekStart = weekStart.subtract(1, 'week').startOf('isoWeek');
    const previousWeekEnd = weekStart.subtract(1, 'day').endOf('day');

    const [pmcRows, activities, previousPmcRows, previousActivities] =
      await Promise.all([
        ctx.pmc.listRange(userId, weekStart.toDate(), weekEnd.toDate(), {
          orderBy: 'asc',
        }),
        this.activities(ctx).findMany({
          where: readyActivityWhere({
            userId,
            startTime: {
              gte: weekStart.toDate(),
              lte: weekEnd.toDate(),
            },
            ...(sportType ? { sportType } : {}),
          }),
          orderBy: { startTime: 'desc' },
          take: 12,
          include: { trimp: true, coggan: true },
        }),
        ctx.pmc.listRange(
          userId,
          previousWeekStart.toDate(),
          previousWeekEnd.toDate(),
          { orderBy: 'asc' },
        ),
        this.activities(ctx).findMany({
          where: readyActivityWhere({
            userId,
            startTime: {
              gte: previousWeekStart.toDate(),
              lte: previousWeekEnd.toDate(),
            },
            ...(sportType ? { sportType } : {}),
          }),
          orderBy: { startTime: 'desc' },
          take: 12,
          include: { trimp: true, coggan: true },
        }),
      ]);

    const summarizePmcRows = (rows: PMCData[], days = 7) => {
      const totalLoad = rows.reduce(
        (sum, row) => sum + Number(row[loadField] ?? row.dailyValue ?? 0),
        0,
      );
      const activeDays = rows.filter(
        (row) => Number(row[loadField] ?? row.dailyValue ?? 0) >= 10,
      ).length;
      const last = rows.at(-1);
      return {
        totalLoad: round(totalLoad, 1),
        avgDailyLoad: round(totalLoad / Math.max(days, 1), 1),
        activeDays,
        restDays: Math.max(days - activeDays, 0),
        ATL: typeof last?.ATL === 'number' ? round(last.ATL, 1) : undefined,
        CTL: typeof last?.CTL === 'number' ? round(last.CTL, 1) : undefined,
        TSB: typeof last?.TSB === 'number' ? round(last.TSB, 1) : undefined,
        AC_ratio:
          typeof last?.ATL === 'number' &&
          typeof last?.CTL === 'number' &&
          last.CTL > 0
            ? round(last.ATL / last.CTL, 2)
            : undefined,
      };
    };

    const summarizeActivities = (rows: ActivityDurationRow[]) => {
      const totalDurationMin = rows.reduce((sum, row) => {
        const seconds =
          typeof row?.timerTime === 'number'
            ? row.timerTime
            : typeof row?.elapsedTime === 'number'
              ? row.elapsedTime
              : 0;
        return sum + seconds / 60;
      }, 0);
      const totalDistanceKm = rows.reduce(
        (sum, row) => sum + Number(row?.distance ?? 0) / 1000,
        0,
      );
      return {
        activityCount: rows.length,
        totalDurationMin: round(totalDurationMin, 1),
        totalDistanceKm: round(totalDistanceKm, 2),
        avgSessionDurationMin:
          rows.length > 0 ? round(totalDurationMin / rows.length, 1) : 0,
        longestSessionMin: round(
          rows.reduce((max, row) => {
            const seconds =
              typeof row?.timerTime === 'number'
                ? row.timerTime
                : typeof row?.elapsedTime === 'number'
                  ? row.elapsedTime
                  : 0;
            return Math.max(max, seconds / 60);
          }, 0),
          1,
        ),
        longestDistanceKm: round(
          rows.reduce(
            (max, row) => Math.max(max, Number(row?.distance ?? 0) / 1000),
            0,
          ),
          2,
        ),
      };
    };

    const weekPmc = summarizePmcRows(pmcRows, 7);
    const previousWeekPmc = summarizePmcRows(previousPmcRows, 7);
    const weekActivities = summarizeActivities(activities);
    const previousWeekActivities = summarizeActivities(previousActivities);

    return {
      sportType,
      loadField,
      anchorDate: anchor.format('YYYY-MM-DD'),
      week: {
        from: weekStart.format('YYYY-MM-DD'),
        to: weekEnd.format('YYYY-MM-DD'),
        isoWeek: weekStart.isoWeek(),
        isoWeekYear: weekStart.isoWeekYear(),
      },
      summary: {
        ...weekPmc,
        ...weekActivities,
        loadPerActiveDay:
          weekPmc.activeDays > 0
            ? round(weekPmc.totalLoad / weekPmc.activeDays, 1)
            : 0,
      },
      comparison: {
        previousWeek: {
          from: previousWeekStart.format('YYYY-MM-DD'),
          to: previousWeekEnd.format('YYYY-MM-DD'),
          totalLoad: previousWeekPmc.totalLoad,
          activityCount: previousWeekActivities.activityCount,
          totalDurationMin: previousWeekActivities.totalDurationMin,
          totalDistanceKm: previousWeekActivities.totalDistanceKm,
        },
        loadDelta: round(weekPmc.totalLoad - previousWeekPmc.totalLoad, 1),
        loadDeltaPct:
          previousWeekPmc.totalLoad > 0
            ? round(
                ((weekPmc.totalLoad - previousWeekPmc.totalLoad) /
                  previousWeekPmc.totalLoad) *
                  100,
                1,
              )
            : undefined,
        activityDelta:
          weekActivities.activityCount - previousWeekActivities.activityCount,
        durationDeltaMin: round(
          weekActivities.totalDurationMin -
            previousWeekActivities.totalDurationMin,
          1,
        ),
        distanceDeltaKm: round(
          weekActivities.totalDistanceKm -
            previousWeekActivities.totalDistanceKm,
          2,
        ),
      },
      activities: activities.map((a) => ({
        hashId: a.hashId,
        activityName: a.activityName ?? undefined,
        sportType: String(a.sportType),
        startTime: a.startTime ? dayjs(a.startTime).toISOString() : undefined,
        durationMin:
          typeof a.timerTime === 'number'
            ? round(a.timerTime / 60, 1)
            : typeof a.elapsedTime === 'number'
              ? round(a.elapsedTime / 60, 1)
              : undefined,
        distanceKm:
          typeof a.distance === 'number'
            ? round(a.distance / 1000, 2)
            : undefined,
        avgHr:
          typeof a.avgHeartRate === 'number'
            ? round(a.avgHeartRate)
            : undefined,
        avgPower:
          typeof a.avgPower === 'number' ? round(a.avgPower) : undefined,
        load:
          typeof a.coggan?.bikeStress === 'number'
            ? round(a.coggan.bikeStress)
            : typeof a.trimp?.trimp100 === 'number'
              ? round(a.trimp.trimp100)
              : undefined,
      })),
    };
  }

  /**
   * bests.summary
   * 获取最佳距离 / 最佳固定时长表现摘要
   */
  async bestsSummary(
    ctx: AiToolContext,
    input: {
      sportType?: string;
      from?: string;
      to?: string;
      mode?: 'distance' | 'time';
      targets?: number[];
      limitPerTarget?: number;
    },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    const sportType =
      this.normalizeSportType(input?.sportType) ?? SportType.RUN;
    const mode: 'distance' | 'time' =
      input?.mode === 'time' ? 'time' : 'distance';
    const limitPerTarget = Math.max(
      1,
      Math.min(5, Math.floor(Number(input?.limitPerTarget ?? 1) || 1)),
    );

    const { from, to } = this.parseHistoryRange(ctx, {
      from: input?.from,
      to: input?.to,
    });

    const result = await this.paceService.getDistancePerformanceByRanges(
      userId,
      sportType,
      [
        {
          start: from?.format('YYYY-MM-DD'),
          end: to?.format('YYYY-MM-DD'),
        },
      ],
      input?.targets?.length ? input.targets : undefined,
      mode,
      limitPerTarget,
    );

    const firstRange = result[0];
    const entries = Object.entries(firstRange?.values ?? {})
      .map(([key, value]) => {
        if (!value) return null;
        return {
          key,
          paceSec: round(value.paceSec, 1),
          timeSec: round(value.timeSec, 1),
          paceBaseM:
            value.paceBaseM ?? (sportType === SportType.SWIM ? 100 : 1000),
          activityId: value.activityId ?? undefined,
          activityTime: value.activityTime ?? undefined,
          topResults: (firstRange?.topValues?.[key] ?? []).map((item) => ({
            paceSec: round(item.paceSec, 1),
            timeSec: round(item.timeSec, 1),
            paceBaseM:
              item.paceBaseM ?? (sportType === SportType.SWIM ? 100 : 1000),
            activityId: item.activityId ?? undefined,
            activityTime: item.activityTime ?? undefined,
          })),
        };
      })
      .filter(Boolean);

    return {
      sportType,
      mode,
      range: {
        from: from?.format('YYYY-MM-DD'),
        to: to?.format('YYYY-MM-DD'),
      },
      itemCount: entries.length,
      items: entries,
    };
  }

  /**
   * pmc.range
   * 查询指定日期范围内的 PMC（ATL/CTL/TSB 与 dailyValue），并按日/周聚合输出
   */
  async pmcRange(
    ctx: AiToolContext,
    input: { from: string; to: string; granularity?: 'day' | 'week' },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    const from = dayjs(input?.from).startOf('day');
    const to = dayjs(input?.to).startOf('day');
    if (!from.isValid() || !to.isValid() || to.isBefore(from)) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.invalid_date_range') ?? 'Invalid date range',
      });
    }

    const days = to.diff(from, 'day') + 1;
    const maxDays = 365;
    if (days > maxDays) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.date_range_too_large') ??
          `Date range too large (max ${maxDays} days)`,
      });
    }

    const granularity: 'day' | 'week' = (() => {
      if (input?.granularity === 'week') return 'week';
      if (days > 42) return 'week';
      return 'day';
    })();

    const records = await ctx.pmc.listRange(
      userId,
      from.toDate(),
      to.endOf('day').toDate(),
      { orderBy: 'asc' },
    );

    if (granularity === 'day') {
      const points = records.map((r) => ({
        date: dayjs(r.date).format('YYYY-MM-DD'),
        dailyValue: r.dailyValue ?? undefined,
        ATL: r.ATL ?? undefined,
        CTL: r.CTL ?? undefined,
        TSB: r.TSB ?? undefined,
      }));
      const activeDays = points.filter((p) => (p.dailyValue ?? 0) >= 10).length;
      const totalLoad = points.reduce((s, p) => s + (p.dailyValue ?? 0), 0);
      return {
        from: from.format('YYYY-MM-DD'),
        to: to.format('YYYY-MM-DD'),
        granularity,
        points,
        summary: {
          activeDays,
          restDays: days - activeDays,
          totalLoad: Number(totalLoad.toFixed(1)),
          avgDailyLoad: Number((totalLoad / Math.max(days, 1)).toFixed(1)),
        },
      };
    }

    const buckets = new Map<
      string,
      { dailyValueSum: number; last?: PMCData }
    >();
    for (const r of records) {
      const key = dayjs(r.date)
        .startOf('week')
        .add(1, 'day')
        .format('YYYY-MM-DD');
      const prev = buckets.get(key) ?? { dailyValueSum: 0, last: undefined };
      prev.dailyValueSum += r.dailyValue ?? 0;
      prev.last = r;
      buckets.set(key, prev);
    }
    const points = [...buckets.entries()].map(([date, v]) => ({
      date,
      dailyValue: Number(v.dailyValueSum.toFixed(1)),
      ATL: v.last?.ATL ?? undefined,
      CTL: v.last?.CTL ?? undefined,
      TSB: v.last?.TSB ?? undefined,
    }));
    const totalLoad = points.reduce((s, p) => s + (p.dailyValue ?? 0), 0);
    const activeDays = records.filter((r) => (r.dailyValue ?? 0) >= 10).length;
    return {
      from: from.format('YYYY-MM-DD'),
      to: to.format('YYYY-MM-DD'),
      granularity,
      points,
      summary: {
        activeDays,
        restDays: days - activeDays,
        totalLoad: Number(totalLoad.toFixed(1)),
        avgDailyLoad: Number((totalLoad / Math.max(days, 1)).toFixed(1)),
      },
    };
  }

  /**
   * training.aggregate
   *
   * 通用训练统计读取端口。模型只提交语义查询；聚合、单位、时区、覆盖率和
   * 完整性均由服务端确定。可视化工具也复用这里，避免模型自行拼数字。
   */
  async trainingAggregate(ctx: AiToolContext, input: TrainingAnalysisQuery) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    try {
      assertTrainingAnalysisQuery(input);
    } catch (error) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          error instanceof Error
            ? error.message
            : 'Invalid training analysis query',
      });
    }

    const userTimezone =
      (await ctx.userService.getPreferredTimezone(userId)) ?? 'UTC';
    const from = dayjs
      .tz(String(input?.from ?? ''), userTimezone)
      .startOf('day');
    const to = dayjs.tz(String(input?.to ?? ''), userTimezone).endOf('day');
    if (!from.isValid() || !to.isValid() || to.isBefore(from)) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.invalid_date_range') ?? 'Invalid date range',
      });
    }
    const rangeDays = to.startOf('day').diff(from.startOf('day'), 'day') + 1;
    if (rangeDays > MAX_TRAINING_ANALYSIS_DAYS) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.date_range_too_large') ??
          `Date range too large (max ${MAX_TRAINING_ANALYSIS_DAYS} days)`,
      });
    }

    const query: TrainingAnalysisQuery = {
      ...input,
      from: from.format('YYYY-MM-DD'),
      to: to.format('YYYY-MM-DD'),
      sportTypes: Array.from(
        new Set(
          (input.sportTypes ?? [])
            .map((sport) => this.normalizeSportType(sport))
            .filter((sport): sport is SportType => Boolean(sport)),
        ),
      ),
      limit:
        input.limit == null
          ? undefined
          : Math.max(1, Math.min(200, Math.floor(Number(input.limit) || 1))),
    };

    if (query.source === 'METRICS') {
      const hasFitnessMetric = query.measures.some(
        (measure) => !['WEIGHT', 'HEIGHT'].includes(measure),
      );
      query.metricSource = hasFitnessMetric
        ? (input.metricSource ?? 'ESTIMATED')
        : undefined;
      if (
        query.measures.every((measure) =>
          ['VO2_MAX', 'WEIGHT', 'HEIGHT'].includes(measure),
        )
      )
        query.sportTypes = [];
      return readTrainingMetricHistory({
        users: this.users(ctx),
        userId,
        query,
        timezone: userTimezone,
      });
    }

    if (query.source === 'PMC') {
      const records = await ctx.pmc.listRange(
        userId,
        from.toDate(),
        to.toDate(),
        { orderBy: 'asc' },
      );
      return buildPmcTrainingDataset({
        query,
        timezone: userTimezone,
        records,
      });
    }

    const explicitLimit = query.limit;
    const take = explicitLimit ?? MAX_TRAINING_ANALYSIS_ACTIVITIES + 1;
    const activities = await this.activities(ctx).findMany({
      where: readyActivityWhere({
        userId,
        startTime: { gte: from.toDate(), lte: to.toDate() },
        ...(query.sportTypes?.length
          ? { sportType: { in: query.sportTypes as SportType[] } }
          : {}),
      }),
      orderBy: { startTime: 'desc' },
      take,
      select: {
        hashId: true,
        activityName: true,
        sportType: true,
        startTime: true,
        timerTime: true,
        elapsedTime: true,
        distance: true,
        avgHeartRate: true,
        avgPower: true,
      },
    });
    const resourceTruncated =
      explicitLimit == null &&
      activities.length > MAX_TRAINING_ANALYSIS_ACTIVITIES;
    return buildActivityTrainingDataset({
      query,
      timezone: userTimezone,
      activities: activities.slice(
        0,
        explicitLimit ?? MAX_TRAINING_ANALYSIS_ACTIVITIES,
      ),
      truncated: resourceTruncated,
    });
  }

  /**
   * compare.blocks
   * 对比两个时间段的训练负荷与强度分布（HR/POWER zones）
   */
  async compareBlocks(
    ctx: AiToolContext,
    input: {
      periodA: { from: string; to: string };
      periodB: { from: string; to: string };
    },
  ) {
    const userId = ctx.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: ctx.i18n.t('common.error.missing_user_id'),
      });
    }

    const parsePeriod = (p: { from: string; to: string }) => ({
      from: dayjs(p.from).startOf('day'),
      to: dayjs(p.to).startOf('day'),
    });
    const a = parsePeriod(input.periodA);
    const b = parsePeriod(input.periodB);
    if (
      !a.from.isValid() ||
      !a.to.isValid() ||
      !b.from.isValid() ||
      !b.to.isValid()
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.invalid_date_range') ?? 'Invalid date range',
      });
    }
    if (a.to.isBefore(a.from) || b.to.isBefore(b.from)) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.invalid_date_range') ?? 'Invalid date range',
      });
    }

    const daysBetween = (from: dayjs.Dayjs, to: dayjs.Dayjs) =>
      to.diff(from, 'day') + 1;
    const daysA = daysBetween(a.from, a.to);
    const daysB = daysBetween(b.from, b.to);
    const maxDays = 120;
    if (daysA > maxDays || daysB > maxDays) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          ctx.i18n.t('common.error.date_range_too_large') ??
          `Date range too large (max ${maxDays} days per block)`,
      });
    }

    const [pmcA, pmcB] = await Promise.all([
      ctx.pmc.listRange(userId, a.from.toDate(), a.to.endOf('day').toDate()),
      ctx.pmc.listRange(userId, b.from.toDate(), b.to.endOf('day').toDate()),
    ]);

    const sumLoad = (xs: Array<{ dailyValue: number | null }>) =>
      xs.reduce((s, x) => s + (x.dailyValue ?? 0), 0);
    const countActive = (xs: Array<{ dailyValue: number | null }>) =>
      xs.filter((x) => (x.dailyValue ?? 0) >= 10).length;

    const totalLoadA = sumLoad(pmcA);
    const totalLoadB = sumLoad(pmcB);
    const activeDaysA = countActive(pmcA);
    const activeDaysB = countActive(pmcB);

    const zoneSummary = async (from: dayjs.Dayjs, to: dayjs.Dayjs) => {
      const acts = await this.activityQuery.getActivitiesWithZonesForAi({
        userId,
        from: from.toDate(),
        to: to.endOf('day').toDate(),
      });

      const byType = new Map<string, Map<string, number>>();
      const totalByType = new Map<string, number>();

      for (const a of acts) {
        for (const z of a.activityZones ?? []) {
          const zoneType = String(z.zoneType);
          const name = String(z.name ?? '');
          const duration = Number(z.duration ?? 0);
          if (!zoneType || !name || !Number.isFinite(duration) || duration <= 0)
            continue;
          const m = byType.get(zoneType) ?? new Map<string, number>();
          m.set(name, (m.get(name) ?? 0) + duration);
          byType.set(zoneType, m);
          totalByType.set(
            zoneType,
            (totalByType.get(zoneType) ?? 0) + duration,
          );
        }
      }

      const out: Array<{
        zoneType: 'HEART_RATE' | 'POWER';
        totals: ZoneTotals[];
      }> = [];
      for (const [zoneType, m] of byType.entries()) {
        if (zoneType !== 'HEART_RATE' && zoneType !== 'POWER') continue;
        const total = totalByType.get(zoneType) ?? 0;
        const totals = [...m.entries()]
          .map(([name, duration_s]) => ({
            name,
            duration_s: Math.round(duration_s),
            percent:
              total > 0 ? Math.round((duration_s / total) * 1000) / 10 : 0,
          }))
          .sort((x, y) => y.duration_s - x.duration_s)
          .slice(0, 10);
        out.push({ zoneType, totals });
      }
      return out;
    };

    const [zonesA, zonesB] = await Promise.all([
      zoneSummary(a.from, a.to),
      zoneSummary(b.from, b.to),
    ]);

    return {
      periodA: {
        from: a.from.format('YYYY-MM-DD'),
        to: a.to.format('YYYY-MM-DD'),
        days: daysA,
        totalLoad: Number(totalLoadA.toFixed(1)),
        activeDays: activeDaysA,
      },
      periodB: {
        from: b.from.format('YYYY-MM-DD'),
        to: b.to.format('YYYY-MM-DD'),
        days: daysB,
        totalLoad: Number(totalLoadB.toFixed(1)),
        activeDays: activeDaysB,
      },
      delta: {
        totalLoad: Number((totalLoadA - totalLoadB).toFixed(1)),
        activeDays: activeDaysA - activeDaysB,
        avgDailyLoad: Number(
          (
            totalLoadA / Math.max(daysA, 1) -
            totalLoadB / Math.max(daysB, 1)
          ).toFixed(1),
        ),
      },
      zones: { periodA: zonesA, periodB: zonesB },
    };
  }
}
