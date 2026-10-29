import { describe, expect, it } from "vitest";
import {
  estimateThresholdWindow,
  parseThresholdDuration,
  thresholdWindowAverage,
  type ThresholdRecord,
} from "./threshold-records";

const records: ThresholdRecord[] = Array.from(
  { length: 1801 },
  (_, seconds) => ({
    seconds,
    heartRate: seconds < 600 ? 140 : 170,
    power: seconds < 600 ? 0 : 300,
    distance: seconds * 4,
  }),
);

describe("threshold file sampling", () => {
  it("uses the final 20 minutes for heart rate, excluding the initial ramp", () => {
    expect(
      estimateThresholdWindow(records, "HEART_RATE", 0, 1800),
    ).toMatchObject({ average: 170, startSeconds: 600, endSeconds: 1800 });
  });
  it("includes zero power and uses only the first 20 minutes of the chosen segment", () => {
    expect(estimateThresholdWindow(records, "POWER", 0, 1800)).toMatchObject({
      average: 150,
      startSeconds: 0,
      endSeconds: 1200,
    });
  });
  it("weights irregular samples by covered time", () => {
    expect(
      thresholdWindowAverage(
        [
          { seconds: 0, heartRate: 100 },
          { seconds: 5, heartRate: 200 },
          { seconds: 10, heartRate: 150 },
          { seconds: 20, heartRate: 170 },
        ],
        "heartRate",
        0,
        20,
      ),
    ).toBe(150);
  });
  it("rejects missing coverage, long gaps, and undersized or out-of-bounds windows", () => {
    expect(
      estimateThresholdWindow(
        records.map((point) => ({ ...point, heartRate: undefined })),
        "HEART_RATE",
        0,
        1800,
      ),
    ).toBeNull();
    expect(
      estimateThresholdWindow(
        records.filter(
          (point) => point.seconds <= 1000 || point.seconds >= 1200,
        ),
        "HEART_RATE",
        0,
        1800,
      ),
    ).toBeNull();
    expect(estimateThresholdWindow(records, "HEART_RATE", 0, 1199)).toBeNull();
    expect(estimateThresholdWindow(records, "POWER", 0, 1801)).toBeNull();
    expect(estimateThresholdWindow(records, "PACE", -1, 1800)).toBeNull();
  });
  it("uses elapsed time and interpolates distance at the requested boundaries", () => {
    expect(
      estimateThresholdWindow(records, "RACE", 300.5, 1500.5),
    ).toMatchObject({ distanceKm: 4.8, seconds: 1200 });
    expect(estimateThresholdWindow(records, "PACE", 300, 1800)).toMatchObject({
      distanceKm: 6,
      seconds: 1500,
    });
  });
  it("rejects distance resets instead of silently treating multiple laps as a continuous distance", () => {
    expect(
      estimateThresholdWindow(
        records.map((point) => ({
          ...point,
          distance: point.seconds === 1000 ? 0 : point.distance,
        })),
        "RACE",
        0,
        1800,
      ),
    ).toBeNull();
  });
});

describe("threshold duration input", () => {
  it("accepts long mm:ss and equivalent hh:mm:ss, rejecting malformed clocks", () => {
    expect(parseThresholdDuration("75:30")).toBe(4530);
    expect(parseThresholdDuration("1:15:30")).toBe(4530);
    for (const value of [
      "",
      "20:",
      "1:60:00",
      "20:60",
      "-1:30",
      "1e2:00",
      "0:00",
    ])
      expect(parseThresholdDuration(value)).toBeNull();
  });
});
