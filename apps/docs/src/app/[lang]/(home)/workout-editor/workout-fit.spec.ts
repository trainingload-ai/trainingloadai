import { describe, expect, it } from "vitest";
import {
  createEmptyRepeat,
  createEmptyStep,
  createExampleWorkout,
  workoutTotalSeconds,
} from "./workout-model";
import { encodeWorkoutFit, summarizeWorkoutFit, workoutFromFit } from "./workout-fit";

describe("workout FIT export", () => {
  it("round-trips step count and expanded duration through the FIT SDK", () => {
    const draft = createExampleWorkout("intervals");
    const bytes = encodeWorkoutFit(draft);
    const summary = summarizeWorkoutFit(bytes);

    expect(summary).not.toBeNull();
    expect(summary?.stepMessages).toBe(4);
    expect(summary?.expandedDurationSec).toBe(workoutTotalSeconds(draft));
    expect(summary?.expandedDurationSec).toBe(45 * 60);
  });

  it("stores pool distance in meters rather than the timeline estimate", () => {
    const draft = createExampleWorkout("pool");
    const summary = summarizeWorkoutFit(encodeWorkoutFit(draft));
    expect(summary?.distanceMeters).toEqual([200, 100, 200]);
    expect(summary?.expandedDurationSec).toBe(8 * 20);
    expect(summary?.expandedDurationSec).not.toBe(workoutTotalSeconds(draft));
  });

  it("keeps power, pace, and repeat structure when a FIT file is read back", () => {
    const draft = createExampleWorkout("intervals");
    draft.sport = "cycling";
    draft.modules = [
      createEmptyStep("warmup", { durationValue: 10 }),
      createEmptyRepeat({
        times: 4,
        steps: [
          createEmptyStep("work", {
            durationValue: 4,
            intensityKind: "power",
            intensityValue: "270",
          }),
          createEmptyStep("recovery", {
            durationValue: 2,
            intensityKind: "pace",
            intensityValue: "5:00/km",
          }),
        ],
      }),
    ];
    const restored = workoutFromFit(encodeWorkoutFit(draft), {
      name: draft.name,
      sport: draft.sport,
      notes: "",
    });
    expect(restored?.modules).toHaveLength(2);
    expect(restored?.modules[1]).toMatchObject({ kind: "repeat", times: 4 });
    const summary = summarizeWorkoutFit(encodeWorkoutFit(draft));
    expect(summary?.expandedDurationSec).toBe(10 * 60 + 4 * (4 * 60 + 2 * 60));
    expect(summary?.stepMessages).toBe(3);
  });
});
