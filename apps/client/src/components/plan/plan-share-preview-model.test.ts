import { describe, expect, it } from "vitest";
import {
  firstBusyWeekIndex,
  groupSharePreviewWeeks,
  uniqueSportTypes,
  type SharePreviewWorkout,
} from "./plan-share-preview-model";

function workout(
  weekIndex: number,
  dayIndex: number,
  sessionIndex = 1,
): SharePreviewWorkout {
  return {
    weekIndex,
    dayIndex,
    sessionIndex,
    sportType: "RUN",
    name: `W${weekIndex}D${dayIndex}`,
    notes: null,
    structureKind: "ENDURANCE",
  };
}

describe("groupSharePreviewWeeks", () => {
  it("fills every weekday for the advertised period", () => {
    const weeks = groupSharePreviewWeeks(
      [workout(1, 1), workout(1, 6), workout(2, 2)],
      2,
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.sessionCount).toBe(2);
    expect(weeks[0]?.previewLoad).toBe(0);
    expect(weeks[0]?.days).toHaveLength(7);
    expect(weeks[0]?.days[0]?.workouts[0]?.name).toBe("W1D1");
    expect(weeks[0]?.days[3]?.workouts).toEqual([]);
    expect(weeks[1]?.sessionCount).toBe(1);
  });

  it("extends past periodWeeks when workouts continue later", () => {
    const weeks = groupSharePreviewWeeks([workout(4, 1)], 2);
    expect(weeks).toHaveLength(4);
    expect(weeks[3]?.sessionCount).toBe(1);
  });

  it("sums generic preview load by week", () => {
    const weeks = groupSharePreviewWeeks(
      [
        { ...workout(1, 1), previewLoad: 20 },
        { ...workout(1, 3), previewLoad: 12.4 },
      ],
      1,
    );
    expect(weeks[0]?.previewLoad).toBe(32.4);
  });

  it("backfills previewLoad from structure when the payload omitted it", () => {
    const weeks = groupSharePreviewWeeks(
      [
        {
          ...workout(1, 1),
          structure: {
            kind: "ENDURANCE",
            version: 1,
            blocks: [
              {
                type: "work",
                steps: [{ duration: 2400, stepKind: "WORK" }],
              },
            ],
          },
        },
      ],
      1,
    );
    expect(weeks[0]?.previewLoad).toBe(32.7);
    expect(weeks[0]?.days[0]?.workouts[0]?.durationSeconds).toBe(2400);
  });

  it("drops illegal week or day indexes", () => {
    const weeks = groupSharePreviewWeeks(
      [workout(0, 1), workout(1, 0), workout(1, 8), workout(1, 2)],
      1,
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.sessionCount).toBe(1);
    expect(weeks[0]?.days[1]?.workouts[0]?.name).toBe("W1D2");
  });

  it("caps advertised period at 52 weeks", () => {
    const weeks = groupSharePreviewWeeks([workout(1, 1)], 80);
    expect(weeks).toHaveLength(52);
  });
});

describe("firstBusyWeekIndex", () => {
  it("skips empty leading weeks", () => {
    const weeks = groupSharePreviewWeeks([workout(2, 1)], 2);
    expect(firstBusyWeekIndex(weeks)).toBe(2);
  });
});

describe("uniqueSportTypes", () => {
  it("keeps payload order and de-duplicates", () => {
    expect(
      uniqueSportTypes(["RUN", "run"], [workout(1, 1), { ...workout(1, 2), sportType: "SWIM" }]),
    ).toEqual(["RUN", "SWIM"]);
  });
});
