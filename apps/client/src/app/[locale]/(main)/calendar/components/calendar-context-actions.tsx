"use client";

import { useRef, useState, type ReactElement } from "react";
import { CalendarCog, CalendarPlus, Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PlanWorkout } from "@/api/plans";
import { usePlanWorkoutDetail } from "@/api/usePlans";
import { useWorkoutDetailCommands } from "@/components/plan/use-workout-detail-commands";
import { WorkoutDetailActions } from "@/components/plan/workout-detail-actions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { canMoveCalendarWorkout } from "./calendar-move-model";

export type CalendarCreateKind = "workout" | "competition";

export function CalendarWorkoutContextMenu({
  workout,
  trigger,
  onMove,
}: {
  workout: PlanWorkout;
  trigger: ReactElement;
  onMove?: (workout: PlanWorkout, trigger?: HTMLElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: details } = usePlanWorkoutDetail(
    workout.planId ?? undefined,
    workout.id,
    open && Boolean(workout.planId) && !workout.capabilities,
  );
  const course = details ?? workout;
  const commands = useWorkoutDetailCommands(course);
  return (
    <WorkoutDetailActions
      {...commands}
      contextTrigger={trigger}
      onContextOpenChange={setOpen}
      onMove={
        onMove && canMoveCalendarWorkout(course)
          ? (element) => onMove(course, element)
          : undefined
      }
    />
  );
}

export function CalendarDateContextMenu({
  trigger,
  onCreate,
  onAdjustSchedule,
  workoutOnly,
}: {
  trigger: ReactElement;
  onCreate: (kind: CalendarCreateKind) => void;
  onAdjustSchedule?: () => void;
  workoutOnly?: boolean;
}) {
  const t = useTranslations("CalendarExperience");
  const tCompetition = useTranslations("CompetitionEvents");
  const tMove = useTranslations("CalendarMove");
  const element = useRef<HTMLSpanElement>(null);
  const openingDialog = useRef(false);
  const create = (kind: CalendarCreateKind) => {
    openingDialog.current = true;
    onCreate(kind);
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild ref={element}>
        {trigger}
      </ContextMenuTrigger>
      <ContextMenuContent
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!openingDialog.current)
            element.current?.focus({ preventScroll: true });
          openingDialog.current = false;
        }}
      >
        <ContextMenuGroup>
          <ContextMenuItem onSelect={() => create("workout")}>
            <CalendarPlus aria-hidden="true" />
            {t("createWorkoutButton")}
          </ContextMenuItem>
          {!workoutOnly ? <ContextMenuItem onSelect={() => create("competition")}>
            <Flag aria-hidden="true" />
            {tCompetition("page.add")}
          </ContextMenuItem> : null}
          {onAdjustSchedule ? (
            <ContextMenuItem onSelect={() => {
              openingDialog.current = true;
              onAdjustSchedule();
            }}>
              <CalendarCog aria-hidden="true" />
              {tMove("adjustSchedule")}
            </ContextMenuItem>
          ) : null}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
