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

  it("expands repeat blocks so walk-run intervals stay visible in the mini chart", () => {
    const workout = {
      id: "workout-walk-run",
      planId: "plan-1",
      dayOffset: 0,
      weekIndex: 1,
      dayIndex: 1,
      sessionIndex: 1,
      scheduledDate: "2026-11-09",
      name: "走跑结合 A",
      text: "warmup 5m\nrepeat 6 {\n  work 1m\n  recovery 2m\n}\ncooldown 5m",
      sportType: "RUN",
      structureKind: "ENDURANCE",
      dslVersion: 1,
      structure: {
        kind: "ENDURANCE",
        version: 1,
        blocks: [
          {
            type: "work",
            steps: [{ duration: 300, stepKind: "WARMUP" }],
          },
          {
            type: "repeat",
            count: 6,
            children: [
              {
                type: "work",
                steps: [
                  { duration: 60, stepKind: "WORK" },
                  { duration: 120, stepKind: "RECOVERY" },
                ],
              },
            ],
          },
          {
            type: "work",
            steps: [{ duration: 300, stepKind: "COOLDOWN" }],
          },
        ],
      },
      summary: {
        kind: "ENDURANCE",
        durationSeconds: 1680,
        stepCount: 14,
        hardSession: false,
      },
      status: "PLANNED",
    } satisfies PlanWorkout;

    const segments = buildMobileWorkoutSegments(workout);
    expect(segments).toHaveLength(14);
    expect(segments[0]).toEqual(
      expect.objectContaining({ duration: 300, color: "#60a5fa" }),
    );
    expect(segments[1]).toEqual(
      expect.objectContaining({ duration: 60, color: "#6366f1" }),
    );
    expect(segments[2]).toEqual(
      expect.objectContaining({ duration: 120, color: "#6ee7b7" }),
    );
    expect(segments.at(-1)).toEqual(
      expect.objectContaining({ duration: 300, color: "#06b6d4" }),
    );
  });

});
