import { describe, expect, it } from "vitest";
import {
  isPlanDateNotGenerated,
  isRollingPlan,
  generatedPlanThrough,
  naturalWeekStart,
} from "./rolling-plan";
import { buildWeekGroups } from "@/components/plan/detail/plan-detail-utils";
import { mapTrainingPlanToHomePlan } from "@/api/v2-home";
import { buildPlanLoadPoints } from "@/components/plan/mobile-plan-load-model";
import { savedPlanToCoachDraft } from "./coach-plan-start";
import type { TrainingPlanDetail, PlanWorkout } from "@/api/plans";

const plan: TrainingPlanDetail = {
  id: "rolling",
  userId: "owner",
  title: "Continuous",
  goal: "Build endurance",
  sourceType: "AI",
  status: "ACTIVE",
  planningMode: "ROLLING",
  periodWeeks: null,
  startDate: "2026-11-18",
  endDate: null,
  generatedThrough: "2026-12-06",
  currentWeekIndex: 3,
  currentDayIndex: 1,
  createdAt: "2026-11-18",
  updatedAt: "2026-12-01",
  generationCoverage: {
    from: "2026-11-18",
    through: "2026-12-06",
    status: "PARTIAL",
    intervals: [
      { from: "2026-11-18", through: "2026-11-22", weekStart: "2026-11-16" },
      { from: "2026-11-30", through: "2026-12-06", weekStart: "2026-11-30" },
    ],
  },
  workouts: [],
};
function workout(
  date: string,
  weekIndex: number,
  dayIndex: number,
): PlanWorkout {
  return {
    id: date,
    planId: plan.id,
    scheduledDate: date,
    weekIndex,
    dayIndex,
    sessionIndex: 1,
    dayOffset: (weekIndex - 1) * 7 + dayIndex - 1,
    status: "PLANNED",
    text: "30m @easy",
    sportType: "RUN",
    structureKind: "FREEFORM",
    dslVersion: 1,
    structure: { kind: "FREEFORM", version: 1, text: "30m @easy" },
    summary: {},
    estimatedLoad: 20,
  } as PlanWorkout;
}
describe("continuous plan consumers", () => {
  it("keeps a plan running beyond 520 weeks without constructing a fixed-duration draft", () => {
    const longPlan = {
      ...plan,
      startDate: "2016-10-26",
      currentWeekIndex: 529,
      currentDayIndex: 1,
      workouts: [workout("2026-12-02", 529, 1)],
    };
    expect(
      mapTrainingPlanToHomePlan(longPlan, "2026-12-02").currentWeekIndex,
    ).toBe(529);
    expect(
      buildWeekGroups(((key: string) => key) as never, longPlan).length,
    ).toBeLessThan(6);
    expect(() => savedPlanToCoachDraft(longPlan)).toThrow(
      "bounded calendar window",
    );
  });
  it("defaults legacy responses to fixed and never infers generated coverage from the furthest date", () => {
    expect(isRollingPlan({})).toBe(false);
    expect(generatedPlanThrough(plan)).toBe("2026-12-06");
    expect(isPlanDateNotGenerated(plan, "2026-11-20")).toBe(false);
    expect(isPlanDateNotGenerated(plan, "2026-11-25")).toBe(true);
    expect(isPlanDateNotGenerated(plan, "2026-12-07")).toBe(true);
    expect(
      isPlanDateNotGenerated(
        { ...plan, generationCoverage: undefined },
        "2026-11-20",
      ),
    ).toBe(true);
    expect(
      isPlanDateNotGenerated(
        { ...plan, planningMode: undefined },
        "2027-01-01",
      ),
    ).toBe(false);
  });
  it("uses ISO natural weeks across month and DST boundaries", () => {
    expect(naturalWeekStart("2026-12-01")).toBe("2026-11-30");
    expect(naturalWeekStart("2026-11-01")).toBe("2026-10-26");
    const detail = {
      ...plan,
      workouts: [
        workout("2026-11-30", 2, 6),
        workout("2026-12-01", 2, 7),
        workout("2026-12-02", 3, 1),
      ],
    };
    const home = mapTrainingPlanToHomePlan(detail, "2026-12-02");
    expect(home.currentWeekWorkouts.map((w) => w.scheduledDate)).toEqual([
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
    expect(home.totalWorkoutCount).toBe(3);
    expect(home.completedWorkoutCount).toBe(0);
    expect(home.nextWorkout?.scheduledDate).toBe("2026-12-02");
    expect(home.generationCoverage).toEqual(plan.generationCoverage);
    const weeks = buildWeekGroups(((key: string) => key) as never, detail);
    const crossMonth = weeks.find(
      (week) => week.days[0].dateKey === "2026-11-30",
    )!;
    expect(crossMonth.days[0].workouts[0].scheduledDate).toBe("2026-11-30");
    expect(crossMonth.days[2].workouts[0].scheduledDate).toBe("2026-12-02");
    expect(crossMonth.days[6].notGenerated).toBe(false);
  });
  it("does not create zero-load forecasts for missing weeks or the next ungenerated week", () => {
    const points = buildPlanLoadPoints(plan, new Date(2026, 11, 1));
    expect(points.some((point) => point.key === "2026-11-25")).toBe(false);
    expect(points.at(-1)?.key).toBe("2026-12-06");
    expect(
      buildPlanLoadPoints({
        ...plan,
        generatedThrough: null,
        generationCoverage: {
          from: null,
          through: null,
          intervals: [],
          status: "NOT_GENERATED",
        },
      }),
    ).toEqual([]);
  });
});
