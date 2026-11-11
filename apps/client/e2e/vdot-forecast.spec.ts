import { test, expect } from "@playwright/test";
import { openCoachFixture } from "./fixtures/coach-page";

for (const scenario of [
  { direction: "up", step: 0.275, value: "44.1", label: "预计高于当前" },
  { direction: "down", step: -0.275, value: "41.9", label: "预计低于当前" },
  { direction: "unavailable", step: 0, value: "", label: "" },
]) {
  test(`home VO2max ${scenario.direction} card and detail share the four-week value`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-11-11T03:00:00Z"));
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await openCoachFixture(page, undefined, { navigate: false, empty: true });
    const status = {
      ctl: 52,
      atl: 44,
      tsb: 8,
      acRatio: 0.85,
      monotony: 0.7,
      intensity: 0.7,
      restDays: 1,
      vo2Max: 43,
    };
    const history = Array.from({ length: 12 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 8, 1 + index * 6)).toISOString(),
      value: 41.5 + index * 0.14,
    }));
    const forecast = {
      forecastId: "visual-fixture",
      status:
        scenario.direction === "unavailable" ? "INSUFFICIENT_HISTORY" : "READY",
      cutoffDate: "2026-11-10",
      asOf: "2026-11-11T03:00:00Z",
      timezone: "Asia/Shanghai",
      source: "FACTOR",
      modelVersion: "fixture",
      lastObservationAt: "2026-11-10",
      history: [],
      estimatedCurrentLevel: 43,
      forecasts:
        scenario.direction === "unavailable"
          ? []
          : Array.from({ length: 4 }, (_, index) => ({
              week: index + 1,
              startDate: new Date(Date.UTC(2026, 10, 11 + index * 7))
                .toISOString()
                .slice(0, 10),
              endDate: new Date(Date.UTC(2026, 10, 17 + index * 7))
                .toISOString()
                .slice(0, 10),
              point: 43 + (index + 1) * scenario.step,
              lower80:
                43 + (index + 1) * scenario.step - (0.9 + (index + 1) * 0.2),
              upper80:
                43 + (index + 1) * scenario.step + (0.9 + (index + 1) * 0.2),
            })),
    };
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/^\/api\/proxy/, "");
      if (path === "/pmc/vdot-forecast")
        return route.fulfill({ json: { data: forecast } });
      if (path === "/pmc/status")
        return route.fulfill({ json: { data: status } });
      if (path === "/pmc/extremes")
        return route.fulfill({
          json: { data: { model: "default", ctl: 72, atl: 76 } },
        });
      if (
        path === "/pmc/vo2max-activity-history" ||
        path === "/pmc/vo2max-history"
      )
        return route.fulfill({
          json: {
            data: history.filter(
              (row) =>
                (!url.searchParams.get("startDate") ||
                  row.date >= url.searchParams.get("startDate")!) &&
                (!url.searchParams.get("endDate") ||
                  row.date <= url.searchParams.get("endDate")!),
            ),
          },
        });
      if (
        path === "/users/fitness-metrics/effective-history" ||
        (path.includes("fitness-metric") && path.includes("history"))
      ) {
        return route.fulfill({ json: { data: [] } });
      }
      if (path === "/pmc/data") return route.fulfill({ json: { data: [] } });
      if (url.pathname === "/api/v2/home")
        return route.fulfill({
          json: {
            activePlan: null,
            recentActivity: null,
            fitnessStatus: status,
            pmcExtremes: { model: "default", ctl: 72, atl: 76 },
            profile: {
              maxHeartRate: 190,
              restingHeartRate: 48,
              timezone: "Asia/Shanghai",
            },
            aiTodaySuggestion: null,
            weather: null,
          },
        });
      if (url.pathname === "/api/v2/activities/feed")
        return route.fulfill({
          json: {
            items: [],
            page: 1,
            perPage: 5,
            total: 0,
            totalPages: 0,
            summary: { count: 0, totalDistance: 0, totalLoad: 0 },
          },
        });
      if (path === "/charts/summary/week-pair")
        return route.fulfill({ json: { data: {} } });
      return route.fallback();
    });
    await page.goto("/zh");
    if (testInfo.project.name === "mobile") {
      await page
        .getByRole("heading", { name: "摘要", exact: true })
        .scrollIntoViewIfNeeded();
    }
    const card = page.locator('[data-metric="vo2Max"]').first();
    if (scenario.direction === "unavailable") {
      await expect(
        card.getByText("积累更多跑步记录后，可查看四周预测。", { exact: true }),
      ).toBeVisible();
      await card.screenshot({
        path: testInfo.outputPath("oxygen-unavailable-card.png"),
        animations: "disabled",
        scale: "css",
      });
      await card.click();
      const summary = page.getByTestId("vdot-forecast-summary");
      await expect(
        summary.getByText("当前最大摄氧量", { exact: true }),
      ).toBeVisible();
      await expect(
        summary.getByText("积累更多跑步记录后，可查看四周预测。", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(summary).not.toContainText("VDOT");
      await summary.screenshot({
        path: testInfo.outputPath("oxygen-unavailable-summary.png"),
        animations: "disabled",
        scale: "css",
      });
      await page.getByRole("link", { name: "问教练", exact: true }).click();
      await expect(page.getByRole("textbox")).toHaveValue(
        "帮我解读最大摄氧量的当前水平、历史变化和可用的四周预测，并结合近期训练给出建议。",
      );
      expect(
        await page.evaluate(() => window.coachStreamFixture.requests),
      ).toBe(0);
      expect(errors).toEqual([]);
      return;
    }
    const prediction = card.getByLabel(
      `四周后预计最大摄氧量 ${scenario.value}, ${scenario.label}`,
    );
    await expect(prediction).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({
      path: testInfo.outputPath("vdot-card-light.png"),
      animations: "disabled",
      scale: "css",
    });
    await page.screenshot({
      path: testInfo.outputPath("vdot-home-light.png"),
      animations: "disabled",
      scale: "css",
    });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await card.screenshot({
      path: testInfo.outputPath("vdot-card-dark.png"),
      animations: "disabled",
      scale: "css",
    });
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );
    await prediction.click();
    await expect(page.getByTestId("vdot-forecast-summary")).toBeVisible();
    await expect(page.getByTestId("vdot-forecast-summary")).not.toContainText(
      "VDOT",
    );
    await expect(
      page
        .getByTestId("vdot-forecast-summary")
        .getByText("43", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("vdot-forecast-summary")
        .getByLabel(
          `四周后预计最大摄氧量 ${scenario.value}, ${scenario.label}`,
        ),
    ).toBeVisible();
    await expect(page.getByText("所选历史范围 + 未来四周预测")).toBeVisible();
    const valuesBox = await page
      .getByTestId("vdot-current-and-forecast")
      .boundingBox();
    const contextBox = await page
      .getByTestId("vdot-forecast-context")
      .boundingBox();
    expect(valuesBox).not.toBeNull();
    expect(contextBox).not.toBeNull();
    if (testInfo.project.name === "desktop") {
      expect(Math.max(valuesBox!.y, contextBox!.y)).toBeLessThan(
        Math.min(
          valuesBox!.y + valuesBox!.height,
          contextBox!.y + contextBox!.height,
        ),
      );
    } else {
      expect(contextBox!.y).toBeGreaterThanOrEqual(
        valuesBox!.y + valuesBox!.height,
      );
    }
    await page.getByRole("tab", { name: "60天", exact: true }).click();
    await expect(
      page.locator("[data-uplot-chart] canvas").last(),
    ).toBeVisible();
    await page.getByTestId("vdot-forecast-summary").screenshot({
      path: testInfo.outputPath("vdot-summary-light.png"),
      animations: "disabled",
      scale: "css",
    });
    await page.screenshot({
      path: testInfo.outputPath("vdot-detail-light.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
    });
    await page.getByTestId("vdot-forecast-summary").screenshot({
      path: testInfo.outputPath("vdot-summary-dark.png"),
      animations: "disabled",
      scale: "css",
    });
    await page.screenshot({
      path: testInfo.outputPath("vdot-detail-dark.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("link", { name: "问教练", exact: true }).click();
    await expect(page.getByRole("textbox")).toHaveValue(
      "帮我解读最大摄氧量的当前水平、历史变化和可用的四周预测，并结合近期训练给出建议。",
    );
    expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(
      0,
    );
    expect(errors).toEqual([]);
  });
}
