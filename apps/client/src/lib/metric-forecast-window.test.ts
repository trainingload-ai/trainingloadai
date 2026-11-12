import { describe, expect, it } from "vitest";
import {
  metricForecastDays,
  metricForecastEnd,
} from "./metric-forecast-window";

describe("metric detail forecast windows", () => {
  it.each([
    ["7", 7, "2026-03-14"],
    ["14", 14, "2026-03-21"],
    ["30", 30, "2026-04-06"],
    ["60", 30, "2026-04-06"],
  ])("maps the %s-day tab to its future calendar window", (tab, days, end) => {
    expect(metricForecastDays(tab)).toBe(days);
    expect(metricForecastEnd("2026-03-07", tab)).toBe(end);
  });
});
