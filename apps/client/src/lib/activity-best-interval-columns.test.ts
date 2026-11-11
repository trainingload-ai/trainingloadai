import { describe, expect, it } from "vitest";
import {
  DEFAULT_BEST_INTERVAL_COLUMNS,
  normalizeBestIntervalColumns,
} from "./activity-best-interval-columns";

describe("best-effort column preferences", () => {
  it("preserves chosen order and removes duplicate or unknown columns", () => {
    expect(
      normalizeBestIntervalColumns([
        "maxHeartRate",
        "value",
        "maxHeartRate",
        "obsolete",
        null,
      ]),
    ).toEqual(["maxHeartRate", "value"]);
  });
  it("recovers usable defaults from empty or invalid preferences", () => {
    expect(normalizeBestIntervalColumns([])).toEqual(
      DEFAULT_BEST_INTERVAL_COLUMNS,
    );
    expect(normalizeBestIntervalColumns({ columns: [] })).toEqual(
      DEFAULT_BEST_INTERVAL_COLUMNS,
    );
  });
});
