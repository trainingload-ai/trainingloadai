"use client";

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import {
  getOfficialPlanStart, saveOfficialPlanStartDate, startOfficialPlanDraft,
  updatePlanWorkout, type PlanWorkout, type UpdatePlanWorkoutDto,
} from "@/api/plans";
import { CalendarMovePreviewCalendar } from "@/app/[locale]/(main)/calendar/components/calendar-move-preview-calendar";
import { canMoveCalendarWorkout } from "@/app/[locale]/(main)/calendar/components/calendar-move-model";
import CalendarSelect from "@/components/calendar-select";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LoadErrorState } from "@/components/ui/load-error-state";
import { ApiFetchError } from "@/lib/api";
import { useCalendarWeekStartsOn } from "@/lib/calendar-week-start";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { queryKeys } from "@/lib/query-keys";
import {
  draftWorkoutPosition,
  isCalendarDate,
  parseScheduleConstraints,
  projectPlanCalendar,
} from "@shared/plan-calendar";

export function OfficialPlanStartCalendar({ planId, close }: { planId: string; close: () => void }) {
  const t = useTranslations("PlanActivationDialog");
  const startup = useTranslations("PlanStartConversation");
  const calendar = useTranslations("AiCoachPage.planDraft");
  const editor = useTranslations("WorkoutEditor.buttons");
  const overview = useTranslations("V2PlanDetailPage.overview");
  const fmt = useFormatter();
  const cache = useQueryClient();
  const weekStartsOn = useCalendarWeekStartsOn();
  const draft = useQuery({
    queryKey: ["official-plan-start", planId],
    queryFn: () => getOfficialPlanStart(planId),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [error, setError] = useState<"refresh" | "start" | "edit" | undefined>();
  const [editorReset, setEditorReset] = useState(0);
  const current = draft.data;
  const startDate = current?.startDate;
  const projection = useMemo(() => {
    if (!current?.plan.periodWeeks || !startDate) return undefined;
    return projectPlanCalendar({
      workouts: current.plan.workouts,
      periodWeeks: current.plan.periodWeeks,
      startDate,
      calendarTimeZone: current.calendarTimeZone,
      constraints: parseScheduleConstraints(current.plan.generationMetadata?.scheduleConstraints),
    });
  }, [current, startDate]);
  const schedule = useMemo(() => {
    const dates: Record<string, PlanWorkout[]> = {};
    if (!projection || !current) return dates;
    for (const { workout, dayOffset, date } of projection.workouts) {
      (dates[date] ??= []).push({
        ...workout, dayOffset, scheduledDate: date,
        calendarTodayYmd: current.earliestStartDate,
        calendarMoveWindow: { from: projection.startDate, through: projection.endDate },
      });
    }
    for (const day of Object.values(dates)) day.sort((a, b) => a.sessionIndex - b.sessionIndex);
    return dates;
  }, [projection, current]);

  const refresh = async () => {
    const latest = await draft.refetch({ throwOnError: true });
    if (!latest.data) throw new Error("OFFICIAL_DRAFT_UNAVAILABLE");
    cache.setQueryData(queryKeys.plans.detail(planId), latest.data.plan);
    void cache.invalidateQueries({ queryKey: queryKeys.plans.list() });
  };
  const edit = useMutation({
    mutationFn: async ({ workout, changes }: { workout: PlanWorkout; changes: Partial<UpdatePlanWorkoutDto> }) => {
      const saved = await updatePlanWorkout(planId, workout.id, {
        expectedRevision: workout.revision,
        expectedPlanStatus: "DRAFT",
        weekIndex: workout.weekIndex,
        dayIndex: workout.dayIndex,
        sessionIndex: workout.sessionIndex,
        name: workout.name,
        notes: workout.notes,
        sportType: workout.sportType,
        sportDefinitionCode: workout.sportDefinitionCode,
        definition: { kind: workout.structureKind, version: 1, source: "STRUCTURE", structure: workout.structure },
        ...changes,
      });
      if (!saved) throw new Error("OFFICIAL_WORKOUT_UPDATE_FAILED");
      await refresh();
    },
    onMutate: () => setError(undefined),
    onError: async (failure) => {
      if (failure instanceof ApiFetchError && failure.status === 409) {
        setError("refresh");
        await refresh().catch(() => undefined);
        setEditorReset((value) => value + 1);
      } else setError("edit");
    },
  });
  const dateSave = useMutation({
    mutationFn: ({ date, revision }: { date: string; revision: string }) =>
      saveOfficialPlanStartDate(planId, date, revision),
    onMutate: () => setError(undefined),
    onSuccess: async () => { await refresh().catch(() => setError("refresh")); },
    onError: async () => {
      setError("refresh");
      await refresh().catch(() => undefined);
    },
  });
  const start = useMutation({
    mutationFn: (input: { date: string; revision: string }) => startOfficialPlanDraft(planId, input.date, input.revision),
    onMutate: () => setError(undefined),
    onSuccess: (plan) => {
      cache.setQueryData(queryKeys.plans.detail(planId), plan);
      close();
      void invalidateAfterPlanMutation(cache, { planId });
    },
    onError: async (failure) => {
      if (failure instanceof ApiFetchError && failure.status === 409) {
        setError("refresh");
        await refresh().catch(() => undefined);
      } else {
        setError("start");
      }
    },
  });

  if (draft.isError || (!draft.isPending && !projection)) {
    return <LoadErrorState retrying={draft.isFetching} onRetry={() => void draft.refetch()} />;
  }
  if (!current || !startDate || !projection) return <p role="status" className="px-4 text-sm text-muted-foreground">{t("loadingDraft")}</p>;
  const busy = draft.isFetching || edit.isPending || dateSave.isPending || start.isPending;
  const editable = current.plan.status === "DRAFT";
  const conflicts = [...new Set(projection.conflicts.map((issue) => issue.date))];
  const canStart = editable && !busy && startDate >= current.earliestStartDate && conflicts.length === 0 && current.plan.workouts.length > 0;
  const dateLabel = (date: string) => fmt.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const move = (workout: PlanWorkout, date: string) => {
    edit.mutate({ workout, changes: draftWorkoutPosition(startDate, date, schedule[date] ?? []) });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 sm:px-4">
      <p className="text-xs text-muted-foreground">
        {overview("weekCount", { count: current.plan.periodWeeks! })}
      </p>
      <section className="min-h-0 flex-1 overflow-hidden" aria-label={startup("pendingCalendar")}>
        <CalendarMovePreviewCalendar
          key={`${startDate}:${editorReset}`}
          planId={planId}
          initialDate={Object.keys(schedule).sort()[0] ?? startDate}
          schedule={schedule}
          presentation={null}
          draft={editable ? { value: null, move, disabled: busy } : undefined}
          canEdit={(workout) => editable && (!current.targetRaceDate || workout.scheduledDate !== current.targetRaceDate) && canMoveCalendarWorkout(workout)}
          saveLabel={editor("saveDraft")}
          onEdit={async (workout, { name, notes, sportType, sportDefinitionCode, definition }) => {
            await edit.mutateAsync({ workout, changes: { name, notes, sportType, sportDefinitionCode, definition } });
          }}
        />
      </section>
      <DialogFooter className="shrink-0 flex-col border-t border-border/60 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] sm:flex-col sm:pt-3 pc:pb-0">
        {error ? <p role="alert" className="text-sm text-destructive">{t(error === "refresh" ? "changedDraft" : error === "start" ? "startFailed" : "editFailed")}</p> : null}
        {conflicts.length ? <p role="status" className="text-sm text-destructive">{calendar("scheduleConflict")} · {conflicts.map(dateLabel).join("、")}</p> : null}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <div className="flex min-w-fit flex-1 items-center gap-2 sm:flex-none sm:gap-3">
            <Label htmlFor="official-plan-start-date" className="shrink-0 text-muted-foreground">
              {startup("dateLabel")}
            </Label>
            <CalendarSelect
              id="official-plan-start-date"
              title={startup("dateLabel")}
              date={dayjs(startDate).hour(12).toDate()}
              dateLabel={dateLabel(startDate)}
              fromDate={dayjs(current.earliestStartDate).toDate()}
              fromYear={dayjs(current.earliestStartDate).year()}
              weekStartsOn={weekStartsOn}
              size="default"
              className="sm:w-auto"
              disabled={!editable || busy || current.targetRaceDate ? true : { before: dayjs(current.earliestStartDate).toDate() }}
              onSelect={(date) => {
                const value = date && dayjs(date).format("YYYY-MM-DD");
                if (!busy && isCalendarDate(value) && value >= current.earliestStartDate && value !== startDate) {
                  dateSave.mutate({ date: value, revision: current.revision });
                }
              }}
            />
          </div>
          <Button size="default" disabled={!canStart} onClick={() => start.mutate({ date: startDate, revision: current.revision })}>
            {editable ? t("title") : startup("activePlanCalendar")}
          </Button>
        </div>
      </DialogFooter>
    </div>
  );
}
