"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import type { PlanProposalPresentation } from "@shared/plan-proposal";
import { getScheduledWorkouts, type PlanWorkout } from "@/api/plans";
import type { ParsedPlan } from "@/api/workout";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { WorkoutDetailActions } from "@/components/plan/workout-detail-actions";
import { queryKeys } from "@/lib/query-keys";
import {
  WorkoutEditorSheet,
  type WorkoutEditorInitialValue,
  type WorkoutEditorPayload,
} from "@/components/plan/WorkoutEditorSheet";
import { CalendarMonthView } from "./CalendarMonthView";
import { canDropCalendarWorkout } from "./calendar-workout-drop";
import { CalendarMoveDatePicker } from "./calendar-move-date-picker";
import { MobileCalendarMonthPanel } from "./MobileCalendarMonthPanel";
import { calendarToday, projectCalendarProposal } from "./calendar-move-model";
import { calendarEditMoveSource, projectCalendarEdits, type CalendarEditDraft } from "./calendar-edit-draft";
import type { CalendarCreateKind } from "./calendar-context-actions";
import { useCalendarSchedule } from "./useCalendarViewModel";
import { calendarScrollFetchRange } from "./utils";
import { useCalendarScrollPosition } from "./use-calendar-scroll-position";
import { cn } from "@/lib/utils";

const newWorkout: WorkoutEditorInitialValue = {
  text: "work 45m",
  sportType: "RUN",
  sportDefinitionCode: "ROAD_RUNNING",
};

export function CalendarMovePreviewCalendar({
  initialDate,
  instanceId,
  planId,
  presentation,
  draft,
  canEdit,
  onEdit,
  renderActions,
}: {
  initialDate: string;
  instanceId?: string;
  planId: string;
  presentation: PlanProposalPresentation | null;
  draft?: {
    value: CalendarEditDraft | null;
    move: (workout: PlanWorkout, date: string) => void;
    add: (date: string, workout: WorkoutEditorPayload) => void;
    remove: (workout: PlanWorkout) => void;
    disabled: boolean;
  };
  canEdit?: (workout: PlanWorkout) => boolean;
  onEdit?: (
    workout: PlanWorkout,
    update: WorkoutEditorPayload,
  ) => Promise<void>;
  renderActions?: (reloadSchedule: () => Promise<Map<string, PlanWorkout>>) => ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations("CalendarExperience");
  const tm = useTranslations("CalendarMove");
  const td = useTranslations("ViewWorkoutDialog");
  const tc = useTranslations("CalendarExperience.createWorkout");
  const queryClient = useQueryClient();
  const moveTitleId = useId();
  const viewKey = ["calendar-editor-view", planId, instanceId] as const;
  const previousView = instanceId
    ? queryClient.getQueryData<{ date: string; month: string }>(viewKey)
    : undefined;
  const [date, setDate] = useState(() => dayjs(previousView?.date ?? initialDate));
  const { currentMonth, setCurrentMonth, displayedMonth, scroll, resetScrollAnchor } =
    useCalendarScrollPosition(() => dayjs(previousView?.month ?? date).startOf("month"));
  const [direction, setDirection] = useState<1 | -1>(1);
  const [selectedWorkout, setSelectedWorkout] = useState<PlanWorkout | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [creatingDate, setCreatingDate] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<PlanWorkout | null>(null);
  const detailsTrigger = useRef<HTMLElement | null>(null);
  const moveTrigger = useRef<HTMLElement | null>(null);
  const calendar = useRef<HTMLDivElement | null>(null);
  const initialValue = useMemo(
    () =>
      selectedWorkout
        ? {
            name: selectedWorkout.name,
            text: selectedWorkout.text,
            notes: selectedWorkout.notes ?? undefined,
            sportType: selectedWorkout.sportType,
            sportDefinitionCode: selectedWorkout.sportDefinitionCode,
            structureKind: selectedWorkout.structureKind,
            structure: selectedWorkout.structure,
            summary: selectedWorkout.summary,
            blocks:
              selectedWorkout.structure.kind === "ENDURANCE"
                ? (selectedWorkout.structure.blocks as ParsedPlan)
                : null,
          }
        : undefined,
    [selectedWorkout],
  );
  const { weeks, workoutsByDate, fetchStart, fetchEnd } = useCalendarSchedule(
    currentMonth, calendarScrollFetchRange(currentMonth),
  );
  const reloadSchedule = async () => {
    if (!fetchStart || !fetchEnd) throw new Error("Missing calendar window");
    const queryKey = queryKeys.plans.scheduled(fetchStart, fetchEnd);
    await queryClient.cancelQueries({ queryKey, exact: true });
    const schedule = await queryClient.fetchQuery({
      queryKey,
      queryFn: () => getScheduledWorkouts(fetchStart, fetchEnd, { suppressErrorToast: true }),
      staleTime: 0,
      retry: false,
    });
    return new Map(schedule.inPlan.map((workout) => [workout.id, workout]));
  };
  const selectedWeek =
    weeks.find((week) => week.some((day) => day.isSame(date, "day"))) ??
    weeks[0] ??
    [];
  const projected = useMemo(() => {
    const published = projectCalendarProposal(workoutsByDate, presentation, planId);
    return draft?.value ? projectCalendarEdits(published.workoutsByDate, draft.value, published.marks) : published;
  }, [planId, presentation, workoutsByDate, draft?.value]);
  const selectDate = (next: Dayjs, jump = false) => {
    setDate(next);
    if (instanceId) queryClient.setQueryData(viewKey, {
      date: next.format("YYYY-MM-DD"),
      month: next.startOf("month").format("YYYY-MM-DD"),
    });
    if (jump || !next.isSame(currentMonth, "month")) {
      setDirection(next.isBefore(currentMonth) ? -1 : 1);
      resetScrollAnchor(next);
      setCurrentMonth(next.startOf("month"));
    }
  };
  const navigate = (direction: 1 | -1, fromMonth?: string) => {
    const month = fromMonth ? dayjs(`${fromMonth}-01`) : displayedMonth;
    const destination = month.add(direction, "month");
    const target = destination.date(Math.min(date.date(), destination.daysInMonth()));
    selectDate(target, true);
  };
  const workoutChangeLabel = (workout: PlanWorkout) => {
    const mark = projected.marks.get(workout.id);
    return mark ? `${tm(mark.side)} · ${mark.number}` : undefined;
  };
  const openWorkout = (workout: PlanWorkout, trigger: EventTarget | null) => {
    detailsTrigger.current = trigger instanceof HTMLElement ? trigger : null;
    setEditing(false);
    setSelectedWorkout(workout);
  };

  const selectWorkout = (workout: PlanWorkout, workoutDate: Dayjs) => {
    if (draft) selectDate(workoutDate);
    openWorkout(workout, document.activeElement);
  };
  const createOnDate = draft && !draft.disabled ? (kind: CalendarCreateKind, target: Dayjs) => {
    if (kind !== "workout" || target.format("YYYY-MM-DD") < calendarToday()) return;
    selectDate(target);
    setCreatingDate(target.format("YYYY-MM-DD"));
  } : undefined;
  const closeWorkout = (open: boolean) => {
    if (open) return;
    setSelectedWorkout(null);
    requestAnimationFrame(() => {
      if (detailsTrigger.current?.getClientRects().length) detailsTrigger.current.focus();
      else calendar.current?.focus();
    });
  };
  const requestMove = (workout: PlanWorkout, trigger?: HTMLElement | null) => {
    moveTrigger.current = trigger ?? null;
    setMoveTarget(workout);
  };
  const stageMove = draft && !draft.disabled ? (workout: PlanWorkout, date: string) => {
    if (!canEdit?.(workout) || !canDropCalendarWorkout(workout, date)) return;
    draft.move(workout, date);
    selectDate(dayjs(date));
  } : undefined;
  const getMoveWorkout = stageMove ? (workout: PlanWorkout) => {
    const mark = projected.marks.get(workout.id);
    const counterpart = mark?.side === "before"
      ? Object.values(projected.workoutsByDate).flat().find(({ id }) => `original:${id}` === workout.id)
      : undefined;
    const source = calendarEditMoveSource(draft?.value ?? null, workout, mark, counterpart);
    return source && canEdit?.(source) ? source : undefined;
  } : undefined;

  return (
    <div
      ref={calendar}
      tabIndex={-1}
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-col",
        draft && "pb-12",
      )}
      data-calendar-proposal
    >
      <CalendarMonthView
        className="gap-2"
        header={{
          monthLabel: new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "long",
          }).format(displayedMonth.toDate()),
          currentMonthDate: displayedMonth.toDate(),
          displayMode: "month",
          showDisplayModeToggle: false,
          onPrev: () => navigate(-1),
          onNext: () => navigate(1),
          onToday: () => selectDate(dayjs(), true),
          onMonthChange: (month) => selectDate(dayjs(month), true),
        }}
        compact={(
          <MobileCalendarMonthPanel
            className="h-auto px-0 pb-0 pt-0"
            showMonthHeading={false}
            currentMonth={currentMonth}
            weeks={weeks}
            selectedDate={date}
            onSelectDate={selectDate}
            onNavigateMonth={navigate}
            onSelectActivity={() => undefined}
            onSelectCompetition={() => undefined}
            onSelectWorkout={selectWorkout}
            onCreateOnDate={createOnDate}
            createWorkoutOnly
            dayActions={createOnDate && date.format("YYYY-MM-DD") >= calendarToday() ? (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t("createWorkoutButton")}
                onClick={() => createOnDate("workout", date)}
              >
                <Plus aria-hidden />
              </Button>
            ) : null}
            onMoveWorkout={stageMove}
            getMoveWorkout={getMoveWorkout}
            onRequestMoveWorkout={stageMove ? requestMove : undefined}
            workoutChangeMarks={projected.marks}
            activitiesByDate={{}}
            workoutsByDate={projected.workoutsByDate}
            competitionEventsByDate={{}}
            tssByDate={{}}
          />
        )}
        grid={{
          currentMonth,
          visibleMonth: displayedMonth,
          selectedDate: date,
          selectedWeek,
          weeks,
          displayMode: "month",
          navigationDirection: direction,
          onSelectDate: selectDate,
          ...scroll,
          onScrollMonth: navigate,
          onPrev: () => navigate(-1),
          onNext: () => navigate(1),
          activitiesByDate: {},
          workoutsByDate: projected.workoutsByDate,
          competitionEventsByDate: {},
          onSelectWorkout: selectWorkout,
          onMoveWorkout: stageMove,
          getMoveWorkout,
          onCreateOnDate: createOnDate,
          createWorkoutOnly: true,
          presentWorkout: (workout) => {
            const mark = projected.marks.get(workout.id);
            return {
              caption: workoutChangeLabel(workout),
              mark,
              contextMenu: draft && canEdit?.(workout) ? (trigger) => (
                <ContextMenu modal={false}>
                  <ContextMenuTrigger asChild onContextMenu={(event) => event.stopPropagation()}>
                    {trigger}
                  </ContextMenuTrigger>
                  <ContextMenuContent onClick={(event) => event.stopPropagation()}>
                    <ContextMenuItem onSelect={() => requestMove(workout)}>{tm("moveWorkout")}</ContextMenuItem>
                    <ContextMenuItem onSelect={() => {
                      openWorkout(workout, document.activeElement);
                      setEditing(true);
                    }}>{tm("editWorkout")}</ContextMenuItem>
                    {workout.capabilities?.delete !== false ? (
                      <ContextMenuItem onSelect={() => {
                        draft.remove(workout);
                        requestAnimationFrame(() => calendar.current?.focus({ preventScroll: true }));
                      }}>
                        {td("actionDelete")}
                      </ContextMenuItem>
                    ) : null}
                  </ContextMenuContent>
                </ContextMenu>
              ) : undefined,
            };
          },
        }}
      />
      {renderActions?.(reloadSchedule)}
      {selectedWorkout ? (
        <WorkoutEditorSheet
          open
          onOpenChange={closeWorkout}
          title={selectedWorkout.name || t("plannedTraining")}
          readOnly={!editing || !canEdit?.(selectedWorkout)}
          initialValue={initialValue}
          showNameField={editing}
          saveLabel={tm(draft ? "stageEdit" : "updateDraft")}
          onSave={async (update) => onEdit?.(selectedWorkout, update)}
          footerActions={
            !editing && canEdit?.(selectedWorkout) ? (
              <WorkoutDetailActions
                onEdit={() => setEditing(true)}
                onMove={draft ? () => {
                  requestMove(selectedWorkout, detailsTrigger.current);
                  setSelectedWorkout(null);
                } : undefined}
                capabilities={{ delete: selectedWorkout.capabilities?.delete !== false }}
                confirmDelete={false}
                onDelete={draft ? () => {
                  draft.remove(selectedWorkout);
                  closeWorkout(false);
                } : undefined}
              />
            ) : undefined
          }
        />
      ) : null}
      {creatingDate && draft ? (
        <WorkoutEditorSheet
          open
          title={tc("title")}
          onOpenChange={(open) => { if (!open) setCreatingDate(null); }}
          initialValue={newWorkout}
          showNameField
          saveLabel={tm("stageEdit")}
          onSave={async (workout) => draft.add(creatingDate, workout)}
        />
      ) : null}
      {moveTarget?.scheduledDate ? (
        <Dialog open onOpenChange={(open) => { if (!open) setMoveTarget(null); }}>
          <DialogContent
            aria-labelledby={moveTitleId}
            className="bg-background md:mx-auto md:max-w-[34rem] pc:right-auto pc:max-w-[34rem]"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const trigger = moveTrigger.current;
              moveTrigger.current = null;
              requestAnimationFrame(() => {
                const target = trigger?.getClientRects().length ? trigger : calendar.current;
                target?.focus({ preventScroll: true });
              });
            }}
          >
            <header className="space-y-1 pr-12">
              <DialogTitle id={moveTitleId}>{tm("title")}</DialogTitle>
              <DialogDescription>{tm("chooseDate")}</DialogDescription>
            </header>
            <CalendarMoveDatePicker
              scheduledDate={moveTarget.scheduledDate}
              targetWindow={moveTarget.calendarMoveWindow}
              onSelect={(date) => {
                stageMove?.(moveTarget, date);
                setMoveTarget(null);
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
