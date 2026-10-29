import { describe, expect, it } from "vitest";
import {
  getLocalizedActivityTitle,
  getLocalizedDemoWorkoutNote,
  type ActivityTitleTranslator,
} from "./activity-title";

const messages: Record<string, string> = {
  untitled: "未命名活动",
  "periods.morning": "上午{sport}",
  "periods.noon": "中午{sport}",
  "periods.afternoon": "下午{sport}",
  "periods.evening": "晚间{sport}",
  "periods.night": "夜间{sport}",
  "sports.run": "跑步",
  "sports.ride": "骑行",
  "sports.swim": "游泳",
  "sports.workout": "训练",
  "demo.base.recoveryRun": "恢复跑",
  "demo.base.goalRace10K": "10 公里目标赛",
  "demo.detail.minutes": "{value} 分钟",
  "demo.detail.kilometers": "{value} 公里",
  "demo.detail.shortened": "缩短完成",
  "demo.note.skippedRecovery": "演示情境：恢复指标不佳，因此跳过本次训练。",
};

const translate: ActivityTitleTranslator = (key, values) =>
  messages[key]
    .replace("{sport}", String(values?.sport ?? ""))
    .replace("{value}", String(values?.value ?? ""));

describe("getLocalizedActivityTitle", () => {
  it.each([
    ["Morning Run", "上午跑步"],
    ["Noon Workout", "中午训练"],
    ["Afternoon Ride", "下午骑行"],
    ["Evening Swim", "晚间游泳"],
    ["Night Run", "夜间跑步"],
  ])("localizes the generated title %s", (title, expected) => {
    expect(getLocalizedActivityTitle({ title }, translate)).toBe(expected);
  });

  it("uses the current sport when a generated title is stale", () => {
    expect(
      getLocalizedActivityTitle(
        { activityName: "Morning Run", sportType: "CYCLING" },
        translate,
      ),
    ).toBe("上午骑行");
  });

  it("recomputes a generated title from the activity timezone", () => {
    expect(
      getLocalizedActivityTitle(
        {
          activityName: "Morning Run",
          sportType: "RUN",
          startTime: "2026-09-24T07:54:02.000Z",
          timezone: "Asia/Shanghai",
        },
        translate,
      ),
    ).toBe("下午跑步");
  });

  it("keeps the stored period when activity timing is incomplete", () => {
    expect(
      getLocalizedActivityTitle(
        {
          activityName: "Morning Run",
          sportType: "RUN",
          startTime: "2026-09-24T07:54:02.000Z",
          timezone: null,
        },
        translate,
      ),
    ).toBe("上午跑步");
  });

  it.each(["Morning Run with Alex", "上午跑步"])(
    "preserves the custom title %s",
    (activityName) => {
      expect(getLocalizedActivityTitle({ activityName }, translate)).toBe(
        activityName,
      );
    },
  );

  it("falls back for empty and legacy UNKNOWN titles", () => {
    expect(getLocalizedActivityTitle({ activityName: "  " }, translate)).toBe(
      "未命名活动",
    );
    expect(
      getLocalizedActivityTitle({ activityName: "UNKNOWN" }, translate, "活动"),
    ).toBe("活动");
  });

  it.each([
    ["Recovery Run", "恢复跑"],
    ["Recovery Run · 30 min", "恢复跑 · 30 分钟"],
    ["Recovery Run · Shortened", "恢复跑 · 缩短完成"],
    ["10K Goal Race · 10.08 km", "10 公里目标赛 · 10.08 公里"],
  ])("localizes a public Demo title %s", (title, expected) => {
    expect(getLocalizedActivityTitle({ title }, translate)).toBe(expected);
  });

  it("localizes an exact public Demo workout note", () => {
    expect(
      getLocalizedDemoWorkoutNote(
        "Demo scenario: skipped because recovery indicators were poor.",
        translate,
      ),
    ).toBe("演示情境：恢复指标不佳，因此跳过本次训练。");
  });

  it("preserves a user-authored workout note", () => {
    expect(getLocalizedDemoWorkoutNote("Listen to your body.", translate)).toBe(
      "Listen to your body.",
    );
  });
});
