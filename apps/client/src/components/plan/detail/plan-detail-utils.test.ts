import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import type { PlanWorkout, TrainingPlanDetail } from "@/api/plans";
import {
  canMutatePlanWorkoutSchedule,
  formatPlanLoadDisplay,
  getPlanWorkoutDisplayKind,
  getPlanWorkoutMovedByLabel,
  getPlanWorkoutStatusLabel,
  getWeekWorkoutCardChrome,
  getWeekWorkoutStatusLabelClass,
  rollupPlanDetailExecution,
} from "./plan-detail-utils";

describe("formatPlanLoadDisplay", () => {
  it("rounds floating-point noise to one decimal place", () => {
    expect(formatPlanLoadDisplay(36.539899999999996)).toBe("36.5");
    expect(formatPlanLoadDisplay(132.5)).toBe("132.5");
    expect(formatPlanLoadDisplay(21)).toBe("21.0");
  });

  it("treats non-finite values as zero", () => {
    expect(formatPlanLoadDisplay(Number.NaN)).toBe("0.0");
    expect(formatPlanLoadDisplay(Number.POSITIVE_INFINITY)).toBe("0.0");
  });
});

describe("plan workout display kind", () => {
  const today = dayjs("2026-09-21").startOf("day");

  it("maps terminal and in-progress statuses from the enum", () => {
    expect(
      getPlanWorkoutDisplayKind(
        { status: "DONE", scheduledDate: "2026-09-20" },
        today,
      ),
    ).toBe("done");
    expect(
      getPlanWorkoutDisplayKind(
        { status: "SKIPPED", scheduledDate: "2026-09-20" },
        today,
      ),
    ).toBe("skipped");
    expect(
      getPlanWorkoutDisplayKind(
        { status: "MOVED", scheduledDate: "2026-09-20" },
        today,
      ),
    ).toBe("moved");
    expect(
      getPlanWorkoutDisplayKind(
        { status: "IN_PROGRESS", scheduledDate: "2026-09-20" },
        today,
      ),
    ).toBe("inProgress");
  });

  it("labels planned workouts before today as incomplete", () => {
    expect(
      getPlanWorkoutDisplayKind(
        { status: "PLANNED", scheduledDate: "2026-09-20" },
        today,
      ),
    ).toBe("incomplete");
  });

  it("labels planned workouts today or later as upcoming", () => {
    expect(
      getPlanWorkoutDisplayKind(
        { status: "PLANNED", scheduledDate: "2026-09-21" },
        today,
      ),
    ).toBe("upcoming");
    expect(
      getPlanWorkoutDisplayKind(
        { status: "PLANNED", scheduledDate: "2026-09-22" },
        today,
      ),
    ).toBe("upcoming");
  });
});

describe("week workout status chrome", () => {
  it("uses emerald for completed workouts", () => {
    expect(getWeekWorkoutCardChrome("done")).toContain("emerald");
    expect(getWeekWorkoutStatusLabelClass("done")).toContain("emerald");
  });

  it("uses amber only for overdue planned workouts", () => {
    expect(getWeekWorkoutCardChrome("incomplete")).toContain("amber");
    expect(getWeekWorkoutStatusLabelClass("incomplete")).toContain("amber");
  });

  it("keeps upcoming planned workouts neutral", () => {
    expect(getWeekWorkoutCardChrome("upcoming")).toContain("neutral");
    expect(getWeekWorkoutStatusLabelClass("upcoming")).toContain("muted");
  });

  it("uses a distinct sky treatment for workouts in progress", () => {
    expect(getWeekWorkoutCardChrome("inProgress")).toContain("sky");
    expect(getWeekWorkoutStatusLabelClass("inProgress")).toContain("sky");
  });

  it("uses ghost treatment for postponed workouts", () => {
    expect(getWeekWorkoutCardChrome("moved")).toContain("violet");
    expect(getWeekWorkoutCardChrome("moved")).toContain("opacity-[0.58]");
  });

  it("uses quiet muted chrome for skipped workouts", () => {
    expect(getWeekWorkoutCardChrome("skipped")).toContain("neutral");
    expect(getWeekWorkoutStatusLabelClass("skipped")).toContain("muted");
  });
});

describe("canMutatePlanWorkoutSchedule", () => {
  function workout(status: PlanWorkout["status"], linked = false): PlanWorkout {
    return {
      id: "w1",
      planId: "plan-1",
      dayOffset: 0,
      weekIndex: 1,
      dayIndex: 1,
      sessionIndex: 1,
      scheduledDate: "2026-09-21",
      text: "work 30m",
      sportType: "RUN",
      structureKind: "ENDURANCE",
      dslVersion: 1,
      structure: { kind: "ENDURANCE", version: 1, blocks: [] },
      summary: {
        kind: "ENDURANCE",
        durationSeconds: 0,
        stepCount: 0,
        hardSession: null,
      },
      status,
      links: linked
        ? [
            {
              id: "link-1",
              planId: "plan-1",
              planWorkoutId: "w1",
              activityId: 1,
              source: "MANUAL",
              role: "PRIMARY",
              linkedAt: "2026-09-21T00:00:00.000Z",
              unlinkedAt: null,
            },
          ]
        : [],
    } as PlanWorkout;
  }

  it("allows postpone/skip for planned and in-progress unlinked workouts", () => {
    expect(canMutatePlanWorkoutSchedule(workout("PLANNED"))).toBe(true);
    expect(canMutatePlanWorkoutSchedule(workout("IN_PROGRESS"))).toBe(true);
  });

  it("hides postpone/skip for terminal statuses", () => {
    expect(canMutatePlanWorkoutSchedule(workout("DONE"))).toBe(false);
    expect(canMutatePlanWorkoutSchedule(workout("SKIPPED"))).toBe(false);
    expect(canMutatePlanWorkoutSchedule(workout("MOVED"))).toBe(false);
  });

  it("hides postpone/skip while a primary activity is linked", () => {
    expect(canMutatePlanWorkoutSchedule(workout("PLANNED", true))).toBe(false);
  });
});

describe("movedBy labels", () => {
  const t = (key: string) => key;

  it("returns user and coach labels and null otherwise", () => {
    expect(getPlanWorkoutMovedByLabel(t as never, "USER")).toBe("movedBy.user");
    expect(getPlanWorkoutMovedByLabel(t as never, "COACH")).toBe(
      "movedBy.coach",
    );
    expect(getPlanWorkoutMovedByLabel(t as never, null)).toBeNull();
  });
});

describe("plan workout status labels", () => {
  const t = (key: string) => key;

  it("uses the locked vocabulary", () => {
    expect(getPlanWorkoutStatusLabel(t as never, "incomplete")).toBe(
      "workoutStatus.incomplete",
    );
    expect(getPlanWorkoutStatusLabel(t as never, "upcoming")).toBe(
      "workoutStatus.upcoming",
    );
    expect(getPlanWorkoutStatusLabel(t as never, "done")).toBe(
      "workoutStatus.done",
    );
    expect(getPlanWorkoutStatusLabel(t as never, "skipped")).toBe(
      "workoutStatus.skipped",
    );
    expect(getPlanWorkoutStatusLabel(t as never, "moved")).toBe(
      "workoutStatus.moved",
    );
    expect(getPlanWorkoutStatusLabel(t as never, "inProgress")).toBe(
      "workoutStatus.inProgress",
    );
  });
});

describe("rollupPlanDetailExecution", () => {
  const today = dayjs("2026-09-21").startOf("day");

  function workout(
    overrides: Partial<PlanWorkout> &
      Pick<PlanWorkout, "id" | "status" | "scheduledDate">,
  ): PlanWorkout {
    return {
      planId: "plan-1",
      dayOffset: 0,
      weekIndex: 1,
      dayIndex: 1,
      sessionIndex: 1,
      name: null,
      text: "work 30m",
      sportType: "RUN",
      structureKind: "ENDURANCE",
      dslVersion: 1,
      structure: {
        kind: "ENDURANCE",
        version: 1,
        blocks: [],
      },
      summary: {
        kind: "ENDURANCE",
        durationSeconds: 0,
      },
      ...overrides,
    } as PlanWorkout;
  }

  const plan: TrainingPlanDetail = {
    id: "plan-1",
    userId: "user-1",
    title: "Test",
    sourceType: "MANUAL",
    status: "ACTIVE",
    periodWeeks: 1,
    startDate: "2026-09-15",
    endDate: "2026-09-21",
    currentWeekIndex: 0,
    currentDayIndex: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    workouts: [
      workout({ id: "done", status: "DONE", scheduledDate: "2026-09-15" }),
      workout({
        id: "skipped",
        status: "SKIPPED",
        scheduledDate: "2026-09-16",
      }),
      workout({ id: "moved", status: "MOVED", scheduledDate: "2026-09-17" }),
      workout({
        id: "in-progress",
        status: "IN_PROGRESS",
        scheduledDate: "2026-09-18",
      }),
      workout({
        id: "overdue",
        status: "PLANNED",
        scheduledDate: "2026-09-20",
      }),
      workout({
        id: "today",
        status: "PLANNED",
        scheduledDate: "2026-09-21",
      }),
      workout({
        id: "future",
        status: "PLANNED",
        scheduledDate: "2026-09-22",
      }),
    ],
  };

  it("splits planned workouts by date and keeps in-progress separate", () => {
    expect(rollupPlanDetailExecution(plan, today)).toEqual({
      incomplete: 1,
      upcoming: 2,
      inProgress: 1,
      done: 1,
      skipped: 1,
      moved: 1,
    });
  });

  it("falls back to plan day when scheduledDate is missing", () => {
    const withoutDate: TrainingPlanDetail = {
      ...plan,
      workouts: [
        workout({
          id: "past-offset",
          status: "PLANNED",
          scheduledDate: null,
          dayOffset: 0,
          weekIndex: 1,
          dayIndex: 1,
        }),
      ],
    };
    expect(rollupPlanDetailExecution(withoutDate, today)).toMatchObject({
      incomplete: 1,
      upcoming: 0,
    });
  });
});
