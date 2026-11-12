import { describe, expect, it, vi } from "vitest";
import { renderLLMText } from "@/lib/llm-text";

describe("renderLLMText", () => {
  it("keeps an explicit home capture route when its ID contains workout", async () => {
    const text = await renderLLMText(
      {
        url: "/zh/docs/guide/today-and-current-state",
        data: {
          title: "今日",
          getText: async () =>
            '<DocsScreenshot id="today-workout-preview" title="预览课次" />',
        },
      },
      "https://www.trainingload.ai",
    );

    expect(text).toContain("[Demo](https://demo.trainingload.ai/zh)");
    expect(text).not.toContain("https://demo.trainingload.ai/zh/plans");
  });

  it("exports homepage task cards as readable headings, images and navigation", async () => {
    const text = await renderLLMText(
      {
        url: "/zh/docs",
        data: {
          title: "文档",
          getText: async () =>
            `<DocsTaskGrid>\n\n<DocsTaskCard preload title="验证第一条活动" description="检查来源与处理结果。" href="/zh/docs/guide/getting-started" action="开始使用" imageSrc="/docs/daily/zh/getting-started-home.webp" imageAlt="训练首页示例" />\n\n<DocsTaskCard title="连接数据" href="/zh/docs/guide/connect-data" />\n\n</DocsTaskGrid>`,
        },
      },
      "https://www.trainingload.ai",
    );

    expect(text).toContain("## 验证第一条活动");
    expect(text).toContain("检查来源与处理结果。");
    expect(text).toContain(
      "![训练首页示例](https://www.trainingload.ai/docs/daily/zh/getting-started-home.webp)",
    );
    expect(text).toContain(
      "[开始使用](https://www.trainingload.ai/zh/docs/guide/getting-started)",
    );
    expect(text).toContain(
      "[连接数据](https://www.trainingload.ai/zh/docs/guide/connect-data)",
    );
    expect(text).not.toContain("<DocsTask");
  });

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

  it("keeps captures without an asset usable through their Demo link", async () => {
    const text = await renderLLMText(
      {
        url: "/docs/guide/getting-started",
        data: {
          title: "Start",
          getText: async () =>
            `<Callout>\n\n<DocsScreenshot id="unavailable-test-capture" title="Home" description="Check today." appPath="/calendar" />\n\n</Callout>`,
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
