import { describe, expect, it } from "vitest";
import {
  buildHealthCardPeriod,
  buildHealthOverviewCards,
  calculateHealthBaseline,
  getHealthBaselineStatus,
  getComparableHealthIntraday,
  getSleepTimelineRow,
  formatHealthHrvLabel,
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
  const readings = new Map([
    [13, 52],
    [15, 60],
    [17, 64],
  ]);
  const days = Array.from({ length: 9 }, (_, index) => {
    const date = `2026-11-${10 + index}`;
    const value = readings.get(10 + index);
    return {
      date,
      timezone: null,
      metrics:
        value == null
          ? []
          : [{ type: "HRV_RMSSD_MS", value, provider: "GARMIN", unit: "ms" }],
    };
  });
  const [card] = buildHealthOverviewCards(days);

  it("shows the latest reading when today has no data", () => {
    const period = buildHealthCardPeriod(
      card,
      "latest",
      undefined,
      "2026-11-18",
    );
    expect(period.currentPoints).toEqual([{ date: "2026-11-17", value: 64 }]);
    expect(period.currentAggregate).toBe(64);
    expect(period.previousAggregate).toBeUndefined();
  });

  it("ends the three-day trend on the latest recorded day and preserves gaps", () => {
    const period = buildHealthCardPeriod(card, "3", undefined, "2026-11-18");
    expect(
      period.currentPoints.map(({ date, value }) => [date, value]),
    ).toEqual([
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
    expect(
      buildHealthCardPeriod(older, "latest", undefined, "2026-11-18")
        .currentAggregate,
    ).toBe(60);
    expect(
      buildHealthCardPeriod(older, "3", undefined, "2026-11-18")
        .currentAggregate,
    ).toBe(56);
    expect(
      buildHealthCardPeriod(older, "latest", undefined, "2026-11-19")
        .currentAggregate,
    ).toBeUndefined();
    expect(
      buildHealthCardPeriod(older, "3", undefined, "2026-11-19")
        .currentAggregate,
    ).toBeUndefined();
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

function metric(type: string, value: number, provider = "GARMIN", unit = "ms") {
  return { type, value, provider, unit };
}

function day(date: string, ...metrics: ReturnType<typeof metric>[]) {
  return { date, timezone: null, metrics };
}

describe("shared recovery overview", () => {
  it("uses the new watch automatically and excludes the old watch from its trend", () => {
    const garminDays = [
      day("2026-11-15", metric("HRV_RMSSD_MS", 55)),
      day("2026-11-16", metric("HRV_RMSSD_MS", 50)),
      day("2026-11-17", metric("HRV_RMSSD_MS", 51)),
    ];
    const [garmin] = buildHealthOverviewCards(garminDays);
    expect(formatHealthHrvLabel(garmin)).toBe("RMSSD · Garmin");
    expect(buildHealthCardPeriod(garmin, "latest").previousAggregate).toBe(50);

    const firstAppleDay = day(
      "2026-11-18",
      metric("HRV_SDNN_MS", 35, "APPLE_HEALTH"),
    );
    const [firstApple] = buildHealthOverviewCards([
      ...garminDays,
      firstAppleDay,
    ]);
    expect(formatHealthHrvLabel(firstApple)).toBe("SDNN · Apple Health");
    expect(
      buildHealthCardPeriod(firstApple, "latest").previousAggregate,
    ).toBeUndefined();

    const [apple] = buildHealthOverviewCards([
      ...garminDays,
      firstAppleDay,
      day("2026-11-19", metric("HRV_SDNN_MS", 39, "APPLE_HEALTH")),
    ]);
    expect(apple.points.map(({ value }) => value)).toEqual([
      undefined,
      undefined,
      undefined,
      35,
      39,
    ]);
    const period = buildHealthCardPeriod(apple, "3");
    expect(period.currentAggregate).toBe(37);
    expect(period.previousAggregate).toBeUndefined();
  });

  it("keeps HRV separate when the latest reading uses the same method at a different source", () => {
    const [card] = buildHealthOverviewCards([
      day("2026-11-18", metric("HRV_RMSSD_MS", 55)),
      day("2026-11-19", metric("HRV_RMSSD_MS", 52, "APPLE_HEALTH")),
    ]);
    expect(formatHealthHrvLabel(card)).toBe("RMSSD · Apple Health");
    expect(
      buildHealthCardPeriod(card, "latest").previousAggregate,
    ).toBeUndefined();
  });

  it("rejects legacy or cross-source HRV details and keeps daily summaries", () => {
    const [card] = buildHealthOverviewCards([
      day("2026-11-19", metric("HRV_RMSSD_MS", 50)),
    ]);
    const intraday = {
      key: "hrv",
      granularity: "intraday",
      currentDate: "2026-11-19",
      previousDate: "2026-11-18",
      current: [
        { time: "2026-11-19T04:00:00Z", value: 42, provider: "GARMIN" },
      ],
      previous: [
        { time: "2026-11-18T04:00:00Z", value: 30, provider: "COROS" },
      ],
    } as const;
    const legacy = {
      ...intraday,
      current: [...intraday.current],
      previous: [...intraday.previous],
    };
    expect(
      getComparableHealthIntraday(card, legacy, "2026-11-19"),
    ).toBeUndefined();
    expect(
      getComparableHealthIntraday(
        card,
        { ...legacy, hrvType: "HRV_SDNN_MS" },
        "2026-11-19",
      ),
    ).toBeUndefined();
    const typed = getComparableHealthIntraday(
      card,
      { ...legacy, hrvType: "HRV_RMSSD_MS" },
      "2026-11-19",
    );
    expect(typed?.previous).toEqual([]);
    expect(typed?.current).toEqual(legacy.current);
    expect(buildHealthCardPeriod(card, "latest", typed).currentAggregate).toBe(
      50,
    );
  });

  it("preserves reported sleep totals without inventing stages or mixing time in bed", () => {
    const [card] = buildHealthOverviewCards([
      day("2026-11-17", metric("SLEEP_ASLEEP_SECONDS", 25200, "GARMIN", "s")),
      day("2026-11-18", metric("SLEEP_IN_BED_SECONDS", 28800, "GARMIN", "s")),
      day(
        "2026-11-19",
        metric("SLEEP_ASLEEP_SECONDS", 21600, "GARMIN", "s"),
        metric("SLEEP_CORE_SECONDS", 18000, "APPLE_HEALTH", "s"),
      ),
    ]);
    expect(card.points[0]).toMatchObject({
      value: 25200,
      unclassifiedSleep: 25200,
    });
    expect(card.points[0].core).toBeUndefined();
    expect(card.points[0].awake).toBeUndefined();
    expect(card.points[2].core).toBeUndefined();
    expect(
      buildHealthCardPeriod(card, "latest").previousAggregate,
    ).toBeUndefined();
    expect(buildHealthCardPeriod(card, "3")).toMatchObject({
      currentAggregate: 23400,
      sleepValueKind: "timeAsleep",
    });
    expect(getSleepTimelineRow("asleep")).toBe(4);
    expect(getSleepTimelineRow("unmeasurable")).toBe(4);
  });
  it("shows real sleep segments and excludes time in bed and daily fallback spans", () => {
    const [card] = buildHealthOverviewCards([
      day("2026-11-19", metric("SLEEP_ASLEEP_SECONDS", 25200, "GARMIN", "s")),
    ]);
    const time = "2026-11-19T00:00:00Z";
    const endTime = "2026-11-19T07:00:00Z";
    const sleep = {
      time,
      endTime,
      value: 25200,
      provider: "GARMIN",
      stage: "sleep",
      summaryOnly: false,
    };
    const detail = getComparableHealthIntraday(
      card,
      {
        key: "sleep",
        granularity: "intraday",
        currentDate: "2026-11-19",
        previousDate: "2026-11-18",
        current: [
          { ...sleep, stage: "in_bed" },
          { ...sleep, summaryOnly: true },
          { ...sleep, provider: "APPLE_HEALTH" },
          sleep,
        ],
        previous: [],
      },
      "2026-11-19",
    );
    expect(detail?.current).toEqual([sleep]);
  });
});
