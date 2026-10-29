import type { PlanSportType, UpdatePlanWorkoutDto } from "@/api/plans";
import {
  safeParsePlanWorkoutAdjustmentDraftData,
  type PlanWorkoutAdjustmentDraftData,
} from "@shared/ai-coach-schema";

export type PlanWorkoutAdjustmentDraft = PlanWorkoutAdjustmentDraftData;

export function normalizeAdjustmentSportType(raw?: string): PlanSportType {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (u === "CYCLING" || u === "CYCLE" || u === "BIKE") return "CYCLING";
  if (u === "SWIM" || u === "SWIMMING") return "SWIM";
  if (u === "STRETCHING") return "STRETCHING";
  if (u === "UNKNOWN") return "UNKNOWN";
  return "RUN";
}

export function safeParsePlanWorkoutAdjustmentDraftToolUseInput(
  raw: unknown,
): PlanWorkoutAdjustmentDraft | null {
  return safeParsePlanWorkoutAdjustmentDraftData(raw);
}

export function adjustmentDraftToUpdatePlanWorkoutDto(
  draft: PlanWorkoutAdjustmentDraft,
): UpdatePlanWorkoutDto {
  return {
    weekIndex: draft.after.weekIndex ?? draft.before.weekIndex,
    dayIndex: draft.after.dayIndex ?? draft.before.dayIndex,
    sessionIndex: draft.after.sessionIndex ?? draft.before.sessionIndex,
    text: draft.after.text.trim(),
    ...(draft.after.notes?.trim() ? { notes: draft.after.notes.trim() } : {}),
    ...(draft.after.name?.trim() ? { name: draft.after.name.trim() } : {}),
    sportType: normalizeAdjustmentSportType(draft.after.sportType),
    reason: draft.reason,
  };
}
