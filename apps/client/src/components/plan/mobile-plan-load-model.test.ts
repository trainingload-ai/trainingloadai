import { describe, expect, it } from "vitest";
import type { PlanWorkout, TrainingPlanDetail } from "@/api/plans";
import {
  buildPlanLoadPoints,
  getPlanFocusWorkouts,
  planLoadAxisMax,
  planTimelineBounds,
} from "./mobile-plan-load-model";

function workout(
  id: string,
  scheduledDate: string,
  estimatedLoad: number,
  status: PlanWorkout["status"] = "PLANNED",
): PlanWorkout {
  return {
    id,
    planId: "plan-1",
    dayOffset: Number(scheduledDate.slice(-2)) - 1,
    weekIndex: 1,
    dayIndex: Number(scheduledDate.slice(-2)),
    sessionIndex: 1,
    scheduledDate,
    name: id,
    text: "work 30m",
    sportType: "RUN",
    structureKind: "FREEFORM",
    dslVersion: 1,
    structure: { kind: "FREEFORM", version: 1, text: "work 30m" },
    summary: { kind: "FREEFORM", durationSeconds: 1800, hardSession: null },
    status,
    estimatedLoad,
  };
}

function plan(workouts: PlanWorkout[]): TrainingPlanDetail {
  return {
    id: "plan-1",
    userId: "user-1",
    title: "Plan",
    sourceType: "AI",
    status: "ACTIVE",
    periodWeeks: 1,
    startDate: "2026-08-11",
    endDate: "2026-08-17",
    currentWeekIndex: 1,
    currentDayIndex: 1,
    createdAt: "2026-08-10T00:00:00Z",
    updatedAt: "2026-08-10T00:00:00Z",
    workouts,
  };
}

describe("mobile plan load model", () => {
  it("starts at today and preserves at least a seven-day viewport", () => {
    const value = planTimelineBounds(plan([]), new Date(2026, 7, 10));
    expect(value.start).toEqual(new Date(2026, 7, 10));
    expect(value.end).toEqual(new Date(2026, 7, 17));
  });

  it("aggregates planned load by day and calculates CTL/ATL", () => {
    const value = plan([
      workout("a", "2026-08-11", 20),
      workout("b", "2026-08-11", 10),
      workout("c", "2026-08-13", 24),
    ]);
    const points = buildPlanLoadPoints(value, new Date(2026, 7, 10));
    const aug11 = points.find((point) => point.key === "2026-08-11");
    expect(aug11?.load).toBe(30);
    expect(aug11?.ctl).toBeCloseTo(30 / 42);
    expect(aug11?.atl).toBeCloseTo(30 / 7);
    expect(planLoadAxisMax(points)).toBeGreaterThanOrEqual(30);
  });

  it("uses today's workout first and the next open workout second", () => {
    const value = plan([
      workout("done", "2026-08-10", 10, "DONE"),
      workout("today", "2026-08-10", 20),
      workout("next", "2026-08-11", 20),
    ]);
    const focus = getPlanFocusWorkouts(value, new Date(2026, 7, 10));
    expect(focus.currentWorkout?.id).toBe("today");
    expect(focus.nextWorkout?.id).toBe("next");
  });
});
