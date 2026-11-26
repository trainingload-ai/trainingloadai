import dayjs from "dayjs";
import type { PlanWorkout } from "@/api/plans";
import type { PlanProposalPresentation } from "@shared/plan-proposal";

export const CALENDAR_WORKOUT_DRAG = "application/x-trainingload-workout";

export type CalendarProposalMark = { number: number; side: "before" | "after" };

export const calendarToday = () => dayjs().format("YYYY-MM-DD");

export function canMoveCalendarWorkout(
  workout: PlanWorkout | undefined,
): workout is PlanWorkout & {
  planId: string;
  revision: number;
  scheduledDate: string;
} {
  return Boolean(
    workout?.planId &&
    workout?.scheduledDate &&
    workout.scheduledDate >= (workout.calendarTodayYmd ?? calendarToday()) &&
    workout.status === "PLANNED" &&
    Number.isInteger(workout.revision) &&
    workout.calendarMoveAllowed !== false &&
    workout.capabilities?.postpone !== false &&
    !workout.links?.some((link) => !link.unlinkedAt),
  );
}

export function calendarWorkoutDropRejection(
  workout: PlanWorkout | undefined,
) {
  if (!workout?.planId || !workout.scheduledDate) return null;
  if (workout.status === "DONE") return "completedDrop";
  if (workout.status === "PLANNED" && workout.scheduledDate < (workout.calendarTodayYmd ?? calendarToday()))
    return "missedDrop";
  return null;
}

export function projectCalendarProposal(
  workoutsByDate: Record<string, PlanWorkout[]>,
  presentation: PlanProposalPresentation | null,
  planId: string,
) {
  const marks = new Map<string, CalendarProposalMark>();
  if (!presentation) return {
    workoutsByDate: Object.fromEntries(
      Object.entries(workoutsByDate).map(([date, workouts]) => [
        date,
        workouts.filter((workout) => workout.planId === planId),
      ]),
    ),
    marks,
  };
  const affected = presentation.rows.filter(
    (row) => row.changeKind && row.changeKind !== "PRESERVED",
  );
  const ids = new Set(
    affected.flatMap((row) => (row.workoutId ? [row.workoutId] : [])),
  );
  const original = Object.values(workoutsByDate).flat();
  const draftStart =
    presentation.calendarDraftStartDate ?? presentation.startDate;
  const draftByDate = new Map<
    string,
    NonNullable<PlanProposalPresentation["calendarDraft"]>["workouts"]
  >();
  if (draftStart) {
    for (const workout of presentation.calendarDraft?.workouts ?? []) {
      const date = dayjs(draftStart)
        .add((workout.weekIndex - 1) * 7 + workout.dayIndex - 1, "day")
        .format("YYYY-MM-DD");
      const workouts = draftByDate.get(date) ?? [];
      workouts.push(workout);
      draftByDate.set(date, workouts);
    }
  }
  const projected = Object.fromEntries(
    Object.entries(workoutsByDate).map(([day, workouts]) => [
      day,
      workouts.filter((workout) => workout.planId === planId && !ids.has(workout.id)),
    ]),
  );
  for (const [index, row] of affected.entries()) {
    const prior = original.find((workout) => workout.id === row.workoutId);
    if (prior?.scheduledDate) {
      const ghostId = `original:${prior.id}`;
      (projected[prior.scheduledDate] ??= []).unshift({
        ...prior,
        id: ghostId,
      });
      marks.set(ghostId, { number: index + 1, side: "before" });
    }
    if (!row.scheduledDate || row.changeKind === "DELETED") continue;
    const draft = draftByDate
      .get(row.scheduledDate)
      ?.find(
        (workout) => row.candidateKey ? workout.candidateKey === row.candidateKey
          : workout.sourceWorkoutId ? workout.sourceWorkoutId === row.workoutId
          : workout.text === row.after && workout.sportType === row.sportType,
      );
    const unchangedStructure =
      row.before === row.after && prior?.sportType === row.sportType;
    const structure = draft?.structure ??
      (unchangedStructure ? prior?.structure : undefined) ?? {
        kind: "FREEFORM" as const,
        version: 1 as const,
        text: row.after,
      };
    const id = prior?.id ?? row.workoutId ?? (row.candidateKey ? `candidate:${row.candidateKey}` : `preview:${index}`);
    const workout: PlanWorkout = {
      id,
      planId,
      dayOffset: 0,
      weekIndex: 1,
      dayIndex: 1,
      sessionIndex: 1,
      status: "PLANNED",
      dslVersion: 1,
      ...prior,
      revision: row.candidateKey ? 0 : prior?.revision ?? row.sourceRevision,
      structureKind: structure.kind,
      structure,
      summary: draft?.summary ??
        (unchangedStructure ? prior?.summary : undefined) ?? {
          kind: "FREEFORM",
          durationSeconds: null,
          hardSession: null,
        },
      scheduledDate: row.scheduledDate,
      sportType: row.sportType as PlanWorkout["sportType"],
      sportDefinitionCode:
        draft?.sportDefinitionCode ?? prior?.sportDefinitionCode,
      name: row.name,
      notes: draft?.notes ?? prior?.notes,
      text: row.after,
    };
    (projected[row.scheduledDate] ??= []).unshift(workout);
    marks.set(id, { number: index + 1, side: "after" });
  }
  return { workoutsByDate: projected, marks };
}
