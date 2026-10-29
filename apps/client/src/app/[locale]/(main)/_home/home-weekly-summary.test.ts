import type { V2HomePlanWorkout } from "@/api/v2-home";
import {
  buildHomeWeeklySummary,
  formatHomeMonthDay,
  formatHomeWeekday,
} from "./home-weekly-summary";

function workout(
  input: Partial<V2HomePlanWorkout> & Pick<V2HomePlanWorkout, "id">,
): V2HomePlanWorkout {
  const { id, description = null, ...overrides } = input;
  return {
    id,
    planId: "plan-1",
    name: null,
    title: input.id,
    description,
    text: "",
    notes: null,
    sportType: "RUN",
    status: "PLANNED",
    scheduledDate: "2026-09-08",
    dayOffset: 0,
    weekIndex: 1,
    dayIndex: 2,
    sessionIndex: 1,
    linkedActivityTitle: null,
    estimatedLoad: null,
    ...overrides,
  };
}

describe("buildHomeWeeklySummary", () => {
  it("returns an empty weekly summary when the plan has no workouts", () => {
    expect(buildHomeWeeklySummary([])).toEqual({
      completedSessions: 0,
      plannedLoad: 0,
      plannedSessions: 0,
      sessionBars: Array.from({ length: 7 }, () => ({
        completed: 0,
        planned: 0,
      })),
    });
  });

  it("matches the mobile planned/completed rules", () => {
    const summary = buildHomeWeeklySummary([
      workout({
        id: "done",
        status: "DONE",
        dayIndex: 1,
        estimatedLoad: 21.4,
      }),
      workout({ id: "planned", dayIndex: 3, estimatedLoad: 28.2 }),
      workout({
        id: "moved",
        status: "MOVED",
        dayIndex: 5,
        estimatedLoad: 99,
      }),
    ]);

    expect(summary).toMatchObject({
      completedSessions: 1,
      plannedLoad: 50,
      plannedSessions: 2,
    });
    expect(summary.sessionBars[0]).toEqual({ completed: 1, planned: 1 });
    expect(summary.sessionBars[2]).toEqual({ completed: 0, planned: 1 });
    expect(summary.sessionBars[4]).toEqual({ completed: 0, planned: 0 });
  });
});

describe("formatHomeWeekday", () => {
  it("uses the locale's full weekday name", () => {
    expect(formatHomeWeekday("zh", "2026-09-08")).toBe("星期二");
    expect(formatHomeWeekday("en", "2026-09-08")).toBe("Tuesday");
  });

  it("uses each locale's month/day order", () => {
    expect(formatHomeMonthDay("zh", "2026-09-08")).toBe("9月8日");
    expect(formatHomeMonthDay("en", "2026-09-08")).toBe("Sep 8");
  });
});
