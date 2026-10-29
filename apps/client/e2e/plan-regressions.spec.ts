import { expect, test, type Page } from "@playwright/test";
import { openCoachFixture } from "./fixtures/coach-page";

const planId = "plan-regression-fixture";
const blocks = [
  {
    type: "work",
    steps: [
      { duration: 300, stepKind: "WARMUP" },
      {
        duration: 1200,
        stepKind: "WORK",
        paceKmh: 3600 / 420,
        primaryTargetMeta: { kind: "SPEED", zoneIndex: 1 },
      },
      { duration: 300, stepKind: "COOLDOWN" },
    ],
  },
];
const workouts = Array.from({ length: 18 }, (_, index) => {
  const weekIndex = Math.floor(index / 3) + 1;
  const dayIndex = [1, 3, 6][index % 3];
  const dayOffset = (weekIndex - 1) * 7 + dayIndex - 1;
  const date = new Date(Date.UTC(2026, 9, 5 + dayOffset)).toISOString();
  return {
    id: `workout-${index}`,
    planId,
    weekIndex,
    dayIndex,
    dayOffset,
    sessionIndex: 1,
    scheduledDate: date,
    name: `轻松跑 ${weekIndex}-${dayIndex}`,
    text: "warmup 5m\nwork 20m pace z1\ncooldown 5m",
    notes: "先慢跑热身 5 分钟，再轻松跑 20 分钟，最后放松 5 分钟。",
    sportType: "RUN",
    status: index === 0 ? "DONE" : index === 1 ? "SKIPPED" : "PLANNED",
    structureKind: "ENDURANCE",
    structure: { kind: "ENDURANCE", version: 1, blocks },
    blocks,
    summary: {
      kind: "ENDURANCE",
      durationSeconds: 1800,
      stepCount: 3,
      hardSession: false,
    },
    links: [],
    capabilities: {
      delete: index >= 2,
      postpone: index >= 2,
      skip: index >= 2,
    },
    estimatedLoad: 28,
    estimatedLoadInputs: {
      thresholds: {
        ftp: null,
        cp: null,
        lthr: 173,
        runThresholdPaceSecPerKm: 350,
        swimThresholdPaceSecPer100m: null,
      },
      bySteps: [
        { bucket: "RPE", ifValue: 0.55, durationSec: 300, contribution: 3 },
        { bucket: "PACE", ifValue: 0.833, durationSec: 1200, contribution: 23 },
        { bucket: "RPE", ifValue: 0.55, durationSec: 300, contribution: 3 },
      ],
    },
  };
});

async function openPlan(page: Page, status = "ACTIVE") {
  await page.clock.setFixedTime(new Date("2026-10-09T03:00:00Z"));
  await openCoachFixture(page);
  let mutations = 0;
  let lastMutation: unknown;
  const plan = {
    id: planId,
    title: "6 周重新跑起来",
    description: "每周 3 次轻松跑，循序渐进恢复训练。",
    goal: "恢复体能",
    status,
    periodWeeks: 6,
    startDate: "2026-10-05",
    endDate: "2026-11-15",
    currentWeekIndex: 1,
    currentDayIndex: 5,
    workouts,
  };
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^\/api\/proxy/,
      "",
    );
    if (path === "/competition-impact/current")
      return route.fulfill({
        json: {
          data: {
            assessmentId: null,
            status: "SUCCESS",
            cacheHit: true,
            assessedAt: "2026-10-09T03:00:00Z",
            confidence: 1,
            fallbackVersion: null,
            events: [],
            result: {
              eventAssessments: [],
              combinedImpact: {
                overallLevel: "LOW",
                conflicts: [],
                strategySummary: "",
              },
            },
          },
        },
      });
    if (path === `/plans/${planId}`) {
      if (route.request().method() !== "GET") {
        mutations++;
        lastMutation = route.request().postDataJSON();
      }
      return route.fulfill({ json: { data: { plan } } });
    }
    if (path === `/plans/${planId}/summary`)
      return route.fulfill({
        json: {
          data: {
            summary: {
              planId,
              status,
              periodWeeks: 6,
              totals: {
                workoutCount: 18,
                doneCount: 1,
                plannedCount: 16,
                inProgressCount: 0,
                skippedCount: 1,
                movedCount: 0,
                actualLoad: 20,
                estimatedLoad: 28,
                completionRate: 6,
                complianceRate: 71,
              },
              weeks: [],
              bySport: [],
            },
          },
        },
      });
    if (path.startsWith(`/plans/${planId}/workouts/`)) {
      if (route.request().method() !== "GET") mutations++;
      const workout = workouts.find((w) => path.endsWith(w.id));
      return route.fulfill({
        json: {
          data: {
            workout:
              status === "ACTIVE"
                ? workout
                : {
                    ...workout,
                    capabilities: {
                      delete: false,
                      postpone: false,
                      skip: false,
                    },
                  },
          },
        },
      });
    }
    if (path === "/plans/active")
      return route.fulfill({ json: { data: { plan } } });
    return route.fallback();
  });
  await page.goto(`/zh/plans/${planId}`);
  await expect(
    page.getByRole("button", { name: "轻松跑 1-6", exact: true }),
  ).toBeVisible();
  await page.addStyleTag({
    content:
      ".tsqd-parent-container,nextjs-portal{display:none!important}*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });
  return { mutations: () => mutations, lastMutation: () => lastMutation };
}

test("plan detail uses shared progress and confirmed workout actions", async ({
  page,
}, info) => {
  const { mutations, lastMutation } = await openPlan(page);
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  if (desktop) {
    await expect(page.getByRole("group", { name: "周期进度" })).toBeVisible();
    await expect(page.getByText("绿色叠层 = 当周实际负荷")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "关联活动", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "推迟", exact: true }),
    ).toHaveCount(0);
  }
  await page.screenshot({
    path: info.outputPath("plan-detail-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "轻松跑 1-6", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "更多操作", exact: true }),
  ).toBeVisible();
  if (desktop) {
    await expect(
      page.getByRole("heading", {
        name: "查看训练 · 第 1 周 · 周六",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("估算强度（IF）", { exact: true }),
    ).toBeVisible();
  }
  await page.screenshot({
    path: info.outputPath("workout-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "推迟", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  expect(mutations()).toBe(0);
  await page.screenshot({
    path: info.outputPath("confirm-postpone.png"),
    fullPage: true,
  });
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "删除", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "不会删除已上传的活动记录",
  );
  expect(mutations()).toBe(0);
  await page.screenshot({
    path: info.outputPath("confirm-delete.png"),
    fullPage: true,
  });
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem("theme", "dark");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "theme", newValue: "dark" }),
    );
  });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: info.outputPath("workout-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "删除", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect.poll(mutations).toBe(1);
  expect(lastMutation()).toEqual({ deletedWorkoutIds: ["workout-2"] });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("completed plans have no current-week marker or destructive actions", async ({
  page,
}, info) => {
  await openPlan(page, "COMPLETED");
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(page.getByRole("group", { name: "周期进度" })).toBeVisible();
    await expect(
      page.getByRole("group", { name: "周期进度" }).locator("[aria-current]"),
    ).toHaveCount(0);
  }
  await page.screenshot({
    path: info.outputPath("completed-plan.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "轻松跑 1-6", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "更多操作", exact: true }),
  ).toHaveCount(0);
});
