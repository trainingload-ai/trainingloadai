import { describe, expect, it } from "vitest";
import { createEmptyStep, createExampleWorkout, workoutToDsl } from "./workout-model";
import {
  MAX_SHARE_WORKFLOW,
  nextWorkoutShareUrl,
  parseWorkoutWorkflow,
  readWorkoutShare,
  serializeWorkoutWorkflow,
  shareResultUrl,
} from "./share-inputs";

describe("workout share inputs", () => {
  it("restores an example only from the example flag", () => {
    const intervals = readWorkoutShare({ example: "intervals" });
    expect(intervals.example).toBe("intervals");
    expect(workoutToDsl(intervals.draft)).toBe(
      workoutToDsl(createExampleWorkout("intervals")),
    );
    const legacy = readWorkoutShare({ example: "1" });
    expect(workoutToDsl(legacy.draft)).toBe(workoutToDsl(intervals.draft));
    const pool = readWorkoutShare({ example: "pool" });
    expect(pool.draft.sport).toBe("swimming");
    expect(workoutToDsl(pool.draft)).toContain("repeat 8");
  });

  it("round-trips a workflow and preserves the hash", () => {
    const draft = createExampleWorkout("intervals");
    draft.name = "Tuesday";
    draft.modules = [
      createEmptyStep("work", {
        durationValue: 20,
        intensityKind: "power",
        intensityValue: "250",
      }),
    ];
    const encoded = serializeWorkoutWorkflow(draft);
    expect(encoded).not.toBeNull();
    const restored = parseWorkoutWorkflow(encoded ?? "");
    expect(restored).not.toBeNull();
    expect(workoutToDsl(restored!)).toBe(workoutToDsl(draft));
    expect(restored?.name).toBe("Tuesday");

    const next = nextWorkoutShareUrl(
      "https://www.trainingload.ai/workout-editor#faq",
      draft,
      null,
    );
    expect(next.tooLong).toBe(false);
    expect(next.href).toContain("#faq");
    expect(new URL(next.href).searchParams.get("w")).toBe(encoded);
    expect(shareResultUrl(next.href).endsWith("#result")).toBe(true);
  });

  it("clears share params when the workout is empty and refuses an overlong link", () => {
    const cleared = nextWorkoutShareUrl(
      "https://www.trainingload.ai/en/workout-editor?example=pool&w=abc#result",
      { name: "", sport: "cycling", notes: "", modules: [] },
      null,
    );
    const url = new URL(cleared.href);
    expect(url.search).toBe("");
    expect(url.hash).toBe("#result");
    expect(cleared.tooLong).toBe(false);

    const huge = createExampleWorkout("intervals");
    huge.modules = Array.from({ length: 24 }, (_, index) =>
      createEmptyStep("work", {
        durationValue: index + 1,
        freeText: "x".repeat(64),
      }),
    );
    expect((serializeWorkoutWorkflow(huge) ?? "").length).toBe(0);
    const blocked = nextWorkoutShareUrl(
      "https://www.trainingload.ai/workout-editor?w=stale#builder",
      huge,
      null,
    );
    expect(blocked.tooLong).toBe(true);
    expect(new URL(blocked.href).searchParams.has("w")).toBe(false);
    expect(blocked.href).toContain("#builder");
    expect(MAX_SHARE_WORKFLOW).toBeGreaterThan(32);
  });

  it("rejects invalid share payloads", () => {
    expect(parseWorkoutWorkflow("")).toBeNull();
    expect(parseWorkoutWorkflow("{")).toBeNull();
    expect(parseWorkoutWorkflow("[]")).toBeNull();
    expect(parseWorkoutWorkflow("x".repeat(MAX_SHARE_WORKFLOW + 1))).toBeNull();
    expect(readWorkoutShare({ w: "{not-json" }).draft.modules).toEqual([]);
    expect(readWorkoutShare({}).example).toBeNull();
    expect(readWorkoutShare({}).draft.modules).toEqual([]);
  });
});
