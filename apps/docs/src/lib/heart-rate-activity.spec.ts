import { describe, expect, it } from "vitest";
import {
  activitySamplesFromRecords,
  calculateFieldLthr,
  compareObservedMaxHr,
  estimateActivityLthr,
  estimateLthrAtWindow,
  observeMaxHeartRate,
  type HeartRateSample,
} from "./heart-rate-activity";

function series(
  seconds: number,
  heartRate: (second: number) => number | null,
  omit?: (second: number) => boolean,
): HeartRateSample[] {
  return Array.from({ length: seconds + 1 }, (_, second) => ({
    seconds: second,
    heartRate: heartRate(second),
  })).filter((_, second) => !omit?.(second));
}

describe("ordinary-activity LTHR", () => {
  it("uses the last 20 minutes and rounds the mean once", () => {
    const samples = series(1800, (second) => (second < 600 ? 160 : 176));
    const result = calculateFieldLthr(samples, 0);
    expect(result.valid).toBe(true);
    expect(result.value).toBe(176);
    expect(result.rawMean).toBeCloseTo(176, 5);
  });

  it("selects the strongest 30-minute window in a 55-minute activity with a short finish", () => {
    const samples = series(3300, (second) => (second < 3060 ? 162 : 177));
    const observed = estimateActivityLthr(samples);
    expect(observed).toMatchObject({
      value: 165,
      windowStartSec: 1500,
      windowEndSec: 3300,
      measureStartSec: 2100,
    });
    expect(observed!.rawMean).toBeCloseTo(165, 0);
    expect(observed!.fullCoverageRatio).toBeGreaterThanOrEqual(0.95);
    expect(observed!.maxGapSeconds).toBeLessThanOrEqual(30);
  });

  it("lets an explicit window replace the automatic pick", () => {
    const samples = series(3300, (second) => (second < 3060 ? 162 : 177));
    expect(estimateLthrAtWindow(samples, 0)?.value).toBe(162);
    expect(estimateActivityLthr(samples)?.value).toBe(165);
  });

  it("rejects a short file, a >30 s gap, unordered samples, and non-finite heart rate", () => {
    expect(estimateActivityLthr(series(1200, () => 150))).toBeNull();
    expect(
      estimateActivityLthr(
        series(3300, () => 160, (second) => second >= 1600 && second <= 1700),
      ),
    ).toBeNull();
    const swapped = series(1800, () => 150);
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(estimateActivityLthr(swapped)).toBeNull();
    expect(calculateFieldLthr(series(1800, () => Number.NaN), 0).valid).toBe(
      false,
    );
    expect(
      activitySamplesFromRecords([
        { seconds: 0, heartRate: 0 },
        { seconds: 1, heartRate: -1 },
        { seconds: 2 },
      ]).map((sample) => sample.heartRate),
    ).toEqual([null, null, null]);
  });

  it("does not treat a finishing spike as the LTHR", () => {
    const steady = estimateActivityLthr(series(3600, () => 150));
    const spiked = estimateActivityLthr(
      series(3600, (second) => (second > 3540 ? 190 : 150)),
    );
    expect(steady?.value).toBe(150);
    expect(spiked?.value).toBe(152);
    expect(spiked!.value).toBeLessThan(190);
  });
});

describe("observed max heart rate", () => {
  it("keeps a peak held for at least three 1-second samples and drops an isolated spike", () => {
    const samples = series(30, (second) => {
      if (second >= 10 && second <= 12) return 188;
      if (second === 20) return 210;
      return 150;
    });
    expect(observeMaxHeartRate(samples)).toMatchObject({
      bpm: 188,
      instantaneous: true,
    });
  });

  it("rejects a two-sample jump and a non-finite peak", () => {
    const brief = series(20, (second) =>
      second === 8 || second === 9 ? 205 : 140,
    );
    expect(observeMaxHeartRate(brief)).toMatchObject({ bpm: 140 });
    expect(
      observeMaxHeartRate([
        { seconds: 0, heartRate: Number.NaN },
        { seconds: 1, heartRate: 0 },
        { seconds: 2, heartRate: -5 },
      ]),
    ).toBeNull();
  });

  it("labels a coarse series as not instantaneous and compares it with the current reference", () => {
    const coarse: HeartRateSample[] = [0, 30, 60, 90].map((seconds) => ({
      seconds,
      heartRate: 172,
    }));
    expect(observeMaxHeartRate(coarse)).toMatchObject({
      bpm: 172,
      instantaneous: false,
    });
    expect(compareObservedMaxHr(188, 180)).toBe("may_be_low");
    expect(compareObservedMaxHr(160, 180)).toBe("not_a_decline");
    expect(compareObservedMaxHr(180, 180)).toBe("matches");
    expect(compareObservedMaxHr(180, null)).toBe("no_reference");
  });
});
