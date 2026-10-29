import {
  aiToolError,
  requireSignedInUser,
  type AiToolContext,
} from '../tool.types';
import { mutationToolFactory } from '../mutation-tool.factory';
import { METRIC_REVIEW_SKILLS } from '../tool-skill-scopes';
import {
  CoachActionType,
  SportType,
  UserFitnessMetricType,
  type Prisma,
} from '@prisma/client';
import { resolveAthleteClock } from '../athlete-relative-day';

const METRIC_ENUM = Object.values(UserFitnessMetricType);
const SPORT_ENUM = Object.values(SportType);

type Input = {
  /** UserFitnessMetricType，如 FTP、CP、LTHR */
  metricType: string;
  /** 主数值（瓦、bpm、sec/km 等，与产品手动阈值一致） */
  value: number;
  /** CS 等指标的第二分量（可选） */
  value2?: number;
  /** 来自用户明确指定或服务端已有数据可唯一判断的运动；VO2_MAX 请用 UNKNOWN */
  sportType?: string;
  /** 运动员本地日期 YYYY-MM-DD，默认运动员本地当天 */
  effectiveDate?: string;
};

type UiPayload = {
  metricType: string;
  sportType: string;
  value: number;
  effectiveDate: string;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function strictDateKey(value: string): string | null {
  if (!DATE_KEY.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

async function resolveEffectiveDate(ctx: AiToolContext, requested?: string) {
  const clock = await resolveAthleteClock({
    userService: ctx.userService,
    userId: ctx.session?.user?.id,
    now: ctx.currentTurnStartedAt,
  });
  const raw = String(requested ?? '').trim();
  return {
    effectiveDate: raw ? strictDateKey(raw) : clock.athleteLocalToday,
    athleteToday: clock.athleteLocalToday,
  };
}

function isMetricType(s: string): s is UserFitnessMetricType {
  return (METRIC_ENUM as string[]).includes(s);
}

function isBlankSport(raw: string | undefined): boolean {
  return raw === undefined || String(raw).trim() === '';
}

function parseSport(raw: string | undefined): SportType | null {
  if (isBlankSport(raw)) return null;
  const s = String(raw).trim();
  if (!(SPORT_ENUM as string[]).includes(s)) return null;
  return s as SportType;
}

function requiresSport(metricType: UserFitnessMetricType): boolean {
  return metricType !== UserFitnessMetricType.VO2_MAX;
}

const INFERABLE_SPORTS: SportType[] = [
  SportType.RUN,
  SportType.CYCLING,
  SportType.SWIM,
];
const SPORT_EVIDENCE_LOOKBACK_DAYS = 90;
const SPORT_EVIDENCE_MIN_ACTIVITIES = 5;
const SPORT_EVIDENCE_MIN_SHARE = 0.8;

function promptNamesSport(
  prompt: string | undefined,
  sport: SportType,
): boolean {
  const text = String(prompt ?? '').trim();
  if (!text) return false;
  switch (sport) {
    case SportType.RUN:
      return /(?:\bruns?\b|\brunning\b|跑步|跑步功率|跑步阈值)/i.test(text);
    case SportType.CYCLING:
      return /(?:\bcycling\b|\bcyclist\b|\bbike\b|\bbiking\b|骑行|自行车|单车)/i.test(
        text,
      );
    case SportType.SWIM:
      return /(?:\bswims?\b|\bswimming\b|游泳)/i.test(text);
    case SportType.STRETCHING:
      return /(?:\bstretch(?:ing)?\b|拉伸)/i.test(text);
    case SportType.UNKNOWN:
      return /(?:\bdefault\b|\bgeneral\b|默认档案|默认资料|通用档案)/i.test(
        text,
      );
  }
}

async function hasServerVerifiedSportEvidence(
  ctx: AiToolContext,
  metricType: UserFitnessMetricType,
  sport: SportType,
): Promise<boolean> {
  if (promptNamesSport(ctx.currentUserPrompt, sport)) return true;
  if (!INFERABLE_SPORTS.includes(sport)) return false;
  const athleteId = userId(ctx);
  if (!athleteId) return false;

  const recordedSports = await ctx.userService.listRecordedFitnessMetricSports(
    athleteId,
    metricType,
  );
  if (recordedSports.length === 1) return recordedSports[0] === sport;

  if (!ctx.activities) return false;
  const asOf = ctx.currentTurnStartedAt ?? new Date();
  const since = new Date(asOf);
  since.setUTCDate(since.getUTCDate() - SPORT_EVIDENCE_LOOKBACK_DAYS);
  const counts = await ctx.activities.countReadyActivitiesBySportSince(
    athleteId,
    since,
    INFERABLE_SPORTS,
  );
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const matching = counts.find((item) => item.sportType === sport)?.count ?? 0;
  return (
    matching >= SPORT_EVIDENCE_MIN_ACTIVITIES &&
    total > 0 &&
    matching / total >= SPORT_EVIDENCE_MIN_SHARE
  );
}

function userId(ctx: AiToolContext): string {
  return ctx.session?.user?.id ?? '';
}

function translate(
  ctx: AiToolContext,
  key: string,
  args?: Record<string, unknown>,
) {
  const value = ctx.i18n.t(key, { lang: ctx.lang, args });
  return typeof value === 'string' && value !== key ? value : key;
}

function metricLabel(ctx: AiToolContext, metricType: UserFitnessMetricType) {
  const key = `common.aiCoach.mutation.userFitnessMetric.metrics.${metricType}`;
  const value = translate(ctx, key);
  return value === key ? metricType : value;
}

function sportLabel(ctx: AiToolContext, sport: SportType) {
  const key = `common.aiCoach.mutation.userFitnessMetric.sports.${sport}`;
  const value = translate(ctx, key);
  return value === key ? sport : value;
}

function buildSummary(
  ctx: AiToolContext,
  args: {
    metricType: UserFitnessMetricType;
    sport: SportType;
    effectiveDate: string;
  },
) {
  const { metricType, sport, effectiveDate } = args;
  return translate(ctx, 'common.aiCoach.mutation.userFitnessMetric.summary', {
    metric: metricLabel(ctx, metricType),
    sport: sportLabel(ctx, sport),
    effectiveDate,
  });
}

/**
 * 写入一条手动体能阈值（与设置页「替换手动指标」同路径）。
 * HIGH：影响区间与后续负荷估算。
 */
export const userFitnessMetricMutationBundle = mutationToolFactory<
  Input,
  UiPayload
>({
  name: 'mutation_user_fitness_metric',
  aliases: ['user.threshold_set', 'user.fitness_metric'],
  description:
    'Set or replace one dated manual fitness threshold for the athlete (FTP, CP, LTHR, HRmax, CS, pace thresholds, VO2max, etc.) while preserving other historical dates. Requires explicit user intent. sportType may be explicit or inferred only when the server can verify a unique existing metric track or a strongly dominant recent sport; ambiguous multisport cases must use ask_user_question first. VO2_MAX should use sportType UNKNOWN.',
  searchHint: 'FTP CP threshold LTHR update profile metric',
  applicableSkills: [...METRIC_REVIEW_SKILLS],
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['metricType', 'value'],
    properties: {
      metricType: {
        type: 'string',
        enum: [...METRIC_ENUM],
      },
      value: { type: 'number' },
      value2: {
        type: 'number',
        description: "Optional second value (e.g. CS D')",
      },
      sportType: {
        type: 'string',
        enum: [...SPORT_ENUM],
        description:
          'Required for all metrics except VO2_MAX. May be explicit or based on a server-verifiable unique/dominant sport; do not guess from generic context.',
      },
      effectiveDate: {
        type: 'string',
        description: 'YYYY-MM-DD (UTC calendar day)',
      },
    },
  },
  cost: 'medium',
  type: CoachActionType.USER_THRESHOLD_UPDATE,
  riskTier: 'high',
  validateInput: async (ctx, input) => {
    const metricType = String(input?.metricType ?? '').trim();
    if (!metricType || !isMetricType(metricType)) {
      return aiToolError(
        `metricType must be one of: ${METRIC_ENUM.join(', ')}`,
        'INVALID_INPUT',
      );
    }
    const v = input?.value;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return aiToolError('value must be a finite number', 'INVALID_INPUT');
    }
    const sportType = input?.sportType;
    const sport = parseSport(sportType);
    if (
      requiresSport(metricType as UserFitnessMetricType) &&
      isBlankSport(sportType)
    ) {
      return aiToolError(
        translate(
          ctx,
          'common.aiCoach.mutation.userFitnessMetric.errors.missingSportType',
        ),
        'MISSING_SPORT_TYPE',
      );
    }
    if (!isBlankSport(sportType) && sport === null) {
      return aiToolError(
        `sportType must be one of: ${SPORT_ENUM.join(', ')}`,
        'INVALID_INPUT',
      );
    }
    if (
      requiresSport(metricType as UserFitnessMetricType) &&
      sport !== null &&
      !(await hasServerVerifiedSportEvidence(
        ctx,
        metricType as UserFitnessMetricType,
        sport,
      ))
    ) {
      return aiToolError(
        translate(
          ctx,
          'common.aiCoach.mutation.userFitnessMetric.errors.missingSportType',
        ),
        'MISSING_SPORT_EVIDENCE',
      );
    }
    const resolved = await resolveEffectiveDate(ctx, input.effectiveDate);
    if (!resolved.effectiveDate) {
      return aiToolError(
        'effectiveDate must be a real YYYY-MM-DD calendar date',
        'INVALID_INPUT',
      );
    }
    if (resolved.effectiveDate > resolved.athleteToday) {
      return aiToolError(
        'effectiveDate cannot be in the future',
        'INVALID_INPUT',
      );
    }
    return { ok: true };
  },
  checkPermissions: async (ctx) =>
    ctx.fitnessAssessmentActive ||
    ctx.activeSkillName === 'fitness-assessment' ||
    ctx.fitnessConfirmation
      ? aiToolError(
          'Use the displayed calculation and mutation_apply_fitness_calculation',
          'CONFIRMATION_REQUIRED',
        )
      : requireSignedInUser(ctx),
  async exec(ctx, input, _runtime, tx) {
    if (
      ctx.fitnessAssessmentActive ||
      ctx.activeSkillName === 'fitness-assessment' ||
      ctx.fitnessConfirmation
    )
      throw new Error('Use mutation_apply_fitness_calculation');
    const userId = ctx.session!.user!.id;
    const metricType = String(input.metricType).trim() as UserFitnessMetricType;
    const parsedSport = parseSport(input.sportType);
    const sport = parsedSport ?? SportType.UNKNOWN;

    const resolvedDate = await resolveEffectiveDate(ctx, input.effectiveDate);
    if (!resolvedDate.effectiveDate) throw new Error('Invalid effectiveDate');
    const effectiveDate = resolvedDate.effectiveDate;

    const metrics: Array<{
      effectiveDate: string;
      value: string;
      value2?: string;
    }> = [
      {
        effectiveDate,
        value: String(input.value),
        ...(input.value2 !== undefined && Number.isFinite(input.value2)
          ? { value2: String(input.value2) }
          : {}),
      },
    ];

    const { afterCommit } =
      await ctx.userService.replaceManualFitnessMetricsForDialog({
        userId,
        type: metricType,
        sportType: sport,
        metrics,
        preserveOtherDates: true,
        tx,
      });

    return {
      forwardData: {
        metricType,
        sport,
        effectiveDate,
        value: input.value,
      } as Prisma.InputJsonValue,
      reverseData: {} as Prisma.InputJsonValue,
      summary: buildSummary(ctx, { metricType, sport, effectiveDate }),
      payloadForUi: {
        metricType,
        sportType: sport,
        value: input.value,
        effectiveDate,
      },
      afterCommit,
    };
  },
  undo: async () => {},
});

export const userFitnessMetricMutationTool =
  userFitnessMetricMutationBundle.tool;
