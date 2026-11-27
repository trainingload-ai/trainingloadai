"use client";

import React from "react";
import type { Dayjs } from "dayjs";
import type { Activity } from "@/api/activities";
import type { PlanWorkout } from "@/api/plans";
import {
  getPlanWorkoutDisplayKind,
  getPlanWorkoutStatusLabel,
} from "@/components/plan/detail/plan-detail-utils";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  CalendarDateContextMenu,
  CalendarWorkoutContextMenu,
  type CalendarCreateKind,
} from "./calendar-context-actions";
import {
  CALENDAR_WORKOUT_DRAG,
  type CalendarProposalMark,
  canMoveCalendarWorkout,
} from "./calendar-move-model";
import { calendarProposalStyle } from "./calendar-proposal-appearance";
import { calendarDropDayClass, type CalendarDropAppearance } from "./calendar-workout-drop";
import { CalendarWorkoutPreview, calendarWorkoutStatusClassName } from "./CalendarWorkoutPreview";

export type CalendarWorkoutPresentation = {
  caption?: string;
  mark?: CalendarProposalMark;
  contextMenu?: (trigger: React.ReactElement) => React.ReactElement;
};

type CalendarDayButtonProps = {
  date: Dayjs;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  activities?: Activity[];
  planWorkouts?: PlanWorkout[];
  competitionLaneCount?: number;
  tss?: number;
  inPlanRange?: boolean;
  onSelect: () => void;
  onSelectWorkout?: (workout: PlanWorkout) => void;
  workoutDrag?: {
    acceptsDropEvent: boolean;
    appearance?: CalendarDropAppearance;
    onStart: (workout: PlanWorkout) => void;
    onHover: () => void;
    onLeave: () => void;
    onDrop: (workoutId: string) => void;
  };
  presentWorkout?: (workout: PlanWorkout) => CalendarWorkoutPresentation;
  onCreate?: (kind: CalendarCreateKind) => void;
  onAdjustSchedule?: () => void;
  createWorkoutOnly?: boolean;
  onRequestMove?: (workout: PlanWorkout, trigger?: HTMLElement | null) => void;
  getMoveWorkout?: (workout: PlanWorkout) => PlanWorkout | undefined;
};

export function CalendarDayButton({
  date,
  isCurrentMonth,
  isToday,
  isSelected,
  activities = [],
  planWorkouts = [],
  competitionLaneCount = 0,
  tss,
  inPlanRange = false,
  onSelect,
  onSelectWorkout,
  workoutDrag,
  presentWorkout,
  onCreate,
  onAdjustSchedule,
  createWorkoutOnly,
  onRequestMove,
  getMoveWorkout,
}: CalendarDayButtonProps) {
  const t = useTranslations("CalendarExperience");
  const tPlan = useTranslations("V2PlanDetailPage");
  const renderWorkout = (workout: PlanWorkout) => {
    const title = workout.name?.trim() || t("plannedTraining");
    const status = getPlanWorkoutDisplayKind(workout);
    const presentation = presentWorkout?.(workout);
    const mark = presentation?.mark;
    const source = getMoveWorkout ? getMoveWorkout(workout) : workout;
    const draggable = Boolean(workoutDrag && canMoveCalendarWorkout(source));
    const interaction = {
      "data-calendar-workout": workout.id,
      draggable,
      onDragStart: draggable && workoutDrag && source
        ? (event: React.DragEvent<HTMLElement>) => {
            event.dataTransfer.setData(CALENDAR_WORKOUT_DRAG, source.id);
            event.dataTransfer.effectAllowed = "move";
            event.currentTarget.focus({ preventScroll: true });
            workoutDrag.onStart(source);
          }
        : undefined,
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        if (onSelectWorkout) onSelectWorkout(workout);
        else onSelect();
      },
    };
    const dragClass = draggable && "cursor-grab active:cursor-grabbing";
    const card = (
      <button
        {...interaction}
        type="button"
        data-calendar-change={mark?.side}
        style={calendarProposalStyle(mark, "card")}
        aria-label={presentation?.caption ? `${title} · ${presentation.caption}` : title}
        aria-description={mark ? undefined : getPlanWorkoutStatusLabel(tPlan, status)}
        className={cn(
          "pointer-events-auto flex min-w-0 flex-col gap-1 rounded-xs p-1 text-start hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-110",
          !mark && calendarWorkoutStatusClassName(status),
          dragClass,
        )}
      >
        <CalendarWorkoutPreview workout={workout} title={title} caption={presentation?.caption} />
      </button>
    );
    if (presentation?.contextMenu) return presentation.contextMenu(card);
    return onCreate && !createWorkoutOnly ? (
      <CalendarWorkoutContextMenu workout={workout} trigger={card} onMove={onRequestMove} />
    ) : card;
  };

  const dateKey = date.format("YYYY-MM-DD");
  const dropHandlers = {
    "data-calendar-date": dateKey,
    "data-workout-drop": workoutDrag?.appearance,
    onDragOver: workoutDrag?.acceptsDropEvent
      ? (event: React.DragEvent<HTMLElement>) => {
          if (!event.dataTransfer.types.includes(CALENDAR_WORKOUT_DRAG)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          workoutDrag.onHover();
        }
      : undefined,
    onDragLeave: workoutDrag?.appearance === "target"
      ? (event: React.DragEvent<HTMLElement>) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          workoutDrag.onLeave();
        }
      : undefined,
    onDrop: workoutDrag?.acceptsDropEvent
      ? (event: React.DragEvent<HTMLElement>) => {
          const workoutId = event.dataTransfer.getData(CALENDAR_WORKOUT_DRAG);
          if (!workoutId) return;
          event.preventDefault();
          workoutDrag.onDrop(workoutId);
        }
      : undefined,
  };
  const dropClass = workoutDrag?.appearance && calendarDropDayClass[workoutDrag.appearance];
  const withDateMenu = (cell: React.ReactElement) =>
    onCreate ? <CalendarDateContextMenu trigger={cell} onCreate={onCreate} workoutOnly={createWorkoutOnly} onAdjustSchedule={onAdjustSchedule} /> : cell;

  const dayCell = (
    <div
      {...dropHandlers}
      tabIndex={onCreate ? -1 : undefined}
      className={cn(
        "group relative flex min-h-[100px] min-w-0 flex-col items-center rounded-md p-1 text-center transition-[background-color,box-shadow] duration-200 ease-out md:min-h-[112px] md:items-stretch md:px-2.5 md:py-2 md:text-left",
        "touch-manipulation select-none ring-inset",
        isSelected
          ? "bg-card text-foreground ring-2 ring-ring"
          : !isCurrentMonth
            ? "bg-secondary text-foreground hover:bg-secondary/80"
            : "bg-card text-foreground hover:bg-secondary",
        !isSelected &&
          inPlanRange &&
          "bg-[repeating-linear-gradient(-45deg,hsl(var(--emerald-500)/0.14)_0_1.5px,transparent_1.5px_10px)] dark:bg-[repeating-linear-gradient(-45deg,hsl(var(--emerald-400)/0.16)_0_1.5px,transparent_1.5px_10px)]",
        dropClass,
      )}
    >
      <button
        type="button"
        aria-label={dateKey}
        aria-pressed={isSelected}
        onClick={onSelect}
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
      <div className="pointer-events-none relative z-10 flex w-full items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[15px] font-semibold tracking-tight transition-colors duration-200 ease-out md:text-[15px]",
              isCurrentMonth || isSelected
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {date.format("D")}
          </span>
          {isToday ? (
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isSelected
                  ? "bg-[hsl(var(--emerald-500))]"
                  : "bg-foreground/50",
              )}
            />
          ) : null}
        </div>
        {tss !== undefined ? (
          <div
            className={cn(
              "text-mobile-unit pc:text-[10px] font-semibold tabular-nums",
              tss > 0 ? "text-load" : "text-muted-foreground",
            )}
          >
            {tss > 0 ? Math.round(tss) : "--"}
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none relative z-10 flex w-full min-w-0 flex-col">
        <div
          className="mt-1 flex flex-1 flex-col gap-1"
          style={
            competitionLaneCount > 0
              ? { paddingTop: competitionLaneCount * 22 }
              : undefined
          }
        >
          {planWorkouts.map((workout) => (
            <React.Fragment key={workout.id}>{renderWorkout(workout)}</React.Fragment>
          ))}

          {activities.length > 0 ? (
            <div className="flex h-5 min-w-0 items-center truncate whitespace-nowrap rounded-md bg-muted px-2 text-mobile-unit pc:text-[10px] font-semibold text-secondary-foreground md:text-mobile-caption">
              {t("activityTab")} +{activities.length}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
  return withDateMenu(dayCell);
}
