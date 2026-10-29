import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { getHomeWeekRange } from "./home-week-range";

describe("getHomeWeekRange", () => {
  it.each([
    ["2026-08-24", "2026-08-24", "2026-08-30"],
    ["2026-08-25", "2026-08-24", "2026-08-30"],
    ["2026-08-30", "2026-08-24", "2026-08-30"],
  ])(
    "maps %s to its Monday-to-Sunday week",
    (anchor, expectedStart, expectedEnd) => {
      const range = getHomeWeekRange(dayjs(anchor));

      expect(range.startDate).toBe(expectedStart);
      expect(range.endDate).toBe(expectedEnd);
      expect(range.dateKeys).toHaveLength(7);
      expect(range.dateKeys).toEqual([
        "2026-08-24",
        "2026-08-25",
        "2026-08-26",
        "2026-08-27",
        "2026-08-28",
        "2026-08-29",
        "2026-08-30",
      ]);
    },
  );
});
