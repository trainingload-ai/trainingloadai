import { test, expect } from "@playwright/test";
import { openCoachFixture } from "./fixtures/coach-page";

test("home forecast, detail chart and coach draft share the four-week value", async ({
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
    status: "READY",
    cutoffDate: "2026-11-10",
    asOf: "2026-11-11T03:00:00Z",
    timezone: "Asia/Shanghai",
    source: "FACTOR",
    modelVersion: "fixture",
    lastObservationAt: "2026-11-10",
    history: [],
    estimatedCurrentLevel: 43,
    forecasts: Array.from({ length: 4 }, (_, index) => ({
      week: index + 1,
      startDate: new Date(Date.UTC(2026, 10, 11 + index * 7))
        .toISOString()
        .slice(0, 10),
      endDate: new Date(Date.UTC(2026, 10, 17 + index * 7))
        .toISOString()
        .slice(0, 10),
      point: 43 + (index + 1) * 0.275,
      lower80: 42.8 - index * 0.1,
      upper80: 43.5 + index * 0.5,
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
  const prediction = page
    .getByText("四周后预计 VDOT 44.1", { exact: true })
    .first();
  await expect(prediction).toBeVisible();
  await prediction.click();
  await expect(page.getByTestId("vdot-forecast-summary")).toBeVisible();
  await expect(page.getByText("所选历史范围 + 未来四周预测")).toBeVisible();
  await page.getByRole("tab", { name: "60天", exact: true }).click();
  await expect(page.locator("[data-uplot-chart] canvas").last()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("vdot-detail-light.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
  });
  await page.screenshot({
    path: testInfo.outputPath("vdot-detail-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: "问教练", exact: true }).click();
  await expect(page.getByRole("textbox")).toHaveValue(
    "帮我解读四周 VDOT 预测，包括预计水平和预测区间。",
  );
  expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(0);
  expect(errors).toEqual([]);
});
