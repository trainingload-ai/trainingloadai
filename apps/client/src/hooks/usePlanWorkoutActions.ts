"use client";

import { useRef, useState } from "react";
import {
  getPlanDetail,
  isWorkoutPlannedOrInProgress,
  updatePlanWorkout,
  updatePlanWorkoutStatus,
  type PlanSportType,
  type PlanWorkoutStatus,
} from "@/api/plans";

function toWeekDayFromOffset(dayOffset: number) {
  const safeOffset = Math.max(0, Math.floor(dayOffset));
  return {
    weekIndex: Math.floor(safeOffset / 7) + 1,
    dayIndex: (safeOffset % 7) + 1,
  };
}

export type PostponeWorkoutInput = {
  planId: string;
  workoutId: string;
  status: PlanWorkoutStatus;
  sourceDayOffset: number;
  text: string;
  notes?: string | null;
  name?: string | null;
  sportType: PlanSportType;
  sportDefinitionCode?: string | null;
};

export type SkipWorkoutInput = {
  planId: string;
  workoutId: string;
  status: PlanWorkoutStatus;
};

export function usePlanWorkoutActions() {
  const [pendingWorkoutId, setPendingWorkoutId] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const postponeWorkout = async (input: PostponeWorkoutInput) => {
    if (!isWorkoutPlannedOrInProgress(input.status) || inFlightRef.current)
      return false;
    inFlightRef.current = true;
    setPendingWorkoutId(input.workoutId);
    try {
      const targetOffset = Math.max(0, input.sourceDayOffset + 1);
      const planDetail = await getPlanDetail(input.planId);
      const sourceWorkout = planDetail?.workouts.find(
        (item) => item.id === input.workoutId,
      );
      const peers = (planDetail?.workouts ?? []).filter(
        (item) =>
          item.id !== input.workoutId && item.dayOffset === targetOffset,
      );
      const nextSessionIndex =
        peers.reduce((max, item) => Math.max(max, item.sessionIndex ?? 1), 0) +
        1;
      const { weekIndex, dayIndex } = toWeekDayFromOffset(targetOffset);

      await updatePlanWorkout(input.planId, input.workoutId, {
        weekIndex,
        dayIndex,
        sessionIndex: nextSessionIndex,
        text: input.text,
        notes: input.notes ?? null,
        name: input.name ?? null,
        sportType: input.sportType,
        sportDefinitionCode: input.sportDefinitionCode ?? null,
        expectedRevision: sourceWorkout?.revision,
        definition: sourceWorkout?.structure
          ? {
              kind: sourceWorkout.structureKind,
              version: 1,
              source: "STRUCTURE",
              structure: sourceWorkout.structure,
            }
          : undefined,
        reason: "postpone",
      });
      return true;
    } finally {
      inFlightRef.current = false;
      setPendingWorkoutId(null);
    }
  };

  const skipWorkout = async (input: SkipWorkoutInput) => {
    if (!isWorkoutPlannedOrInProgress(input.status) || inFlightRef.current)
      return false;
    inFlightRef.current = true;
    setPendingWorkoutId(input.workoutId);
    try {
      await updatePlanWorkoutStatus(input.planId, input.workoutId, {
        status: "SKIPPED",
      });
      return true;
    } finally {
      inFlightRef.current = false;
      setPendingWorkoutId(null);
    }
  };

  return {
    pendingWorkoutId,
    postponeWorkout,
    skipWorkout,
  };
}
