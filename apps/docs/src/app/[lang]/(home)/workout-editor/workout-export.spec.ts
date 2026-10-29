import { describe, expect, it } from "vitest";
import {
  createDefaultWorkout,
  createEmptyRepeat,
  createEmptyStep,
  workoutToDsl,
} from "./workout-model";
import {
  fitSportForWorkout,
  formatIntervalsDoc,
  parseIntervalsDocInput,
  workoutToIntervalsDoc,
} from "./workout-export";

describe("workout editor exports", () => {
  it("maps sports to FIT workout sport enums", () => {
    expect(fitSportForWorkout("running")).toBe("running");
    expect(fitSportForWorkout("cycling")).toBe("cycling");
    expect(fitSportForWorkout("swimming")).toBe("swimming");
    expect(fitSportForWorkout("strength")).toBe("generic");
  });

  it("exports an intervals.icu workout_doc the import mapper understands", () => {
    const doc = workoutToIntervalsDoc(createDefaultWorkout());

    expect(doc.duration).toBe(2700);
    expect(doc.steps).toEqual([
      { text: "Warm up", duration: 600 },
      {
        text: "5x",
        reps: 5,
        steps: [
          {
            text: "Work Z4",
            duration: 180,
            pace: { value: 4, units: "zone" },
          },
          { text: "Easy", duration: 120 },
        ],
      },
      { text: "Cool down", duration: 600 },
    ]);
  });

  it("maps cycling zones to %FTP so intervals.icu power import can read them", () => {
    const draft = createDefaultWorkout();
    draft.sport = "cycling";
    draft.modules = [
      createEmptyStep("work", {
        durationValue: 8,
        intensityKind: "zone",
        intensityValue: "z4",
      }),
      createEmptyStep("work", {
        durationValue: 10,
        intensityKind: "power",
        intensityValue: "90-95%",
      }),
    ];

    expect(workoutToIntervalsDoc(draft).steps).toEqual([
      {
        text: "Work Z4",
        duration: 480,
        power: { value: 95, units: "%ftp" },
      },
      {
        text: "Work",
        duration: 600,
        power: { start: 90, end: 95, units: "%ftp" },
      },
    ]);
  });

  it("round-trips intervals.icu JSON back into the builder model", () => {
    const original = createDefaultWorkout();
    original.modules = [
      createEmptyStep("warmup", { durationValue: 10 }),
      createEmptyRepeat({
        times: 4,
        steps: [
          createEmptyStep("work", {
            durationValue: 4,
            intensityKind: "power",
            intensityValue: "270W",
          }),
          createEmptyStep("recovery", { durationValue: 2 }),
        ],
      }),
      createEmptyStep("cooldown", { durationValue: 8 }),
    ];

    const imported = parseIntervalsDocInput(formatIntervalsDoc(original), {
      name: original.name,
      sport: original.sport,
      notes: original.notes,
    });

    expect(workoutToDsl(imported)).toBe(workoutToDsl(original));
  });

  it("rejects empty or invalid intervals JSON", () => {
    const fallback = {
      name: "Aerobic intervals",
      sport: "running" as const,
      notes: "",
    };
    expect(() => parseIntervalsDocInput("", fallback)).toThrow(
      "intervals_doc_empty",
    );
    expect(() => parseIntervalsDocInput("{not-json", fallback)).toThrow(
      "intervals_doc_invalid_json",
    );
    expect(() => parseIntervalsDocInput("[]", fallback)).toThrow(
      "intervals_doc_empty",
    );
  });

  it("round-trips pace and power targets between DSL and intervals JSON", () => {
    const original = createDefaultWorkout();
    original.sport = "running";
    original.modules = [
      createEmptyStep("work", {
        durationValue: 5,
        durationUnit: "min",
        intensityKind: "pace",
        intensityValue: "4:30/km",
      }),
      createEmptyRepeat({
        times: 3,
        steps: [
          createEmptyStep("work", {
            durationValue: 8,
            intensityKind: "power",
            intensityValue: "250",
          }),
          createEmptyStep("recovery", {
            durationValue: 2,
            intensityKind: "power",
            intensityValue: "120-150",
          }),
        ],
      }),
    ];

    const imported = parseIntervalsDocInput(formatIntervalsDoc(original), {
      name: original.name,
      sport: original.sport,
      notes: original.notes,
    });
    expect(workoutToDsl(imported)).toBe(workoutToDsl(original));

    const again = workoutToIntervalsDoc(imported);
    expect(again.steps?.[0]).toMatchObject({
      duration: 300,
      pace: { value: 270, units: "sec/km" },
    });
    expect(again.steps?.[1]).toMatchObject({
      reps: 3,
      steps: [
        { duration: 480, power: { value: 250, units: "W" } },
        { duration: 120, power: { start: 120, end: 150, units: "W" } },
      ],
    });
  });
});
