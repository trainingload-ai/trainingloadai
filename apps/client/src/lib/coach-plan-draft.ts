import type { CreatePlanDto, PlanSportType } from "@/api/plans";
import type { PlanCurrent } from "@/lib/plan-store";
import { DAYS_PER_WEEK, listWorkoutEntries } from "@/lib/plan-store";
import {
  COACH_PLAN_DRAFT_TYPE,
  safeParseCoachPlanDraftToolUseInput as safeParseSharedCoachPlanDraftToolUseInput,
  safeParseCoachPlanDraftFencePayload,
  type CoachPlanDraftData,
} from "@shared/ai-coach-schema";

/** 与落库 `CreatePlanDto` / 服务端 `create-plan.dto` 对齐；`text` 为 DSL 真源 */
export const COACH_PLAN_DRAFT_FENCE_TYPE = COACH_PLAN_DRAFT_TYPE;
export type CoachPlanDraft = CoachPlanDraftData;

/** 与 `draftToCreatePlanDto` / 图表 sport 一致 */
export function normalizeCoachDraftSportType(raw?: string): PlanSportType {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (u === "CYCLING" || u === "CYCLE" || u === "BIKE") return "CYCLING";
  if (u === "SWIM" || u === "SWIMMING") return "SWIM";
  if (u === "STRETCHING") return "STRETCHING";
  if (u === "UNKNOWN" || u === "STRENGTH") return "UNKNOWN";
  return "RUN";
}

/** 提交 `POST /plans` 用；过滤空 `text`，补全 `sportType` */
export function draftToCreatePlanDto(draft: CoachPlanDraft): CreatePlanDto {
  const baseWorkouts = draft.workouts
    .filter((w) => typeof w.text === "string" && w.text.trim().length > 0)
    .sort((a, b) =>
      a.weekIndex === b.weekIndex
        ? a.dayIndex === b.dayIndex
          ? (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1)
          : a.dayIndex - b.dayIndex
        : a.weekIndex - b.weekIndex,
    )
    .map((w) => ({
      weekIndex: w.weekIndex,
      dayIndex: w.dayIndex,
      sessionIndex: Math.max(1, w.sessionIndex ?? 1),
      text: w.text.trim(),
      ...(w.notes?.trim() ? { notes: w.notes.trim() } : {}),
      ...(w.name?.trim() ? { name: w.name.trim() } : {}),
      sportType:
        (w.structureKind ?? "ENDURANCE") === "STRENGTH"
          ? ("UNKNOWN" as const)
          : normalizeCoachDraftSportType(w.sportType),
      sportDefinitionCode:
        (w.structureKind ?? "ENDURANCE") === "STRENGTH"
          ? "STRENGTH_TRAINING"
          : w.sportDefinitionCode,
      definition: w.structure
        ? {
            kind: w.structure.kind,
            version: 1 as const,
            source: "STRUCTURE" as const,
            structure: w.structure,
          }
        : {
            kind: w.structureKind ?? "ENDURANCE",
            version: 1 as const,
            source: "TEXT" as const,
            text: w.text.trim(),
          },
    }));

  // 兜底：按同一天分组，强制连续 sessionIndex（1..n），避免模型遗漏 sessionIndex 导致全部为 1。
  const workouts = baseWorkouts.map((w) => ({ ...w }));
  const groupCounter = new Map<string, number>();
  for (const workout of workouts) {
    const groupKey = `${workout.weekIndex}-${workout.dayIndex}`;
    const next = (groupCounter.get(groupKey) ?? 0) + 1;
    groupCounter.set(groupKey, next);
    workout.sessionIndex = next;
  }

  if (workouts.length === 0) {
    throw new Error("No workouts with non-empty text");
  }

  return {
    title: draft.title.trim(),
    sourceType: "AI",
    ...(draft.qualityContract
      ? { generationMetadata: { qualityContract: draft.qualityContract } }
      : {}),
    ...(draft.description?.trim()
      ? { description: draft.description.trim() }
      : {}),
    periodWeeks: draft.periodWeeks,
    workouts,
  };
}

/** 与日历格子、对话框展示一致：按周→日→节次排序后的全计划序号（1-based） */
export function draftWorkoutOrdinalKey(w: {
  weekIndex: number;
  dayIndex: number;
  sessionIndex?: number;
}): string {
  return `${w.weekIndex}-${w.dayIndex}-${Math.max(1, w.sessionIndex ?? 1)}`;
}

export function buildCoachDraftGlobalSessionOrdinalMap(
  draft: CoachPlanDraft,
): Map<string, number> {
  const sorted = draft.workouts
    .filter((w) => typeof w.text === "string" && w.text.trim().length > 0)
    .sort((a, b) =>
      a.weekIndex !== b.weekIndex
        ? a.weekIndex - b.weekIndex
        : a.dayIndex !== b.dayIndex
          ? a.dayIndex - b.dayIndex
          : (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1),
    );
  const m = new Map<string, number>();
  sorted.forEach((w, i) => {
    m.set(draftWorkoutOrdinalKey(w), i + 1);
  });
  return m;
}

export function safeParseCoachPlanDraftFenceJson(
  raw: unknown,
): CoachPlanDraft | null {
  return safeParseCoachPlanDraftFencePayload(raw);
}

export function safeParseCoachPlanDraftToolUseInput(
  raw: unknown,
): CoachPlanDraft | null {
  return safeParseSharedCoachPlanDraftToolUseInput(raw);
}

/** 将 plan-store 中的当前计划转为与 AI 草案相同的结构，供 `CoachPlanDraftCalendarPreview` 使用 */
export function planCurrentToCoachPlanDraft(
  current: PlanCurrent,
): CoachPlanDraft {
  const workouts = listWorkoutEntries(current)
    .filter(
      ({ dayOffset, workout }) =>
        dayOffset < current.weeks * DAYS_PER_WEEK &&
        workout.text.trim().length > 0,
    )
    .map(({ workout, weekIndex, dayIndex, sessionIndex }) => ({
      weekIndex: weekIndex + 1,
      dayIndex: dayIndex + 1,
      sessionIndex,
      text: workout.text.trim(),
      ...(workout.notes?.trim() ? { notes: workout.notes.trim() } : {}),
      sportType: normalizeCoachDraftSportType(workout.sportType),
      structureKind: workout.structureKind ?? workout.structure?.kind,
      dslVersion: 1,
      sportDefinitionCode: workout.sportDefinitionCode ?? undefined,
      ...(workout.structure ? { structure: workout.structure } : {}),
      ...(workout.summary ? { summary: workout.summary } : {}),
      ...(workout.blocks && workout.blocks.length > 0
        ? { blocks: workout.blocks }
        : {}),
    }));

  return {
    title: current.title.trim() || "—",
    ...(current.description?.trim()
      ? { description: current.description.trim() }
      : {}),
    periodWeeks: Math.max(1, current.weeks),
    workouts,
  };
}
