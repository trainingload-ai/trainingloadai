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

const emptyCompetitionImpact = {
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
};

test("the plan card opens details and keeps its actions independent", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "Desktop plan cards");
  await openCoachFixture(page, undefined, { navigate: false });
  const title = "训练计划卡片";
  const listPath = "/zh/plans";
  const detailPath = `${listPath}/${planId}`;
  await page.route("**/api/proxy/plans", (route) =>
    route.fulfill({
      json: {
        data: {
          plans: [{
            id: planId,
            title,
            status: "DRAFT",
            workoutCount: 18,
            completedWorkoutCount: 0,
            createdAt: "2026-10-05T00:00:00Z",
          }],
        },
      },
    }),
  );
  await page.route(`**/api/proxy/ai/plans/${planId}/start-draft`, (route) =>
    route.fulfill({ status: 404, json: { message: "Fixture draft unavailable" } }),
  );

  await page.goto(listPath);
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: title }) });
  const titleLink = card.getByRole("link", { name: title, exact: true });
  await expect(card.getByRole("link", { name: "查看计划详情" })).toHaveAttribute("href", detailPath);

  await card.getByRole("button", { name: "开始计划" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  const deleteDialog = page.getByRole("alertdialog", { name: "删除计划" });
  await card.getByRole("button", { name: "删除计划" }).click();
  await deleteDialog.getByRole("button", { name: "取消" }).click();
  await expect(deleteDialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${listPath}$`));

  await card.click({ position: { x: 20, y: 80 } });
  await expect(page).toHaveURL(new RegExp(`${detailPath}$`));

  await page.goto(listPath);
  await titleLink.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
});

test("active plan menu offers completion without deletion", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "Desktop plan menu");
  await page.clock.setFixedTime(new Date("2026-10-09T03:00:00Z"));
  await openCoachFixture(page, undefined, { navigate: false });
  await page.route("**/api/proxy/competition-impact/current*", (route) =>
    route.fulfill({
      json: { data: { result: { eventAssessments: [], combinedImpact: { conflicts: [] } } } },
    }),
  );
  await page.route("**/api/proxy/plans/active", (route) =>
    route.fulfill({
      json: {
        data: {
          plan: {
            id: planId,
            title: "当前训练计划",
            status: "ACTIVE",
            periodWeeks: 6,
            startDate: "2026-10-05",
            endDate: "2026-11-15",
            currentWeekIndex: 1,
            currentDayIndex: 5,
            capabilities: { delete: false },
            workouts,
          },
        },
      },
    }),
  );
  await page.goto("/zh/plan", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "管理计划" }).click();
  await expect(page.getByRole("menuitem", { name: "删除计划" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "完成计划" }).click();
  const dialog = page.getByRole("alertdialog", { name: "完成计划" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "取消" }).click();
});

async function openPlan(page: Page, status = "ACTIVE") {
  await page.clock.setFixedTime(new Date("2026-10-09T03:00:00Z"));
  await openCoachFixture(page, undefined, { navigate: false });
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
      return route.fulfill({ json: emptyCompetitionImpact });
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

test("rolling plans use the active plan layout and calendar weeks", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-23T10:00:00Z"));
  await openCoachFixture(page, undefined, { navigate: false, membershipPlan: "FREE" });
  const plan = {
    id: planId,
    title: "持续跑步计划",
    status: "ACTIVE",
    planningMode: "ROLLING",
    periodWeeks: null,
    startDate: "2026-11-20",
    endDate: null,
    currentWeekIndex: 1,
    currentDayIndex: 4,
    generatedThrough: "2026-12-06",
    monthDirections: [{
      monthStart: "2026-11-01",
      effectiveFrom: "2026-11-20",
      strategy: {
        objective: "稳步积累跑量",
        loadRange: { unit: "NORMALIZED_LOAD", min: 90, max: 120 },
        durationMinutesRange: { min: 185, max: 245 },
        runningDistanceKmRange: { min: 24, max: 30 },
        weekFocus: [],
      },
    }, {
      monthStart: "2026-10-01",
      effectiveFrom: "2026-10-01",
      strategy: {
        objective: "十月恢复跑步节奏",
        loadRange: null,
        durationMinutesRange: null,
        weekFocus: [],
      },
    }],
    generationCoverage: {
      from: "2026-11-20",
      through: "2026-12-06",
      status: "GENERATED",
      intervals: [
        { weekStart: "2026-11-16", from: "2026-11-20", through: "2026-11-22" },
        { weekStart: "2026-11-23", from: "2026-11-23", through: "2026-11-29" },
        { weekStart: "2026-11-30", from: "2026-11-30", through: "2026-12-06" },
      ],
    },
    workouts: [
      { ...workouts[0], scheduledDate: "2026-11-20", name: "上周轻松跑" },
      { ...workouts[2], dayOffset: 3, dayIndex: 4, scheduledDate: "2026-11-23", name: "今日长跑" },
      { ...workouts[3], dayOffset: 11, dayIndex: 5, scheduledDate: "2026-12-01", name: "下月节奏跑" },
    ],
  };
  await page.route("**/api/proxy/plans/active", (route) =>
    route.fulfill({ json: { data: { plan } } }),
  );
  await page.route(`**/api/proxy/plans/${planId}`, (route) =>
    route.fulfill({ json: { data: { plan } } }),
  );
  await page.route("**/api/access/features", (route) =>
    route.fulfill({ json: { schemaVersion: 1, features: {} } }),
  );
  await page.route("**/api/proxy/competition-impact/current*", (route) =>
    route.fulfill({ json: emptyCompetitionImpact }),
  );
  await page.route(`**/api/proxy/plans/${planId}/automation`, (route) =>
    route.fulfill({
      json: { data: { enabled: true, revision: 1, hasAuthorization: true, jobs: [] } },
    }),
  );
  await page.route(`**/api/proxy/plans/${planId}/workouts/*`, (route) =>
    route.fulfill({
      json: { data: { workout: plan.workouts.find(({ id }) => route.request().url().endsWith(id)) } },
    }),
  );
  await page.goto("/zh/plan");
  const today = page.getByRole("heading", { name: "今日训练" });
  await expect(today).toBeVisible();
  await expect(page.getByRole("heading", { name: /月度方向|自动管理/ })).toHaveCount(0);

  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  if (desktop) {
    const topPlanLink = page.locator("header").getByRole("link", { name: "查看计划", exact: true });
    await expect(topPlanLink).toHaveAttribute("href", `/zh/plans/${planId}`);
    await expect(page.getByRole("link", { name: "查看计划", exact: true })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "全部计划", exact: true })).toHaveCount(0);
    const progress = page.getByRole("group", { name: "周期进度" });
    await expect(progress.getByText("当前 · 11/23 – 11/29")).toBeVisible();
    await expect(progress.getByRole("button", { pressed: true })).toHaveText(/11\/23 – 11\/29/);
    await progress.getByRole("button", { name: "查看第 3 周", exact: true }).click();
    await expect(page.getByRole("heading", { name: "下月节奏跑", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "今日长跑", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "下月节奏跑", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "查看训练 · 第 3 周 · 周二" })).toBeVisible();
    await page.keyboard.press("Escape");
    await topPlanLink.click();
  } else {
    await expect(page.getByRole("button", { name: "今日长跑", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "查看计划", exact: true }).click();
    await expect(page.getByRole("dialog").getByText(/已生成至 2026-12-06/).first()).toBeVisible();
  }

  const monthlyDirection = page.getByText("当月方向", { selector: "summary" });
  await expect(monthlyDirection).toBeVisible();
  await expect(page.getByText("稳步积累跑量")).not.toBeVisible();
  await expect(page.getByText("分享计划", { exact: true })).toHaveCount(0);
  if (desktop) {
    await expect(page.getByText("2026-11-20 – 2026-11-22", { exact: true })).toBeVisible();
    await expect(page.getByText("11/16", { exact: true })).toHaveCount(0);
  }
  await monthlyDirection.click();
  const monthlyTargets = page.locator("details").filter({ has: monthlyDirection });
  await expect(monthlyTargets.getByText("稳步积累跑量")).toBeVisible();
  await expect(monthlyTargets.getByText("计划跑量", { exact: true })).toBeVisible();
  await expect(monthlyTargets.getByText(/24–30\s*公里/)).toBeVisible();
  await expect(monthlyTargets.getByText(/185–245\s*分钟/)).toBeVisible();
  await expect(monthlyTargets.getByText("计划负荷", { exact: true })).toBeVisible();
  await expect(monthlyTargets.getByText(/实际完成|剩余课程预计|未生成部分预测/)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "自动管理", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "关闭自动管理", exact: true })).toHaveCount(0);
  await expect(page.getByText("十月恢复跑步节奏")).toHaveCount(0);
  await page.getByRole("button", { name: "历史方向", exact: true }).click();
  const history = page.getByRole("dialog", { name: "历史方向", exact: true });
  await history.getByText("2026-10 月度方向", { selector: "summary" }).click();
  await expect(history.getByText("十月恢复跑步节奏")).toBeVisible();
});

test("plan detail uses shared progress and confirmed workout actions", async ({
  page,
}, info) => {
  const { mutations, lastMutation } = await openPlan(page);
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  const confirmation = page.getByRole("alertdialog");
  const cancel = confirmation.getByRole("button", { name: "取消", exact: true });
  const expectSpacedActions = async () => {
    const buttons = confirmation.locator('[data-slot="alert-dialog-footer"]').getByRole("button");
    await expect(buttons).toHaveCount(2);
    const [first, second] = await buttons.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().toJSON()),
    );
    expect(first.height).toBe(desktop ? 32 : 44);
    expect(second.height).toBe(first.height);
    expect(desktop ? second.left - first.right : first.top - second.bottom).toBeGreaterThanOrEqual(8);
  };
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
  await expect(confirmation).toBeVisible();
  await expectSpacedActions();
  await expect(cancel).toBeFocused();
  expect(mutations()).toBe(0);
  await page.screenshot({
    path: info.outputPath("confirm-postpone.png"),
    fullPage: true,
  });
  await cancel.click();
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "跳过", exact: true }).click();
  await expectSpacedActions();
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(confirmation).toHaveCount(0);

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
