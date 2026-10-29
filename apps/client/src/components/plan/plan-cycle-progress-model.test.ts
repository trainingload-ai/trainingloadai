import { summarizePlanCycleProgress } from "./plan-cycle-progress-model";

describe("summarizePlanCycleProgress", () => {
  it("marks unresolved sessions in past weeks as missed", () => {
    expect(
      summarizePlanCycleProgress(
        [
          { status: "PLANNED", dateKey: "2026-09-01", dayIndex: 1 },
          { status: "IN_PROGRESS", dateKey: "2026-09-02", dayIndex: 2 },
        ],
        {
          phase: "past",
          todayKey: "2026-10-08",
          currentDayIndex: 4,
        },
      ),
    ).toMatchObject({ missed: 2, pending: 0 });
  });

  it("separates missed and pending sessions in the current week", () => {
    expect(
      summarizePlanCycleProgress(
        [
          { status: "PLANNED", dateKey: "2026-10-07", dayIndex: 3 },
          { status: "PLANNED", dateKey: "2026-10-09", dayIndex: 5 },
          { status: "IN_PROGRESS", dateKey: "2026-10-07", dayIndex: 3 },
        ],
        {
          phase: "current",
          todayKey: "2026-10-08",
          currentDayIndex: 4,
        },
      ),
    ).toMatchObject({ missed: 1, pending: 2 });
  });

  it("keeps terminal statuses distinct from future work", () => {
    expect(
      summarizePlanCycleProgress(
        [
          { status: "DONE", dateKey: "2026-10-09", dayIndex: 5 },
          { status: "SKIPPED", dateKey: "2026-10-10", dayIndex: 6 },
          { status: "MOVED", dateKey: "2026-10-11", dayIndex: 7 },
          { status: "PLANNED", dateKey: "2026-10-12", dayIndex: 1 },
        ],
        {
          phase: "future",
          todayKey: "2026-10-08",
          currentDayIndex: 4,
        },
      ),
    ).toEqual({
      completed: 1,
      missed: 0,
      skipped: 1,
      moved: 1,
      pending: 1,
      total: 4,
    });
  });
});
