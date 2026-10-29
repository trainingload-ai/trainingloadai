import { describe, expect, it, vi } from "vitest";
import type { WeekGroup } from "./plan-detail-utils";
import { detailCycleProgress } from "./plan-detail-cycle-progress";
vi.mock("../plan-cycle-progress-chart", () => ({
  PlanCycleProgressChart: () => null,
}));
const weeks = [
  {
    weekIndex: 1,
    days: [
      {
        dayIndex: 1,
        dateKey: "2026-10-05",
        workouts: [
          { dayIndex: 1, dateKey: "2026-10-05", status: "DONE" },
          { dayIndex: 1, dateKey: "2026-10-05", status: "PLANNED" },
        ],
      },
      {
        dayIndex: 5,
        dateKey: "2026-10-09",
        workouts: [{ dayIndex: 5, dateKey: "2026-10-09", status: "MOVED" }],
      },
      {
        dayIndex: 7,
        dateKey: "2026-10-11",
        workouts: [{ dayIndex: 7, dateKey: "2026-10-11", status: "PLANNED" }],
      },
    ],
  },
] as WeekGroup[];
describe("plan detail cycle progress", () => {
  it("uses the shared status rollup, not load values", () => {
    const result = detailCycleProgress(weeks, "2026-10-09", "ACTIVE");
    expect(result.currentKey).toBe("1");
    expect(result.data[0]).toMatchObject({
      completed: 1,
      missed: 1,
      moved: 1,
      pending: 1,
      total: 4,
    });
  });
  it.each(["COMPLETED", "CANCELLED", "PAUSED", "SCHEDULED"] as const)(
    "does not mark a current week on a %s plan",
    (status) => {
      expect(
        detailCycleProgress(weeks, "2026-10-09", status).currentKey,
      ).toBeUndefined();
    },
  );
  it("does not fabricate a current week before the plan begins", () => {
    const result = detailCycleProgress(weeks, "2026-10-01", "ACTIVE");
    expect(result.currentKey).toBeUndefined();
    expect(result.data[0].missed).toBe(0);
  });
});
