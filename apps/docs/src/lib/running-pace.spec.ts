import { describe, expect, it } from "vitest";
import {
  EMPTY_PACE_CALCULATOR,
  calculatePace,
  changePaceSolveFor,
  buildPaceComparison,
  KM_PER_MILE,
  PACE_CALCULATOR_EXAMPLE,
  RACE_DISTANCES_KM,
  buildPaceCalculatorSearch,
  buildSplitChart,
  convertDistanceText,
  convertPaceParts,
  formatClock,
  formatPaceClock,
  formatSplitTable,
  pacePartsToSeconds,
  paceToSecPerKm,
  paceToSpeed,
  parsePaceCalculatorQuery,
  parsePositiveNumber,
  roundClockSeconds,
  secPerKmToPace,
  solveDistanceKm,
  solvePaceSecPerKm,
  solveTimeSec,
  timePartsToSeconds,
} from "./running-pace";

describe("running pace math", () => {
  it("keeps a valid calculation when switching the unknown, including fractional seconds", () => {
    let state = { ...PACE_CALCULATOR_EXAMPLE, seconds: "02.5" };
    for (const mode of ["time", "distance", "pace", "time", "pace"] as const) {
      state = changePaceSolveFor(state, mode);
      const result = calculatePace(state)!;
      expect(result.timeSec).toBeCloseTo(1502.5, 5);
      expect(result.distanceKm).toBeCloseTo(5, 6);
      expect(result.secPerKm).toBeCloseTo(300.5, 5);
    }
    const distance = {
      ...PACE_CALCULATOR_EXAMPLE,
      solveFor: "distance" as const,
      minutes: "40",
      seconds: "0",
    };
    const restored = changePaceSolveFor(distance, "pace");
    expect(restored.preset).toBe("custom");
    expect(restored.distanceText).toBe("8");
    expect(calculatePace(restored)?.distanceKm).toBe(8);
    expect(changePaceSolveFor(EMPTY_PACE_CALCULATOR, "time").paceMinutes).toBe(
      "",
    );
  });

  it("compares neighboring paces in the selected unit and respects supported pace limits", () => {
    const metric = buildPaceComparison(300, "min_per_km");
    expect(metric.map((column) => column.label)).toEqual([
      "4:50",
      "4:55",
      "5:00",
      "5:05",
      "5:10",
    ]);
    expect(metric[1].times["10k"]).toBe(2950);
    expect(metric[2].times["5k"]).toBe(1500);
    expect(formatClock(metric[2].times.marathon)).toBe("3:30:59");
    const imperial = buildPaceComparison(300, "min_per_mi");
    expect(imperial[2].times["10k"] - imperial[1].times["10k"]).toBeCloseTo(
      50 / KM_PER_MILE,
      8,
    );
    expect(
      buildPaceComparison(90, "min_per_km").map((column) => column.offset),
    ).toEqual([0, 5, 10]);
    expect(
      buildPaceComparison(1200, "min_per_km").map((column) => column.offset),
    ).toEqual([-10, -5, 0]);
    expect(buildPaceComparison(NaN, "min_per_km")).toEqual([]);
    expect(buildPaceComparison(80, "min_per_km")).toEqual([]);
  });

  it("restores a custom-distance split selection through a shared link", () => {
    const state = {
      ...PACE_CALCULATOR_EXAMPLE,
      preset: "custom" as const,
      distanceText: "8.125",
      chart: "custom" as const,
    };
    const restored = parsePaceCalculatorQuery(
      buildPaceCalculatorSearch("", state, { full: true }),
    );
    expect(restored.chart).toBe("custom");
    expect(calculatePace(restored)?.distanceKm).toBe(8.125);
    const converted = {
      ...PACE_CALCULATOR_EXAMPLE,
      solveFor: "time" as const,
      paceUnit: "min_per_mi" as const,
      paceMinutes: "8",
      paceSeconds: "02.8032",
    };
    const shared = parsePaceCalculatorQuery(
      buildPaceCalculatorSearch("", converted, { full: true }),
    );
    expect(shared.paceSeconds).toBe("02.8032");
    expect(calculatePace(shared)?.timeSec).toBeCloseTo(1500, 8);
  });
  it("converts pace to speed without using the rounded display pace", () => {
    expect(paceToSpeed(300, "km/h")).toBe(12);
    expect(paceToSpeed(300, "mph")).toBeCloseTo(7.4564543, 6);
    const exactPace = solvePaceSecPerKm(42.195, 4 * 3600)!;
    expect(paceToSpeed(exactPace, "km/h")).toBeCloseTo(42.195 / 4, 10);
    for (const invalid of [0, -1, NaN, Infinity, 1201]) {
      expect(paceToSpeed(invalid, "km/h")).toBeNull();
    }
  });

  it("preserves speed and fractional seconds when switching input pace units", () => {
    const perMile = convertPaceParts(
      { minutes: 5, seconds: 0 },
      "min_per_km",
      "min_per_mi",
    )!;
    expect(perMile).toEqual({ minutes: 8, seconds: 2.8032 });
    const back = convertPaceParts(perMile, "min_per_mi", "min_per_km")!;
    expect(back).toEqual({ minutes: 5, seconds: 0 });
    const fractional = { minutes: 7, seconds: 59.99 };
    const perKm = convertPaceParts(fractional, "min_per_mi", "min_per_km")!;
    expect(
      pacePartsToSeconds(convertPaceParts(perKm, "min_per_km", "min_per_mi")!),
    ).toBeCloseTo(479.99, 5);
    expect(
      convertPaceParts({ minutes: 0, seconds: 0 }, "min_per_km", "min_per_mi"),
    ).toBeNull();
  });
  it("round-trips pace, time, and distance including a fractional second", () => {
    const distanceKm = 10;
    const timeSec = 50 * 60 + 12.5;
    const paceSecPerKm = solvePaceSecPerKm(distanceKm, timeSec);

    expect(paceSecPerKm).toBeCloseTo(timeSec / distanceKm, 8);
    expect(solveTimeSec(distanceKm, paceSecPerKm!)).toBeCloseTo(timeSec, 8);
    expect(solveDistanceKm(timeSec, paceSecPerKm!)).toBeCloseTo(distanceKm, 8);

    const marathonKm = RACE_DISTANCES_KM.marathon;
    const fourHour = 4 * 3600;
    const marathonPace = solvePaceSecPerKm(marathonKm, fourHour)!;
    expect(formatPaceClock(marathonPace)).toBe("5:41");
    expect(solveTimeSec(marathonKm, marathonPace)).toBeCloseTo(fourHour, 0);
    expect(solveDistanceKm(fourHour, marathonPace)).toBeCloseTo(marathonKm, 6);
  });

  it("round-trips kilometers and miles without changing the distance", () => {
    const miles = convertDistanceText("10", "km", "mi");
    expect(miles).not.toBeNull();
    expect(Number(miles)).toBeCloseTo(10 / KM_PER_MILE, 6);
    expect(Number(convertDistanceText(miles!, "mi", "km"))).toBeCloseTo(10, 4);

    const halfMiles = convertDistanceText(
      String(RACE_DISTANCES_KM.half),
      "km",
      "mi",
    );
    expect(Number(convertDistanceText(halfMiles!, "mi", "km"))).toBeCloseTo(
      RACE_DISTANCES_KM.half,
      4,
    );
  });

  it("round-trips min/km and min/mile without changing speed", () => {
    const secPerKm = 300.4;
    const secPerMile = secPerKmToPace(secPerKm, "min_per_mi");
    expect(paceToSecPerKm(secPerMile, "min_per_mi")).toBeCloseTo(secPerKm, 8);
    expect(secPerMile).toBeCloseTo(secPerKm * KM_PER_MILE, 8);

    const fiveK = RACE_DISTANCES_KM["5k"];
    const timeSec = 25 * 60;
    const solved = solvePaceSecPerKm(fiveK, timeSec)!;
    expect(
      solveTimeSec(
        fiveK,
        paceToSecPerKm(secPerKmToPace(solved, "min_per_mi"), "min_per_mi"),
      ),
    ).toBe(timeSec);
  });

  it("rounds a half-second total once, at display time", () => {
    const paceSecPerKm = 5 * 60;
    const time = solveTimeSec(RACE_DISTANCES_KM.marathon, paceSecPerKm);
    expect(time).toBeCloseTo(12658.5, 6);
    expect(roundClockSeconds(time!)).toBe(12659);
    expect(formatClock(time!)).toBe("3:30:59");

    const pace = solvePaceSecPerKm(5, 25 * 60 + 2.5)!;
    expect(pace).toBeCloseTo(300.5, 8);
    expect(formatPaceClock(pace)).toBe("5:01");
  });

  it("keeps even-split totals equal to the finish, with a partial last kilometer", () => {
    const paceSecPerKm = 5 * 60;
    const distanceKm = RACE_DISTANCES_KM.marathon;
    const rows = buildSplitChart({
      distanceKm,
      paceSecPerKm,
      unit: "km",
    });

    expect(rows).not.toBeNull();
    const rawSum = rows!.reduce((sum, row) => sum + row.splitSec, 0);
    expect(rawSum).toBeCloseTo(rows!.at(-1)!.elapsedSec, 6);
    expect(rows!.at(-1)!.elapsedSec).toBeCloseTo(paceSecPerKm * distanceKm, 6);

    const lastGap = rows!.at(-1)!.distanceKm - rows!.at(-2)!.distanceKm;
    expect(lastGap).toBeGreaterThan(0);
    expect(lastGap).toBeLessThan(1);

    const fullSplits = rows!.slice(0, -1).map((row) => row.splitSec);
    expect(new Set(fullSplits.map((split) => split.toFixed(6))).size).toBe(1);

    const displayed = formatSplitTable(rows!);
    const displaySum = displayed.reduce(
      (sum, row) => sum + row.displaySplitSec,
      0,
    );
    expect(displaySum).toBe(displayed.at(-1)!.displayElapsedSec);
    expect(displayed.at(-1)!.displayElapsedSec).toBe(
      roundClockSeconds(rows!.at(-1)!.elapsedSec),
    );
    expect(formatClock(displayed.at(-1)!.displayElapsedSec)).toBe("3:30:59");
  });

  it("rejects empty, zero, negative, and non-finite inputs", () => {
    expect(parsePositiveNumber("")).toBeNull();
    expect(parsePositiveNumber("0")).toBeNull();
    expect(parsePositiveNumber("-1")).toBeNull();
    expect(parsePositiveNumber("NaN")).toBeNull();
    expect(parsePositiveNumber("Infinity")).toBeNull();
    expect(timePartsToSeconds({ hours: 0, minutes: 0, seconds: 0 })).toBeNull();
    expect(
      timePartsToSeconds({ hours: 0, minutes: 60, seconds: 0 }),
    ).toBeNull();
    expect(
      timePartsToSeconds({ hours: Number.NaN, minutes: 1, seconds: 0 }),
    ).toBeNull();
    expect(pacePartsToSeconds({ minutes: 0, seconds: 0 })).toBeNull();
    expect(pacePartsToSeconds({ minutes: 5, seconds: 30.5 })).toBe(330.5);
    expect(solvePaceSecPerKm(0, 1800)).toBeNull();
    expect(solvePaceSecPerKm(-5, 1800)).toBeNull();
    expect(solvePaceSecPerKm(Number.NaN, 1800)).toBeNull();
    expect(solvePaceSecPerKm(5, Number.POSITIVE_INFINITY)).toBeNull();
    expect(solvePaceSecPerKm(5, 60)).toBeNull();
    expect(solveTimeSec(5, 80)).toBeNull();
    expect(solveTimeSec(-1, 300)).toBeNull();
    expect(solveDistanceKm(0, 300)).toBeNull();
    expect(solveDistanceKm(1800, Number.NaN)).toBeNull();
  });

  it("builds a marathon pace chart with km splits and a finish row", () => {
    const rows = buildSplitChart({
      distanceKm: RACE_DISTANCES_KM.marathon,
      paceSecPerKm: 5 * 60,
      unit: "km",
    });

    expect(rows).not.toBeNull();
    expect(rows![0]).toMatchObject({
      label: "1 km",
      elapsedSec: 300,
      splitSec: 300,
      isFinish: false,
    });
    expect(rows!.at(-1)).toMatchObject({
      label: "42.195 km",
      isFinish: true,
    });
    expect(rows!.filter((row) => row.isFinish)).toHaveLength(1);
    expect(rows!.length).toBe(43);
  });

  it("builds mile splits for a half marathon", () => {
    const rows = buildSplitChart({
      distanceKm: RACE_DISTANCES_KM.half,
      paceSecPerKm: 5 * 60,
      unit: "mi",
    });

    expect(rows).not.toBeNull();
    expect(rows![0].label).toBe("1 mi");
    expect(rows![0].elapsedSec).toBeCloseTo(5 * 60 * KM_PER_MILE, 6);
    expect(rows!.at(-1)?.isFinish).toBe(true);
    expect(rows!.at(-1)?.label).toContain("mi");
    expect(rows!.at(-1)!.splitSec).toBeGreaterThan(0);
    expect(rows!.at(-1)!.splitSec).toBeLessThan(rows![0].splitSec);
    const rawSum = rows!.reduce((sum, row) => sum + row.splitSec, 0);
    expect(rawSum).toBeCloseTo(rows!.at(-1)!.elapsedSec, 6);
  });

  it("round-trips a shared pace link, including a cleared input", () => {
    const shared = {
      ...PACE_CALCULATOR_EXAMPLE,
      solveFor: "time" as const,
      preset: "marathon" as const,
      distanceUnit: "mi" as const,
      paceUnit: "min_per_mi" as const,
      distanceText: "26.2",
      hours: "3",
      minutes: "30",
      seconds: "00",
      paceMinutes: "8",
      paceSeconds: "00",
      chart: "half" as const,
      example: false,
    };
    const search = buildPaceCalculatorSearch("?utm=poster", shared, {
      full: true,
    });

    expect(search).toContain("utm=poster");
    expect(search).toContain("solve=time");
    expect(search).toContain("race=marathon");
    expect(search).toContain("unit=mi");
    expect(search).toContain("pu=mi");
    expect(search).toContain("chart=half");
    expect(search).toContain("h=3");
    expect(search).toContain("m=30");
    expect(search).toContain("pm=8");
    expect(search).not.toContain("example=1");
    expect(parsePaceCalculatorQuery(search)).toEqual(shared);
  });

  it("keeps a fresh visit empty and loads the example only from example=1", () => {
    expect(buildPaceCalculatorSearch("", EMPTY_PACE_CALCULATOR)).toBe("");
    expect(parsePaceCalculatorQuery("")).toEqual(EMPTY_PACE_CALCULATOR);
    expect(parsePaceCalculatorQuery("?solve=nope&race=ultra")).toEqual(
      EMPTY_PACE_CALCULATOR,
    );
    expect(buildPaceCalculatorSearch("", PACE_CALCULATOR_EXAMPLE)).toBe(
      "?example=1",
    );
    expect(parsePaceCalculatorQuery("?example=1")).toEqual(
      PACE_CALCULATOR_EXAMPLE,
    );
    expect(parsePaceCalculatorQuery("?example=1&m=20").example).toBe(false);
    expect(parsePaceCalculatorQuery("?example=1&m=20").minutes).toBe("20");
  });
});
