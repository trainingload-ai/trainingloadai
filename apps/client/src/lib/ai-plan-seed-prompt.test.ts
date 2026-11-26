import { describe, expect, it } from "vitest";

import {
  aiPlanSeedDedupeKey,
  buildAiPlanSeedUserText,
  parseAiPlanSeedFromSearchParams,
  stripAiPlanSeedParams,
} from "./ai-plan-seed-prompt";
import { draftToCreatePlanDto } from "./coach-plan-draft";
import { safeParseCoachPlanDraftData } from "@shared/ai-coach-schema";

describe("buildAiPlanSeedUserText", () => {
  it("shows the plan brief below the plan request", () => {
    expect(
      buildAiPlanSeedUserText("zh", {
        title: "计划简报",
        lines: [
          "项目：跑步",
          "目的：比赛备战",
          "周期：12 周 · 每周 5 天 · 单次 70 分钟",
        ],
      }),
    ).toBe(
      [
        "请根据这份计划条件生成训练计划。",
        "",
        "计划简报",
        "- 项目：跑步",
        "- 目的：比赛备战",
        "- 周期：12 周 · 每周 5 天 · 单次 70 分钟",
      ].join("\n"),
    );
  });

  it("keeps the short request when no visible brief is supplied", () => {
    expect(buildAiPlanSeedUserText("en")).toBe(
      "Please generate a training plan from this plan brief.",
    );
  });
});

it("keeps the continuous brief distinct from a fixed plan and clears the entry params", () => {
  const params = new URLSearchParams("planMode=rolling&planIntent=fitnessBuild&sports=run&days=5&mins=70");
  const continuous = parseAiPlanSeedFromSearchParams(params);
  expect(continuous).toMatchObject({ planningMode: "ROLLING", cycleWeeks: null, weeklyDays: 5, dailyMinutes: 70 });
  const fixed = parseAiPlanSeedFromSearchParams(new URLSearchParams("planIntent=fitnessBuild&sports=run&weeks=1&days=5&mins=70"));
  expect(aiPlanSeedDedupeKey(continuous!)).not.toEqual(aiPlanSeedDedupeKey(fixed!));
  stripAiPlanSeedParams(params);
  expect(params.toString()).toBe("");
});

it("saves the starter workouts on an open-ended plan", () => {
  const draft = safeParseCoachPlanDraftData({
    title: "Aerobic base",
    goal: "Build a consistent running routine",
    planningMode: "ROLLING",
    periodWeeks: 1,
    workouts: [{ weekIndex: 1, dayIndex: 1, sportType: "RUN", text: "- 30m Z2" }],
  });
  expect(draft).not.toBeNull();
  expect(draftToCreatePlanDto(draft!)).toMatchObject({
    planningMode: "ROLLING",
    periodWeeks: null,
    goal: "Build a consistent running routine",
    workouts: [{ weekIndex: 1, dayIndex: 1 }],
  });
});
