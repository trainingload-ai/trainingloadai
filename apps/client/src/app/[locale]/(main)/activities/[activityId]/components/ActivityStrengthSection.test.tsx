import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityStrengthSection } from "./ActivityStrengthSection";

vi.mock("next-intl", () => ({
  useLocale: () => "zh",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    isLoading: false,
    data: {
      activityId: 42,
      activityHashId: "fr955-strength",
      exercises: [
        {
          id: "exercise-1",
          name: "Barbell deadlift",
          sets: [
            {
              id: "set-1",
              setIndex: 0,
              sourceSequenceIndex: 8,
              setType: "WORK",
              completedReps: 10,
              completedDurationSeconds: 46,
              restAfterSeconds: 269,
              load: { kind: "ABSOLUTE", value: 40, unit: "KG" },
              completedAt: "2026-11-03T19:51:02.000Z",
              source: "FIT",
            },
          ],
        },
      ],
      summary: {
        kind: "STRENGTH_ACTUAL",
        exerciseCount: 1,
        setCount: 1,
        completedSetCount: 1,
        workingSetCount: 1,
        completedReps: 10,
        timedSetSeconds: 46,
        volumeLoadKg: 400,
        volumeLoadLb: 0,
      },
      planned: null,
    },
  }),
}));

vi.mock("@/api/activity", () => ({
  fetchActivityStrength: vi.fn(),
}));

describe("ActivityStrengthSection", () => {
  it("displays FIT strength facts including reps, active duration, rest, and load", () => {
    render(
      <ActivityStrengthSection
        activity={{
          hashId: "fr955-strength",
          sportType: "UNKNOWN",
          sportDefinitionCode: "STRENGTH_TRAINING",
        }}
      />,
    );

    expect(screen.getByText("力量训练记录")).toBeVisible();
    expect(screen.getByText("已完成 1/1 组 · 10 次")).toBeVisible();
    expect(screen.getByText("动作 46s · 休息 269s")).toBeVisible();
    expect(screen.getByText("实际: 10 次 · 46s")).toBeVisible();
    expect(screen.getByText("休息 269s")).toBeVisible();
    expect(screen.getByText("40kg")).toBeVisible();
    expect(screen.getByText("FIT")).toBeVisible();
    expect(screen.getByText("已完成容量: 400 kg")).toBeVisible();
  });
});
