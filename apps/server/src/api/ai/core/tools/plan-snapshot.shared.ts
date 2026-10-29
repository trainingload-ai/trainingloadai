import dayjs = require('dayjs');

export type PlanWorkoutSummary = {
  id: string;
  weekIndex: number;
  dayIndex: number;
  dayOffset: number;
  sessionIndex: number;
  scheduledDate: string | null;
  sportType: string;
  sportDefinitionCode?: string | null;
  name?: string | null;
  text: string;
  notes?: string | null;
  structureKind?: string | null;
  dslVersion?: number | null;
  structure?: unknown;
  summary?: unknown;
  blocks?: unknown;
  plannedDurationSeconds?: number | null;
  estimatedLoad?: number | null;
  status: string;
  linkedActivityCount: number;
};

export type PlanSnapshotToolOutput = {
  asOf: string;
  plan: null | {
    id: string;
    title: string;
    description?: string | null;
    goal?: string | null;
    sourceType: string;
    status: string;
    periodWeeks: number;
    startDate: string | null;
    endDate: string | null;
    currentWeekIndex: number | null;
    currentDayIndex: number | null;
    workoutCount: number;
    completedWorkoutCount: number;
    cycleReview?: {
      adherenceScore: number | null;
      progressLabel: string | null;
      keyDrivers: unknown;
      riskFlags: unknown;
      nextCycleSuggestion: unknown;
      markdown: string | null;
    } | null;
  };
  today: {
    date: string;
    weekIndex: number | null;
    dayIndex: number | null;
    workouts: PlanWorkoutSummary[];
  };
  tomorrow: {
    date: string;
    weekIndex: number | null;
    dayIndex: number | null;
    workouts: PlanWorkoutSummary[];
  };
  currentWeek: {
    weekIndex: number | null;
    workouts: PlanWorkoutSummary[];
    summary: {
      workoutCount: number;
      completedCount: number;
      skippedCount: number;
      movedCount: number;
      plannedCount: number;
    };
  };
  allWorkouts?: PlanWorkoutSummary[];
};

export function normalizePlanDate(value?: Date | string | null) {
  if (!value) return null;
  const date = dayjs(value);
  if (!date.isValid()) return null;
  return date.format('YYYY-MM-DD');
}

export function planDayOffsetToWeekDay(dayOffset: number) {
  return {
    weekIndex: Math.floor(dayOffset / 7) + 1,
    dayIndex: (dayOffset % 7) + 1,
  };
}

export type PlanSnapshotWorkoutRow = {
  id: string;
  dayOffset?: number | null;
  sessionIndex?: number | null;
  scheduledDate?: Date | string | null;
  sportType?: string | null;
  sportDefinitionCode?: string | null;
  name?: string | null;
  text?: string | null;
  notes?: string | null;
  structureKind?: string | null;
  dslVersion?: number | null;
  structure?: unknown;
  summary?: unknown;
  blocks?: unknown;
  plannedDurationSeconds?: number | null;
  estimatedLoad?: number | null;
  status?: string | null;
  links?: unknown[] | null;
};

export type PlanSnapshotPlanRow = {
  id: string;
  title: string;
  description?: string | null;
  goal?: string | null;
  sourceType: string;
  status: string;
  periodWeeks?: number | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  currentWeekIndex?: number | null;
  currentDayIndex?: number | null;
  workouts?: PlanSnapshotWorkoutRow[] | null;
  coachSummary?: {
    adherenceScore?: number | null;
    progressLabel?: string | null;
    keyDrivers?: unknown;
    riskFlags?: unknown;
    nextCycleSuggestion?: unknown;
    markdown?: string | null;
  } | null;
};

export function summarizePlanWorkoutRow(
  row: PlanSnapshotWorkoutRow,
): PlanWorkoutSummary {
  const { weekIndex, dayIndex } = planDayOffsetToWeekDay(row.dayOffset ?? 0);
  return {
    id: row.id,
    weekIndex,
    dayIndex,
    dayOffset: row.dayOffset ?? 0,
    sessionIndex: row.sessionIndex ?? 1,
    scheduledDate: normalizePlanDate(row.scheduledDate),
    sportType: String(row.sportType ?? ''),
    sportDefinitionCode: row.sportDefinitionCode ?? null,
    name: row.name ?? null,
    text: typeof row.text === 'string' ? row.text : '',
    notes: row.notes ?? null,
    structureKind: row.structureKind ?? null,
    dslVersion:
      typeof row.dslVersion === 'number' ? row.dslVersion : null,
    structure: row.structure ?? null,
    summary: row.summary ?? null,
    blocks: row.blocks ?? null,
    plannedDurationSeconds:
      typeof row.plannedDurationSeconds === 'number'
        ? row.plannedDurationSeconds
        : null,
    estimatedLoad:
      typeof row.estimatedLoad === 'number' ? row.estimatedLoad : null,
    status: String(row.status ?? ''),
    linkedActivityCount: Array.isArray(row.links) ? row.links.length : 0,
  };
}

export function getPlanAnchorDayIndex(
  plan: Pick<PlanSnapshotPlanRow, 'startDate' | 'periodWeeks'>,
  date: dayjs.Dayjs,
) {
  if (!plan?.startDate || !plan?.periodWeeks) {
    return { weekIndex: null, dayIndex: null, dayOffset: null };
  }

  const start = dayjs(plan.startDate).startOf('day');
  const diff = date.startOf('day').diff(start, 'day');
  const maxOffset = plan.periodWeeks * 7 - 1;
  if (diff < 0 || diff > maxOffset) {
    return { weekIndex: null, dayIndex: null, dayOffset: null };
  }

  return {
    ...planDayOffsetToWeekDay(diff),
    dayOffset: diff,
  };
}

/** 将 Prisma plan + workouts 转为 plan.active / plan.by_id 共用结构 */
export function buildPlanSnapshotFromRow(
  plan: PlanSnapshotPlanRow,
  input: { includeAllWorkouts?: boolean },
  anchor: dayjs.Dayjs,
  tomorrow: dayjs.Dayjs,
): PlanSnapshotToolOutput {
  const asOfDate = anchor.format('YYYY-MM-DD');
  const tomorrowDate = tomorrow.format('YYYY-MM-DD');

  const workouts = Array.isArray(plan.workouts)
    ? plan.workouts.map(summarizePlanWorkoutRow)
    : [];
  const todayIndex = getPlanAnchorDayIndex(plan, anchor);
  const tomorrowIndex = getPlanAnchorDayIndex(plan, tomorrow);
  const currentWeekIndex =
    todayIndex.weekIndex ?? plan.currentWeekIndex ?? null;
  const currentWeekWorkouts = currentWeekIndex
    ? workouts.filter((item) => item.weekIndex === currentWeekIndex)
    : [];
  const summary = {
    workoutCount: currentWeekWorkouts.length,
    completedCount: currentWeekWorkouts.filter((w) => w.status === 'DONE')
      .length,
    skippedCount: currentWeekWorkouts.filter((w) => w.status === 'SKIPPED')
      .length,
    movedCount: currentWeekWorkouts.filter((w) => w.status === 'MOVED').length,
    plannedCount: currentWeekWorkouts.filter((w) => w.status === 'PLANNED')
      .length,
  };

  return {
    asOf: asOfDate,
    plan: {
      id: plan.id,
      title: plan.title,
      description: plan.description ?? null,
      goal: plan.goal ?? null,
      sourceType: plan.sourceType,
      status: plan.status,
      periodWeeks: plan.periodWeeks,
      startDate: normalizePlanDate(plan.startDate),
      endDate: normalizePlanDate(plan.endDate),
      currentWeekIndex,
      currentDayIndex: todayIndex.dayIndex ?? plan.currentDayIndex ?? null,
      workoutCount: workouts.length,
      completedWorkoutCount: workouts.filter((w) => w.status === 'DONE')
        .length,
      cycleReview: plan.coachSummary
        ? {
            adherenceScore: plan.coachSummary.adherenceScore ?? null,
            progressLabel: plan.coachSummary.progressLabel ?? null,
            keyDrivers: plan.coachSummary.keyDrivers ?? null,
            riskFlags: plan.coachSummary.riskFlags ?? null,
            nextCycleSuggestion: plan.coachSummary.nextCycleSuggestion ?? null,
            markdown: plan.coachSummary.markdown ?? null,
          }
        : null,
    },
    today: {
      date: asOfDate,
      weekIndex: todayIndex.weekIndex,
      dayIndex: todayIndex.dayIndex,
      workouts:
        todayIndex.dayOffset == null
          ? []
          : workouts.filter((item) => item.dayOffset === todayIndex.dayOffset),
    },
    tomorrow: {
      date: tomorrowDate,
      weekIndex: tomorrowIndex.weekIndex,
      dayIndex: tomorrowIndex.dayIndex,
      workouts:
        tomorrowIndex.dayOffset == null
          ? []
          : workouts.filter(
              (item) => item.dayOffset === tomorrowIndex.dayOffset,
            ),
    },
    currentWeek: {
      weekIndex: currentWeekIndex,
      workouts: currentWeekWorkouts,
      summary,
    },
    ...(input.includeAllWorkouts ? { allWorkouts: workouts } : {}),
  };
}

export function emptyPlanSnapshotOutput(
  anchor: dayjs.Dayjs,
  tomorrow: dayjs.Dayjs,
): PlanSnapshotToolOutput {
  const asOfDate = anchor.format('YYYY-MM-DD');
  const tomorrowDate = tomorrow.format('YYYY-MM-DD');
  return {
    asOf: asOfDate,
    plan: null,
    today: {
      date: asOfDate,
      weekIndex: null,
      dayIndex: null,
      workouts: [],
    },
    tomorrow: {
      date: tomorrowDate,
      weekIndex: null,
      dayIndex: null,
      workouts: [],
    },
    currentWeek: {
      weekIndex: null,
      workouts: [],
      summary: {
        workoutCount: 0,
        completedCount: 0,
        skippedCount: 0,
        movedCount: 0,
        plannedCount: 0,
      },
    },
  };
}
