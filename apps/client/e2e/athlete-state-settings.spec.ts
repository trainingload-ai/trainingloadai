import { expect, test } from "@playwright/test";
import { openCoachFixture } from "./fixtures/coach-page";

for (const theme of ["light", "dark"] as const)
  test(`${theme}: independent athlete state automation setting`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(
      (value) => localStorage.setItem("theme", value),
      theme,
    );
    await openCoachFixture(page, undefined, { navigate: false });
    const reviewMode = JSON.stringify({
      activityReview: true,
      dailyReview: false,
      weeklyReview: true,
    });
    const settings: Record<string, string> = {
      AI_REVIEW_MODE: reviewMode,
      UNIT_SYSTEM: "metric",
    };
    const writes: string[] = [];
    await page.route("**/*", async (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        /^\/api\/proxy/,
        "",
      );
      if (path === "/api/access/features")
        return route.fulfill({
          json: {
            schemaVersion: 1,
            features: Object.fromEntries(
              [
                "ai.coach",
                "ai.activityReview",
                "ai.periodReview",
                "ai.todaySuggestion",
                "ai.planAdvice",
              ].map((key) => [key, { allowed: true, reason: "GRANTED" }]),
            ),
          },
        });
      if (path === "/api/activities/timeline")
        return route.fulfill({
          json: { items: [], nextCursor: null, totalActivities: 0 },
        });
      if (path === "/api/v2/activities/feed")
        return route.fulfill({
          json: {
            items: [],
            externalActivityMirrors: [],
            nextPage: null,
            summary: {
              totalActivities: 0,
              totalDistance: 0,
              totalDuration: 0,
              totalLoad: 0,
              bySport: [],
            },
          },
        });
      if (path.includes("auto-update-config"))
        return route.fulfill({ json: { data: [] } });
      if (path === "/users/settings")
        return route.fulfill({ json: { data: settings } });
      if (path === "/users/settings/ATHLETE_STATE_AUTO_ENABLED") {
        settings.ATHLETE_STATE_AUTO_ENABLED = route
          .request()
          .postDataJSON().value;
        writes.push(path);
        return route.fulfill({ json: { data: {} } });
      }
      return route.fallback();
    });
    const mobile = (testInfo.project.use.viewport?.width ?? 1440) < 768;
    await page.goto(mobile ? "/zh/me" : "/zh/account");
    if (mobile) {
      const menu = page.getByText("复盘自动化", { exact: true });
      if (!(await menu.isVisible().catch(() => false)))
        await page.getByRole("button", { name: /菜单/ }).first().click();
      await page.getByText("复盘自动化", { exact: true }).click();
    }
    const label = page.getByText("自动评估运动员状态", { exact: true });
    await expect(label).toBeVisible();
    const toggle = mobile
      ? label.locator("..").locator("..").getByRole("switch")
      : page.getByRole("switch", { name: "自动评估运动员状态" });
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute("data-state", "checked");
    await toggle.click();
    await expect.poll(() => settings.ATHLETE_STATE_AUTO_ENABLED).toBe("false");
    await expect(toggle).toHaveAttribute("data-state", "unchecked");
    expect(settings.AI_REVIEW_MODE).toBe(reviewMode);
    expect(writes).toHaveLength(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await label.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`athlete-state-${theme}.png`),
    });
  });
