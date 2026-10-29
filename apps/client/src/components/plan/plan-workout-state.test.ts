import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import {
  getPlanWorkoutActionState,
  getPlanWorkoutDatePosition,
} from "./plan-workout-state";

const today = dayjs("2026-08-14");

describe("plan workout date position", () => {
  it.each([
    ["2026-08-11", "past"],
    ["2026-08-14", "today"],
    ["2026-08-16", "future"],
    [null, "unscheduled"],
    ["invalid", "unscheduled"],
  ] as const)("classifies %s as %s", (date, expected) => {
    expect(getPlanWorkoutDatePosition(date, today)).toBe(expected);
  });
});

describe("plan workout action state", () => {
  it("marks a historical open workout overdue and removes schedule actions", () => {
    expect(
      getPlanWorkoutActionState({
        status: "PLANNED",
        scheduledDateKey: "2026-08-11",
        hasLinkedActivity: false,
        today,
      }),
    ).toMatchObject({
      datePosition: "past",
      isOverdue: true,
      canPostpone: false,
      canSkip: false,
    });
  });

  it.each(["today", "future", "unscheduled"] as const)(
    "allows an unlinked open %s workout to be changed",
    (position) => {
      const scheduledDateKey =
        position === "today"
          ? "2026-08-14"
          : position === "future"
            ? "2026-08-16"
            : null;
      expect(
        getPlanWorkoutActionState({
          status: "IN_PROGRESS",
          scheduledDateKey,
          hasLinkedActivity: false,
          today,
        }),
      ).toMatchObject({
        datePosition: position,
        isOverdue: false,
        canPostpone: true,
        canSkip: true,
      });
    },
  );

  it.each(["DONE", "SKIPPED", "MOVED"] as const)(
    "does not expose actions for %s workouts",
    (status) => {
      expect(
        getPlanWorkoutActionState({
          status,
          scheduledDateKey: "2026-08-16",
          hasLinkedActivity: false,
          today,
        }),
      ).toMatchObject({
        isOverdue: false,
        canPostpone: false,
        canSkip: false,
      });
    },
  );

  it("does not expose actions while an activity is linked", () => {
    expect(
      getPlanWorkoutActionState({
        status: "PLANNED",
        scheduledDateKey: "2026-08-16",
        hasLinkedActivity: true,
        today,
      }),
    ).toMatchObject({ canPostpone: false, canSkip: false });
  });
});
