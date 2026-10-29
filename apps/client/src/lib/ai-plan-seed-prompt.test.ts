import { describe, expect, it } from "vitest";

import { buildAiPlanSeedUserText } from "./ai-plan-seed-prompt";

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
