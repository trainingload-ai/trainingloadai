import { expect, test } from "@playwright/test";
import { openCoachFixture } from "./fixtures/coach-page";
import { pmcFixture } from "./fixtures/pmc-projection";
import type {
  PmcProjectionScenario,
  PmcProjectionScope,
} from "../../../packages/shared/pmc-projection";

for (const state of [
  "ready",
  "habits",
  "pause",
  "partial",
  "cold",
  "missing",
  "empty",
  "network",
  "cached",
] as const) {
  test(`PMC ${state}: simplified layout and honest data states`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    const posts: string[] = [];
    let fail = state === "network";
    const scenario =
      state === "habits" ? "HABIT" : state === "pause" ? "REST" : "AUTO";
    const fixtureState =
      state === "partial" ||
      state === "cold" ||
      state === "missing" ||
      state === "empty"
        ? state
        : "ready";
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/pmc/"))
        posts.push(request.url());
    });
    await page.clock.install({ time: new Date("2026-11-11T04:00:00Z") });
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await openCoachFixture(page, undefined, { empty: true, navigate: false });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith("/pmc/projection")) return route.fallback();
      if (fail) return route.abort("failed");
      return route.fulfill({
        json: {
          data: pmcFixture(
            url.searchParams.get("scope") as PmcProjectionScope,
            url.searchParams.get("scenario") as PmcProjectionScenario,
            Number(url.searchParams.get("historyDays")),
            fixtureState,
          ),
        },
      });
    });
    await page.goto(`/zh/pmc?scenario=${scenario}`);
    const capture = async (name: string) => {
      await page.screenshot({
        path: testInfo.outputPath(`${name}-page.png`),
        animations: "disabled",
        scale: "css",
      });
      if (await page.getByTestId("pmc-outlook-summary").count())
        await page.getByTestId("pmc-outlook-summary").screenshot({
          path: testInfo.outputPath(`${name}-summary.png`),
          animations: "disabled",
          scale: "css",
        });
    };
    if (state === "network") {
      await expect(page.getByTestId("pmc-initial-error")).toBeVisible();
      await capture("initial-network-error");
      fail = false;
      await page.getByRole("button", { name: "重试", exact: true }).click();
    }
    const current = page.getByTestId("pmc-current-ctl");
    await expect(current).toBeVisible();
    if (state === "missing" || state === "empty")
      await expect(current).toHaveText("—");
    else await expect(current).not.toHaveText("—");
    const originalCurrent = await current.innerText();
    await expect(page.locator("canvas")).toHaveCount(state === "empty" ? 0 : 2);
    await expect(
      page.getByRole("combobox", { name: "历史范围", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "推演方式", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "刷新", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByTestId("pmc-future-ctl")).toHaveCount(0);
    await expect(page.getByTestId("pmc-selected-day")).toHaveCount(0);
    await expect(page.getByTestId("pmc-weekly-details")).toHaveCount(0);
    await expect(page.getByTestId("pmc-evidence-details")).toHaveCount(0);
    await expect(page.getByTestId("pmc-chart-tooltip")).toHaveCount(0);
    await expect(page.getByTestId("pmc-projection-page")).not.toContainText(
      "推演",
    );
    const scope = page.getByRole("combobox", { name: "运动范围", exact: true });
    const coach = page.getByRole("link", { name: "问教练", exact: true });
    const scopeBox = (await scope.boundingBox())!,
      coachBox = (await coach.boundingBox())!;
    expect(scopeBox.x).toBeLessThan(coachBox.x);
    expect(Math.abs(scopeBox.y - coachBox.y)).toBeLessThan(8);
    await capture(state);
    if (state !== "empty")
      await page.getByTestId("pmc-projection-chart").screenshot({
        path: testInfo.outputPath(`${state}-chart.png`),
        animations: "disabled",
        scale: "css",
      });
    if (state === "ready") {
      const chart = page.getByTestId("pmc-projection-chart");
      await expect(chart).toHaveAttribute("data-metric", "tsb");
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await capture("dark");
      await page.getByTestId("pmc-projection-chart").screenshot({
        path: testInfo.outputPath("dark-chart.png"),
        animations: "disabled",
        scale: "css",
      });
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark"),
      );
      for (const [name, metric] of [
        ["体能", "ctl"],
        ["疲劳", "atl"],
        ["状态", "tsb"],
      ] as const) {
        await page
          .getByTestId("pmc-metric-switch")
          .getByText(name, { exact: true })
          .click();
        await expect(chart).toHaveAttribute("data-metric", metric);
        await chart.screenshot({
          path: testInfo.outputPath(`${metric}-chart.png`),
          animations: "disabled",
          scale: "css",
        });
      }
      const graph = page.getByRole("group", { name: /可用左右方向键/ });
      if (testInfo.project.name === "mobile") {
        const plot = page.locator(".u-over").first();
        const box = (await plot.boundingBox())!;
        await plot.tap({ position: { x: box.width * 0.8, y: 45 } });
        await expect(page.getByTestId("pmc-chart-tooltip")).toBeVisible();
        await chart.screenshot({
          path: testInfo.outputPath("touch-tooltip.png"),
          animations: "disabled",
          scale: "css",
        });
      }
      await graph.focus();
      const selected = await page.getByTestId("pmc-chart-tooltip").innerText();
      await graph.press("ArrowLeft");
      await expect(page.getByTestId("pmc-chart-tooltip")).not.toHaveText(
        selected,
      );
      await page.getByTestId("pmc-projection-chart").screenshot({
        path: testInfo.outputPath("keyboard-tooltip.png"),
        animations: "disabled",
        scale: "css",
      });
      await graph.press("Escape");
      await expect(page.getByTestId("pmc-chart-tooltip")).toHaveCount(0);
      await scope.click();
      await page.getByRole("option", { name: "跑步", exact: true }).click();
      await expect(current).not.toHaveText(originalCurrent);
      await capture("running-scope");
    }
    if (state === "cached") {
      fail = true;
      await page.clock.fastForward(65_000);
      await expect(page.getByTestId("pmc-update-status")).toContainText(
        "更新失败",
      );
      await expect(page.getByTestId("pmc-projection-error")).toHaveCount(0);
      await expect(current).toHaveText(originalCurrent);
      await capture("cached-refresh-error");
    }
    if (state === "empty")
      await expect(
        page.getByText(
          "尚无已记录的训练负荷，连接设备或导入活动后可查看历史。",
          { exact: true },
        ),
      ).toBeVisible();
    if (state === "partial" || state === "cold" || state === "missing") {
      const graph = page.getByRole("group", { name: /可用左右方向键/ });
      await graph.focus();
      for (let i = 0; i < 4; i++) await graph.press("ArrowRight");
      await expect(page.getByTestId("pmc-chart-tooltip")).toContainText(
        "暂无预测",
      );
      await page.getByTestId("pmc-projection-chart").screenshot({
        path: testInfo.outputPath(`${state}-tooltip.png`),
        animations: "disabled",
        scale: "css",
      });
      await graph.press("Escape");
    }
    await coach.click();
    const finalScope = state === "ready" ? "跑步" : "全部运动";
    const scenarioText =
      scenario === "REST"
        ? "暂停训练"
        : scenario === "HABIT"
          ? "近期习惯"
          : "计划优先";
    await expect(page.getByRole("textbox")).toHaveValue(
      `帮我解读${finalScope}的当前训练负荷、历史变化，以及按“${scenarioText}”预测的未来四周走势，并结合近期训练和恢复给出建议。`,
    );
    expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(
      0,
    );
    if (state === "ready") {
      await page.getByRole("button", { name: "发送", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
        .toBe(1);
      const body = await page.evaluate(
        () => window.coachStreamFixture.lastBody,
      );
      expect(JSON.stringify(body)).toContain("client:pmc_projection_context");
      expect(JSON.stringify(body)).toContain("expectedProjectionId");
      await page.evaluate(() => window.coachStreamFixture.finish(null));
    }
    expect(posts).toEqual([]);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
  });
}
