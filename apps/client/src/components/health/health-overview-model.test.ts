import { describe, expect, it } from "vitest";
import {
  buildHealthCardPeriod,
  buildHealthOverviewCards,
  calculateHealthBaseline,
  getHealthBaselineStatus,
  type HealthChartPoint,
} from "./health-overview-model";

function points(values: number[]): HealthChartPoint[] {
  return values.map((value, index) => ({
    date: `2026-10-${String(index + 1).padStart(2, "0")}`,
    value,
  }));
}

describe("health overview baseline", () => {
  it("builds a typical range from the middle 60 percent of history", () => {
    const baseline = calculateHealthBaseline(
      points([40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60]),
    );

    expect(baseline).toEqual({
      lower: 44,
      upper: 56,
      center: 50,
      sampleSize: 11,
    });
  });

  it("requires enough history and ignores missing readings", () => {
    const sparse = points([40, 42, 44, 46, 48, 50]);
    sparse.push({ date: "2026-10-07" });

    expect(calculateHealthBaseline(sparse)).toBeNull();
  });

  it("classifies values against the baseline without implying good or bad", () => {
    const baseline = { lower: 45, upper: 55, center: 50, sampleSize: 21 };

    expect(getHealthBaselineStatus(44, baseline)).toBe("below");
    expect(getHealthBaselineStatus(50, baseline)).toBe("within");
    expect(getHealthBaselineStatus(56, baseline)).toBe("above");
  });
});

describe("health overview ranges", () => {
  const readings = new Map([[13, 52], [15, 60], [17, 64]]);
  const days = Array.from({ length: 9 }, (_, index) => {
    const date = `2026-11-${10 + index}`;
    const value = readings.get(10 + index);
    return {
      date,
      timezone: null,
      metrics: value == null
        ? []
        : [{ type: "HRV_RMSSD_MS", value, provider: "GARMIN", unit: "ms" }],
    };
  });
  const [card] = buildHealthOverviewCards(days);

  it("shows the latest reading when today has no data", () => {
    const period = buildHealthCardPeriod(card, "latest", undefined, "2026-11-18");
    expect(period.currentPoints).toEqual([{ date: "2026-11-17", value: 64 }]);
    expect(period.currentAggregate).toBe(64);
    expect(period.previousAggregate).toBeUndefined();
  });

  it("ends the three-day trend on the latest recorded day and preserves gaps", () => {
    const period = buildHealthCardPeriod(card, "3", undefined, "2026-11-18");
    expect(period.currentPoints.map(({ date, value }) => [date, value])).toEqual([
      ["2026-11-15", 60],
      ["2026-11-16", undefined],
      ["2026-11-17", 64],
    ]);
    expect(period.currentAggregate).toBe(62);
    expect(period.previousAggregate).toBe(52);
  });

  it("keeps a reading three days old and omits older ones from the short ranges", () => {
    const latestDate = "2026-11-15";
    const older = { ...card, latestDate, points: card.points.slice(0, 6) };
    expect(buildHealthCardPeriod(older, "latest", undefined, "2026-11-18").currentAggregate).toBe(60);
    expect(buildHealthCardPeriod(older, "3", undefined, "2026-11-18").currentAggregate).toBe(56);
    expect(buildHealthCardPeriod(older, "latest", undefined, "2026-11-19").currentAggregate).toBeUndefined();
    expect(buildHealthCardPeriod(older, "3", undefined, "2026-11-19").currentAggregate).toBeUndefined();
  });

  it("ends the seven-day trend on the reference date", () => {
    const period = buildHealthCardPeriod(card, "7", undefined, "2026-11-18");
    expect(period.currentPoints[0]?.date).toBe("2026-11-12");
    expect(period.currentPoints.at(-1)).toEqual({
      date: "2026-11-18",
      value: undefined,
    });
  });
});
