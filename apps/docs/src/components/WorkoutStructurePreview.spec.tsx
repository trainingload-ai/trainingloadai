import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  getPlanTemplateVariant,
  getRunPlanTemplate,
} from "@shared/plan-templates";

import { WorkoutStructurePreview } from "./WorkoutStructurePreview";

describe("WorkoutStructurePreview", () => {
  it("renders parsed ENDURANCE IR as a localized chart instead of translated DSL", () => {
    const workout = getPlanTemplateVariant(
      getRunPlanTemplate("improve-10k")!,
    )!.workouts.find((item) => item.sourceDsl.includes("repeat"))!;
    if (workout.definition.source !== "STRUCTURE") {
      throw new Error("Expected the frozen workout to use structured IR");
    }

    const html = renderToStaticMarkup(
      <WorkoutStructurePreview
        structure={workout.definition.structure}
        lang="zh"
      />,
    );

    expect(html).toContain("训练结构图");
    expect(html).toContain("热身");
    expect(html).toContain("主训练");
    expect(html).toContain("恢复");
    expect(html).toContain("放松");
    expect(html).toContain("×");
    expect(html).not.toMatch(/warmup|work|recovery|cooldown/i);
    expect(workout.sourceDsl).toMatch(
      /warmup.*repeat.*work.*recovery.*cooldown/s,
    );
  });
});
