import { describe, expect, it } from "vitest";
import {
  computeVdotForDistanceTime,
  formatPaceSeconds,
  formatRaceDuration,
  predictTimeForVdot,
} from "@shared/vdot";
import { RACE_DISTANCES_KM } from "./running-pace";
import type { ThresholdRecord } from "./threshold-records";
import {
  EMPTY_RACE_TIME_SHARE,
  EXAMPLE_RACE_TIME_SHARE,
  VDOT_MAX,
  VDOT_MIN,
  bestRaceWindow,
  buildRaceTimeSearch,
  clockPartsFromSeconds,
  convertDistanceInput,
  convertPaceInput,
  displayedRacePaceSecPerKm,
  displayedRaceTimeSec,
  distanceGap,
  fastestRaceWindow,
  formatPredictedClock,
  highlightedRaceKey,
  listRaceWindows,
  parseRaceTimeQuery,
  predictFromShare,
  predictRaceTimes,
  readRaceTimeInputs,
  roundVdot,
  sourceTimeFromPace,
} from "./race-time-predictor";

function clock(seconds: number) {
  return formatRaceDuration(seconds);
}

describe("race time predictor", () => {
  it("matches shared VDOT equivalents for a 10K in 50:00", () => {
    const distanceMeters = RACE_DISTANCES_KM["10k"] * 1000;
    const timeSec = 50 * 60;
    const raw = computeVdotForDistanceTime(distanceMeters, timeSec)!;
    const table = roundVdot(raw);
    const result = predictRaceTimes({
      distanceKm: RACE_DISTANCES_KM["10k"],
      timeSec,
    })!;

    expect(result.vdot).toBe(raw);
    expect(roundVdot(result.vdot!)).toBeCloseTo(40, 1);
    expect(table).toBeCloseTo(40, 1);
    expect(result.vdotSupported).toBe(true);

    const byKey = Object.fromEntries(result.rows.map((row) => [row.key, row]));
    for (const key of ["5k", "10k", "half", "marathon"] as const) {
      expect(byKey[key].timeSec).toBe(
        predictTimeForVdot(RACE_DISTANCES_KM[key] * 1000, table),
      );
    }

    const source = byKey["10k"];
    expect(source.isSource).toBe(true);
    expect(displayedRaceTimeSec(source, result.sourceTimeSec)).toBe(50 * 60);
    expect(formatPredictedClock(displayedRaceTimeSec(source, result.sourceTimeSec)!)).toBe(
      "50:00",
    );
    expect(formatPredictedClock(byKey["5k"].timeSec!)).toBe("24:06");
    expect(formatPredictedClock(byKey.half.timeSec!)).toBe("1:50:54");
    expect(formatPredictedClock(byKey.marathon.timeSec!)).toBe("3:49:37");
    expect(formatPredictedClock(byKey.marathon.timeSec!)).not.toBe(
      clock(timeSec * (RACE_DISTANCES_KM.marathon / 10) ** 1.06),
    );

    const marathonPace = displayedRacePaceSecPerKm(byKey.marathon, result)!;
    expect(formatPaceSeconds(marathonPace)).toBe("5:27/km");
    expect(formatPaceSeconds(marathonPace, "IMPERIAL")).toBe("8:45/mi");
  });

  it("rounds the VDOT score once before the table lookup", () => {
    const timeSec = 49 * 60 + 30;
    const raw = computeVdotForDistanceTime(10000, timeSec)!;
    const once = roundVdot(raw);
    const twice = Math.round(once);
    expect(once).not.toBe(twice);
    expect(predictTimeForVdot(42195, once)).not.toBe(
      predictTimeForVdot(42195, twice),
    );

    const result = predictRaceTimes({ distanceKm: 10, timeSec })!;
    expect(result.vdot).toBe(raw);
    expect(result.rows.find((row) => row.key === "marathon")!.timeSec).toBe(
      predictTimeForVdot(42195, once),
    );
  });

  it("rounds a .5 second only when formatting the clock", () => {
    expect(formatPredictedClock(3 * 3600 + 49 * 60 + 36.5)).toBe("3:49:37");
    expect(formatPredictedClock(3 * 3600 + 49 * 60 + 36.4)).toBe("3:49:36");
    expect(roundVdot(40.05)).toBe(40.1);
    expect(roundVdot(40.04)).toBe(40);
    expect(sourceTimeFromPace(10, 300.5)).toBe(3005);
  });

  it("keeps physical distance and pace when km and miles switch", () => {
    const miles = convertDistanceInput("10", "km", "mi");
    const back = convertDistanceInput(miles, "mi", "km");
    expect(Number(back)).toBeCloseTo(10, 5);

    const fromKm = predictFromShare({
      ...EMPTY_RACE_TIME_SHARE,
      preset: "custom",
      distance: "10",
      minutes: "50",
      seconds: "00",
    })!;
    const fromMiles = predictFromShare({
      ...EMPTY_RACE_TIME_SHARE,
      preset: "custom",
      unit: "mi",
      distance: miles,
      minutes: "50",
      seconds: "00",
    })!;
    expect(fromMiles.vdot).toBeCloseTo(fromKm.vdot!, 4);
    expect(fromMiles.rows.find((row) => row.key === "marathon")!.timeSec).toBeCloseTo(
      fromKm.rows.find((row) => row.key === "marathon")!.timeSec!,
      4,
    );

    const pace = convertPaceInput("5", "0", "min_per_km", "min_per_mi");
    const paceBack = convertPaceInput(
      pace.minutes,
      pace.seconds,
      "min_per_mi",
      "min_per_km",
    );
    const perKm =
      Number(paceBack.minutes) * 60 + Number(paceBack.seconds);
    expect(perKm).toBeCloseTo(300, 2);

    const fromPace = predictFromShare({
      ...EMPTY_RACE_TIME_SHARE,
      mode: "pace",
      paceMinutes: "5",
      paceSeconds: "0",
    })!;
    const fromMilePace = predictFromShare({
      ...EMPTY_RACE_TIME_SHARE,
      mode: "pace",
      paceUnit: "min_per_mi",
      paceMinutes: pace.minutes,
      paceSeconds: pace.seconds,
    })!;
    expect(fromMilePace.vdot).toBeCloseTo(fromPace.vdot!, 4);
    expect(fromPace.rows.find((row) => row.key === "marathon")!.timeSec).toBe(
      fromKm.rows.find((row) => row.key === "marathon")!.timeSec,
    );
  });

  it("accepts a known pace as the source race effort", () => {
    const timeSec = sourceTimeFromPace(RACE_DISTANCES_KM["10k"], 5 * 60);
    expect(timeSec).toBe(50 * 60);
    const fromPace = predictRaceTimes({
      distanceKm: RACE_DISTANCES_KM["10k"],
      timeSec: timeSec!,
    });
    const fromTime = predictRaceTimes({
      distanceKm: RACE_DISTANCES_KM["10k"],
      timeSec: 50 * 60,
    });
    expect(fromPace!.vdot).toBe(fromTime!.vdot);
  });

  it("adds a custom target without duplicating a standard race", () => {
    const result = predictRaceTimes({
      distanceKm: RACE_DISTANCES_KM["5k"],
      timeSec: 22 * 60,
      customDistanceKm: 8,
    })!;
    expect(result.rows.map((row) => row.key)).toEqual([
      "5k",
      "10k",
      "half",
      "marathon",
      "custom",
    ]);
    expect(result.rows.find((row) => row.key === "custom")?.distanceKm).toBe(8);

    const duplicated = predictRaceTimes({
      distanceKm: 10,
      timeSec: 50 * 60,
      customDistanceKm: 10,
    })!;
    expect(duplicated.rows.some((row) => row.key === "custom")).toBe(false);
  });

  it("keeps the VDOT number but withholds times outside the 20–85 table", () => {
    const tooSlow = predictRaceTimes({ distanceKm: 5, timeSec: 55 * 60 })!;
    expect(tooSlow.vdot).not.toBeNull();
    expect(roundVdot(tooSlow.vdot!)).toBeLessThan(VDOT_MIN);
    expect(tooSlow.vdotSupported).toBe(false);
    expect(tooSlow.rows.every((row) => row.timeSec == null)).toBe(true);

    const tooFast = predictRaceTimes({ distanceKm: 5, timeSec: 11 * 60 })!;
    expect(roundVdot(tooFast.vdot!)).toBeGreaterThan(VDOT_MAX);
    expect(tooFast.vdotSupported).toBe(false);
  });

  it("starts from an empty form and restores a shared result", () => {
    expect(parseRaceTimeQuery("")).toEqual(EMPTY_RACE_TIME_SHARE);
    expect(predictFromShare(EMPTY_RACE_TIME_SHARE)).toBeNull();
    expect(buildRaceTimeSearch("?utm=newsletter", EMPTY_RACE_TIME_SHARE)).toBe(
      "?utm=newsletter",
    );

    const example = predictFromShare(EXAMPLE_RACE_TIME_SHARE)!;
    expect(formatPredictedClock(
      displayedRaceTimeSec(
        example.rows.find((row) => row.key === "10k")!,
        example.sourceTimeSec,
      )!,
    )).toBe("50:00");

    const search = buildRaceTimeSearch("?utm=newsletter", {
      ...EMPTY_RACE_TIME_SHARE,
      mode: "pace",
      preset: "5k",
      unit: "mi",
      paceMinutes: "8",
      paceSeconds: "03",
      paceUnit: "min_per_mi",
      target: "8",
      example: true,
    });
    expect(search).toContain("utm=newsletter");
    expect(search).toContain("example=1");
    expect(search).not.toContain("d=");
    const restored = parseRaceTimeQuery(search);
    expect(restored.mode).toBe("pace");
    expect(restored.preset).toBe("5k");
    expect(restored.unit).toBe("mi");
    expect(restored.paceMinutes).toBe("8");
    expect(restored.paceSeconds).toBe("03");
    expect(restored.paceUnit).toBe("min_per_mi");
    expect(restored.target).toBe("8");
    expect(restored.example).toBe(true);
    expect(restored.minutes).toBe("");
  });

  it("reads SSR search params and ignores hostile values", () => {
    expect(readRaceTimeInputs({})).toEqual(EMPTY_RACE_TIME_SHARE);
    expect(
      readRaceTimeInputs({ example: "1" }).minutes,
    ).toBe(EXAMPLE_RACE_TIME_SHARE.minutes);
    expect(
      readRaceTimeInputs({
        race: "half",
        m: "90",
        s: "00",
        unit: ["mi", "km"],
      }),
    ).toMatchObject({ preset: "half", minutes: "90", seconds: "00", unit: "mi" });
    expect(readRaceTimeInputs({ m: "x".repeat(40) })).toEqual(EMPTY_RACE_TIME_SHARE);
    expect(readRaceTimeInputs({ m: "nope", race: "10k" }).minutes).toBe("nope");
    expect(predictFromShare(readRaceTimeInputs({ m: "nope", race: "10k" }))).toBeNull();
  });

  it("highlights a custom target, otherwise the marathon", () => {
    const standard = predictRaceTimes({
      distanceKm: RACE_DISTANCES_KM["10k"],
      timeSec: 50 * 60,
    })!;
    expect(highlightedRaceKey(standard.rows)).toBe("marathon");
    const custom = predictRaceTimes({
      distanceKm: RACE_DISTANCES_KM["5k"],
      timeSec: 25 * 60,
      customDistanceKm: 8,
    })!;
    expect(highlightedRaceKey(custom.rows)).toBe("custom");
  });

  it("classifies distance-gap boundaries", () => {
    expect(distanceGap(10, 30)).toBe("large");
    expect(distanceGap(10, 29.999)).toBe("step");
    expect(distanceGap(10, 18)).toBe("step");
    expect(distanceGap(10, 17.999)).toBe("close");
    expect(distanceGap(21.0975, 42.195)).toBe("step");
    expect(distanceGap(5, 42.195)).toBe("large");
    expect(distanceGap(10, 10)).toBe("close");
    expect(distanceGap(0, 10)).toBe("close");
    expect(distanceGap(Number.NaN, 10)).toBe("close");
    expect(distanceGap(-5, 10)).toBe("close");
  });

  it("rejects incomplete, non-finite, and non-positive inputs", () => {
    expect(predictRaceTimes({ distanceKm: 0, timeSec: 50 * 60 })).toBeNull();
    expect(predictRaceTimes({ distanceKm: -10, timeSec: 50 * 60 })).toBeNull();
    expect(predictRaceTimes({ distanceKm: Number.NaN, timeSec: 50 * 60 })).toBeNull();
    expect(predictRaceTimes({ distanceKm: Number.POSITIVE_INFINITY, timeSec: 50 * 60 })).toBeNull();
    expect(predictRaceTimes({ distanceKm: 10, timeSec: 0 })).toBeNull();
    expect(predictRaceTimes({ distanceKm: 10, timeSec: -1 })).toBeNull();
    expect(predictRaceTimes({ distanceKm: 10, timeSec: Number.NaN })).toBeNull();
    expect(predictRaceTimes({ distanceKm: 10, timeSec: Number.POSITIVE_INFINITY })).toBeNull();
    expect(sourceTimeFromPace(10, 0)).toBeNull();
    expect(sourceTimeFromPace(10, Number.NaN)).toBeNull();
    expect(sourceTimeFromPace(0, 300)).toBeNull();
    expect(predictFromShare({ ...EMPTY_RACE_TIME_SHARE, minutes: "" })).toBeNull();
    expect(clockPartsFromSeconds(Number.NaN)).toEqual({
      hours: "",
      minutes: "",
      seconds: "",
    });
  });
});

function steady(seconds: number, meters: number, step = 1): ThresholdRecord[] {
  const records: ThresholdRecord[] = [];
  for (let time = 0; time <= seconds; time += step) {
    records.push({ seconds: time, distance: (meters * time) / seconds });
  }
  return records;
}

describe("race activity windows", () => {
  it("uses the fastest continuous window and the whole activity", () => {
    const records = steady(3000, 10000);
    const ten = fastestRaceWindow(records, 10000, "10k")!;
    expect(ten.timeSec).toBeCloseTo(3000, 1);
    expect(ten.distanceKm).toBeCloseTo(10, 2);

    const five = fastestRaceWindow(records, 5000, "5k")!;
    expect(five.timeSec).toBeCloseTo(1500, 1);

    const best = bestRaceWindow(records)!;
    expect(best.key).toBe("10k");
    expect(roundVdot(best.vdot!)).toBeCloseTo(40, 1);
    expect(listRaceWindows(records).some((window) => window.key === "activity")).toBe(
      false,
    );
  });

  it("prefers a faster inner window over an easy average", () => {
    const records: ThresholdRecord[] = [];
    for (let time = 0; time <= 2000; time += 1) {
      const distance = time <= 1000 ? time * 2 : 2000 + (time - 1000) * 5;
      records.push({ seconds: time, distance });
    }
    const five = fastestRaceWindow(records, 5000, "5k")!;
    expect(five.timeSec).toBeCloseTo(1000, 0);
    expect(five.startSeconds).toBeGreaterThan(900);
  });

  it("rejects a window that crosses a long gap or a distance rollback", () => {
    const first = Array.from({ length: 601 }, (_, index) => ({
      seconds: index,
      distance: index * 3,
    }));
    const second = Array.from({ length: 601 }, (_, index) => ({
      seconds: 620 + index,
      distance: 1800 + index * 3,
    }));
    expect(fastestRaceWindow([...first, ...second], 1500, "1500")).not.toBeNull();
    expect(fastestRaceWindow([...first, ...second], 3000, "3k")).toBeNull();

    const rollback: ThresholdRecord[] = [
      { seconds: 0, distance: 0 },
      { seconds: 100, distance: 400 },
      { seconds: 200, distance: 100 },
      { seconds: 800, distance: 2000 },
    ];
    expect(fastestRaceWindow(rollback, 1500, "1500")).toBeNull();
    expect(bestRaceWindow(steady(100, 400))).toBeNull();
  });
});
