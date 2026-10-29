import { describe, expect, it, vi } from "vitest";
import { renderLLMText } from "@/lib/llm-text";

describe("renderLLMText", () => {
  it("includes processed documentation content without duplicating its H1", async () => {
    const getText = vi.fn(async () =>
      [
        "# Create a Training Plan",
        "",
        "Trainingload.ai supports three plan creation paths.",
        "",
        "## Official templates",
        "",
        "Use a reviewed template when it matches the athlete.",
      ].join("\n"),
    );

    const text = await renderLLMText(
      {
        url: "/docs/guide/create-training-plan",
        data: {
          title: "Create a Training Plan",
          description: "Create and review a structured training plan.",
          getText,
        },
      },
      "https://www.trainingload.ai/",
    );

    expect(getText).toHaveBeenCalledWith("processed");
    expect(text.match(/^# Create a Training Plan$/gm)).toHaveLength(1);
    expect(text).toContain(
      "Trainingload.ai supports three plan creation paths",
    );
    expect(text).toContain("## Official templates");
    expect(text).toContain(
      "Canonical URL: https://www.trainingload.ai/docs/guide/create-training-plan",
    );
  });
});
