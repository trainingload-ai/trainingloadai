import { describe, expect, it } from "vitest";
import { projectionChartSeries } from "./pmc-projection-model";
import type { PmcProjectionResult } from "@shared/pmc-projection";

describe("PMC presentation model", () => {
  const point = (
    date: string,
    basis = "ACTUAL",
    load: number | null = 20,
    ctl: number | null = 40,
  ) => ({
    date,
    basis,
    load,
    ctl,
    atl: ctl === null ? null : 45,
    tsb: ctl === null ? null : -5,
    plannedLoad: basis === "PLAN" ? load : null,
    habitLoad: null,
  });
  it("keeps current actual values separate and does not draw through unknown future metrics", () => {
    const data = {
      today: "2026-11-11",
      history: [point("2026-11-10"), point("2026-11-11")],
      forecast: [
        point("2026-11-12", "PLAN", 30, 41),
        point("2026-11-13", "UNKNOWN", null, null),
        point("2026-11-14", "PLAN", 50, null),
      ],
    } as unknown as PmcProjectionResult;
    const series = projectionChartSeries(data, "ctl");
    expect(series.actual).toEqual([40, 40, null, null, null]);
    expect(series.future).toEqual([null, 40, 41, null, null]);
  });
});
