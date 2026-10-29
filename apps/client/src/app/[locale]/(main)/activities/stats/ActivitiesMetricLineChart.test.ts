import { describe, expect, it } from "vitest";
import { buildActivityMetricChartRows } from "./ActivitiesMetricLineChart";

describe("buildActivityMetricChartRows", () => {
  it("groups periods and averages only positive average-metric samples", () => {
    const rows = buildActivityMetricChartRows({
      rows: [
        { time: "2026-01-01T00:00:00.000Z", value: 100 },
        { time: "2026-01-02T00:00:00.000Z", value: 200 },
        { time: "2026-01-03T00:00:00.000Z", value: 0 },
      ],
      granularity: "month",
      metricKey: "heartRate",
      systemUnit: "metric",
      locale: "zh",
    });

    expect(rows).toEqual([{ period: "1月", heartRate: 150 }]);
  });
});
