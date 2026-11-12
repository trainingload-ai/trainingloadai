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

  it("exports localized screenshots, explanations and exact Demo destinations", async () => {
    const text = await renderLLMText(
      {
        url: "/zh/docs/guide/activity-timeline",
        data: {
          title: "时间线",
          getText: async () =>
            `<DocsScreenshot id="activity-timeline-full" title="全程" description="查看范围统计。" imageAlt="全程图表" demoLabel="打开示例" />`,
        },
      },
      "https://www.trainingload.ai",
    );

    expect(text).toContain("**全程**");
    expect(text).toContain("查看范围统计。");
    expect(text).toContain(
      "![全程图表](https://www.trainingload.ai/docs/activities/zh/activity-timeline-full.webp)",
    );
    expect(text).toContain(
      "[打开示例](https://demo.trainingload.ai/zh/activities/17921623926005309429)",
    );
    expect(text).not.toContain("<DocsScreenshot");
  });

  it("keeps pending captures usable without exporting nonexistent images", async () => {
    const text = await renderLLMText(
      {
        url: "/docs/guide/getting-started",
        data: {
          title: "Start",
          getText: async () =>
            `<Callout>\n\n<DocsScreenshot id="getting-started-web-home" title="Home" description="Check today." appPath="/calendar" />\n\n</Callout>`,
        },
      },
      "https://www.trainingload.ai",
    );

    expect(text).toContain("**Home**");
    expect(text).toContain("Check today.");
    expect(text).toContain("[Demo](https://demo.trainingload.ai/en/calendar)");
    expect(text).not.toContain("![");
  });

  it("preserves code examples, math and tables while resolving relative links", async () => {
    const example = '<DocsScreenshot id="example" title="Example" />';
    const text = await renderLLMText(
      {
        url: "/docs/guide/activity-timeline",
        data: {
          title: "Timeline",
          getText: async () =>
            [
              "```mdx",
              example,
              "```",
              "",
              "$x = y + 1$",
              "",
              "$$",
              "a = b^2",
              "$$",
              "",
              "| Metric | Value |",
              "| --- | --- |",
              "| HR | 150 |",
              "",
              "[Guide](activity-detail#tabs) ![Chart](/chart.webp)",
              "",
              "[Reference][ref]",
              "",
              "[ref]: /docs/metrics/ctl",
            ].join("\n"),
        },
      },
      "https://www.trainingload.ai",
    );

    expect(text).toContain(`\`\`\`mdx\n${example}\n\`\`\``);
    expect(text).toContain("$x = y + 1$");
    expect(text).toContain("$$\na = b^2\n$$");
    expect(text).toMatch(/\| HR\s+\| 150\s+\|/);
    expect(text).toContain(
      "[Guide](https://www.trainingload.ai/docs/guide/activity-detail#tabs)",
    );
    expect(text).toContain("![Chart](https://www.trainingload.ai/chart.webp)");
    expect(text).toContain(
      "[ref]: https://www.trainingload.ai/docs/metrics/ctl",
    );
  });
});
