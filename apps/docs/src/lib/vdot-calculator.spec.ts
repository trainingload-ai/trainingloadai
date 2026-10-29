import { describe, expect, it } from "vitest";
import {
  VDOT_ZONE_KEYS,
  VDOT_ZONE_PERCENTAGES,
  computeVdotForDistanceTime,
  formatRaceDuration,
  resolveVdotPaceRange,
  resolveVdotPaceRangeExact,
} from "@shared/vdot";
import { predictRaceTimes, roundVdot } from "./race-time-predictor";
import { KM_PER_MILE } from "./running-pace";
import { parseFlexibleTime, parseTimeParts } from "./vdot-time";
import {
  briefRaceEquivalents,
  displayVdot,
  equivalentTimeSec,
  roundPaceSeconds,
  trainingPaceBands,
  vdotFromRace,
} from "./vdot-calculator";
import { estimateVdotFromActivity } from "./vdot-activity";
import type { ThresholdRecord } from "./threshold-records";

describe("VDOT calculator", () => {
  it("matches the race-time predictor for the same performance", () => {
    const cases = [
      [5000, 25 * 60],
      [5000, 20 * 60],
      [10000, 50 * 60],
      [21097.5, 90 * 60],
    ] as const;

    for (const [distanceM, timeSec] of cases) {
      const race = predictRaceTimes({
        distanceKm: distanceM / 1000,
        timeSec,
      });
      const brief = briefRaceEquivalents(distanceM, timeSec);
      expect(brief).not.toBeNull();
      expect(brief!.vdot).toBe(roundVdot(race!.vdot!));
      expect(vdotFromRace(distanceM, timeSec)).toBe(roundVdot(race!.vdot!));
      for (const row of brief!.rows) {
        const predicted = race!.rows.find((item) => item.key === row.key);
        expect(row.timeSec).toBe(predicted?.timeSec ?? null);
        expect(row.isSource).toBe(predicted?.isSource ?? false);
      }
    }
  });

  it("locks the published worked examples", () => {
    expect(vdotFromRace(5000, 25 * 60)).toBe(38.3);
    expect(vdotFromRace(5000, 20 * 60)).toBe(49.8);
    expect(formatRaceDuration(equivalentTimeSec(42195, 50)!)).toBe("3:10:40");
    expect(formatRaceDuration(equivalentTimeSec(5000, 38)!)).toBe("25:10");
  });

  it("keeps E/M/T/I/R pace rows from sharing an integer second", () => {
    for (const vdot of [30, 38.3, 40, 49.8, 50, 60, 70]) {
      for (const unit of ["km", "mi"] as const) {
        const bands = trainingPaceBands(vdot, unit);
        expect(bands?.map((band) => band.zone)).toEqual([...VDOT_ZONE_KEYS]);
        for (let index = 1; index < bands!.length; index += 1) {
          const slower = bands![index - 1];
          const faster = bands![index];
          expect(faster.fastSec).toBeLessThan(faster.slowSec);
          expect(faster.slowSec).toBeLessThan(slower.fastSec);
        }
      }
    }
  });

  it("limits the marathon/threshold shoulder to the published 83–84% overlap", () => {
    expect(VDOT_ZONE_PERCENTAGES.E).toEqual({ low: 0.59, high: 0.74 });
    expect(VDOT_ZONE_PERCENTAGES.M).toEqual({ low: 0.75, high: 0.84 });
    expect(VDOT_ZONE_PERCENTAGES.T).toEqual({ low: 0.83, high: 0.88 });
    expect(VDOT_ZONE_PERCENTAGES.I).toEqual({ low: 0.95, high: 1 });
    expect(VDOT_ZONE_PERCENTAGES.R).toEqual({ low: 1.05, high: 1.1 });
    expect(VDOT_ZONE_PERCENTAGES.E.high).toBeLessThan(VDOT_ZONE_PERCENTAGES.M.low);
    expect(VDOT_ZONE_PERCENTAGES.T.high).toBeLessThan(VDOT_ZONE_PERCENTAGES.I.low);
    expect(VDOT_ZONE_PERCENTAGES.I.high).toBeLessThan(VDOT_ZONE_PERCENTAGES.R.low);

    const published = resolveVdotPaceRange(38.3, "T");
    const exact = resolveVdotPaceRangeExact(38.3, "T");
    expect(published.slowSecPerKm).toBe(Math.round(exact.slowSecPerKm));
    const shown = trainingPaceBands(38.3, "km")!.find((band) => band.zone === "T")!;
    const marathon = trainingPaceBands(38.3, "km")!.find((band) => band.zone === "M")!;
    expect(shown.fastSec).toBe(published.fastSecPerKm);
    expect(shown.slowSec).toBe(marathon.fastSec - 1);
    expect(shown.slowSec).toBeLessThan(published.slowSecPerKm);
  });

  it("preserves physical speed and every training pace when units change", () => {
    const distanceM = 5000;
    const timeSec = 25 * 60;
    const miles = distanceM / 1000 / KM_PER_MILE;
    expect(vdotFromRace(miles * KM_PER_MILE * 1000, timeSec)).toBe(
      vdotFromRace(distanceM, timeSec),
    );

    const vdot = vdotFromRace(distanceM, timeSec)!;
    const metric = trainingPaceBands(vdot, "km")!;
    const imperial = trainingPaceBands(vdot, "mi")!;
    for (const zone of VDOT_ZONE_KEYS) {
      const exact = resolveVdotPaceRangeExact(vdot, zone);
      const km = metric.find((band) => band.zone === zone)!;
      const mi = imperial.find((band) => band.zone === zone)!;
      expect(km.fastSec).toBe(roundPaceSeconds(exact.fastSecPerKm, "km"));
      if (zone !== "T") {
        expect(mi.slowSec).toBe(roundPaceSeconds(exact.slowSecPerKm, "mi"));
      }
      expect(mi.fastSec).toBe(roundPaceSeconds(exact.fastSecPerKm, "mi"));
    }
  });

  it("rounds a pace once, including the x.5 boundary", () => {
    expect(roundPaceSeconds(300.5, "km")).toBe(301);
    expect(roundPaceSeconds(300.4, "km")).toBe(300);
    const exact = 363.25;
    expect(roundPaceSeconds(exact, "mi")).toBe(Math.round(exact * KM_PER_MILE));
    expect(roundPaceSeconds(exact, "mi")).not.toBe(
      Math.round(Math.round(exact) * KM_PER_MILE),
    );
    expect(displayVdot(38.25)).toBe(38.3);
    expect(displayVdot(38.24)).toBe(38.2);
    expect(displayVdot(computeVdotForDistanceTime(5000, 1500))).toBe(38.3);
  });

  it("rejects empty and non-finite race inputs", () => {
    expect(vdotFromRace(Number.NaN, 1500)).toBeNull();
    expect(vdotFromRace(Number.POSITIVE_INFINITY, 1500)).toBeNull();
    expect(vdotFromRace(0, 1500)).toBeNull();
    expect(vdotFromRace(-5, 1500)).toBeNull();
    expect(vdotFromRace(5000, 0)).toBeNull();
    expect(vdotFromRace(5000, -1)).toBeNull();
    expect(vdotFromRace(5000, Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseFlexibleTime("")).toBeNull();
    expect(parseFlexibleTime("NaN")).toBeNull();
    expect(parseFlexibleTime("Infinity")).toBeNull();
    expect(parseTimeParts("NaN", "25", "00")).toBeNull();
    expect(parseTimeParts("", "25", "")).toBeNull();
    expect(parseTimeParts("", "25", "00.5")).toBe(1500.5);
  });
});

describe("activity VDOT windows", () => {
  it("uses the whole activity when it is asked for, and the best race window otherwise", () => {
    const activity = joinRuns([
      steadyRun(5000, 20 * 60),
      steadyRun(5000, 30 * 60),
    ]);
    const whole = estimateVdotFromActivity(activity, "whole");
    const best = estimateVdotFromActivity(activity, "best");
    expect(whole).not.toBeNull();
    expect(best).not.toBeNull();
    expect(whole!.distanceM).toBeCloseTo(10000, 0);
    expect(whole!.vdot).toBe(vdotFromRace(10000, whole!.timeSec));
    expect(best!.vdot).toBeGreaterThan(whole!.vdot);
    expect(best!.distanceM).toBeCloseTo(5000, 0);
    expect(best!.vdot).toBe(vdotFromRace(5000, 20 * 60));
  });

  it("does not score a window that crosses a sensor gap or a distance regression", () => {
    const clean = steadyRun(5000, 25 * 60, 5);
    expect(estimateVdotFromActivity(clean, "whole")!.vdot).toBe(38.3);

    const before = steadyRun(5000, 25 * 60, 5);
    const after = steadyRun(2000, 12 * 60, 5);
    const last = before[before.length - 1];
    const gapped = [
      ...before,
      ...after.slice(1).map((point) => ({
        seconds: point.seconds + last.seconds + 15,
        distance: (point.distance ?? 0) + (last.distance ?? 0),
      })),
    ];
    expect(estimateVdotFromActivity(gapped, "whole")).toBeNull();
    expect(estimateVdotFromActivity(gapped, "best")!.vdot).toBe(38.3);

    const reversed = steadyRun(5000, 25 * 60, 5);
    reversed[20] = { ...reversed[20], distance: reversed[10].distance! - 50 };
    expect(estimateVdotFromActivity(reversed, "whole")).toBeNull();
    expect(estimateVdotFromActivity(steadyRun(1000, 5 * 60), "whole")).toBeNull();
    expect(estimateVdotFromActivity([], "best")).toBeNull();
  });
});

function steadyRun(
  distanceM: number,
  seconds: number,
  step = 5,
): ThresholdRecord[] {
  const records: ThresholdRecord[] = [];
  const count = Math.ceil(seconds / step);
  for (let index = 0; index <= count; index += 1) {
    const elapsed = Math.min(seconds, index * step);
    records.push({
      seconds: elapsed,
      distance: (distanceM * elapsed) / seconds,
    });
  }
  return records;
}

function joinRuns(parts: ThresholdRecord[][]) {
  const records: ThresholdRecord[] = [];
  let timeOffset = 0;
  let distanceOffset = 0;
  for (const part of parts) {
    part.forEach((point, index) => {
      if (records.length > 0 && index === 0) return;
      records.push({
        seconds: point.seconds + timeOffset,
        distance: (point.distance ?? 0) + distanceOffset,
      });
    });
    const last = part[part.length - 1];
    timeOffset += last.seconds;
    distanceOffset += last.distance ?? 0;
  }
  return records;
}
