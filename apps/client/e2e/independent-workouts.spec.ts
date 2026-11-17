import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openCoachFixture } from "./fixtures/coach-page";

async function openIndependentCourses(
  page: Page,
  matchingReason?: "AMBIGUOUS" | "INSUFFICIENT_EVIDENCE",
) {
  await openCoachFixture(page, [], { navigate: false });
  const date = new Date().toISOString().slice(0, 10);
  let linked = false;
  let suppressed = false;
  const mutations: Array<{ method: string; body: unknown }> = [];
  const activity = {
    id: "42",
    hashId: "completed-run",
    title: "Completed easy run",
    sportType: "RUN",
    startTime: `${date}T08:00:00Z`,
    duration: 1800,
    distance: 5000,
    status: "READY",
  };
  const workout = (id: string) => ({
    id,
    planId: null,
    name: id === "ordinary-run" ? "Ordinary run" : "Ordinary swim",
    text: id === "ordinary-run" ? "Run" : "Swim",
    notes: "Imported from Intervals.icu",
    sportType: id === "ordinary-run" ? "RUN" : "SWIM",
    status: linked && id === "ordinary-run" ? "DONE" : "PLANNED",
    scheduledDate: date,
    sessionIndex: id === "ordinary-run" ? 1 : 2,
    dayOffset: 0,
    weekIndex: 0,
    dayIndex: 0,
    structureKind: "FREEFORM",
    structure: {
      kind: "FREEFORM",
      version: 1,
      text: id === "ordinary-run" ? "Run" : "Swim",
    },
    summary: {
      kind: "FREEFORM",
      durationSeconds: id === "ordinary-run" ? 1800 : null,
    },
    links:
      linked && id === "ordinary-run"
        ? [
            {
              id: "manual-link",
              planId: null,
              planWorkoutId: id,
              activityId: 42,
              source: "MANUAL",
              role: "PRIMARY",
              unlinkedAt: null,
              activity,
            },
          ]
        : [],
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/proxy/, "");
    if (path === "/api/v2/home")
      return route.fulfill({
        json: {
          activePlan: null,
          todayDate: date,
          todayWorkouts: ["ordinary-run", "ordinary-swim"].map((id) => {
            const course = workout(id);
            return {
              ...course,
              title: course.name,
              description: course.notes,
              durationSeconds: course.summary.durationSeconds,
              estimatedLoad: null,
              linkedActivityTitle: course.links[0]?.activity.title ?? null,
            };
          }),
          recentActivity: activity,
          fitnessStatus: { ctl: 30, atl: 32, tsb: -2 },
          pmcExtremes: null,
          profile: { timezone: "UTC" },
          weather: { status: "unavailable" },
          aiTodaySuggestion: null,
        },
      });
    const detail = path.match(/\/plans\/workouts\/independent\/([^/]+)$/);
    if (detail)
      return route.fulfill({ json: { data: { workout: workout(detail[1]) } } });
    if (path === "/api/v2/activities/feed")
      return route.fulfill({
        json: {
          items: [
            {
              ...activity,
              linkedPlanWorkout: linked
                ? { planId: null, workoutId: "ordinary-run", source: "MANUAL" }
                : null,
            },
          ],
          pagination: { page: 1, perPage: 100, total: 1, totalPages: 1 },
        },
      });
    if (path.endsWith("/activities/completed-run/plan-workout/link")) {
      mutations.push({
        method: request.method(),
        body: request.postDataJSON(),
      });
      linked = request.method() === "POST";
      if (request.method() === "DELETE") suppressed = true;
      return route.fulfill({
        json: {
          data: linked
            ? {
                linkedPlanWorkout: {
                  workoutId: "ordinary-run",
                  planId: null,
                  source: "MANUAL",
                },
              }
            : { success: true },
        },
      });
    }
    if (path.endsWith("/ai/today-suggestion"))
      return route.fulfill({ json: { data: null } });
    if (
      path.endsWith("/coach/pending-decisions") ||
      path.endsWith("/coach/home-review-state")
    )
      return route.fulfill({
        json: {
          data: {
            decisions: [],
            inquiry: null,
            guidance: null,
            workoutMatching:
              matchingReason && !linked && !suppressed
                ? [
                    {
                      id: "review-42",
                      activityHashId: activity.hashId,
                      activityTitle: activity.title,
                      date,
                      reason: matchingReason,
                      candidates: [
                        {
                          workoutId: "ordinary-run",
                          planId: null,
                          name: "Ordinary run",
                          durationSeconds: 1800,
                          distanceMeters: null,
                        },
                        {
                          workoutId: "plan-run",
                          planId: "plan-2",
                          planTitle: "Second plan",
                          name: "Easy run",
                          durationSeconds: 1860,
                          distanceMeters: null,
                        },
                      ],
                    },
                  ]
                : [],
          },
        },
      });
    return route.fallback();
  });
  await page.goto("/en");
  await page.addStyleTag({
    content: ".tsqd-parent-container,nextjs-portal{display:none!important}",
  });
  return mutations;
}

for (const width of [1440, 390]) {
  for (const theme of ["light", "dark"] as const) {
    test(`independent courses support manual completion without a plan ${width} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 960 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      const mutations = await openIndependentCourses(page);
      await expect(
        page.getByRole("heading", { name: "Ordinary run", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Ordinary swim", exact: true }),
      ).toBeVisible();
      expect(mutations).toEqual([]);
      await expect(page.getByTestId("workout-mini-chart")).toHaveCount(0);
      mkdirSync("/private/tmp/independent-workout-qa", { recursive: true });
      await page
        .getByRole("heading", { name: "Ordinary run", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `/private/tmp/independent-workout-qa/home-${width}-${theme}.png`,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Ordinary run", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText("Imported from Intervals.icu", { exact: true }),
      ).toBeVisible();
      await expect(dialog.getByRole("heading", { name: /Week/ })).toHaveCount(
        0,
      );
      await dialog
        .getByRole("button", { name: "Link activity", exact: true })
        .click();
      await page.getByRole("menuitem", { name: /Completed easy run/ }).click();
      await expect
        .poll(() => mutations)
        .toEqual([{ method: "POST", body: { workoutId: "ordinary-run" } }]);
      const linkedButton = dialog.getByRole("button", {
        name: width < 768 ? "Activity" : "Completed easy run",
        exact: true,
      });
      await expect(linkedButton).toBeVisible();
      await page.screenshot({
        path: `/private/tmp/independent-workout-qa/linked-${width}-${theme}.png`,
        animations: "disabled",
      });
      await linkedButton.click();
      await page
        .getByRole("menuitem", { name: "Remove link", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Link activity", exact: true }),
      ).toBeVisible();
      expect(mutations.map((value) => value.method)).toEqual([
        "POST",
        "DELETE",
      ]);
    });
  }
}

for (const width of [1440, 390])
  for (const theme of ["light", "dark"] as const) {
    test(`Coach keeps unresolved matching visible until manual association ${width} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 960 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      const mutations = await openIndependentCourses(page, "AMBIGUOUS");
      const reminder = page.getByRole("article").filter({
        has: page.getByRole("heading", { name: "Check workout association" }),
      });
      await expect(reminder).toBeVisible();
      await expect(reminder).toContainText("Second plan");
      await expect(
        reminder.getByRole("link", {
          name: "Associate Completed easy run manually",
        }),
      ).toHaveAttribute("href", "/en/activities/completed-run");
      await reminder.getByRole("link").focus();
      await expect(reminder.getByRole("link")).toBeFocused();
      expect(mutations).toEqual([]);
      mkdirSync("/private/tmp/unified-matching-qa", { recursive: true });
      await page.screenshot({
        path: `/private/tmp/unified-matching-qa/coach-${width}-${theme}.png`,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Ordinary run", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: "Link activity", exact: true })
        .click();
      await page.getByRole("menuitem", { name: /Completed easy run/ }).click();
      await expect(reminder).toHaveCount(0);
      expect(mutations).toEqual([
        { method: "POST", body: { workoutId: "ordinary-run" } },
      ]);
    });
  }
