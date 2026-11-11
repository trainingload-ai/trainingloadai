import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openCoachFixture } from "./fixtures/coach-page";

const headline = "Keep today easy";
const summary =
  "Run easily for 30 minutes at a conversational effort. Your recent training supports keeping the session light without adding extra intensity.";

async function openHome(
  page: Page,
  mode: "normal" | "expiry" | "failure" = "normal",
) {
  await openCoachFixture(page, [], { navigate: false });
  let requests = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v2/home")
      return route.fulfill({
        json: {
          activePlan: null,
          recentActivity: {
            id: "42",
            hashId: "recorded-run",
            title: "Easy run",
            sportType: "RUN",
            startTime: new Date().toISOString(),
            duration: 1_800,
            distance: 5_000,
            status: "READY",
          },
          fitnessStatus: { ctl: 30, atl: 32, tsb: -2 },
          pmcExtremes: null,
          profile: { timezone: "UTC" },
          weather: { status: "unavailable" },
          aiTodaySuggestion: null,
        },
      });
    if (url.pathname.endsWith("/ai/today-suggestion")) {
      requests += 1;
      if (mode === "failure")
        return route.fulfill({
          status: 503,
          json: { message: "Temporarily unavailable" },
        });
      return route.fulfill({
        json: {
          data: {
            version: 2,
            suggestionId: `advice-${mode === "expiry" ? requests : 1}`,
            headline:
              mode === "expiry" && requests > 1
                ? "Advice updated with current facts"
                : headline,
            summary,
            recommendation: {
              kind: "TRAIN",
              durationMinutes: 30,
              intensity: "EASY",
            },
            confidence: "MEDIUM",
            evidence: [
              {
                code: "RECENT_ACTIVITY",
                label: "Recent activity recorded",
                evidenceRefs: ["fact:test"],
              },
            ],
            primaryIntent: null,
            secondaryIntents: [
              {
                type: "OPEN_ACTIVITY_REVIEW",
                label: "Review activity",
                activityId: "recorded-run",
              },
            ],
            validUntil: new Date(
              Date.now() +
                (mode === "expiry" && requests === 1 ? 500 : 3_600_000),
            ).toISOString(),
            delivery: {
              state: "GENERATED",
              reasonCode: "GENERATED",
              generatedAt: new Date().toISOString(),
            },
            source: "generated",
            tags: ["Recent training"],
            shouldRefresh: false,
            generatedAt: new Date().toISOString(),
          },
        },
      });
    }
    if (/\/ai\/today-suggestion\/.*\/interactions$/.test(url.pathname))
      return route.fulfill({ json: { data: {} } });
    if (
      url.pathname.endsWith("/coach/pending-decisions") ||
      url.pathname.endsWith("/coach/home-review-state")
    )
      return route.fulfill({
        json: { data: { decisions: [], inquiry: null, guidance: null } },
      });
    return route.fallback();
  });
  await page.goto("/en");
  await page.addStyleTag({
    content: ".tsqd-parent-container,nextjs-portal{display:none!important}",
  });
  return () => requests;
}

for (const width of [1440, 390]) {
  for (const theme of ["light", "dark"] as const) {
    test(`daily judgment is usable without extra interaction ${width} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 960 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      const requests = await openHome(page);
      await expect(page.getByText(headline, { exact: true })).toBeVisible();
      await expect(page.getByText(summary, { exact: true })).toBeVisible();
      expect(requests()).toBe(1);
      mkdirSync("/private/tmp/today-advice-qa", { recursive: true });
      await page.screenshot({
        path: `/private/tmp/today-advice-qa/home-${width}-${theme}.png`,
        fullPage: false,
      });
      await page
        .getByRole("button", { name: `${headline} · ${summary}` })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page).toHaveURL(/\/en$/);
      await expect(
        page.getByRole("dialog").getByText(summary, { exact: true }),
      ).toBeVisible();
      expect(requests()).toBe(1);
    });
  }
}

test("expired advice refreshes without requiring a card click", async ({
  page,
}) => {
  await openHome(page, "expiry");
  await expect(
    page.getByText("Advice updated with current facts", { exact: true }),
  ).toBeVisible();
});

test("a failed request leaves a clear error instead of permanent loading", async ({
  page,
}) => {
  await openHome(page, "failure");
  await expect(
    page.getByText(
      "Today's advice is temporarily unavailable. Please try again shortly.",
      { exact: true },
    ),
  ).toBeVisible();
});
