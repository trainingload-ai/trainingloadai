import { describe, expect, it } from "vitest";
import { mapFitnessMetricEffectiveRows } from "./user-profile-metric-model";

describe("mapFitnessMetricEffectiveRows", () => {
  it("prefers the server calendar date over the UTC timestamp date", () => {
    expect(
      mapFitnessMetricEffectiveRows([
        {
          recordedAt: "2026-08-03T16:00:00.000Z",
          effectiveDate: "2026-08-04",
          value: 173,
          source: "AUTO",
        },
      ]),
    ).toEqual([
      {
        effectiveDate: "2026-08-04",
        value: "173",
        source: "AUTO",
        editable: undefined,
        sourceInfo: null,
      },
    ]);
  });
});
