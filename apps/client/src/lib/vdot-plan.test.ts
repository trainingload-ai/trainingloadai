import { describe, expect, it } from "vitest";
import {
  VDOT_GOAL_DISTANCES,
  VdotPlanGenerationError,
  generateVdotPlan,
  validateVdotPlanDraft,
  type VdotGoalDistance,
  type VdotPlanBriefV1,
} from "@shared/vdot-plan";
import { resolveVdotPaces } from "@shared/vdot";

function brief(
  goalDistance: VdotGoalDistance,
  overrides: Partial<VdotPlanBriefV1> = {},
): VdotPlanBriefV1 {
  const periods: Record<VdotGoalDistance, number> = {
    "5K": 8,
    "10K": 10,
    HALF_MARATHON: 14,
    MARATHON: 20,
  };
  return {
    schemaVersion: 1,
    vdot: 45,
    goalDistance,
    periodWeeks: periods[goalDistance],
    startDate: "2026-08-03",
    unitSystem: "METRIC",
    currentWeeklyDistanceKm: goalDistance === "MARATHON" ? 42 : 30,
    currentLongestRunKm: goalDistance === "MARATHON" ? 16 : 10,
    runsPerWeek: 5,
    longRunDayIndex: 7,
    unavailableDayIndexes: [],
    ...overrides,
  };
}

describe("VDOT pace resolver", () => {
  it("returns ordered finite pace ranges for every supported intensity", () => {
    for (const vdot of [20, 35, 45, 60, 85]) {
      const snapshot = resolveVdotPaces(vdot);
      for (const range of Object.values(snapshot.zones)) {
        expect(Number.isFinite(range.fastSecPerKm)).toBe(true);
        expect(Number.isFinite(range.slowSecPerKm)).toBe(true);
        expect(range.fastSecPerKm).toBeGreaterThan(0);
        expect(range.fastSecPerKm).toBeLessThanOrEqual(range.slowSecPerKm);
      }
    }
  });
});

describe("VDOT plan generator", () => {
  it.each(VDOT_GOAL_DISTANCES)(
    "creates a valid complete %s plan",
    (goalDistance) => {
      const plan = generateVdotPlan(brief(goalDistance), {
        locale: "zh",
        generatedAt: "2026-07-28T00:00:00.000Z",
      });
      const validation = validateVdotPlanDraft(plan);

      expect(validation.valid).toBe(true);
      expect(plan.weeks).toHaveLength(plan.periodWeeks);
      expect(
        new Set(plan.workouts.map((workout) => workout.weekIndex)).size,
      ).toBe(plan.periodWeeks);
      expect(
        plan.workouts.some((workout) => workout.intent.primary === "RACE"),
      ).toBe(true);
      const raceWeek = plan.weeks[plan.weeks.length - 1];
      expect(raceWeek.plannedRaceDistanceKm).toBeGreaterThan(0);
      expect(raceWeek.plannedTrainingDistanceKm).toBeGreaterThan(0);
      expect(
        plan.workouts.every(
          (workout) =>
            workout.weekIndex >= 1 &&
            workout.weekIndex <= plan.periodWeeks &&
            workout.dayIndex >= 1 &&
            workout.dayIndex <= 7,
        ),
      ).toBe(true);
    },
  );

  it("does not use goal time to raise current-fitness training paces", () => {
    const withoutGoal = generateVdotPlan(brief("10K"), {
      generatedAt: "2026-07-28T00:00:00.000Z",
    });
    const withGoal = generateVdotPlan(
      brief("10K", { optionalGoalTimeSec: 2_100 }),
      { generatedAt: "2026-07-28T00:00:00.000Z" },
    );

    expect(withGoal.paceSnapshot).toEqual(withoutGoal.paceSnapshot);
    expect(withGoal.workouts.map((workout) => workout.definition)).toEqual(
      withoutGoal.workouts.map((workout) => workout.definition),
    );
  });

  it("respects selected run days and unavailable days", () => {
    const plan = generateVdotPlan(
      brief("5K", {
        runsPerWeek: 3,
        unavailableDayIndexes: [1, 3, 5, 6],
        longRunDayIndex: 7,
      }),
    );

    for (const week of plan.weeks) {
      expect(week.workoutCount).toBe(3);
    }
    expect(
      plan.workouts.every(
        (workout) => ![1, 3, 5, 6].includes(workout.dayIndex),
      ),
    ).toBe(true);
  });

  it("rejects a short marathon build without sufficient foundation", () => {
    expect(() =>
      generateVdotPlan(
        brief("MARATHON", {
          periodWeeks: 12,
          currentWeeklyDistanceKm: 12,
          currentLongestRunKm: 5,
        }),
      ),
    ).toThrow(VdotPlanGenerationError);
  });
});
