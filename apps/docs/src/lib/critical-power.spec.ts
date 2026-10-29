import { describe, expect, it } from "vitest";
import {
  buildCpSearch,
  cpWattsPerKg,
  cpZonesSearch,
  fitCriticalPower,
  formatClock,
  formatRSquared,
  formatWPrimeKj,
  parseCpQuery,
  predictPowerWatts,
  roundCpWatts,
  timeToExhaustionSeconds,
} from "./critical-power";

const twoPoint = [
  { seconds: 180, watts: 400 },
  { seconds: 720, watts: 300 },
];

describe("critical power model", () => {
  it("solves the worked two-point line", () => {
    const fit = fitCriticalPower(twoPoint);
    expect(fit).not.toBeNull();
    expect(fit!.cpWatts).toBeCloseTo(266.6667, 3);
    expect(fit!.wPrimeJoules).toBeCloseTo(24000, 3);
    expect(fit!.rSquared).toBeNull();
    expect(roundCpWatts(fit!.cpWatts)).toBe(267);
    expect(formatWPrimeKj(fit!.wPrimeJoules)).toBe("24.0");
    expect(predictPowerWatts(fit!.cpWatts, fit!.wPrimeJoules, 300)).toBeCloseTo(
      346.6667,
      3,
    );
    expect(predictPowerWatts(fit!.cpWatts, fit!.wPrimeJoules, 1200)).toBeCloseTo(
      286.6667,
      3,
    );
    expect(
      timeToExhaustionSeconds(fit!.cpWatts, fit!.wPrimeJoules, 350),
    ).toBeCloseTo(288, 3);
    expect(formatClock(288)).toBe("4:48");
    expect(cpWattsPerKg(267, 70)).toBeCloseTo(3.814, 2);
  });

  it("fits the worked three-point line and reports the miss", () => {
    const fit = fitCriticalPower([
      ...twoPoint.slice(0, 1),
      { seconds: 360, watts: 350 },
      twoPoint[1]!,
    ]);
    expect(fit).not.toBeNull();
    expect(fit!.cpWatts).toBeCloseTo(264.2857, 3);
    expect(fit!.wPrimeJoules).toBeCloseTo(27000, 3);
    expect(roundCpWatts(fit!.cpWatts)).toBe(264);
    expect(formatWPrimeKj(fit!.wPrimeJoules)).toBe("27.0");
    expect(formatRSquared(fit!.rSquared!)).toBe("0.998");
    expect(Math.round(fit!.maxAbsResidualWatts)).toBe(14);
  });

  it("shows how a 20 W softer long effort moves CP and W′", () => {
    const fit = fitCriticalPower([
      { seconds: 180, watts: 400 },
      { seconds: 720, watts: 280 },
    ]);
    expect(roundCpWatts(fit!.cpWatts)).toBe(240);
    expect(formatWPrimeKj(fit!.wPrimeJoules)).toBe("28.8");
  });

  it("refuses a single effort and identical durations", () => {
    expect(fitCriticalPower([twoPoint[0]!])).toBeNull();
    expect(
      fitCriticalPower([
        { seconds: 180, watts: 400 },
        { seconds: 180, watts: 380 },
      ]),
    ).toBeNull();
  });

  it("round-trips efforts, weight, and units through the query string", () => {
    const search = buildCpSearch("", {
      efforts: [
        { preset: "180", minutes: "", watts: "400" },
        { preset: "custom", minutes: "12", watts: "300" },
        { preset: "360", minutes: "", watts: "350" },
      ],
      weightKg: "70",
      units: "imperial",
    });
    expect(search).toContain("t1=180");
    expect(search).toContain("p1=400");
    expect(search).toContain("t2=720");
    expect(search).toContain("p2=300");
    expect(search).toContain("t3=360");
    expect(search).toContain("units=imperial");
    const restored = parseCpQuery(search);
    expect(restored.efforts[0]).toMatchObject({ preset: "180", watts: "400" });
    expect(restored.efforts[1]).toMatchObject({ preset: "720", minutes: "", watts: "300" });
    expect(restored.weightKg).toBe("70");
    expect(restored.units).toBe("imperial");

    const custom = buildCpSearch("", {
      efforts: [
        { preset: "180", minutes: "", watts: "400" },
        { preset: "custom", minutes: "7", watts: "320" },
        { preset: "unset", minutes: "", watts: "" },
      ],
      weightKg: "",
      units: "metric",
    });
    expect(custom).toContain("t2=420");
    expect(parseCpQuery(custom).efforts[1]).toMatchObject({
      preset: "custom",
      minutes: "7",
      watts: "320",
    });
  });

  it("opens power zones with CP as the base", () => {
    expect(cpZonesSearch(267)).toBe("model=friel&baseType=cp&base=267");
    expect(cpZonesSearch(267, "STRYD")).toBe("model=stryd&baseType=cp&base=267");
  });
});
