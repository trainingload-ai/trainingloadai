"use client";

import { useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { getScheduledWorkouts, updateIndependentWorkout, type PlanWorkout } from "@/api/plans";
import type { ParsedPlan } from "@/api/workout";
import { WorkoutEditorSheet } from "@/components/plan/WorkoutEditorSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadErrorState } from "@/components/ui/load-error-state";
import { ApiFetchError } from "@/lib/api-error";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";
import { CalendarCreateWorkoutSheet } from "../calendar/components/calendar-create-workout-sheet";
import { calendarToday } from "../calendar/components/calendar-move-model";
import { CalendarScheduleReloadOverlay } from "../calendar/components/calendar-schedule-reload-overlay";

export function CoachIndependentWorkoutPanel({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const t = useTranslations("CalendarExperience");
  const tMove = useTranslations("CalendarMove");
  const tEditor = useTranslations("WorkoutEditor");
  const tDetail = useTranslations("ViewWorkoutDialog");
  const qc = useQueryClient();
  const [date, setDate] = useState(calendarToday);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PlanWorkout>();
  const editingInitialValue = useMemo(() => editing && ({
    ...editing,
    notes: editing.notes ?? undefined,
    blocks: editing.structure.kind === "ENDURANCE" ? editing.structure.blocks as ParsedPlan : null,
  }), [editing]);
  const [editingDate, setEditingDate] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const schedule = useQuery({
    queryKey: queryKeys.plans.scheduled(date, date),
    queryFn: () => getScheduledWorkouts(date, date, { suppressErrorToast: true }),
    retry: false,
    meta: { errorSurface: "inline" },
  });

  return (
    <section aria-labelledby={titleId} className="relative flex h-full min-h-0 flex-col gap-3 p-3">
      <header className="flex shrink-0 items-center justify-between gap-2">
        <h2 id={titleId} className="font-semibold">{t("createWorkout.scopeIndependent")}</h2>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>{tEditor("buttons.close")}</Button>
      </header>
      {needsRefresh ? (
        <CalendarScheduleReloadOverlay
          title={tMove("adjustmentStates.STALE")}
          onReload={() => schedule.refetch({ throwOnError: true })}
          onReloaded={() => { setEditing(undefined); setNeedsRefresh(false); }}
        >
          <p>{tMove("adjustmentConflicts.WORKOUT_CHANGED")}</p>
        </CalendarScheduleReloadOverlay>
      ) : creating ? (
        <CalendarCreateWorkoutSheet inline open scheduledDate={date} defaultScope="independent"
          onOpenChange={(open) => { if (!open) setCreating(false); }} />
      ) : editing ? (
        <WorkoutEditorSheet inline open title={tEditor("title.edit")} saveLabel={tDetail("saveWorkout")} showNameField
          initialValue={editingInitialValue}
          headerExtra={<Input type="date" min={calendarToday()} value={editingDate}
            aria-label={t("createWorkout.dateLabel", { date: editingDate })}
            onChange={(event) => setEditingDate(event.target.value)} />}
          onOpenChange={(open) => { if (!open) setEditing(undefined); }}
          onSave={async (payload) => {
            if (!editingDate || !editing.revision) throw new Error(tEditor("errors.saveFailed"));
            if (editingDate < calendarToday()) throw new Error(tMove("adjustmentConflicts.TARGET_DATE"));
            try {
              const saved = await updateIndependentWorkout(editing.id, {
                expectedRevision: editing.revision, scheduledDate: editingDate,
                name: payload.name, notes: payload.notes, sportType: payload.sportType,
                sportDefinitionCode: payload.sportDefinitionCode, definition: payload.definition,
              });
              if (!saved) throw new Error(tEditor("errors.saveFailed"));
              await invalidateAfterPlanMutation(qc);
              setDate(editingDate);
            } catch (error) {
              if (error instanceof ApiFetchError && error.status === 409) setNeedsRefresh(true);
              throw error;
            }
          }} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={date} aria-label={t("createWorkout.dateLabel", { date })}
              className="w-auto" onChange={(event) => { if (event.target.value) setDate(event.target.value); }} />
            <Button type="button" size="sm" disabled={date < calendarToday()} onClick={() => setCreating(true)}>{t("createWorkout.title")}</Button>
          </div>
          {schedule.isError && <LoadErrorState retrying={schedule.isFetching}
            onRetry={() => void schedule.refetch({ cancelRefetch: false })} />}
          <ul className="space-y-2 overflow-y-auto">
            {schedule.data?.independent.map((workout) => (
              <li key={workout.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <span>{workout.name || t("plannedTraining")}</span>
                {workout.capabilities?.edit && <Button type="button" size="sm" variant="outline"
                  onClick={() => {
                    setEditingDate(workout.scheduledDate ?? date);
                    setEditing(workout);
                  }}>{tEditor("title.edit")}</Button>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
