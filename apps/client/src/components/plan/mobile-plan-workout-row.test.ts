import { describe, expect, it } from "vitest";
import type { PlanWorkout } from "@/api/plans";
import { buildMobileWorkoutSegments } from "./mobile-plan-workout-row";

describe("buildMobileWorkoutSegments", () => {
  it("uses the workout target zone for the mobile chart color and height", () => {
    const workout = {
      id: "workout-1",
      planId: "plan-1",
      dayOffset: 0,
      weekIndex: 1,
      dayIndex: 1,
      sessionIndex: 1,
      scheduledDate: "2026-08-11",
      name: "Easy run",
      text: "work 30m pace z1",
      sportType: "RUN",
      structureKind: "ENDURANCE",
      dslVersion: 1,
      structure: {
        kind: "ENDURANCE",
        version: 1,
        blocks: [
          {
            type: "work",
            steps: [
              {
                duration: 1800,
                stepKind: "WORK",
                primaryTargetMeta: { kind: "SPEED", zoneIndex: 1 },
              },
            ],
          },
        ],
      },
      summary: {
        kind: "ENDURANCE",
        durationSeconds: 1800,
        stepCount: 1,
        hardSession: false,
      },
      status: "PLANNED",
    } satisfies PlanWorkout;

    expect(buildMobileWorkoutSegments(workout)).toEqual([
      expect.objectContaining({
        duration: 1800,
        intensity: 65,
        color: "#94a3b8",
        targetKind: "SPEED",
        zoneIndex: 1,
      }),
    ]);
  });
});
