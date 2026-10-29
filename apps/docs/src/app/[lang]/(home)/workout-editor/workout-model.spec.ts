import { describe, expect, it } from "vitest";
import {
  convertDurationQuantity,
  convertPaceText,
  convertPowerText,
  createDefaultWorkout,
  createEmptyRepeat,
  createEmptyStep,
  createPoolExample,
  durationToSeconds,
  formatClock,
  formatPaceClock,
  ftpPercentFromWatts,
  hasMeaningfulWorkout,
  paceSecondsForUnit,
  parseDurationNumber,
  PREVIEW_SECONDS_PER_METER,
  roundOnce,
  wattsFromFtpPercent,
  workoutPreviewSegments,
  workoutSummary,
  workoutToDsl,
  workoutTotalSeconds,
} from "./workout-model";

describe("workout editor model", () => {
  it("exports the default aerobic interval session as workout DSL", () => {
    expect(workoutToDsl(createDefaultWorkout())).toBe(
      [
        "warmup 10m",
        "repeat 5 {",
        "  work 3m pace z4",
        "  recovery 2m",
        "}",
        "cooldown 10m",
      ].join("\n"),
    );
  });

  it("chooses sport-specific zone channels and keeps RPE out of DSL", () => {
    const draft = createDefaultWorkout();
    draft.sport = "cycling";
    draft.modules = [
      createEmptyStep("work", {
        durationValue: 8,
        intensityKind: "zone",
        intensityValue: "Z3",
      }),
      createEmptyStep("work", {
        durationValue: 2,
        intensityKind: "rpe",
        intensityValue: "7",
      }),
      createEmptyStep("other", {
        durationValue: null,
        freeText: "easy spin until legs feel ready",
      }),
    ];

    expect(workoutToDsl(draft)).toBe(
      [
        "work 8m power z3",
        "work 2m",
        "easy spin until legs feel ready",
      ].join("\n"),
    );
    expect(workoutSummary(draft)).toContain("RPE 7");
  });

  it("formats power, pace, and heart-rate targets", () => {
    const draft = createDefaultWorkout();
    draft.modules = [
      createEmptyStep("work", {
        durationValue: 20,
        intensityKind: "power",
        intensityValue: "250",
      }),
      createEmptyStep("work", {
        durationValue: 5,
        durationUnit: "km",
        intensityKind: "pace",
        intensityValue: "4:30/km",
      }),
      createEmptyStep("recovery", {
        durationValue: 90,
        durationUnit: "s",
        intensityKind: "hr",
        intensityValue: "140-150",
      }),
    ];

    expect(workoutToDsl(draft)).toBe(
      [
        "work 20m power 250W",
        "work 5km pace 4:30/km",
        "recovery 90s hr 140-150bpm",
      ].join("\n"),
    );
  });

  it("sums repeat blocks into the preview duration", () => {
    const draft = createDefaultWorkout();
    expect(formatClock(workoutTotalSeconds(draft))).toBe("45:00");
    expect(hasMeaningfulWorkout(draft)).toBe(true);
    expect(hasMeaningfulWorkout({ ...draft, modules: [] })).toBe(false);
  });

  it("keeps interval repeats as one DSL block", () => {
    const draft = createDefaultWorkout();
    draft.modules = [
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
    ];

    expect(workoutToDsl(draft)).toBe(
      ["repeat 4 {", "  work 4m power 270W", "  recovery 2m", "}"].join("\n"),
    );
  });

  it("sums the expanded repeat duration once per repetition", () => {
    const draft = createDefaultWorkout();
    draft.modules = [
      createEmptyRepeat({
        times: 4,
        steps: [
          createEmptyStep("work", { durationValue: 3, durationUnit: "min" }),
          createEmptyStep("recovery", { durationValue: 90, durationUnit: "s" }),
        ],
      }),
    ];

    const segments = workoutPreviewSegments(draft);
    expect(segments).toHaveLength(2);
    expect(segments.reduce((total, segment) => total + segment.seconds, 0)).toBe(
      1080,
    );
    expect(workoutTotalSeconds(draft)).toBe(1080);
    expect(formatClock(workoutTotalSeconds(draft))).toBe("18:00");
  });

  it("rejects invalid durations and repeat counts instead of inventing a session", () => {
    expect(parseDurationNumber("")).toBeNull();
    expect(parseDurationNumber("   ")).toBeNull();
    expect(parseDurationNumber("abc")).toBeNull();
    expect(parseDurationNumber(Number.NaN)).toBeNull();
    expect(parseDurationNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(durationToSeconds(Number.NaN, "min")).toBe(0);
    expect(durationToSeconds(Number.NEGATIVE_INFINITY, "s")).toBe(0);
    expect(durationToSeconds(0, "min")).toBe(0);
    expect(durationToSeconds(-5, "km")).toBe(0);
    expect(parseDurationNumber("1.5")).toBe(1.5);

    const draft = createDefaultWorkout();
    draft.modules = [
      createEmptyRepeat({
        times: Number.NaN,
        steps: [createEmptyStep("work", { durationValue: 3 })],
      }),
    ];
    expect(workoutTotalSeconds(draft)).toBe(0);
    draft.modules = [
      createEmptyRepeat({
        times: 0,
        steps: [createEmptyStep("work", { durationValue: 3 })],
      }),
    ];
    expect(workoutTotalSeconds(draft)).toBe(0);
  });

  it("preserves time and distance when the unit changes, and rounds only for display", () => {
    expect(convertDurationQuantity(90, "s", "min")).toBe(1.5);
    expect(convertDurationQuantity(1.5, "min", "s")).toBe(90);
    expect(convertDurationQuantity(1, "h", "min")).toBe(60);
    expect(convertDurationQuantity(2.5, "km", "m")).toBe(2500);
    expect(convertDurationQuantity(2500, "m", "km")).toBe(2.5);
    expect(convertDurationQuantity(10, "min", "km")).toBeNull();
    expect(convertDurationQuantity(Number.NaN, "min", "s")).toBeNull();
    expect(convertDurationQuantity(-1, "m", "km")).toBe(-0.001);
    expect(roundOnce(260.5)).toBe(261);
    expect(roundOnce(247.475)).toBe(247);
  });

  it("round-trips pace and power units without changing the physical quantity", () => {
    const perMile = paceSecondsForUnit(270, "sec/km", "sec/mi");
    expect(perMile).not.toBeNull();
    expect(paceSecondsForUnit(perMile ?? 0, "sec/mi", "sec/km")).toBeCloseTo(270, 6);
    const perYard = paceSecondsForUnit(90, "sec/100m", "sec/100yd");
    expect(paceSecondsForUnit(perYard ?? 0, "sec/100yd", "sec/100m")).toBeCloseTo(
      90,
      6,
    );
    expect(formatPaceClock(90.5)).toBe("1:31");
    expect(convertPaceText("4:30/km", "sec/mi")).toBe("7:15/mi");
    expect(convertPaceText("7:15/mi", "sec/km")).toBe("4:30/km");
    expect(paceSecondsForUnit(Number.NaN, "sec/km", "sec/mi")).toBeNull();
    expect(paceSecondsForUnit(0, "sec/km", "sec/mi")).toBeNull();

    expect(ftpPercentFromWatts(260.5, 274)).toBeCloseTo((260.5 / 274) * 100, 6);
    expect(wattsFromFtpPercent(95, 260.5)).toBeCloseTo(247.475, 6);
    expect(convertPowerText("95%", "W", 260.5)).toBe("247");
    expect(convertPowerText("250", "%", 263)).toBe("95%");
    expect(convertPowerText("220-260", "%", 200)).toBe("110-130%");
    expect(convertPowerText("250", "%", 0)).toBeNull();
    expect(convertPowerText("250", "%", Number.NaN)).toBeNull();
    expect(ftpPercentFromWatts(-1, 250)).toBeNull();
    expect(wattsFromFtpPercent(90, -10)).toBeNull();
  });

  it("uses one preview pace so 1000 m and 1 km have the same timeline width", () => {
    expect(durationToSeconds(1000, "m")).toBe(1000 * PREVIEW_SECONDS_PER_METER);
    expect(durationToSeconds(1, "km")).toBe(durationToSeconds(1000, "m"));
    const pool = createPoolExample();
    expect(workoutTotalSeconds(pool)).toBe(
      200 * PREVIEW_SECONDS_PER_METER * 2 + 8 * (100 * PREVIEW_SECONDS_PER_METER + 20),
    );
  });
});
