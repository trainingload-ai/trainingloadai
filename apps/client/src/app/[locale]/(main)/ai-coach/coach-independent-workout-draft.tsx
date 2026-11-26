"use client";

import { createContext, useContext, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { fetchIndependentWorkoutDraft, type IndependentWorkoutDraft } from "@/api/plans";
import type { ParsedPlan } from "@/api/workout";
import { getSportDisplayName } from "@/api/sports";
import { WorkoutMiniChart } from "@/components/plan/mobile-plan-workout-row";
import { PlanWorkoutListRow } from "@/components/plan/plan-workout-list-row";
import { WorkoutEditorSheet } from "@/components/plan/WorkoutEditorSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadErrorState } from "@/components/ui/load-error-state";
import { ApiFetchError } from "@/lib/api-error";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { CalendarScheduleReloadOverlay } from "../calendar/components/calendar-schedule-reload-overlay";
import { CoachWorkoutPreview } from "./coach-workout-preview";
import { CoachPreviewCard } from "./cards/coach-preview-card";
import { CalendarPlus } from "lucide-react";

export const CoachIndependentWorkoutDraftContext = createContext<((id: string) => void) | null>(null);

function useDraft(id: string, enabled = true) {
  return useQuery({
    queryKey: ["independent-workout-draft", id],
    queryFn: () => fetchIndependentWorkoutDraft(id),
    enabled,
    retry: false,
    meta: { errorSurface: "inline" },
  });
}

export function CoachIndependentWorkoutDraftCard({ id }: { id: string }) {
  const open = useContext(CoachIndependentWorkoutDraftContext);
  const t = useTranslations("CalendarExperience.createWorkout");
  const move = useTranslations("CalendarMove");
  const sports = useTranslations("SportCatalog");
  const editor = useTranslations("WorkoutEditor.title");
  const format = useFormatter();
  const draft = useDraft(id, Boolean(open)).data;
  if (!open) return null;
  if (!draft) return (
    <CoachPreviewCard title={t("scopeIndependent")} icon={CalendarPlus}
      actionLabel={move("continueEditing")} onOpen={() => open(id)} />
  );

  const { workout } = draft;
  const status = draft.state === "READY" ? move("recovery.ready") : move(`adjustmentStates.${draft.state}`);
  const sport = getSportDisplayName([], {
    sportType: workout.sportType, sportDefinitionCode: workout.sportDefinitionCode,
  }, sports);
  const date = new Date(`${workout.scheduledDate}T00:00:00Z`);
  const validDate = Number.isFinite(date.getTime());
  const dateLabel = validDate ? format.dateTime(date, { month: "short", timeZone: "UTC" }) : undefined;
  const dayLabel = validDate ? format.dateTime(date, { day: "2-digit", timeZone: "UTC" }) : undefined;
  const structure = workout.definition?.source === "STRUCTURE" ? workout.definition.structure : undefined;
  const chart = structure?.kind === "ENDURANCE" ? (
    <WorkoutMiniChart workout={{ structure, sportType: workout.sportType, text: workout.text }} />
  ) : undefined;

  return <PlanWorkoutListRow title={workout.name?.trim() || sport} meta={sport}
    dateLabel={dateLabel} dayLabel={dayLabel} displayKind="upcoming"
    subtitle={workout.notes} statusLabel={status} chart={chart}
    ariaLabel={[workout.name?.trim() || sport, status, draft.state === "READY" ? move("continueEditing") : editor("view")].join(" · ")}
    onOpen={() => open(id)} />;
}

export function CoachIndependentWorkoutDraftPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const titleId = useId();
  const t = useTranslations("CalendarExperience.createWorkout");
  const move = useTranslations("CalendarMove");
  const editor = useTranslations("WorkoutEditor");
  const qc = useQueryClient();
  const draftQuery = useDraft(id);
  const draft = draftQuery.data;
  const [editing, setEditing] = useState<IndependentWorkoutDraft>();
  const [date, setDate] = useState("");
  const [stale, setStale] = useState(false);
  const initial = useMemo(() => {
    const workout = editing?.workout;
    if (!workout) return undefined;
    const structure = workout.definition?.source === "STRUCTURE" ? workout.definition.structure : undefined;
    return {
      ...workout, structure, notes: workout.notes ?? undefined,
      blocks: structure?.kind === "ENDURANCE" ? structure.blocks as ParsedPlan : null,
    };
  }, [editing]);
  const transition = useMutation({
    mutationFn: (input: NonNullable<Parameters<typeof fetchIndependentWorkoutDraft>[1]>) =>
      fetchIndependentWorkoutDraft(id, input),
    onSuccess: async (result) => {
      qc.setQueryData(["independent-workout-draft", id], result);
      if (result.state === "APPLIED") await invalidateAfterPlanMutation(qc);
    },
    onError: (error) => {
      if (error instanceof ApiFetchError && error.status === 409) setStale(true);
    },
  });

  const stateLabel = draft?.state === "READY" ? move("recovery.ready")
    : draft ? move(`adjustmentStates.${draft.state}`) : "";

  return (
    <section aria-labelledby={titleId} className="relative flex h-full min-h-0 flex-col gap-3 p-3">
      <header className="flex shrink-0 items-center justify-between gap-2">
        <h2 id={titleId} className="font-semibold">{t("scopeIndependent")}</h2>
        <Button type="button" size="sm" variant="ghost" disabled={transition.isPending} onClick={onClose}>
          {editor("buttons.close")}
        </Button>
      </header>
      {stale ? (
        <CalendarScheduleReloadOverlay title={move("adjustmentStates.STALE")} retryDraft
          onReload={() => draftQuery.refetch({ throwOnError: true })}
          onReloaded={() => { setEditing(undefined); setStale(false); transition.reset(); }}>
          <p>{move("adjustmentConflicts.WORKOUT_CHANGED")}</p>
        </CalendarScheduleReloadOverlay>
      ) : draftQuery.isError ? (
        <LoadErrorState retrying={draftQuery.isFetching} onRetry={() => void draftQuery.refetch({ cancelRefetch: false })} />
      ) : editing ? (
        <WorkoutEditorSheet inline open title={editor("title.edit")} saveLabel={editor("buttons.saveDraft")}
          initialValue={initial} showNameField
          headerExtra={<Input type="date" value={date} aria-label={move("targetDate")}
            onChange={(event) => setDate(event.target.value)} />}
          onOpenChange={(open) => { if (!open && !transition.isPending) setEditing(undefined); }}
          onSave={async (payload) => {
            await transition.mutateAsync({
              action: "SAVE", expectedRevision: editing.revision,
              workout: {
                scheduledDate: date, name: payload.name, notes: payload.notes,
                sportType: payload.sportType, sportDefinitionCode: payload.sportDefinitionCode, definition: payload.definition,
              },
            });
            setEditing(undefined);
          }} />
      ) : draft ? (
        <div className="min-h-0 space-y-3 overflow-y-auto">
          <div>
            <p role="status" className="text-xs text-muted-foreground">{stateLabel}</p>
            <h3 className="font-semibold">{draft.workout.name || t("title")}</h3>
            <p className="text-sm text-muted-foreground">{t("dateLabel", { date: draft.workout.scheduledDate })}</p>
            {draft.workout.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{draft.workout.notes}</p>}
            <CoachWorkoutPreview text={draft.workout.text || ""} sportType={draft.workout.sportType}
              kind={draft.workout.definition?.kind} />
          </div>
          {transition.isError && <p role="alert" className="text-sm text-destructive">{editor("errors.saveFailed")}</p>}
          <div className="flex flex-wrap gap-2">
            {(draft.state === "READY" || draft.state === "EXPIRED") && (
              <Button type="button" size="sm" variant="outline" disabled={transition.isPending} onClick={() =>
                transition.mutate({ action: "DISCARD", expectedRevision: draft.revision })}>{move("discard")}</Button>
            )}
            {draft.state === "READY" && (
              <>
                <Button type="button" size="sm" variant="outline" disabled={transition.isPending} onClick={() => {
                  setDate(draft.workout.scheduledDate);
                  setEditing(draft);
                }}>{editor("title.edit")}</Button>
                <Button type="button" size="sm" disabled={transition.isPending} onClick={() =>
                  transition.mutate({ action: "CONFIRM", expectedRevision: draft.revision })}>{t("create")}</Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{move("working")}</p>
      )}
    </section>
  );
}
