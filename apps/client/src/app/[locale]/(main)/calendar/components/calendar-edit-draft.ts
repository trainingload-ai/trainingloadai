import type { PlanCalendarEdit } from "@shared/plan-proposal";
import type { PlanWorkout } from "@/api/plans";
import type { WorkoutEditorPayload } from "@/components/plan/WorkoutEditorSheet";
import {
  canMoveCalendarWorkout,
  type CalendarProposalMark,
} from "./calendar-move-model";

export type CalendarDraftEntry =
  | { kind: "ADD"; after: PlanWorkout; payload: WorkoutEditorPayload }
  | {
      kind: "UPDATE";
      before: PlanWorkout;
      after: PlanWorkout;
      payload?: WorkoutEditorPayload;
    }
  | { kind: "DELETE"; before: PlanWorkout };

export type CalendarEditDraft = {
  batchId: string;
  baseVersionId?: string;
  entries: Record<string, CalendarDraftEntry>;
};

export function calendarEditMoveSource(
  draft: CalendarEditDraft | null,
  workout: PlanWorkout,
  mark?: CalendarProposalMark,
  projectedWorkout?: PlanWorkout,
): PlanWorkout | undefined {
  const fromBefore = mark?.side === "before";
  const id = fromBefore ? workout.id.replace(/^original:/, "") : workout.id;
  const entry = draft?.entries[id];
  if (entry?.kind === "UPDATE") {
    return canMoveCalendarWorkout(entry.before) &&
      canMoveCalendarWorkout(entry.after)
      ? entry.after
      : undefined;
  }
  const source = fromBefore ? projectedWorkout : workout;
  return canMoveCalendarWorkout(source) && canMoveCalendarWorkout(workout)
    ? source
    : undefined;
}

export function calendarDraftEdits(
  draft: CalendarEditDraft,
): PlanCalendarEdit[] {
  return Object.values(draft.entries).map((entry) => {
    if (entry.kind === "DELETE") {
      return {
        kind: entry.kind,
        workoutId: entry.before.id,
        expectedRevision: entry.before.revision!,
      };
    }
    const workout = entry.payload && {
      sportType: entry.payload.sportType,
      sportDefinitionCode: entry.payload.sportDefinitionCode,
      name: entry.payload.name,
      notes: entry.payload.notes || null,
      definition: entry.payload.definition,
    };
    const targetDate = entry.after.scheduledDate!;
    return entry.kind === "ADD"
      ? {
          kind: entry.kind,
          candidateKey: entry.after.id,
          targetDate,
          workout: workout!,
        }
      : {
          kind: entry.kind,
          workoutId: entry.before.id,
          expectedRevision: entry.before.revision!,
          targetDate,
          workout,
        };
  });
}

export function projectCalendarEdits(
  workoutsByDate: Record<string, PlanWorkout[]>,
  draft: CalendarEditDraft,
  baseMarks: ReadonlyMap<string, CalendarProposalMark> = new Map(),
) {
  const projected = Object.fromEntries(
    Object.entries(workoutsByDate).map(([date, workouts]) => [
      date,
      workouts.filter((workout) => !draft.entries[workout.id]),
    ]),
  );
  const marks = new Map(baseMarks);
  let number = Math.max(
    0,
    ...Array.from(marks.values(), (mark) => mark.number),
  );
  for (const [id, entry] of Object.entries(draft.entries)) {
    const currentMark = marks.get(id);
    const comparison = currentMark?.number ?? ++number;
    if (entry.kind !== "ADD" && !currentMark) {
      const before = { ...entry.before, id: `original:${entry.before.id}` };
      (projected[before.scheduledDate!] ??= []).unshift(before);
      marks.set(before.id, { number: comparison, side: "before" });
    }
    if (entry.kind !== "DELETE") {
      (projected[entry.after.scheduledDate!] ??= []).unshift(entry.after);
      marks.set(entry.after.id, { number: comparison, side: "after" });
    }
  }
  return { workoutsByDate: projected, marks };
}

export function refreshCalendarEditDraft(
  draft: CalendarEditDraft,
  workouts: ReadonlyMap<string, PlanWorkout>,
  batchId: string,
  baseVersionId?: string,
): CalendarEditDraft {
  return {
    batchId,
    baseVersionId,
    entries: Object.fromEntries(
      Object.entries(draft.entries).map(([id, entry]) => {
        const published = workouts.get(id);
        if (entry.kind === "ADD" || !canMoveCalendarWorkout(published))
          return [id, entry];
        if (entry.kind === "DELETE")
          return [id, { ...entry, before: published }];
        return [
          id,
          {
            ...entry,
            before: published,
            after: {
              ...published,
              ...entry.payload,
              scheduledDate: entry.after.scheduledDate,
            },
          },
        ];
      }),
    ),
  };
}
