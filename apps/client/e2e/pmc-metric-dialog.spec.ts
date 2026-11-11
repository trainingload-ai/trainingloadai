import { expect, test } from "@playwright/test";
import { openCoachFixture } from "./fixtures/coach-page";
import { pmcFixture } from "./fixtures/pmc-projection";

for (const [metric, state] of [
  ["atl", "ready"],
  ["ctl", "ready"],
  ["tsb", "ready"],
  ["atl", "partial"],
  ["ctl", "cold"],
  ["tsb", "missing"],
  ["atl", "network"],
  ["ctl", "empty"],
] as const) {
  test(`PMC dialog ${metric} ${state}`, async ({ page }, testInfo) => {
    const errors: string[] = [],
      writes: string[] = [];
    let reads = 0,
      fail = state === "network";
    const fixture = pmcFixture(
      "ALL",
      "AUTO",
      60,
      state === "network" ? "ready" : state,
      30,
    );
    const title =
      metric === "atl"
        ? "疲劳（ATL）"
        : metric === "ctl"
          ? "体能（CTL）"
          : "状态（TSB）";
    await page.clock.install({ time: new Date("2026-11-11T04:00:00Z") });
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await openCoachFixture(page, undefined, { navigate: false });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/pmc/"))
        writes.push(request.url());
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname.replace(/^\/api\/proxy/, "");
      const json = (data: unknown) => route.fulfill({ json: { data } });
      if (path === "/users/settings")
        return json({
          FITNESS_STATUS_LAYOUT: JSON.stringify([
            { key: "atl", span: 1 },
            { key: "ctl", span: 1 },
            { key: "tsb", span: 1 },
          ]),
        });
      if (path === "/pmc/status")
        return json({
          ctl: 51,
          atl: 48.8,
          tsb: 2.2,
          acRatio: 1,
          monotony: 0.5,
          intensity: 500,
          restDays: 1,
        });
      if (path === "/pmc/extremes")
        return json({ model: "fixture", ctl: 70, atl: 85 });
      if (path === "/charts/summary/week-pair") return json({});
      if (path === "/pmc/projection") {
        reads++;
        expect(url.searchParams.get("scope")).toBe("ALL");
        expect(url.searchParams.get("scenario")).toBe("AUTO");
        expect(url.searchParams.get("forecastDays")).toBe("30");
        if (fail) return route.abort("failed");
        return json(fixture);
      }
      return route.fallback();
    });
    await page.goto("/zh/dashboard");
    const card = page.getByText(title, { exact: true }).first();
    await expect(card).toBeVisible();
    expect(reads).toBe(0);
    await card.click();
    const panel = page.getByTestId(`pmc-metric-panel-${metric}`);
    await expect(panel).toBeVisible();
    if (state === "network") {
      await expect(
        panel.getByRole("button", { name: "重试", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`${metric}-network-error.png`),
        animations: "disabled",
        scale: "css",
      });
      fail = false;
      await panel.getByRole("button", { name: "重试", exact: true }).click();
    }
    if (state === "empty")
      await expect(panel).toContainText("尚无已记录的训练负荷");
    else {
      const chart = panel.getByTestId("pmc-projection-chart");
      await expect(chart).toHaveAttribute("data-metric", metric);
      await expect(panel.locator("canvas")).toHaveCount(1);
      await expect(panel.getByText("预测", { exact: true })).toBeVisible();
      await expect(panel.getByTestId("pmc-metric-switch")).toHaveCount(0);
      await expect(chart.getByText(title, { exact: true })).toHaveCount(0);
      for (const [tab, end] of [
        ["7天", "2026-11-18"],
        ["14天", "2026-11-25"],
        ["30天", "2026-12-11"],
        ["60天", "2026-12-11"],
      ]) {
        await panel.getByRole("tab", { name: tab, exact: true }).click();
        await expect(chart).toHaveAttribute("data-forecast-end", end);
      }
      await panel.getByRole("tab", { name: "30天", exact: true }).click();
      await expect(
        panel.getByRole("tab", { name: "30天", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(panel.getByTestId("pmc-dialog-current")).toHaveText(
        fixture.current?.[metric] == null
          ? "—"
          : new Intl.NumberFormat("zh", { maximumFractionDigits: 2 }).format(
              fixture.current[metric]!,
            ),
      );
      await expect(panel.getByTestId("pmc-dialog-current")).toBeInViewport();
      await page.screenshot({
        path: testInfo.outputPath(`${metric}-${state}-dialog.png`),
        animations: "disabled",
        scale: "css",
      });
      await panel.screenshot({
        path: testInfo.outputPath(`${metric}-${state}-panel.png`),
        animations: "disabled",
        scale: "css",
      });
      if (state === "ready") {
        await page.evaluate(() =>
          document.documentElement.classList.add("dark"),
        );
        await page.screenshot({
          path: testInfo.outputPath(`${metric}-dark-dialog.png`),
          animations: "disabled",
          scale: "css",
        });
        await panel.screenshot({
          path: testInfo.outputPath(`${metric}-dark-panel.png`),
          animations: "disabled",
          scale: "css",
        });
      }
      if (state === "partial" || state === "cold" || state === "missing") {
        const graph = panel.getByRole("group", { name: /可用左右方向键/ });
        await graph.focus();
        for (let i = 0; i < 4; i++) await graph.press("ArrowRight");
        await expect(panel.getByTestId("pmc-chart-tooltip")).toContainText(
          "暂无预测",
        );
      }
    }
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
  });
}
