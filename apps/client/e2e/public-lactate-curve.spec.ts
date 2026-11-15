import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const hydrationErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page, context, baseURL }) => {
  const errors: string[] = [];
  hydrationErrors.set(page, errors);
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydrat|server rendered/i.test(message.text())
    )
      errors.push(message.text());
  });
  await context.addCookies([
    { name: "tl-locale-suggestion-dismissed", value: "2", url: baseURL! },
  ]);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "doNotTrack", {
      configurable: true,
      get: () => "1",
    });
    const calls: unknown[][] = [];
    Object.defineProperty(window, "gtag", {
      configurable: true,
      get:
        () =>
        (...args: unknown[]) =>
          calls.push(args),
      set() {},
    });
    Object.assign(window, {
      lactateAnalyticsCalls: calls,
      lactatePrintCalls: 0,
    });
    window.print = () => {
      (window as unknown as { lactatePrintCalls: number }).lactatePrintCalls++;
    };
  });
  page.on("dialog", (dialog) => dialog.accept());
});

test.afterEach(async ({ page }) => {
  expect(hydrationErrors.get(page)).toEqual([]);
});

test("analyzes, invalidates stale results, exports and prints without uploading input", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const sent: string[] = [];
  page.on("request", (request) =>
    sent.push(`${request.url()} ${request.postData() ?? ""}`),
  );
  await page.goto("/lactate-curve-calculator");
  await expect(
    page.getByRole("heading", {
      name: "Lactate Curve Calculator",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await page.getByTestId("lactate-analyze").dblclick();
  await expect(
    page.getByRole("heading", { name: "Three intensity zones" }),
  ).toBeVisible();
  await expect(page.locator(".recharts-scatter-symbol").first()).toBeVisible();
  const starts = await page.evaluate(
    () =>
      (
        window as unknown as { lactateAnalyticsCalls: unknown[][] }
      ).lactateAnalyticsCalls.filter((row) => row[1] === "tool_start").length,
  );
  expect(starts).toBe(1);
  await page
    .getByRole("button", { name: "Edit test data", exact: false })
    .click();
  await page
    .getByLabel("Stage 2 Lactate", { exact: true })
    .fill("1.23456789123");
  await expect(
    page.getByText("Your inputs have changed.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download results CSV" }),
  ).toHaveCount(0);
  await page.getByTestId("lactate-analyze").click();
  await expect(
    page.getByRole("button", { name: "Download results CSV" }),
  ).toBeEnabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download results CSV" }).click();
  const path = await (await download).path();
  const csv = await readFile(path!, "utf8");
  expect(csv).toContain("1.23456789123");
  expect(csv).toContain(
    "reference_commit,2cd3709f6442447b3b9128e325f13fa38570eb17",
  );
  await page.getByRole("button", { name: "Print report", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { lactatePrintCalls: number }).lactatePrintCalls,
    ),
  ).toBe(1);
  expect(sent.join("\n")).not.toContain("1.23456789123");
  const telemetry = await page.evaluate(() =>
    JSON.stringify(
      (window as unknown as { lactateAnalyticsCalls: unknown[][] })
        .lactateAnalyticsCalls,
    ),
  );
  expect(telemetry).not.toContain("1.23456789123");
  expect(telemetry).toContain("example_edited");
  expect(new URL(page.url()).search).toBe("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("lactate-result.png"),
    fullPage: true,
  });
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByText("Lactate test report", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("lactate-print.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("imports CSV through column mapping and supports keyboard input", async ({
  page,
}) => {
  await page.goto("/lactate-curve-calculator");
  await page.locator("input[type=file]").setInputFiles({
    name: "private-recording.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "power,lactate,HR\n100,1,110\n125,1.1,120\n150,1.3,130\n175,1.8,140\n200,2.6,150\n225,4.2,160\n250,6.8,170",
    ),
  });
  await expect(
    page.getByRole("heading", { name: "Check columns and units", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use these columns" }).click();
  await page.getByLabel("Stage 1 Intensity", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByLabel("Stage 1 Lactate", { exact: true }),
  ).toBeFocused();
  await page.getByTestId("lactate-analyze").click();
  await expect(
    page.getByRole("heading", { name: "Three intensity zones" }),
  ).toBeVisible();
  const telemetry = await page.evaluate(() =>
    JSON.stringify(
      (window as unknown as { lactateAnalyticsCalls: unknown[][] })
        .lactateAnalyticsCalls,
    ),
  );
  expect(telemetry).toContain("user");
  expect(telemetry).not.toContain("private-recording.csv");
});

test("keeps validation, normal no-result and partial-result outcomes separate", async ({
  page,
}) => {
  await page.goto("/lactate-curve-calculator");
  await page.getByTestId("lactate-analyze").click();
  await expect(page.locator("[data-slot=alert]")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "broken.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("power,lactate\n100,1\n125"),
  });
  await expect(page.locator("[data-slot=alert]")).toBeVisible();
  async function importData(text: string) {
    const edit = page.getByRole("button", {
      name: "Edit test data",
      exact: false,
    });
    if (await edit.isVisible()) await edit.click();
    await page.locator("input[type=file]").setInputFiles({
      name: "synthetic.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(text),
    });
    await page.getByRole("button", { name: "Use these columns" }).click();
    await page.getByTestId("lactate-analyze").click();
  }
  await importData("power,lactate\n100,1\n125,1\n150,1\n175,1");
  await expect(
    page.getByText("No applicable threshold was found.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Three intensity zones" }),
  ).toHaveCount(0);
  await importData("power,lactate\n100,1\n150,1.4\n200,2.5\n250,6");
  await expect(
    page.getByText("Some methods could not find a threshold.", {
      exact: false,
    }),
  ).toBeVisible();
  const names = await page.evaluate(() =>
    (
      window as unknown as { lactateAnalyticsCalls: unknown[][] }
    ).lactateAnalyticsCalls.map((row) => row[1]),
  );
  expect(names.filter((name) => name === "tool_start")).toHaveLength(2);
  expect(names.filter((name) => name === "tool_no_result")).toHaveLength(1);
  expect(names.filter((name) => name === "tool_success")).toHaveLength(1);
  expect(names.filter((name) => name === "tool_input_rejected")).toHaveLength(
    2,
  );
  expect(names.filter((name) => name === "tool_error")).toHaveLength(0);
});

test("explains methods and renders the Chinese report and fit diagnostics", async ({
  page,
  browserName,
}, info) => {
  await page.goto("/zh/lactate-curve-calculator");
  await page
    .getByRole("button", { name: "加载示例", exact: true })
    .first()
    .click();
  await page.getByTestId("lactate-analyze").click();
  await expect(page.getByText("阈值方法比较", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Log-log", exact: true }).click();
  await expect(
    page.getByText("Log-log 视图 · 两条坐标轴均为对数刻度", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Log-Poly-ModDmax LT2/ }).click();
  await page.keyboard.press("Escape");
  await page.getByText("拟合诊断", { exact: true }).click();
  await expect(page.getByRole("img", { name: "逐阶段残差" })).toBeVisible();
  await page
    .getByRole("heading", { name: "乳酸测试报告", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("lactate-zh-viewport.png") });
  await page
    .locator("[data-lactate-tool]")
    .screenshot({ path: info.outputPath("lactate-zh-report.png") });
  await page
    .locator('section[aria-label="Trainingload.ai"]:visible')
    .screenshot({
      path: info.outputPath("lactate-product-bridge.png"),
      style: "header { visibility: hidden !important; }",
    });
  await page.emulateMedia({ media: "print" });
  if (browserName === "chromium")
    await page.pdf({
      path: info.outputPath("lactate-report.pdf"),
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
});

test("inspects the full example chart with pointer, touch and keyboard without starting an analysis", async ({
  page,
}, info) => {
  await page.goto("/zh/lactate-curve-calculator");
  const points = page.locator(
    '[data-testid="lactate-stage-point"][data-series="lactate"]',
  );
  await expect(points).toHaveCount(8);
  const figure = page.getByRole("figure", { name: "乳酸曲线", exact: true });
  const hint = figure.getByText("悬停、点选或键盘聚焦样本，查看阶段数据", {
    exact: true,
  });
  const action = page
    .getByRole("button", { name: "加载示例 →", exact: true })
    .locator("..");
  const [plotBox, legendBox, hintBox, figureBox, actionBox] = await Promise.all(
    [
      figure.locator(".recharts-responsive-container").last().boundingBox(),
      figure.locator("figcaption").boundingBox(),
      hint.boundingBox(),
      figure.boundingBox(),
      action.boundingBox(),
    ],
  );
  expect(legendBox!.y).toBeGreaterThanOrEqual(
    plotBox!.y + plotBox!.height - 0.5,
  );
  expect(hintBox!.y).toBeGreaterThanOrEqual(
    legendBox!.y + legendBox!.height - 0.5,
  );
  expect(figureBox!.y + figureBox!.height).toBeGreaterThanOrEqual(
    hintBox!.y + hintBox!.height - 0.5,
  );
  expect(actionBox!.y).toBeGreaterThanOrEqual(hintBox!.y + hintBox!.height + 8);
  await figure.locator("..").screenshot({
    path: info.outputPath("lactate-example-layout.png"),
    style: "header { visibility: hidden !important; }",
  });
  await page
    .getByRole("region", { name: "测试数据", exact: true })
    .getByRole("table")
    .screenshot({
      path: info.outputPath("lactate-input-table.png"),
      style: "header { visibility: hidden !important; }",
    });
  await points.nth(4).hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("2.40");
  await expect(tooltip).toContainText("145");
  await expect(tooltip).toContainText("拟合乳酸");
  await points.nth(4).focus();
  await expect(points.nth(4)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(points.nth(5)).toBeFocused();
  await expect(tooltip).toContainText("3.50");
  await expect(tooltip).toContainText("156");
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await expect(points.nth(5)).toBeFocused();
  await points.nth(4).click();
  await expect(tooltip).toContainText("2.40");
  const viewport = page.viewportSize()!;
  const plot = figure.locator(".recharts-responsive-container").first();
  const crosshair = figure.getByTestId("lactate-crosshair");
  const plotWidth = (await plot.boundingBox())!.width;
  const crosshairRatio =
    ((await crosshair.evaluate((node) => parseFloat(node.style.left))) - 46) /
    (plotWidth - 64);
  await page.setViewportSize({
    ...viewport,
    width: viewport.width > 600 ? 1100 : 360,
  });
  await expect
    .poll(async () => (await plot.boundingBox())!.width)
    .toBeLessThan(plotWidth - 10);
  await expect
    .poll(async () => {
      const width = (await plot.boundingBox())!.width;
      const left = await crosshair.evaluate((node) => parseFloat(node.style.left));
      return Math.abs(left - (46 + crosshairRatio * (width - 64)));
    })
    .toBeLessThan(1);
  await expect(tooltip).toContainText("2.40");
  await points.nth(4).focus();
  await page.keyboard.press("ArrowRight");
  await expect(points.nth(5)).toBeFocused();
  await expect(tooltip).toContainText("3.50");
  await page.setViewportSize(viewport);
  const names = await page.evaluate(() =>
    (
      window as unknown as { lactateAnalyticsCalls: unknown[][] }
    ).lactateAnalyticsCalls.map((row) => row[1]),
  );
  expect(names).not.toContain("tool_start");
  expect(names).not.toContain("tool_success");
  await page.screenshot({
    path: info.outputPath("lactate-example-tooltip.png"),
  });
});

test("renders each indexed language and the measured-data metadata", async ({
  page,
}) => {
  for (const [prefix, title] of [
    ["", "Lactate Curve Calculator"],
    ["/zh", "乳酸曲线分析工具"],
    ["/zh-hant", "乳酸曲線分析工具"],
    ["/ja", "乳酸カーブ計算ツール"],
  ]) {
    await page.goto(`${prefix}/lactate-curve-calculator`);
    await expect(page.locator("h1")).toHaveText(title!);
    await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
      "href",
      `https://www.trainingload.ai${prefix}/lactate-curve-calculator`,
    );
    expect(
      await page
        .locator('script[type="application/ld+json"]')
        .allTextContents(),
    ).not.toHaveLength(0);
    const methods = page.locator("#methods");
    await expect(methods.locator("article")).toHaveCount(8);
    for (const card of await methods.locator("article").all()) {
      await expect(card.locator("dl > div")).toHaveCount(2);
      await expect(card.locator("a").first()).toHaveAttribute(
        "target",
        "_blank",
      );
    }
    const bibliography = methods.locator("details");
    await bibliography.locator("summary").click();
    await expect(bibliography.locator("ol > li")).toHaveCount(9);
    await expect(methods).not.toContainText(/\{[a-z]+\}/);
    if (prefix === "/zh") {
      await methods.screenshot({
        path: test.info().outputPath("lactate-method-sources.png"),
        style: "header { visibility: hidden !important; }",
      });
      const recording = page
        .locator("details")
        .filter({ has: page.locator("table caption.sr-only") });
      await recording.locator("summary").click();
      const caption = recording.locator("caption");
      await expect(recording.getByRole("table")).toHaveAccessibleName(
        (await caption.textContent()) ?? "",
      );
      expect(
        await caption.evaluate(
          (element) => element.getBoundingClientRect().height,
        ),
      ).toBeLessThanOrEqual(1);
      await recording.screenshot({
        path: test.info().outputPath("lactate-example-recording.png"),
        style: "header { visibility: hidden !important; }",
      });
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
