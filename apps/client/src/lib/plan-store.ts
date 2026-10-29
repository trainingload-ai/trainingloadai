import { create } from "zustand";
import type { ParsedPlan } from "@/api/workout";
import type { PlanSportType } from "@/api/plans";
import type {
  WorkoutDefinitionInput,
  WorkoutStructure,
  WorkoutStructureKind,
} from "@shared/workout-structure";
import type { WorkoutSummary } from "@shared/workout-summary";

export type Workout = {
  id?: string;
  name?: string;
  text: string;
  notes?: string;
  sportType?: PlanSportType;
  sportDefinitionCode?: string | null;
  blocks?: ParsedPlan | null;
  structureKind?: WorkoutStructureKind;
  structure?: WorkoutStructure | null;
  summary?: WorkoutSummary | null;
  definition?: WorkoutDefinitionInput;
};

export type WorkoutMap = Record<string, Workout>;
export type WorkoutEntry = {
  dayOffset: number;
  sessionIndex: number;
  weekIndex: number;
  dayIndex: number;
  workout: Workout;
};

export type PlanCurrent = {
  title: string;
  description?: string;
  weeks: number;
  workouts: WorkoutMap;
};

export const DAYS_PER_WEEK = 7;

export const EMPTY_WORKOUT: Workout = {
  text: "",
  notes: "",
  sportType: "RUN",
  sportDefinitionCode: "ROAD_RUNNING",
  blocks: null,
};

export const createEmptyWorkout = (): Workout => ({
  ...EMPTY_WORKOUT,
});

export const toDayOffset = (weekIndexZero: number, dayIndexZero: number) =>
  weekIndexZero * DAYS_PER_WEEK + dayIndexZero;

export const toWeekDay = (dayOffset: number) => ({
  weekIndex: Math.floor(dayOffset / DAYS_PER_WEEK),
  dayIndex: dayOffset % DAYS_PER_WEEK,
});

export const getWorkoutKey = (
  weekIndexZero: number,
  dayIndexZero: number,
  sessionIndex = 1,
) => `${toDayOffset(weekIndexZero, dayIndexZero)}:${sessionIndex}`;

export const getWorkoutKeyFromOffset = (dayOffset: number, sessionIndex = 1) =>
  `${dayOffset}:${sessionIndex}`;

export const parseWorkoutKey = (key: string) => {
  // key 格式为 dayOffset:sessionIndex，支持同一天多节训练。
  const [dayOffsetPart, sessionIndexPart] = key.split(":");
  const dayOffset = Number(dayOffsetPart);
  const sessionIndex = Math.max(1, Number(sessionIndexPart || 1) || 1);
  return {
    dayOffset,
    sessionIndex,
  };
};

export const getWorkoutAt = (
  current: PlanCurrent | null | undefined,
  weekIndexZero: number,
  dayIndexZero: number,
  sessionIndex = 1,
) =>
  current?.workouts[getWorkoutKey(weekIndexZero, dayIndexZero, sessionIndex)] ??
  EMPTY_WORKOUT;

export const listWorkoutsAt = (
  current: PlanCurrent | null | undefined,
  weekIndexZero: number,
  dayIndexZero: number,
): WorkoutEntry[] =>
  // 从扁平 map 中筛出某一天的所有 session，并按 sessionIndex 保持展示顺序。
  Object.entries(current?.workouts ?? {})
    .map(([key, workout]) => ({
      ...parseWorkoutKey(key),
      workout,
      ...toWeekDay(parseWorkoutKey(key).dayOffset),
    }))
    .filter(
      ({ dayOffset }) => dayOffset === toDayOffset(weekIndexZero, dayIndexZero),
    )
    .sort((a, b) => a.sessionIndex - b.sessionIndex);

export const getNextSessionIndexAt = (
  current: PlanCurrent | null | undefined,
  weekIndexZero: number,
  dayIndexZero: number,
) =>
  listWorkoutsAt(current, weekIndexZero, dayIndexZero).reduce(
    (max, entry) => Math.max(max, entry.sessionIndex),
    0,
  ) + 1;

export const buildWorkoutGrid = (
  current: PlanCurrent | null | undefined,
): Workout[][] => {
  const weeks = current?.weeks ?? 0;
  return Array.from({ length: weeks }, (_, weekIndexZero) =>
    Array.from(
      { length: DAYS_PER_WEEK },
      (_, dayIndexZero) =>
        listWorkoutsAt(current, weekIndexZero, dayIndexZero)[0]?.workout ??
        EMPTY_WORKOUT,
    ),
  );
};

export const buildWorkoutSessionGrid = (
  current: PlanCurrent | null | undefined,
): Workout[][][] => {
  const weeks = current?.weeks ?? 0;
  return Array.from({ length: weeks }, (_, weekIndexZero) =>
    Array.from({ length: DAYS_PER_WEEK }, (_, dayIndexZero) =>
      listWorkoutsAt(current, weekIndexZero, dayIndexZero).map(
        ({ workout }) => workout,
      ),
    ),
  );
};

export const buildWorkoutEntryGrid = (
  current: PlanCurrent | null | undefined,
): WorkoutEntry[][][] => {
  const weeks = current?.weeks ?? 0;
  return Array.from({ length: weeks }, (_, weekIndexZero) =>
    Array.from({ length: DAYS_PER_WEEK }, (_, dayIndexZero) =>
      listWorkoutsAt(current, weekIndexZero, dayIndexZero),
    ),
  );
};

export const listWorkoutEntries = (
  current: PlanCurrent | null | undefined,
): WorkoutEntry[] => {
  if (!current) return [];
  return Object.entries(current.workouts)
    .map(([key, workout]) => ({
      ...parseWorkoutKey(key),
      workout,
      ...toWeekDay(parseWorkoutKey(key).dayOffset),
    }))
    .sort((a, b) =>
      a.dayOffset === b.dayOffset
        ? a.sessionIndex - b.sessionIndex
        : a.dayOffset - b.dayOffset,
    );
};

/** 按周→日→当天节次排序后，每个格子在全计划中的序号（1-based），key = `${weekZero}:${dayZero}:${sessionIndex}` */
export function buildPlanGlobalSessionOrdinalMap(
  current: PlanCurrent | null | undefined,
): Map<string, number> {
  const entries = listWorkoutEntries(current);
  const m = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    m.set(`${e.weekIndex}:${e.dayIndex}:${e.sessionIndex}`, i + 1);
  }
  return m;
}

/**
 * 全计划中的训练序号（1-based）。已落库的 slot 走 Map；
 * 新增尚未写入 `workouts` 的空槽位按「周→日→节」推算排在第几场。
 */
export function getPlanGlobalSessionOrdinalDisplay(
  current: PlanCurrent | null | undefined,
  weekIndexZero: number,
  dayIndexZero: number,
  sessionIndex: number,
): number {
  const map = buildPlanGlobalSessionOrdinalMap(current);
  const hit = map.get(`${weekIndexZero}:${dayIndexZero}:${sessionIndex}`);
  if (hit !== undefined) return hit;

  const targetOffset = toDayOffset(weekIndexZero, dayIndexZero);
  const entries = listWorkoutEntries(current);
  const before = entries.filter((e) => {
    if (e.dayOffset < targetOffset) return true;
    if (e.dayOffset > targetOffset) return false;
    return e.sessionIndex < sessionIndex;
  }).length;
  return before + 1;
}

export const countFilledWorkouts = (current: PlanCurrent | null | undefined) =>
  listWorkoutEntries(current).filter(
    ({ dayOffset, workout }) =>
      dayOffset < (current?.weeks ?? 0) * DAYS_PER_WEEK &&
      workout.text.trim().length > 0,
  ).length;

type ExistingPlanWorkout = {
  id?: string;
  name?: string | null;
  weekIndex?: number;
  dayIndex?: number;
  dayOffset?: number;
  sessionIndex?: number;
  text: string;
  notes?: string | null;
  sportType?: "RUN" | "CYCLING" | "SWIM" | "STRETCHING" | "UNKNOWN";
  sportDefinitionCode?: string | null;
  blocks?: string | ParsedPlan | unknown[] | Record<string, unknown> | null;
  structureKind?: WorkoutStructureKind;
  structure?: WorkoutStructure | null;
  summary?: WorkoutSummary | null;
};

type PlanStore = {
  current: PlanCurrent | null;
  hasCurrent: boolean;
  sourcePlanId?: number | string;
  deletedWorkoutIds: string[];
  initCurrent: (title: string, weeks: number, description?: string) => void;
  initCurrentFromExisting: (plan: {
    id: number | string;
    title: string;
    description?: string;
    periodWeeks: number;
    workouts?: ExistingPlanWorkout[];
  }) => void;
  setMeta: (
    meta: Partial<Pick<PlanCurrent, "title" | "description" | "weeks">>,
  ) => void;
  setWorkout: (
    weekIndexZero: number,
    dayIndexZero: number,
    patch: Partial<Workout>,
    sessionIndex?: number,
  ) => Promise<boolean>;
  deleteWorkout: (
    weekIndexZero: number,
    dayIndexZero: number,
    sessionIndex?: number,
  ) => Promise<boolean>;
  clear: () => void;
  serializeToCreate: () => {
    title: string;
    description?: string;
    periodWeeks: number;
    deletedWorkoutIds?: string[];
    workouts: Array<{
      id?: string;
      weekIndex: number;
      dayIndex: number;
      sessionIndex?: number;
      text: string;
      notes?: string;
      name?: string;
      sportType: PlanSportType;
      sportDefinitionCode?: string | null;
      blocks?: ParsedPlan | null;
      definition?: WorkoutDefinitionInput;
    }>;
  } | null;
  serializeToUpdate: () => {
    planId: number | string;
    title: string;
    description?: string;
    periodWeeks: number;
    workouts: Array<{
      id?: string;
      weekIndex: number;
      dayIndex: number;
      sessionIndex?: number;
      text: string;
      notes?: string;
      name?: string;
      sportType: PlanSportType;
      sportDefinitionCode?: string | null;
      blocks?: ParsedPlan | null;
      definition?: WorkoutDefinitionInput;
    }>;
  } | null;
};

const parseBlocks = (
  blocks:
    | string
    | ParsedPlan
    | unknown[]
    | Record<string, unknown>
    | null
    | undefined,
): ParsedPlan | null => {
  // 兼容服务端可能返回 JSON 字符串、数组或已反序列化对象的 blocks。
  if (!blocks) return null;
  try {
    return Array.isArray(blocks)
      ? (blocks as ParsedPlan)
      : typeof blocks === "string"
        ? (JSON.parse(blocks) as ParsedPlan)
        : (blocks as unknown as ParsedPlan);
  } catch (err) {
    console.error("Error parsing blocks:", err);
    return null;
  }
};

const normalizeWeeks = (weeks: number) =>
  Math.max(1, Math.min(52, Math.floor(weeks || 1)));

const normalizeEditableSportType = (
  sportType?: ExistingPlanWorkout["sportType"],
): PlanSportType => {
  return sportType ?? "RUN";
};

const serializeWorkouts = (current: PlanCurrent) =>
  // 提交给服务端时过滤空文本和超出当前周数的残留 workout。
  listWorkoutEntries(current)
    .filter(({ dayOffset }) => dayOffset < current.weeks * DAYS_PER_WEEK)
    .filter(({ workout }) => workout.text.trim().length > 0)
    .map(({ workout, weekIndex, dayIndex, sessionIndex }) => ({
      id: workout.id,
      weekIndex: weekIndex + 1,
      dayIndex: dayIndex + 1,
      sessionIndex,
      text: workout.text.trim(),
      notes: workout.notes,
      name: workout.name?.trim() || undefined,
      sportType: workout.sportType || "UNKNOWN",
      sportDefinitionCode: workout.sportDefinitionCode ?? null,
      blocks: workout.blocks ?? null,
      definition:
        workout.definition ??
        (workout.structure
          ? {
              kind: workout.structure.kind,
              version: 1,
              source: "STRUCTURE" as const,
              structure: workout.structure,
            }
          : undefined),
    }));

export const usePlanStore = create<PlanStore>((set, get) => ({
  current: null,
  hasCurrent: false,
  sourcePlanId: undefined,
  deletedWorkoutIds: [],

  initCurrent: (title, weeks, description) => {
    set({
      current: {
        title,
        description,
        weeks: normalizeWeeks(weeks),
        workouts: {},
      },
      hasCurrent: true,
      sourcePlanId: undefined,
      deletedWorkoutIds: [],
    });
  },

  initCurrentFromExisting: (plan) => {
    // 编辑已有计划时把 1-based week/day 或 dayOffset 都归一成 store 的 0-based key。
    const safeWeeks = normalizeWeeks(plan.periodWeeks);
    const workouts: WorkoutMap = {};

    (plan.workouts || []).forEach((workout) => {
      const dayOffset =
        typeof workout.dayOffset === "number"
          ? workout.dayOffset
          : typeof workout.weekIndex === "number" &&
              typeof workout.dayIndex === "number"
            ? toDayOffset(workout.weekIndex - 1, workout.dayIndex - 1)
            : null;
      if (dayOffset === null || dayOffset < 0) return;
      workouts[getWorkoutKeyFromOffset(dayOffset, workout.sessionIndex ?? 1)] =
        {
          id: workout.id,
          name: workout.name ?? "",
          text: workout.text ?? "",
          notes: workout.notes ?? "",
          sportType: normalizeEditableSportType(workout.sportType),
          sportDefinitionCode: workout.sportDefinitionCode ?? null,
          blocks: parseBlocks(workout.blocks),
          structureKind: workout.structureKind,
          structure: workout.structure ?? null,
          summary: workout.summary ?? null,
          definition: workout.structure
            ? {
                kind: workout.structure.kind,
                version: 1,
                source: "STRUCTURE",
                structure: workout.structure,
              }
            : undefined,
        };
    });

    set({
      current: {
        title: plan.title,
        description: plan.description,
        weeks: safeWeeks,
        workouts,
      },
      hasCurrent: true,
      sourcePlanId: plan.id,
      deletedWorkoutIds: [],
    });
  },

  setMeta: (meta) => {
    const curr = get().current;
    if (!curr) return;
    set({
      current: {
        ...curr,
        title: meta.title ?? curr.title,
        description: meta.description ?? curr.description,
        weeks:
          meta.weeks !== undefined ? normalizeWeeks(meta.weeks) : curr.weeks,
      },
      hasCurrent: true,
    });
  },

  setWorkout: (weekIndexZero, dayIndexZero, patch, sessionIndex = 1) =>
    new Promise<boolean>((resolve, reject) => {
      const curr = get().current;
      if (!curr) {
        reject(new Error("Current plan does not exist"));
        return;
      }
      if (
        weekIndexZero < 0 ||
        weekIndexZero >= curr.weeks ||
        dayIndexZero < 0 ||
        dayIndexZero >= DAYS_PER_WEEK
      ) {
        reject(new Error("Index out of bounds: invalid week/day"));
        return;
      }

      const key = getWorkoutKey(weekIndexZero, dayIndexZero, sessionIndex);
      const prev = curr.workouts[key] ?? createEmptyWorkout();
      const nextWorkout = { ...prev, ...patch };

      set({
        current: {
          ...curr,
          workouts: {
            ...curr.workouts,
            [key]: nextWorkout,
          },
        },
      });
      resolve(true);
    }),

  deleteWorkout: (weekIndexZero, dayIndexZero, sessionIndex = 1) =>
    new Promise<boolean>((resolve, reject) => {
      const curr = get().current;
      if (!curr) {
        reject(new Error("Current plan does not exist"));
        return;
      }
      const key = getWorkoutKey(weekIndexZero, dayIndexZero, sessionIndex);
      const existing = curr.workouts[key];
      if (!existing) {
        reject(new Error("Workout does not exist"));
        return;
      }

      const nextWorkouts = { ...curr.workouts };
      delete nextWorkouts[key];

      set({
        current: {
          ...curr,
          workouts: nextWorkouts,
        },
        // 已落库的训练课需要带回 deletedWorkoutIds；本地新建未保存的课直接丢弃即可。
        deletedWorkoutIds: existing.id
          ? [...get().deletedWorkoutIds, existing.id]
          : get().deletedWorkoutIds,
      });
      resolve(true);
    }),

  clear: () =>
    set({
      current: null,
      hasCurrent: false,
      sourcePlanId: undefined,
      deletedWorkoutIds: [],
    }),

  serializeToCreate: () => {
    const curr = get().current;
    if (!curr) return null;
    return {
      title: curr.title,
      description: curr.description,
      periodWeeks: curr.weeks,
      workouts: serializeWorkouts(curr),
    };
  },

  serializeToUpdate: () => {
    const curr = get().current;
    const planId = get().sourcePlanId;
    if (!curr || planId === undefined) return null;
    return {
      planId,
      title: curr.title,
      description: curr.description,
      periodWeeks: curr.weeks,
      deletedWorkoutIds: get().deletedWorkoutIds,
      workouts: serializeWorkouts(curr),
    };
  },
}));
