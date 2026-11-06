import { describe, expect, it } from "vitest";
import {
  buildManualMetricSegments,
  getFitnessMetricType,
  isFitnessMetricKey,
} from "./metric-history-chart-model";
import dayjs from "dayjs";

describe("metric history chart model", () => {
  it("routes VO2max through the same AUTO timeline as CP and FTP", () => {
    expect(isFitnessMetricKey("vo2Max")).toBe(true);
    expect(getFitnessMetricType("vo2Max")).toBe("VO2_MAX");
  });

  it("renders manual values as bounded effective intervals", () => {
    expect(
      buildManualMetricSegments({
        startDate: dayjs("2026-01-01T00:00:00.000Z"),
        endDate: dayjs("2026-01-31T00:00:00.000Z"),
        manualRows: [
          { recordedAt: "2026-01-05T00:00:00.000Z", value: 40 },
          { recordedAt: "2026-01-20T00:00:00.000Z", value: 42 },
        ],
      }),
    ).toHaveLength(2);
  });
});
