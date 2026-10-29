import { describe, expect, it } from "vitest";

import { buildPmcSeries, DEMO_PMC_EXTREMES } from "./demo-fixtures";

describe("buildPmcSeries", () => {
  it("derives CTL, ATL, and TSB from the same daily load series", () => {
    const rows = buildPmcSeries();
    const ctlDecayFactor = Math.exp(-1 / 42);
    const atlDecayFactor = Math.exp(-1 / 7);
    let expectedCtl = 38;
    let expectedAtl = 40;

    expect(rows).toHaveLength(72);

    rows.forEach((row, index) => {
      expectedCtl =
        expectedCtl * ctlDecayFactor + row.value * (1 - ctlDecayFactor);
      expectedAtl =
        expectedAtl * atlDecayFactor + row.value * (1 - atlDecayFactor);

      expect(row.fitness).toBe(Math.round(expectedCtl * 10) / 10);
      expect(row.fatigue).toBe(Math.round(expectedAtl * 10) / 10);
      expect(row.form).toBe(Math.round((expectedCtl - expectedAtl) * 10) / 10);

      if (index % 7 === 6) {
        expect(row.value).toBe(0);
      }
    });

    const last = rows.at(-1)!;
    expect(last.fitness).toBe(47.7);
    expect(last.fatigue).toBe(51.3);
    expect(last.form).toBe(-3.6);
    expect(last.fatigue / last.fitness).toBeCloseTo(1.08, 2);
    expect(DEMO_PMC_EXTREMES.ctl).toBeGreaterThanOrEqual(
      Math.max(...rows.map((row) => row.fitness)),
    );
    expect(DEMO_PMC_EXTREMES.atl).toBeGreaterThanOrEqual(
      Math.max(...rows.map((row) => row.fatigue)),
    );
  });
});
