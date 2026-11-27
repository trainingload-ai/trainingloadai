import type { V2HomePlanWorkout } from "@/api/v2-home";
import dayjs from "dayjs";
import { getHomeWeekRange } from "./home-week-range";
import {
  buildHomeWeeklyActualSummary,
  buildHomeWeeklySummary,
  formatHomeMonthDay,
  formatHomeWeekday,
} from "./home-weekly-summary";

describe("buildHomeWeeklyActualSummary", () => {
  it("counts imported activities by PMC day independently of plan workouts", () => {
    expect(
      buildHomeWeeklyActualSummary([
        { activityCount: 1 },
        { activityCount: 14 },
        {},
      ]),
    ).toEqual({
      activityCount: 15,
      activityCountsByDay: [1, 14, 0, 0, 0, 0, 0],
      load: 0,
    });
  });

  it("uses the chart's daily PMC values for the weekly total without rounding each day", () => {
    expect(
      buildHomeWeeklyActualSummary([
        { actual: 14.69, activityCount: 1 },
        { actual: 1049.9676, activityCount: 17 },
        { actual: 0 },
        {},
        { actual: Number.NaN },
        { actual: -1 },
        { actual: 0 },
        { actual: 999 },
      ]),
    ).toEqual({
      activityCount: 18,
      activityCountsByDay: [1, 17, 0, 0, 0, 0, 0],
      load: 1064.6576,
    });
  });
});

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
    structure: {
      kind: "FREEFORM",
      version: 1,
      text: "",
    },
    estimatedLoadInputs: null,
    ...overrides,
  };
}

describe("buildHomeWeeklySummary", () => {
  const { dateKeys } = getHomeWeekRange(dayjs("2026-09-08"));

  it("returns an empty weekly summary when the plan has no workouts", () => {
    expect(buildHomeWeeklySummary([], dateKeys)).toEqual({
      completedSessions: 0,
      plannedLoad: 0,
      plannedSessions: 0,
      sessionBars: Array.from({ length: 7 }, () => ({
        completed: 0,
        planned: 0,
      })),
    });
  });

  it("counts only the calendar week's workouts and places bars by scheduled date", () => {
    const summary = buildHomeWeeklySummary([
      workout({
        id: "done",
        status: "DONE",
        scheduledDate: "2026-09-07",
        dayIndex: 6,
        estimatedLoad: 21.4,
      }),
      workout({ id: "planned", scheduledDate: "2026-09-09", dayIndex: 1, estimatedLoad: 28.2 }),
      workout({
        id: "moved",
        status: "MOVED",
        scheduledDate: "2026-09-11",
        estimatedLoad: 99,
      }),
      workout({ id: "next-week", scheduledDate: "2026-09-14", estimatedLoad: 99 }),
      workout({ id: "undated", scheduledDate: null, estimatedLoad: 99 }),
    ], dateKeys);

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
