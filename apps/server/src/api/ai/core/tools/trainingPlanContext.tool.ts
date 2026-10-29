import {
  aiToolError,
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import type { CoachToolsService } from '../coach-tools.service';
import type { PlanService } from '@/api/plan/plan.service';

type Input = {
  asOf?: string;
  sportType?: string;
};

type Output = {
  kind: 'training_plan_context';
  asOf: string;
  sportType: 'RUN' | 'CYCLING' | 'SWIM';
  profile: unknown;
  planHistory: {
    primaryReference: 'ACTIVE' | 'LATEST_COMPLETED' | 'NONE';
    currentActive: unknown | null;
    latestCompleted: unknown | null;
  };
  recentTraining: {
    completedWeekBaseline: unknown;
    readiness: unknown;
    pmc28: unknown;
  };
  capabilities: {
    currentMetrics: unknown;
    metricTrends: unknown[];
    recentBests: unknown;
    intensityStrategy: unknown;
  };
  dataQuality: {
    personalizationReadiness: unknown;
    latestPmcDate: unknown;
    missingCoreFields: string[];
  };
};

const CURRENT_METRICS = [
  'weight',
  'vo2Max',
  'ftp',
  'eftp',
  'cp',
  'ecp',
  'cs',
  'tp',
  'pMax',
  'lthr',
  'maxHr',
  'restingHr',
];

const TREND_METRICS: Record<Output['sportType'], string[]> = {
  RUN: ['weight', 'vo2Max', 'cs'],
  CYCLING: ['weight', 'vo2Max', 'ftp', 'cp'],
  SWIM: ['weight', 'vo2Max', 'cs', 'tp'],
};

function normalizeSportType(value: unknown): Output['sportType'] {
  const normalized = String(value ?? 'RUN')
    .trim()
    .toUpperCase();
  if (normalized === 'CYCLE' || normalized === 'BIKE') return 'CYCLING';
  if (normalized === 'CYCLING' || normalized === 'SWIM') return normalized;
  return 'RUN';
}

function isValidYmd(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function shiftYmd(value: string, days: number) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

type MetricHistoryResult = Awaited<
  ReturnType<CoachToolsService['metricHistory']>
>;
type BestsResult = Awaited<ReturnType<CoachToolsService['bestsSummary']>>;
type IntensityResult = Awaited<
  ReturnType<CoachToolsService['workoutIntensityStrategy']>
>;
type PlanListResult = Awaited<ReturnType<PlanService['listPlans']>>;
type PlanListItem = PlanListResult['plans'][number];
type MetricCurrentResult = Awaited<
  ReturnType<CoachToolsService['metricCurrent']>
>;
type CompletedSummary = {
  planId: string | null;
  adherenceScore: number | null;
  progressLabel: string | null;
  keyDrivers: unknown;
  riskFlags: unknown;
  nextCycleSuggestion: unknown;
};

function compactMetricTrend(result: MetricHistoryResult) {
  return {
    metric: result?.metric,
    source: result?.source,
    sportType: result?.sportType,
    unit: result?.unit,
    range: result?.range,
    summary: result?.summary,
    recentPoints: Array.isArray(result?.points) ? result.points.slice(-8) : [],
  };
}

function compactBests(result: BestsResult) {
  return {
    sportType: result?.sportType,
    mode: result?.mode,
    range: result?.range,
    itemCount: result?.itemCount,
    items: Array.isArray(result?.items)
      ? result.items.slice(0, 6).map((item) => ({
          key: item?.key,
          paceSec: item?.paceSec,
          timeSec: item?.timeSec,
          activityTime: item?.activityTime,
        }))
      : [],
  };
}

function compactIntensityStrategy(result: IntensityResult) {
  return {
    anchorDate: result?.anchorDate,
    range: result?.range,
    recentData: result?.recentData,
    thresholds: result?.thresholds,
    selectedZoneRanges: result?.selectedZoneRanges,
    recommendation: result?.recommendation,
    decisionRubric: result?.decisionRubric,
  };
}

function dateSortValue(value: unknown) {
  if (value == null) return 0;
  const parsed = value instanceof Date ? value : new Date(String(value));
  const time = parsed.getTime();
  return Number.isNaN(time) ? 0 : time;
}

function mostRecentPlan(
  plans: PlanListItem[],
  primaryDate: 'startDate' | 'endDate',
) {
  return [...plans].sort(
    (a, b) =>
      dateSortValue(b?.[primaryDate]) - dateSortValue(a?.[primaryDate]) ||
      dateSortValue(b?.updatedAt) - dateSortValue(a?.updatedAt),
  )[0];
}

function compactPlan(
  plan: PlanListItem | undefined,
  completedSummaryByPlanId: Map<string, CompletedSummary>,
) {
  if (!plan) return null;
  const completedSummary = completedSummaryByPlanId.get(plan.id);
  return {
    title: plan.title,
    description: plan.description,
    goal: plan.goal,
    sourceType: plan.sourceType,
    status: plan.status,
    periodWeeks: plan.periodWeeks,
    startDate: plan.startDate,
    endDate: plan.endDate,
    currentWeekIndex: plan.currentWeekIndex,
    currentDayIndex: plan.currentDayIndex,
    workoutCount: plan.workoutCount,
    completedWorkoutCount: plan.completedWorkoutCount,
    sessionCompletionRate: plan.sessionCompletionRate,
    estimatedLoadTotal: plan.estimatedLoadTotal,
    actualLoadTotal: plan.actualLoadTotal,
    complianceRate: plan.complianceRate,
    cycleReview: completedSummary
      ? {
          adherenceScore: completedSummary.adherenceScore,
          progressLabel: completedSummary.progressLabel,
          keyDrivers: completedSummary.keyDrivers,
          riskFlags: completedSummary.riskFlags,
          nextCycleSuggestion: completedSummary.nextCycleSuggestion,
        }
      : null,
  };
}

function compactPlanHistory(
  result: PlanListResult,
  completedSummaries: CompletedSummary[],
): Output['planHistory'] {
  const plans = Array.isArray(result?.plans) ? result.plans : [];
  const currentActive = mostRecentPlan(
    plans.filter((plan) => plan?.status === 'ACTIVE'),
    'startDate',
  );
  const latestCompleted = mostRecentPlan(
    plans.filter((plan) => plan?.status === 'COMPLETED'),
    'endDate',
  );
  const completedSummaryByPlanId = new Map(
    (Array.isArray(completedSummaries) ? completedSummaries : [])
      .filter((summary) => typeof summary?.planId === 'string')
      .map((summary) => [summary.planId as string, summary]),
  );

  return {
    primaryReference: currentActive
      ? 'ACTIVE'
      : latestCompleted
        ? 'LATEST_COMPLETED'
        : 'NONE',
    currentActive: compactPlan(currentActive, completedSummaryByPlanId),
    latestCompleted: compactPlan(latestCompleted, completedSummaryByPlanId),
  };
}

function currentMetricValue(currentMetrics: MetricCurrentResult, name: string) {
  const item = Array.isArray(currentMetrics?.items)
    ? currentMetrics.items.find((candidate) => candidate?.metric === name)
    : null;
  return item && 'effectiveCurrent' in item
    ? item.effectiveCurrent
    : item && 'value' in item
      ? item.value
      : null;
}

/**
 * Stable athlete evidence bundle for plan generation. It deliberately aggregates
 * the existing read models so the model cannot accidentally draft from schedule
 * fields while missing current load, body data, or capability trends.
 */
export const trainingPlanContextTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'training.plan_context',
  aliases: ['training_plan_context', 'athlete.plan_context'],
  description:
    'Build the mandatory athlete evidence bundle for a new plan: current active and latest completed plan summaries, completed-week baseline, rolling 28-day training and PMC, current ATL/CTL/TSB, body/profile attributes, current capability metrics, compact metric trends, recent bests, and intensity-data coverage. Call once before drafting; use it as context rather than as rigid prescription rules.',
  cost: 'high',
  searchHint:
    'athlete plan context recent 28 days PMC readiness VO2max CP CS FTP body profile',
  applicableSkills: ['plan-builder'],
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 20_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      asOf: {
        type: 'string',
        description:
          'Optional anchor date in YYYY-MM-DD. Defaults to the user-local date.',
      },
      sportType: {
        type: 'string',
        description: 'Primary endurance sport: RUN, CYCLING, or SWIM.',
      },
    },
  },
  validateInput: async (_ctx, input) =>
    input?.asOf && !isValidYmd(input.asOf)
      ? aiToolError('Invalid asOf date; expected YYYY-MM-DD.', 'INVALID_INPUT')
      : { ok: true },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => output,
  execute: async (ctx, input) => {
    const sportType = normalizeSportType(input?.sportType);
    const currentTime = input?.asOf
      ? null
      : await ctx.coachTools.currentTime(ctx);
    const asOf =
      input?.asOf ??
      String(
        currentTime?.user?.date ?? currentTime?.server?.date,
      );
    const from28 = shiftYmd(asOf, -27);
    const fromTrend = shiftYmd(asOf, -89);
    const fromBests = shiftYmd(asOf, -364);

    const trendPromises = TREND_METRICS[sportType].map((metric) =>
      ctx.coachTools.metricHistory(ctx, {
        metric,
        sportType,
        from: fromTrend,
        to: asOf,
        limit: 24,
      }),
    );

    const [
      profile,
      planList,
      completedPlanSummaries,
      completedWeekBaseline,
      readiness,
      pmc28,
      currentMetrics,
      recentBests,
      intensityStrategy,
      metricTrendResults,
    ] = await Promise.all([
      ctx.coachTools.profileCurrent(ctx, { sportType }),
      ctx.planService.listPlans(ctx.session.user.id),
      ctx.prisma.coachSummary.findMany({
        where: { userId: ctx.session.user.id },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          planId: true,
          adherenceScore: true,
          progressLabel: true,
          keyDrivers: true,
          riskFlags: true,
          nextCycleSuggestion: true,
        },
      }),
      ctx.coachTools.trainingBaseline(ctx, {
        asOf,
        sportType,
        weeks: 4,
        excludeCurrentWeek: true,
      }),
      ctx.coachTools.trainingReadiness(ctx, { asOf, sportType }),
      ctx.coachTools.pmcRange(ctx, {
        from: from28,
        to: asOf,
        granularity: 'day',
      }),
      ctx.coachTools.metricCurrent(ctx, {
        sportType,
        metrics: CURRENT_METRICS,
      }),
      ctx.coachTools.bestsSummary(ctx, {
        sportType,
        from: fromBests,
        to: asOf,
        mode: 'distance',
        limitPerTarget: 1,
      }),
      ctx.coachTools.workoutIntensityStrategy(ctx, {
        sportType,
        workoutGoal: 'mixed',
        asOf,
        weeks: 8,
      }),
      Promise.all(trendPromises),
    ]);

    const missingCoreFields: string[] = [];
    if (profile?.body?.heightCm == null)
      missingCoreFields.push('height');
    if (currentMetricValue(currentMetrics, 'weight') == null)
      missingCoreFields.push('weight');
    if (currentMetricValue(currentMetrics, 'vo2Max') == null)
      missingCoreFields.push('vo2Max');

    return {
      kind: 'training_plan_context',
      asOf,
      sportType,
      profile,
      planHistory: compactPlanHistory(planList, completedPlanSummaries),
      recentTraining: {
        completedWeekBaseline,
        readiness,
        pmc28: { ...pmc28, kind: 'pmc_range' },
      },
      capabilities: {
        currentMetrics,
        metricTrends: metricTrendResults.map(compactMetricTrend),
        recentBests: compactBests(recentBests),
        intensityStrategy: compactIntensityStrategy(intensityStrategy),
      },
      dataQuality: {
        personalizationReadiness:
          completedWeekBaseline.personalizationReadiness,
        latestPmcDate: readiness.latestAvailableDate,
        missingCoreFields,
      },
    };
  },
});
