"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import type { Dayjs } from "dayjs";
import type { PlanWorkout } from "@/api/plans";
import type { CalendarCreateKind } from "./calendar-context-actions";
import type { CalendarMoveWorkspaceHandle } from "./calendar-move-workspace";

const CalendarMoveWorkspace = dynamic(
  () => import("./calendar-move-workspace").then((module) => module.CalendarMoveWorkspace),
  { ssr: false },
);
const CalendarCreateWorkoutSheet = dynamic(
  () => import("./calendar-create-workout-sheet").then((module) => module.CalendarCreateWorkoutSheet),
  { ssr: false },
);
const CompetitionEventDialog = dynamic(
  () => import("@/components/competition/competition-event-dialog").then((module) => module.CompetitionEventDialog),
  { ssr: false },
);

export function useCalendarEditing({
  onSelectDate,
}: {
  onSelectDate?: (date: Dayjs) => void;
} = {}) {
  const [creating, setCreating] = useState<{ kind: CalendarCreateKind; date: string } | null>(null);
  const workspace = useRef<CalendarMoveWorkspaceHandle>(null);
  const [ready, setReady] = useState(false);
  const bindWorkspace = useCallback((handle: CalendarMoveWorkspaceHandle | null) => {
    workspace.current = handle;
    if (handle) setReady(true);
  }, []);

  return {
    creating,
    setCreating,
    bindWorkspace,
    createOnDate(kind: CalendarCreateKind, date: Dayjs) {
      onSelectDate?.(date);
      setCreating({ kind, date: date.format("YYYY-MM-DD") });
    },
    moveWorkout: ready
      ? (workout: PlanWorkout, date: string) => workspace.current?.request(workout, date)
      : undefined,
    requestMove: ready
      ? (workout: PlanWorkout, trigger?: HTMLElement | null) =>
          workspace.current?.request(workout, undefined, trigger)
      : undefined,
  };
}

export function CalendarEditingDialogs({
  editing,
  planId,
  showResume,
}: {
  editing: ReturnType<typeof useCalendarEditing>;
  planId?: string | null;
  showResume?: boolean;
}) {
  const { bindWorkspace, creating, setCreating } = editing;
  const close = (open: boolean) => {
    if (!open) setCreating(null);
  };
  return (
    <>
      <CalendarMoveWorkspace workspaceRef={bindWorkspace} showResume={showResume} />
      {creating?.kind === "workout" ? (
        <CalendarCreateWorkoutSheet
          open
          onOpenChange={close}
          scheduledDate={creating.date}
          activePlanId={planId}
          defaultScope={planId ? "inPlan" : "independent"}
        />
      ) : null}
      {creating?.kind === "competition" ? (
        <CompetitionEventDialog open event={null} onOpenChange={close} defaultDate={creating.date} />
      ) : null}
    </>
  );
}
