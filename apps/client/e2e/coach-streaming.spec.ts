import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { TrainingVisualizationV1 } from "../../../packages/shared/training-visualization";
import type { TrainingVisualizationV2 } from "../../../packages/shared/training-exploration";
import { openCoachFixture } from "./fixtures/coach-page";
import { explorationFixtures } from "./fixtures/exploration-fixtures";
import {
  activity,
  enduranceBlocks,
  runRow,
  text,
  tool,
  userRow,
  visualStates,
  visualTime,
} from "./fixtures/coach-visual-states";

test("puts the health summary and preview cards below the completed answer", async ({ page }) => {
  const firstParagraph = "下面是昨晚的睡眠记录。";
  const finalParagraph = "也可以打开活动、计划和概览。";
  const activityCard = tool("CoachDetailView", {
    kind: "activity_detail", hashId: "sleep-related-run", section: "overview",
  }, "activity-detail");
  const otherCards = [
    tool("CoachHealthVisualization", {
      kind: "coach_health_visualization", schemaVersion: 1,
      scope: { metric: "sleep", mode: "LATEST", from: "2026-11-22", to: "2026-11-22" },
      observedAt: visualTime, fingerprint: "sleep-fixture",
      date: "2026-11-22", value: 24_720, knownDays: 1,
    }, "sleep"),
    tool("CoachDetailView", {
      kind: "plan_detail", planId: "coach-test-plan", title: "基础训练计划",
    }, "plan"),
    tool("CoachDetailView", { kind: "athlete_overview" }, "overview"),
    tool("PlanCalendarView", {
      planId: "coach-test-plan", title: "基础训练计划", initialDate: "2026-11-22",
    }, "calendar"),
  ];
  const history = [
    userRow("先看一下训练情况。"),
    {
      id: "previous-answer", role: "assistant",
      content: "这是已经保存的历史回复。", createdAt: visualTime,
    },
  ];
  await openCoachFixture(page, history);
  await page.getByRole("textbox").fill("看看昨晚睡眠和训练详情。");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.coachStreamFixture.requests)).toBe(1);
  await page.evaluate(
    ({ activityCard, firstParagraph, otherCards }) => {
      window.coachStreamFixture.send([
        { type: "start", messageId: "answer-cards-live" },
        { type: "start-step" },
        activityCard,
        { type: "text-start", id: "coach-text-1" },
        { type: "text-delta", id: "coach-text-1", delta: firstParagraph },
        { type: "text-end", id: "coach-text-1" },
        ...otherCards,
      ]);
    },
    { activityCard, firstParagraph, otherCards },
  );
  const log = page.getByRole("log");
  const activityButton = log.getByRole("button", { name: "活动详情", exact: true });
  const sleep = log.getByText("412 min", { exact: true });
  await expect(log.getByText(firstParagraph, { exact: true })).toBeVisible();
  await expect(activityButton).toHaveCount(0);
  await expect(sleep).toHaveCount(0);
  history.push(runRow({
    id: "answer-cards", title: "睡眠和训练详情", category: "数据结果",
    parts: [activityCard, text(firstParagraph), ...otherCards, text(finalParagraph)],
  }));
  await page.evaluate((delta) => {
    window.coachStreamFixture.send([
      { type: "text-start", id: "coach-text-2" },
      { type: "text-delta", id: "coach-text-2", delta },
    ]);
    window.coachStreamFixture.finish("coach-text-2");
  }, finalParagraph);

  const verifyCards = async () => {
    const links = [
      activityButton,
      log.getByRole("button", { name: "基础训练计划", exact: true }),
      log.getByRole("button", { name: "概览", exact: true }),
      log.getByRole("button", { name: /基础训练计划.*查看日历/ }),
    ];
    const answer = log.getByText(finalParagraph, { exact: true });
    await expect(answer).toBeVisible();
    const paragraph = await answer.elementHandle();
    for (const card of [sleep, ...links]) {
      await expect(card).toBeVisible();
      expect(await card.evaluate((node, before) =>
        Boolean(before.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING),
      paragraph)).toBe(true);
    }
    await paragraph.dispose();
  };
  await verifyCards();
  await page.reload();
  await verifyCards();
});

test("previews a plan day workout from its read-only coach card", async ({ page }) => {
  const state = visualStates.find(({ id }) => id === "workout-run")!;
  let detailReads = 0;
  await openCoachFixture(page, [runRow(state)], { navigate: false });
  await page.route(/\/plans\/gallery-plan\/workouts\/gallery-workout(?:\?|$)/, (route) => {
    detailReads++;
    return route.abort();
  });
  await page.goto("/zh/ai-coach?sid=coach-stream-fixture");
  const trigger = page.getByRole("button", { name: /有氧间歇跑/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "有氧间歇跑" });
  await dialog.getByText("课表", { exact: true }).click();
  await expect(dialog.getByText(/warmup 10m/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /编辑|跳过|推迟/ })).toHaveCount(0);
  expect(detailReads).toBe(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("previews the published week with workout thumbnails on desktop and dates on mobile", async ({ page }) => {
  const planId = "published-week-plan";
  const title = "冬季训练计划";
  const initialDate = "2026-12-01";
  const workout = {
    planId, weekIndex: 1, dayIndex: 3, sessionIndex: 1, scheduledDate: "2026-12-02",
    sportType: "RUN", status: "PLANNED", structureKind: "ENDURANCE",
    structure: { kind: "ENDURANCE", version: 1, blocks: enduranceBlocks },
    summary: { kind: "ENDURANCE", durationSeconds: 2280 }, text: "work 30m pace z2",
  };
  await openCoachFixture(page, [runRow({
    id: "published-week", title: "查看课表", category: "数据结果",
    parts: [tool("PlanCalendarView", { planId, title, initialDate })],
  })], { navigate: false });
  await page.route(`**/plans/${planId}`, (route) => route.fulfill({
    json: { data: { plan: { id: planId, title, status: "ACTIVE", workouts: [] } } },
  }));
  await page.route("**/plans/scheduled-workouts?*", (route) => {
    const { searchParams } = new URL(route.request().url());
    const inPlan = [
      { ...workout, id: "second-session", name: "第二节跑课", sessionIndex: 2 },
      { ...workout, id: "first-session", name: "耐力跑" },
      { ...workout, id: "another-plan-workout", planId: "another-plan", name: "其他计划的课" },
      { ...workout, id: "following-sunday", name: "周末长跑", scheduledDate: "2026-12-06" },
      { ...workout, id: "preceding-sunday", name: "跨月轻松跑", scheduledDate: "2026-11-29" },
    ].filter(({ scheduledDate }) => scheduledDate >= searchParams.get("start")!
      && scheduledDate <= searchParams.get("end")!);
    return route.fulfill({ json: { data: { inPlan, independent: [] } } });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/zh/ai-coach?sid=coach-stream-fixture");
  const card = page.getByRole("log").getByRole("article").filter({ hasText: title });
  const open = card.getByRole("button", { name: /冬季训练计划.*查看日历/ });
  await expect(card.getByRole("listitem")).toHaveCount(7);
  await expect(card.locator("time").first()).toHaveAttribute("datetime", "2026-11-30");
  await expect(card.locator("time").last()).toHaveAttribute("datetime", "2026-12-06");
  await expect(card.locator("time[aria-current]")).toHaveAttribute("datetime", initialDate);
  await expect(card.getByText("耐力跑", { exact: true })).toBeVisible();
  await expect(card.getByTestId("workout-mini-chart").first()).toBeVisible();
  await expect(card.getByText("+1 个训练", { exact: true })).toBeVisible();
  await expect(card.getByText(/· 3 个训练$/)).toBeVisible();
  await expect(card.getByText("其他计划的课", { exact: true })).toHaveCount(0);
  await expect(card.getByText("周末长跑", { exact: true })).toBeVisible();
  await expect(card.getByText("跨月轻松跑", { exact: true })).toHaveCount(0);
  await expect(card.getByRole("button")).toHaveCount(1);
  await open.press("Enter");
  const panel = page.getByRole("tabpanel", { name: title });
  await expect(panel.getByText("2026年12月", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /关闭.*预览/ }).click();

  await page.evaluate(() => {
    const key = "trainingload:calendar-week-start";
    localStorage.setItem(key, "sunday");
    window.dispatchEvent(new Event(key));
  });
  await expect(card.locator("time").first()).toHaveAttribute("datetime", "2026-11-29");
  await expect(card.locator("time").last()).toHaveAttribute("datetime", "2026-12-05");
  await expect(card.locator("time[aria-current]")).toHaveAttribute("datetime", initialDate);
  await expect(card.getByText("跨月轻松跑", { exact: true })).toBeVisible();
  await expect(card.getByText("周末长跑", { exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 393, height: 852 });
  await expect(open).toBeVisible();
  await expect(card.getByTestId("workout-mini-chart").first()).toBeHidden();
  await expect(card.getByRole("listitem")).toHaveCount(7);
  await expect(card.locator("time[aria-current]")).toBeVisible();
});

test("loads health chart details on demand and preserves sources and gaps", async ({ page }) => {
  const scope = {
    metric: "hrv", from: "2026-11-19", to: "2026-11-22",
    mode: "TREND", hrvType: "HRV_SDNN_MS", provider: "APPLE_HEALTH",
  };
  const summary = {
    kind: "coach_health_visualization", schemaVersion: 1, scope,
    observedAt: visualTime, fingerprint: "sdnn-fixture", date: "2026-11-21",
    value: 37, knownDays: 2,
  };
  const rows = [runRow({
    id: "health", title: "健康指标", category: "数据结果",
    parts: [
      tool("CoachHealthVisualization", summary, "health-trend"),
      tool("CoachHealthVisualization", {
        ...summary, scope: { ...scope, from: "2026-11-22", mode: "LATEST" },
        value: null, date: null, knownDays: 0,
      }, "health-empty"),
    ],
  })];
  await openCoachFixture(page, rows, { navigate: false });
  const garmin = { id: JSON.stringify(["GARMIN", "HRV_RMSSD_MS"]), provider: "GARMIN", hrvType: "HRV_RMSSD_MS" };
  const apple = { id: JSON.stringify(["APPLE_HEALTH", "HRV_SDNN_MS"]), provider: "APPLE_HEALTH", hrvType: "HRV_SDNN_MS" };
  let reads = 0;
  let unavailable = true;
  await page.route(/\/messages\/gallery-message\/charts\/health-trend(?:\?|$)/, (route) => {
    reads++;
    if (unavailable) return route.fulfill({ status: 404, json: { message: "Chart unavailable" } });
    const switched = new URL(route.request().url()).searchParams.get("hrvSource") === garmin.id;
    return route.fulfill({ json: { data: {
      ...summary,
      hrvSources: [apple, garmin],
      ...(switched ? {
        value: 52, knownDays: 1, date: "2026-11-19",
        scope: { ...scope, provider: garmin.provider, hrvType: garmin.hrvType },
      } : {}),
      chart: {
        key: "hrv", chartKind: "line", latestDate: switched ? "2026-11-19" : "2026-11-21",
        latestValue: switched ? 52 : 39, latestUnit: "ms",
        provider: switched ? garmin.provider : apple.provider, hrvType: switched ? garmin.hrvType : apple.hrvType,
        points: switched ? [{ date: "2026-11-19", value: 52 }] : [
          { date: "2026-11-19" }, { date: "2026-11-20", value: 35 },
          { date: "2026-11-21", value: 39 }, { date: "2026-11-22" },
        ],
      },
    } } });
  });
  await page.goto("/zh/ai-coach?sid=coach-stream-fixture");
  await expect(page.getByText("2/4 天有记录")).toBeVisible();
  await expect(page.getByText("没有符合范围的可用数据。")).toBeVisible();
  expect(reads).toBe(0);
  await page.getByRole("button", { name: /HRV.*查看图表/ }).click();
  const panel = page.getByRole("tabpanel", { name: "HRV" });
  await expect(panel.getByRole("heading", { name: "加载失败", exact: true })).toBeVisible();
  await expect(panel.getByRole("alert")).toBeVisible();
  unavailable = false;
  await panel.getByRole("button", { name: "重试", exact: true }).click();
  await page.getByText("查看数据", { exact: true }).click();
  await expect(page.getByText("2026-11-19", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "2026-11-20", exact: true })).toBeVisible();
  expect(reads).toBeGreaterThan(0);
  const source = panel.getByRole("combobox", { name: "HRV 来源" });
  await source.selectOption(garmin.id);
  await expect(panel.getByText("52 ms", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText("2026-11-19 – 2026-11-22 · RMSSD · Garmin", { exact: true })).toBeVisible();
  await source.selectOption(apple.id);
  await expect(panel.getByText("2/4 天有记录")).toBeVisible();
  await expect(page.getByText("2/4 天有记录")).toHaveCount(2);
});

test("opens an activity in the conversation sidebar after history reload", async ({ page }, testInfo) => {
  const row = runRow(visualStates.find((state) => state.id === "activity-day")!);
  const message = row.message as { parts: Array<{ data?: { input?: { items?: Array<{ hashId: string }> } } }> };
  const id = message.parts.find((part) => part.data?.input?.items)?.data?.input?.items?.[0]?.hashId;
  expect(id).toBeTruthy();
  await openCoachFixture(page, [row], { navigate: false });
  const linkedWorkout = { workoutId: "easy-run", planId: "plan-1", name: "轻松跑课次", source: "MANUAL" };
  let linked = true;
  await page.route("**/activities/cards?*", (route) => {
    expect(new URL(route.request().url()).searchParams.get("hashIds")).toBe(id);
    return route.fulfill({ json: { data: { activities: [{
      hashId: id, activityName: "清晨轻松跑", sportType: "RUN", processingStatus: "READY",
      activitySources: [{ sourceKind: "FILE", isPrimary: true }],
      thirdPartyMappings: [{ id: 1, provider: "INTERVALS_ICU", syncDirection: "EXPORT" }],
      planLinkUiVisible: true, linkedPlanWorkout: linked ? linkedWorkout : null,
    }] } } });
  });
  await page.route(`**/activities/${id}/plan-workout/candidates?*`, (route) =>
    route.fulfill({ json: { data: { candidates: [] } } }),
  );
  await page.route(`**/activities/${id}/plan-workout/link`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { data: { linkedPlanWorkout: linked ? linkedWorkout : null } } });
    }
    expect(route.request().method()).toBe("DELETE");
    linked = false;
    return route.fulfill({ json: { data: { success: true } } });
  });
  await page.route(`**/activities/${id}`, (route) => route.request().isNavigationRequest()
    ? route.fallback()
    : route.fulfill({ json: { data: {
      hashId: id, title: "测试跑步详情", sportType: "RUN",
      distance: 5000, elapsedTime: 1800, averageSpeed: 2.78, avgHeartRate: 130,
      sessionRpe: 3, processingStatus: "READY",
      startTime: "2026-10-09T08:00:00.000Z",
    } } }));
  await page.route(`**/activities/${id}/ai-review?*`, (route) => route.fulfill({ json: { data: {
    found: true, status: "SUCCEEDED", markdown: "保持轻松配速，逐步恢复训练节奏。",
  } } }));
  await page.route(`**/activities/${id}/timeline-segments`, (route) => route.fulfill({
    json: { data: { revision: 0, segments: null } },
  }));
  await page.route("**/charts/execute/activity?*", (route) => {
    const metric = new URL(route.request().url()).searchParams.get("metric");
    const rows = metric === "speed" || metric === "heartRate"
      ? [0, 30, 60].map((second) => ({
        time: new Date(Date.parse("2026-10-09T08:00:00Z") + second * 1000).toISOString(),
        distance: second * 3,
        [metric]: metric === "speed" ? 3 : 130,
      }))
      : [];
    return route.fulfill({ json: { data: { rows, metadata: {} } } });
  });
  await page.goto("/zh/ai-coach?sid=coach-stream-fixture");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "清晨轻松跑", exact: true }) });
  const open = card.getByRole("button", { name: "清晨轻松跑", exact: true });
  const metrics = page.getByTestId("activity-summary-metric");
  let desktopMetrics: string[] | undefined;
  for (const afterReload of [false, true]) {
    if (afterReload) await page.reload();
    await expect(card).toContainText(/跑步 .*8\.2 km · 46:36 · 负荷 42/);
    await expect(card.getByText("143 bpm")).toHaveCount(0);
    await expect(card.getByLabel("Intervals.icu", { exact: true })).toBeVisible();
    const workout = card.getByRole("button", { name: afterReload ? "关联训练" : "轻松跑课次", exact: true });
    await expect(workout).toBeVisible();
    const arrow = open.locator(".lucide-chevron-right");
    await expect(arrow).toBeVisible();
    if (afterReload) {
      await open.press("Enter");
    } else {
      await card.screenshot({ path: testInfo.outputPath("activity-summary-card.png") });
      const bounds = (await arrow.boundingBox())!;
      const cardBounds = (await card.boundingBox())!;
      expect(bounds.y - cardBounds.y).toBeCloseTo(12, 0);
      expect(cardBounds.x + cardBounds.width - bounds.x - bounds.width).toBeCloseTo(12, 0);
      if ((page.viewportSize()?.width ?? 0) < 448) {
        await page.touchscreen.tap(cardBounds.x + 24, cardBounds.y + 24);
      } else {
        await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      }
    }
    const preview = page.getByRole("tabpanel", { name: "清晨轻松跑", exact: true });
    const title = preview.getByRole("heading", { name: "测试跑步详情", exact: true });
    await expect(title).toBeVisible();
    await expect(preview.getByRole("link", { name: "查看完整活动" })).toHaveCount(0);
    await expect(preview.getByRole("button", { name: /编辑运动类型|轻松跑课次|关联训练/ })).toHaveCount(0);
    await expect(preview.getByRole("combobox")).toHaveCount(0);
    await expect(preview).toContainText(/RPE\s*3\/10/);
    if (!afterReload) await expect(preview.getByText("轻松跑课次", { exact: true })).toBeVisible();
    const review = preview.getByText("保持轻松配速，逐步恢复训练节奏。", { exact: true });
    await expect(review).toBeVisible();
    await expect(page.getByRole("tab", { name: "总览", selected: true })).toBeVisible();
    await expect(metrics).toHaveCount(6);
    const pace = metrics.filter({ hasText: "平均配速" }).getByText("6:00", { exact: true });
    await expect(pace).toBeVisible();
    expect(await pace.evaluate((value) => value.scrollWidth - value.clientWidth)).toBeLessThanOrEqual(1);
    if (!afterReload) {
      const metricRows = () => metrics.evaluateAll((cells) =>
        new Set(cells.map((cell) => cell.getBoundingClientRect().top)).size,
      );
      const divider = page.getByRole("separator", { name: "调整对话和预览宽度" });
      if (await divider.isVisible()) {
        await expect.poll(metricRows).toBe(1);
        desktopMetrics = await metrics.allTextContents();
        await page.screenshot({ path: testInfo.outputPath("activity-sidebar-wide.png") });
        const bounds = (await divider.boundingBox())!;
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 220, y, { steps: 10 });
        await expect.poll(metricRows).toBe(2);
        await page.mouse.move(x + 500, y, { steps: 10 });
        await page.mouse.up();
        await expect.poll(metricRows).toBe(3);
        await expect(review).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("activity-sidebar-narrow.png") });
      } else if ((page.viewportSize()?.width ?? 0) < 448) {
        await expect.poll(metricRows).toBe(3);
        await page.screenshot({ path: testInfo.outputPath("activity-sidebar-phone.png") });
      }
    }
    if (!afterReload) {
      await preview.getByRole("tab", { name: "时间线", exact: true }).click();
      const timeline = preview.locator("[data-timeline-scroll]");
      await expect(timeline).toBeVisible();
      await expect(preview.getByRole("button", { name: "编辑分段", exact: true })).toHaveCount(0);
      await expect(preview.getByRole("button", { name: "添加图表", exact: true })).toHaveCount(0);
    }
    expect(new URL(page.url()).pathname).toBe("/zh/ai-coach");
    await page.getByRole("button", { name: /关闭.*预览/ }).click();
    await expect(open).toBeFocused();
    if (!afterReload) {
      await workout.click();
      await expect(preview).toHaveCount(0);
      await page.getByRole("menuitem", { name: "移除关联" }).click();
      await expect(card.getByRole("button", { name: "关联训练", exact: true })).toBeVisible();
    }
  }
  if (desktopMetrics) {
    await page.goto(`/zh/activities/${id}`);
    await expect(page.getByRole("heading", { name: "测试跑步详情", exact: true })).toBeVisible();
    await expect(metrics).toHaveText(desktopMetrics);
    await expect(page.getByText("保持轻松配速，逐步恢复训练节奏。", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /编辑运动类型/ })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "RPE 3" })).toBeVisible();
  }
});

test("fetches the recent activity footers together and skips a missing activity", async ({ page }) => {
  const row = runRow(visualStates.find((state) => state.id === "activity-recent")!);
  await openCoachFixture(page, [row], { navigate: false });
  let requests = 0;
  await page.route("**/activities/cards?*", (route) => {
    requests += 1;
    expect(new URL(route.request().url()).searchParams.get("hashIds")).toBe("activity-a,activity-b");
    return route.fulfill({ json: { data: { activities: [{
      hashId: "activity-a", activityName: "同步后的跑步", sportType: "RUN", processingStatus: "READY",
      activitySources: [{ provider: "INTERVALS_ICU", isPrimary: true }],
    }] } } });
  });
  await page.goto("/zh/ai-coach?sid=coach-stream-fixture");
  const log = page.getByRole("log");
  const matched = log.getByRole("article").filter({ has: page.getByRole("heading", { name: "同步后的跑步" }) });
  const missing = log.getByRole("article").filter({ has: page.getByRole("heading", { name: "室内有氧骑行" }) });
  await expect(matched.getByLabel("Intervals.icu", { exact: true })).toBeVisible();
  await expect(missing.getByRole("heading", { name: "室内有氧骑行" })).toBeVisible();
  const group = log.locator('[data-coach-card="collapsible"]').filter({
    has: page.getByRole("heading", { name: "同步后的跑步", exact: true }),
  });
  expect((await matched.boundingBox())?.x).toBe((await group.boundingBox())?.x);
  await expect(group.getByRole("button", { name: "下一页" })).toHaveCount(0);
  await expect(missing.locator("footer")).toHaveCount(0);
  expect(requests).toBe(1);
});

for (const status of [404, 503]) {
  test(`retries an unavailable activity detail (${status}) from the recent activities preview`, async ({ page }) => {
    const row = runRow(visualStates.find((state) => state.id === "activity-recent")!);
    await openCoachFixture(page, [row], { navigate: false });
    await page.route("**/activities/cards?*", (route) =>
      route.fulfill({ json: { data: { activities: [] } } }),
    );
    const errorMessage = "Activity detail fixture error";
    let available = false;
    await page.route(/\/activities\/activity-a(?:\?|$)/, (route) => {
      if (route.request().isNavigationRequest()) return route.fallback();
      return available
        ? route.fulfill({ json: { data: {
            hashId: "activity-a", title: "测试跑步详情", sportType: "RUN",
            startTime: "2026-10-08T23:05:00Z", elapsedTime: 2796, distance: 8240,
            processingStatus: "READY",
          } } })
        : route.fulfill({ status, json: { message: errorMessage } });
    });
    await page.goto("/zh/ai-coach?sid=coach-stream-fixture");

    await page.getByRole("log").getByRole("button", { name: "清晨轻松跑", exact: true }).click();
    const preview = page.getByRole("tabpanel", { name: "清晨轻松跑", exact: true });
    await expect(preview.getByRole("heading", { name: "加载失败", exact: true })).toBeVisible();
    await expect(page.getByText(errorMessage, { exact: true })).toHaveCount(0);
    const retry = preview.getByRole("button", { name: "重试", exact: true });
    await expect(retry).toBeEnabled();

    available = true;
    await retry.click();
    await expect(preview.getByRole("heading", { name: "测试跑步详情", exact: true })).toBeVisible();
    await expect(retry).toHaveCount(0);
  });
}

test("paginates recent activities through controls in the expanded card header", async ({ page }) => {
  const activities = Array.from({ length: 13 }, (_, index) => ({
    hashId: `page-activity-${index + 1}`,
    title: `最近训练 ${index + 1}`,
    sportType: "RUN",
    durationMin: 30,
  }));
  const row = runRow({
    id: "activity-pages",
    title: "最近活动分页",
    category: "数据结果",
    parts: [tool("ActivityRecent", { kind: "activity_recent", items: activities })],
  });
  await openCoachFixture(page, [row], { navigate: false });
  const requestedIds: string[][] = [];
  await page.route("**/activities/cards?*", (route) => {
    requestedIds.push(new URL(route.request().url()).searchParams.get("hashIds")!.split(","));
    return route.fulfill({ json: { data: { activities: [] } } });
  });
  await page.goto("/zh/ai-coach?sid=coach-stream-fixture");

  const group = page.locator('[data-coach-card="collapsible"]').filter({ hasText: "最近活动" });
  const header = group.locator("header");
  const toggle = header.getByRole("button", { name: "展开或收起详情" });
  const next = header.getByRole("button", { name: "下一页" });
  const previous = header.getByRole("button", { name: "上一页" });
  const pageLabel = header.getByRole("status");
  await expect(group.getByRole("article")).toHaveCount(10);
  await expect(group.getByRole("heading", { name: "最近训练 10", exact: true })).toBeVisible();
  await expect(pageLabel).toContainText("第 1 页，共 2 页");
  await expect(previous).toBeDisabled();
  const nextBounds = (await next.boundingBox())!;
  const headerBounds = (await header.boundingBox())!;
  expect(nextBounds.x + nextBounds.width).toBeCloseTo(headerBounds.x + headerBounds.width, 0);
  const hasTouch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  expect(nextBounds.height).toBeGreaterThanOrEqual(hasTouch ? 44 : 24);

  await next.press("Enter");
  await expect(group.getByRole("article")).toHaveCount(3);
  await expect(group.getByRole("heading", { name: "最近训练 11", exact: true })).toBeVisible();
  await expect(pageLabel).toContainText("第 2 页，共 2 页");
  await expect(next).toBeDisabled();
  await expect(next).toBeFocused();
  await next.press("Enter");
  await expect(group.getByRole("article")).toHaveCount(3);
  await expect.poll(() => requestedIds.map((ids) => ids.length)).toEqual([10, 3]);
  expect(requestedIds[1]).toEqual(activities.slice(10).map(({ hashId }) => hashId));

  await toggle.click();
  await expect(next).toHaveCount(0);
  await expect(group.getByRole("article")).toHaveCount(0);
  await toggle.click();
  await expect(pageLabel).toContainText("第 2 页，共 2 页");
  await previous.click();
  await expect(group.getByRole("article")).toHaveCount(10);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("the activity search card menu stays independent from the card link", async ({ page }) => {
  await openCoachFixture(page, undefined, { navigate: false });
  const title = "活动流测试骑行";
  const hashId = "feed-card-ride";
  const ride = {
    id: hashId, hashId, title, sportType: "CYCLING", status: "READY", timezone: "Asia/Shanghai",
    startTime: "2026-11-24T03:20:00Z", duration: 1500, distance: 9100, load: 13,
    primaryProvider: "MANUAL", thirdPartyMappings: [], planLinkUiVisible: false,
  };
  await page.route("**/api/v2/activities/feed?*", (route) => route.fulfill({ json: {
    items: [ride], externalActivityMirrors: [], nextPage: null,
    summary: { count: 1, totalDistance: 9100, totalLoad: 13 },
  } }));
  await page.route(`**/api/proxy/activities/${hashId}`, (route) => route.fulfill({ json: {
    data: { ...ride, elapsedTime: ride.duration, processingStatus: "READY" },
  } }));
  await page.goto("/zh/activities/search");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: title }) });
  const link = card.getByRole("link", { name: title });
  await expect(link).toHaveAttribute("href", `/zh/activities/${hashId}`);
  await card.getByRole("button", { name: "打开菜单" }).click();
  await expect(page.getByRole("menuitem", { name: "导出", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/zh\/activities\/search$/);
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: "打开菜单" })).toBeFocused();
  await link.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/zh/activities/${hashId}$`));
});

test("opens plan details and athlete overview in the same sidebar", async ({ page }) => {
  const rows = [runRow({
    id: "detail-views", title: "训练详情", category: "数据结果",
    parts: [
      tool("CoachDetailView", { kind: "plan_detail", planId: "coach-test-plan", title: "基础训练计划" }, "plan-detail"),
      tool("CoachDetailView", { kind: "athlete_overview" }, "overview"),
    ],
  })];
  await openCoachFixture(page, rows, { navigate: false });
  await page.route("**/plans/coach-test-plan", (route) => route.fulfill({ json: { data: { plan: {
    id: "coach-test-plan", title: "基础训练计划", status: "ACTIVE", mode: "FIXED",
    startDate: "2026-11-16", endDate: "2026-12-13", durationWeeks: 4, currentWeekIndex: 0,
    goal: "建立有氧基础", workouts: [],
  } } } }));
  await page.goto("/zh/ai-coach?sid=coach-stream-fixture");
  await page.getByRole("button", { name: "基础训练计划", exact: true }).click();
  const plan = page.getByRole("tabpanel", { name: "基础训练计划" });
  await expect(plan.getByText("建立有氧基础")).toBeVisible();
  await expect(plan.getByRole("button", { name: "暂停", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /关闭.*预览/ }).click();
  await page.getByRole("button", { name: "概览", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "概览" }).getByText("近30天", { exact: true })).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "课表预览" });
  const overview = tabs.getByRole("tab", { name: "概览", exact: true });
  await page.getByRole("button", { name: "关闭 基础训练计划", exact: true }).click();
  await expect(tabs.getByRole("tab", { name: "基础训练计划" })).toHaveCount(0);
  await expect(overview).toHaveAttribute("aria-selected", "true");
  await expect(overview).toBeFocused();
  expect(new URL(page.url()).pathname).toBe("/zh/ai-coach");
});

test("drills into training statistics, PMC gaps and a measured power curve", async ({ page }) => {
  const from = "2026-11-20";
  const to = "2026-11-22";
  const stats: TrainingVisualizationV1 = {
    kind: "training_visualization", schemaVersion: 1, title: "跑步训练统计",
    intent: "LOOKUP", view: "METRIC_STRIP", x: { key: "label", type: "TIME" },
    detail: {}, observedAt: visualTime, rows: [],
    summary: { AVG_HEART_RATE: 142.5, ACTIVITY_COUNT: 3 },
    series: [{ key: "AVG_HEART_RATE", unit: "bpm" }, { key: "ACTIVITY_COUNT", unit: "count" }],
    provenance: {
      source: "ACTIVITIES", from, to, groupBy: "DAY", timezone: "Asia/Shanghai",
      sportTypes: ["RUN"], fingerprint: "stats", complete: true, truncated: false,
      coverage: { AVG_HEART_RATE: 0.667 }, coverageDetails: { AVG_HEART_RATE: { known: 40, total: 60, unit: "min" } },
    },
  };
  const pmc: TrainingVisualizationV1 = {
    ...stats, title: "负荷状态趋势", intent: "TREND", view: "LINE", detail: undefined,
    series: [{ key: "TSB", unit: "load" }], summary: { TSB: -8 },
    rows: [0, null, -8].map((TSB, index) => ({
      key: `2026-11-2${index}`, label: `2026-11-2${index}`, values: { TSB },
    })),
    provenance: { ...stats.provenance, source: "PMC", sportTypes: [], fingerprint: "pmc", coverage: { TSB: 0.667 } },
  };
  const power: TrainingVisualizationV2 = {
    kind: "training_visualization", schemaVersion: 2, title: "骑行功率持续曲线",
    highlights: [{ label: "5 min", value: 220, unit: "W" }], detail: true, panels: [], notes: [],
    provenance: {
      query: { source: "POWER_DURATION", from, to, sportTypes: ["CYCLING"] }, timezone: "Asia/Shanghai",
      fingerprint: "power", complete: true, truncated: false, matchedCount: 1, missingCount: 1,
    },
  };
  await openCoachFixture(page, [runRow({ id: "stats-and-power", title: "训练数据", category: "数据结果", parts: [
    tool("TrainingVisualization", stats, "training-stats"),
    tool("TrainingVisualization", pmc, "pmc-trend"),
    tool("TrainingVisualization", power, "power-duration"),
  ] })], { navigate: false });
  await page.route(/\/charts\/training-stats(?:\?|$)/, (route) => {
    const group = new URL(route.request().url()).searchParams.has("byActivity");
    return route.fulfill({ json: { data: {
      ...stats, detail: undefined, view: "TABLE",
      provenance: { ...stats.provenance, groupBy: group ? "ACTIVITY" : "DAY" },
      rows: [{ key: "a", label: group ? "清晨耐力跑" : from, start: from, values: { AVG_HEART_RATE: 142.5, ACTIVITY_COUNT: 1 } }],
    } } });
  });
  await page.route("**/charts/power-duration", (route) => route.fulfill({ json: { data: {
    ...power, highlights: undefined, detail: undefined,
    panels: [{
      id: "cycling", view: "LINE", x: { kind: "ELAPSED_TIME", unit: "s" },
      y: { kind: "NUMBER", unit: "W", measure: "POWER" },
      series: [{ id: "cycling", points: [
        { x: 300, y: 220, label: "山路骑行", activityHashId: "power-origin" },
        { x: 1200, y: null },
      ] }],
    }],
  } } }));
  await page.route("**/activities/power-origin", (route) => route.fulfill({ json: { data: {
    hashId: "power-origin", title: "山路骑行", sportType: "CYCLING", avgPower: 220,
    distance: 25000, elapsedTime: 4000, processingStatus: "READY", startTime: "2026-11-21T08:00:00.000Z",
  } } }));
  await page.goto("/zh/ai-coach?sid=coach-stream-fixture");
  await page.getByRole("button", { name: /负荷状态趋势.*查看图表/ }).click();
  const pmcPanel = page.getByRole("tabpanel", { name: "负荷状态趋势" });
  await pmcPanel.getByText("查看数据", { exact: true }).click();
  const pmcRows = pmcPanel.getByRole("table").first().getByRole("row");
  await expect(pmcRows.nth(1)).toContainText("0");
  await expect(pmcRows.nth(2)).toContainText("—");
  await expect(pmcRows.nth(3)).toContainText("-8");
  await page.getByRole("button", { name: /关闭.*预览/ }).click();
  await page.getByRole("button", { name: "查看图表 · 平均心率" }).click();
  const statsPanel = page.getByRole("tabpanel", { name: "跑步训练统计" });
  await statsPanel.getByRole("button", { name: "按活动查看" }).click();
  await expect(statsPanel.getByText("清晨耐力跑")).toBeVisible();
  await expect(statsPanel.getByText("142.5 bpm")).toBeVisible();
  await page.getByRole("button", { name: /关闭.*预览/ }).click();
  await page.getByRole("button", { name: /骑行功率持续曲线.*查看图表/ }).click();
  const powerPanel = page.getByRole("tabpanel", { name: "骑行功率持续曲线" });
  await powerPanel.getByText("查看数据", { exact: true }).click();
  await expect(powerPanel.getByRole("row", { name: /5:00 220/ }).getByRole("cell", { name: "220", exact: true })).toBeVisible();
  await expect(powerPanel.getByRole("row", { name: /20:00 —/ }).getByRole("cell").nth(2)).toHaveText("—");
  await powerPanel.getByRole("button", { name: "山路骑行", exact: true }).click();
  const activityPanel = page.getByRole("tabpanel", { name: "山路骑行" });
  await expect(activityPanel.getByRole("tab", { name: "功率", selected: true })).toBeVisible();
});

test("refreshes the conversation after an obsolete answer and removes the old question", async ({
  page,
}) => {
  const pending = visualStates.find((state) => state.id === "question-pending")!;
  const rows = [runRow(pending)];
  const historyReads = await openCoachFixture(page, rows, { empty: true });
  const question = page.locator(
    "[data-coach-question-dock] [data-coach-question]",
  );
  await expect(question).toBeVisible();
  const firstRead = historyReads();
  await question.getByText("备战半程马拉松", { exact: true }).click();
  await question.getByRole("button", { name: "下一步", exact: true }).click();
  await question.getByText("3 次", { exact: true }).click();
  await question.getByRole("button", { name: "提交", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(1);

  rows.splice(
    0,
    1,
    runRow({ ...pending, status: "cancelled", parts: [] }),
    {
      id: "current",
      role: "assistant",
      content: "训练安排已更新。",
      createdAt: visualTime,
    },
  );
  await page.evaluate(() => {
    window.coachStreamFixture.send([
      { type: "start", messageId: "stale-answer-result" },
      { type: "start-step" },
      {
        type: "data-coach-turn-error",
        id: "coach-turn-error",
        data: { code: "question_stale" },
      },
      { type: "error", errorText: "请求与当前状态冲突" },
    ]);
    window.coachStreamFixture.finish(null);
  });

  await expect(page.getByText("训练安排已更新。", { exact: true })).toBeVisible();
  await expect(question).toHaveCount(0);
  await expect(page.getByText(/这个问题已过期/)).toBeVisible();
  expect(historyReads()).toBe(firstRead + 1);
});

for (const outcome of ["completed", "failed"] as const) {
  test(`internal repair stays private until final ${outcome} and survives history restore`, async ({
    page,
  }, testInfo) => {
    await page.clock.setFixedTime(new Date(visualTime));
    const rows: Record<string, unknown>[] = [
      {
        id: "ready",
        role: "assistant",
        content: "已准备好测试",
        createdAt: visualTime,
      },
    ];
    await openCoachFixture(page, rows, { readyText: "已准备好测试" });
    await page.getByRole("textbox").fill("看看近期训练负荷");
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
      .toBe(1);
    const hidden = (id: string) => {
      const part = activity(
        id,
        "tool",
        "waiting",
        "present_training_visualization",
      );
      return { ...part, data: { ...(part.data as object), display: "hidden" } };
    };
    const parts = [
      hidden("invalid-1"),
      hidden("invalid-2"),
      activity("analysis", "analysis", "running"),
    ];
    const state = {
      id: "repair",
      title: "训练负荷",
      category: "运行",
      status: "running" as const,
      parts,
    };
    const initial = runRow(state).message as {
      metadata: unknown;
      parts: Record<string, unknown>[];
    };
    await page.evaluate(
      (message) =>
        window.coachStreamFixture.send([
          {
            type: "start",
            messageId: "gallery-message",
            messageMetadata: message.metadata,
          },
          { type: "start-step" },
          ...message.parts,
        ]),
      initial,
    );
    const run = page.locator('[data-run-id="gallery-run"]');
    await expect(run.locator('[data-activity-id="analysis"]')).toBeVisible();
    await expect(run.locator('[data-activity-id^="invalid-"]')).toHaveCount(0);
    await expect(run.locator(".text-destructive")).toHaveCount(0);
    // Preserve an explicitly opened timeline across completion.
    await run.getByRole("button", { name: /^运行中/ }).click();
    await run.getByRole("button", { name: /^运行中/ }).click();
    const finalActivity = activity(
      outcome === "completed" ? "valid-3" : "invalid-2",
      "tool",
      outcome,
      "present_training_visualization",
    );
    (finalActivity.data as Record<string, unknown>).revision = 2;
    const finalParts = [
      hidden("invalid-1"),
      ...(outcome === "completed" ? [hidden("invalid-2")] : []),
      activity("analysis", "analysis", "completed"),
      finalActivity,
    ];
    const row = runRow({ ...state, status: outcome, parts: finalParts });
    const saved = row.message as { parts: Record<string, unknown>[] };
    const answer =
      outcome === "completed"
        ? "已生成负荷趋势，请结合近期记录查看。"
        : "这次未能生成图表，请稍后重试。";
    rows.push(row);
    await page.evaluate(
      ({ parts, answer }) => {
        window.coachStreamFixture.send([
          ...parts,
          { type: "text-start", id: "answer" },
          { type: "text-delta", id: "answer", delta: answer },
        ]);
        window.coachStreamFixture.finish("answer");
      },
      { parts: saved.parts, answer },
    );
    saved.parts.push({ type: "text", text: answer });
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    await expect(run.locator(".text-destructive")).toHaveCount(
      outcome === "failed" ? 1 : 0,
    );
    await page.reload();
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
    const toggle = run.getByRole("button", {
      name: outcome === "completed" ? /^运行完成/ : /^运行失败/,
    });
    if ((await toggle.getAttribute("aria-expanded")) === "false")
      await toggle.click();
    await expect(run.locator('[data-activity-id="invalid-1"]')).toHaveCount(0);
    await expect(run.locator(".text-destructive")).toHaveCount(
      outcome === "failed" ? 1 : 0,
    );
    const dir = resolve(
      process.cwd(),
      "../artifacts/coach-state-review",
      testInfo.project.name,
    );
    await mkdir(dir, { recursive: true });
    await page.addStyleTag({
      content:
        ".tsqd-parent-container, nextjs-portal { display:none!important }",
    });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((mode) => {
        localStorage.setItem("theme", mode);
        window.dispatchEvent(
          new StorageEvent("storage", { key: "theme", newValue: mode }),
        );
      }, theme);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await page.screenshot({
        path: resolve(dir, `internal-repair-${outcome}-${theme}.png`),
        animations: "disabled",
      });
    }
  });
}

test("public reasoning streams into its activity, respects disclosure and restores without private reasoning", async ({
  page,
}) => {
  const state = visualStates.find((item) => item.id === "reasoning-live")!;
  const rows: Record<string, unknown>[] = [
    {
      id: "ready",
      role: "assistant",
      content: "已准备好测试",
      createdAt: "2026-10-09T03:00:00.000Z",
    },
  ];
  await openCoachFixture(page, rows, {
    readyText: "已准备好测试",
    thinkingEnabled: true,
  });
  await page.getByRole("textbox").fill("根据近期负荷安排恢复训练");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(1);
  const message = runRow(state).message as {
    metadata: unknown;
    parts: Record<string, unknown>[];
  };
  await page.evaluate(({ metadata, parts }) => {
    window.coachStreamFixture.send([
      {
        type: "start",
        messageId: "gallery-message",
        messageMetadata: metadata,
      },
      { type: "start-step" },
      ...parts,
    ]);
  }, message);
  const run = page.locator('[data-run-id="gallery-run"]');
  const summary = run.locator("[data-coach-reasoning-summary]");
  const summaryToggle = summary.getByRole("button");
  await expect(summaryToggle).toHaveAttribute("aria-expanded", "true");
  await expect(summary).toContainText("起始负荷应兼顾近期运动量和恢复状态");
  await summaryToggle.click();
  await page.evaluate(
    (part) => window.coachStreamFixture.send([part]),
    message.parts[1],
  );
  await expect(summary).toHaveCount(1);
  await expect(summaryToggle).toHaveAttribute("aria-expanded", "false");
  await summaryToggle.click();
  // Explicitly retain the parent timeline across completion too.
  await run.getByRole("button", { name: /^运行中/ }).click();
  await run.getByRole("button", { name: /^运行中/ }).click();
  const finished = runRow({ ...state, status: "completed", live: false });
  const saved = finished.message as { parts: Record<string, unknown>[] };
  const answer = "具体训练安排仍需你确认。";
  saved.parts.push({ type: "text", text: answer });
  // Old raw reasoning must stay invisible even when a public summary exists.
  saved.parts.push({
    type: "reasoning",
    text: "PRIVATE_HISTORY_REASONING",
    state: "done",
  });
  rows.push(finished);
  await page.evaluate(
    ({ runPart, answer }) => {
      window.coachStreamFixture.send([
        runPart,
        { type: "text-start", id: "answer" },
        { type: "text-delta", id: "answer", delta: answer },
      ]);
      window.coachStreamFixture.finish("answer");
    },
    { runPart: saved.parts[0], answer },
  );
  await expect(
    page.getByRole("button", { name: "发送", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await page.reload();
  await expect(run.getByRole("button", { name: /^运行完成/ })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await run.getByRole("button", { name: /^运行完成/ }).click();
  await expect(summaryToggle).toHaveAttribute("aria-expanded", "false");
  await summaryToggle.press("Enter");
  await expect(summary).toContainText("起始负荷应兼顾近期运动量和恢复状态");
  await expect(summary).toHaveCount(1);
  await expect(page.getByText("PRIVATE_HISTORY_REASONING")).toHaveCount(0);
  expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(0);
});

test("context details update during streaming, survive the next attempt and support keyboard dismissal", async ({
  page,
}) => {
  await openCoachFixture(page);
  const trigger = page.locator("[data-coach-context-trigger]:visible");
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "上下文窗口" });
  await expect(panel.getByRole("progressbar")).toHaveCount(0);
  await panel.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("textbox").fill("上下文检查");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(1);
  const context = {
    step: 1,
    maxContextTokens: 128000,
    reservedOutputTokens: 8000,
    inputBudgetTokens: 120000,
    usedInputTokens: 30000,
    remainingInputTokens: 90000,
    compressionThresholdTokens: 100000,
    usageRatio: 0.25,
    estimator: "mixed_chars_v1",
    compressed: false,
    compactedMessages: 0,
  };
  await page.evaluate(
    (data) =>
      window.coachStreamFixture.send([
        { type: "start", messageId: "context-attempt" },
        { type: "start-step" },
        {
          type: "data-coach-context-window",
          id: "coach-context-window-current",
          data,
        },
        { type: "text-start", id: "coach-text-1" },
        { type: "text-delta", id: "coach-text-1", delta: "上下文正在更新。" },
      ]),
    context,
  );
  await expect(trigger).toContainText("~25%");
  await trigger.click();
  await page.evaluate(
    (data) =>
      window.coachStreamFixture.send([
        {
          type: "data-coach-context-window",
          id: "coach-context-window-current",
          data: { ...data, usedInputTokens: 108000, usageRatio: 0.9 },
        },
      ]),
    context,
  );
  await expect(panel.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "90",
  );
  await expect(panel).toContainText("已接近压缩阈值");
  await page.evaluate(() => window.coachStreamFixture.finish());
  await panel.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("textbox").fill("继续");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(2);
  await page.evaluate(() =>
    window.coachStreamFixture.send([
      { type: "start", messageId: "context-attempt-two" },
      { type: "start-step" },
      { type: "text-start", id: "coach-text-1" },
      { type: "text-delta", id: "coach-text-1", delta: "新的执行段。" },
    ]),
  );
  await expect(trigger).toContainText("~90%"); // latest known estimate, not a fake reset
  await page.evaluate(() => window.coachStreamFixture.finish());
});

test("step evidence streams once, preserves disclosure on updates, and restores under the same step", async ({
  page,
}) => {
  const fixture = visualStates.find(
    (state) => state.id === "timeline-evidence-empty",
  )!;
  const saved = runRow(fixture);
  const envelope = saved.message as {
    metadata: unknown;
    parts: Array<{
      type: string;
      id?: string;
      data?: Record<string, unknown>;
      text?: string;
    }>;
  };
  const run = envelope.parts.find((part) => part.type === "data-coach-run")!;
  const activities = envelope.parts.filter(
    (part) => part.type === "data-coach-activity",
  );
  await openCoachFixture(page);
  await page.getByRole("textbox").fill("查看区间和赛事");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(1);
  await page.evaluate(
    ({ metadata, run, activities }) =>
      window.coachStreamFixture.send([
        {
          type: "start",
          messageId: "gallery-message",
          messageMetadata: metadata,
        },
        { type: "start-step" },
        {
          ...run,
          data: {
            ...run.data,
            revision: 1,
            status: "running",
            endedAt: undefined,
          },
        },
        ...activities.map((part) => ({
          ...part,
          data: { ...part.data, status: "running", endedAt: undefined },
        })),
      ]),
    { metadata: envelope.metadata, run, activities },
  );
  const row = page.locator('[data-activity-id="zones-call"]');
  await expect(row).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);
  await page.evaluate(
    (parts) => window.coachStreamFixture.send(parts),
    envelope.parts.filter(
      (part) =>
        part.type === "data-coach-tool" || part.type === "data-coach-activity",
    ),
  );
  await row.getByRole("button").click();
  await expect(row.getByRole("table")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(1);
  await page.evaluate(
    (part) =>
      window.coachStreamFixture.send([
        { ...part, data: { ...part.data, revision: 3 } },
      ]),
    activities[0],
  );
  await expect(row.getByRole("button")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.evaluate((run) => {
    window.coachStreamFixture.send([
      run,
      { type: "text-start", id: "coach-text-1" },
      {
        type: "text-delta",
        id: "coach-text-1",
        delta: "已读取你的强度区间。这个查询范围内没有赛事安排。",
      },
    ]);
    window.coachStreamFixture.finish();
  }, run);
  await expect(row.getByRole("table")).toBeVisible(); // manual choice survives completion
  await page.route("**/ai/coach/sessions/*/messages*", (route) =>
    route.fulfill({ json: { data: [saved] } }),
  );
  await page.reload();
  await expect(
    page.locator('[data-run-id="gallery-run"] button[aria-expanded]').first(),
  ).toHaveAttribute("aria-expanded", "false");
  await page
    .locator('[data-run-id="gallery-run"] button[aria-expanded]')
    .first()
    .click();
  await row.getByRole("button").click();
  await expect(row.getByRole("table")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(1);
  await page
    .locator('[data-activity-id="events-call"]')
    .getByRole("button")
    .click();
  await expect(
    page.locator('[data-activity-result="events-call"]'),
  ).toContainText("查询范围内暂无赛事安排。");
  expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(0);
});

test("process-only history survives refresh without auto-resuming", async ({
  page,
}) => {
  const startedAt = "2026-10-08T00:00:00.000Z";
  await openCoachFixture(page, [
    {
      id: "saved-attempt",
      role: "assistant",
      content: "",
      createdAt: startedAt,
      message: {
        kind: "ui_message",
        version: 2,
        role: "assistant",
        providerReplay: false,
        metadata: {
          schemaVersion: 2,
          runId: "saved-run",
          attemptId: "saved-attempt",
        },
        parts: [
          {
            type: "data-coach-run",
            id: "saved-run",
            data: {
              runId: "saved-run",
              attemptId: "saved-attempt",
              messageId: "saved-attempt",
              revision: 2,
              status: "interrupted",
              startedAt,
              endedAt: startedAt,
              previousExecutionMs: 0,
              executionMs: 1200,
            },
          },
          {
            type: "data-coach-activity",
            id: "saved-step",
            data: {
              activityId: "saved-step",
              runId: "saved-run",
              attemptId: "saved-attempt",
              seq: 0,
              revision: 2,
              kind: "skill",
              labelKey: "skill",
              status: "failed",
              startedAt,
              endedAt: startedAt,
            },
          },
        ],
      },
    },
    {
      id: "history-assistant",
      role: "assistant",
      content: "这是已经保存的历史回复。",
      createdAt: startedAt,
    },
  ]);
  for (let round = 0; round < 2; round += 1) {
    await expect(
      page.locator('[data-run-id="saved-run"] button[aria-expanded]').first(),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("加载技能", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "继续执行（新尝试）", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(
      0,
    );
    if (!round) await page.reload();
  }
});

test("streaming never steals scroll after the user scrolls upward", async ({
  page,
}) => {
  await openCoachFixture(page);
  await page.getByRole("textbox").fill("长回答滚动测试");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(1);
  await page.evaluate(() =>
    window.coachStreamFixture.send([
      { type: "text-start", id: "coach-text-1" },
      {
        type: "text-delta",
        id: "coach-text-1",
        delta: Array.from(
          { length: 65 },
          (_, i) => `第 ${i + 1} 段训练建议：逐步增加负荷，注意恢复。`,
        ).join("\n\n"),
      },
    ]),
  );
  await expect(
    page.getByText("第 65 段训练建议：逐步增加负荷，注意恢复。", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("log").hover();
  await page.mouse.wheel(0, -1600);
  const latest = page.getByRole("button", {
    name: "回到最新消息",
    exact: true,
  });
  await expect(latest).toBeVisible();
  const position = () =>
    page.getByRole("log").evaluate((root) => {
      const nodes = [root, ...root.querySelectorAll<HTMLElement>("div")];
      const scroll = nodes.find(
        (node) =>
          node.scrollHeight > node.clientHeight + 100 &&
          getComputedStyle(node).overflowY === "auto",
      );
      return scroll?.scrollTop ?? -1;
    });
  const before = await position();
  expect(before).toBeGreaterThanOrEqual(0);
  await page.evaluate(() =>
    window.coachStreamFixture.send([
      { type: "text-delta", id: "coach-text-1", delta: "\n\n这是后续增量。" },
    ]),
  );
  await expect
    .poll(async () => Math.abs((await position()) - before))
    .toBeLessThan(5);
  await expect(latest).toBeVisible();
  await latest.click();
  await expect(page.getByText("这是后续增量。", { exact: true })).toBeVisible();
  await page.evaluate(() => window.coachStreamFixture.finish());
});

test("run timeline confirms questions and continues without duplicating prior output", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openCoachFixture(page);
  const startedAt = new Date().toISOString();
  const run = {
    runId: "run-fixture",
    attemptId: "attempt-1",
    messageId: "attempt-message-1",
    revision: 1,
    status: "running",
    startedAt,
    previousExecutionMs: 0,
    executionMs: 0,
  };
  const interaction = {
    runId: run.runId,
    interactionId: "interaction-1",
    questionMessageId: run.messageId,
    questionToolCallId: "question-1",
    revision: 1,
    status: "pending",
  };
  const textbox = page.getByRole("textbox").first();
  await textbox.fill("帮我安排训练");
  // IME composition Enter must not submit.
  await textbox.dispatchEvent("compositionstart");
  await textbox.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
    keyCode: 229,
  });
  expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(0);
  await textbox.dispatchEvent("compositionend");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(1);
  await page.evaluate(
    ({ run, interaction }) =>
      window.coachStreamFixture.send([
        {
          type: "start",
          messageId: run.messageId,
          messageMetadata: {
            schemaVersion: 2,
            runId: run.runId,
            attemptId: run.attemptId,
          },
        },
        { type: "start-step" },
        { type: "data-coach-run", id: run.runId, data: run },
        {
          type: "data-coach-activity",
          id: "activity-1",
          data: {
            activityId: "activity-1",
            runId: run.runId,
            attemptId: run.attemptId,
            kind: "tool",
            toolName: "profile.zones",
            labelKey: "tool",
            status: "running",
            seq: 0,
            revision: 1,
            startedAt: run.startedAt,
          },
        },
        {
          type: "data-coach-activity",
          id: "activity-1",
          data: {
            activityId: "activity-1",
            runId: run.runId,
            attemptId: run.attemptId,
            kind: "tool",
            toolName: "profile.zones",
            labelKey: "tool",
            status: "completed",
            seq: 0,
            revision: 2,
            startedAt: run.startedAt,
            endedAt: run.startedAt,
          },
        },
        {
          type: "data-coach-tool",
          id: "question-1",
          data: {
            toolCallId: "question-1",
            name: "AskUserQuestion",
            input: {
              questions: [
                {
                  id: "goal",
                  header: "目标",
                  question: "这轮训练的主要目标是什么？",
                  options: [
                    {
                      value: "race",
                      label: "备战比赛",
                      description: "按比赛目标安排",
                    },
                    {
                      value: "health",
                      label: "保持健康",
                      description: "以恢复和规律运动为主",
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          type: "data-coach-interaction",
          id: interaction.interactionId,
          data: interaction,
        },
        {
          type: "data-coach-run",
          id: run.runId,
          data: {
            ...run,
            status: "awaiting_input",
            revision: 2,
            executionMs: 1200,
            endedAt: new Date().toISOString(),
            pendingInteractionId: interaction.interactionId,
          },
        },
      ]),
    { run, interaction },
  );
  await page.evaluate(() => window.coachStreamFixture.finish(null));
  await expect(
    page.getByRole("button", { name: "停止", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("读取阈值配置", { exact: true })).toHaveCount(1);
  const header = page
    .locator('[data-run-id="run-fixture"] button[aria-expanded]')
    .first();
  await header.click(); // A pending question remains visible even with history collapsed.
  await expect(
    page.getByRole("log").locator("[data-coach-question]"),
  ).toHaveCount(0);
  await expect(
    page.locator("[data-coach-question-dock] [data-coach-question]"),
  ).toBeVisible();
  await expect(page.getByText("这轮训练的主要目标是什么？")).toBeVisible();
  await page.getByRole("radio", { name: /备战比赛/ }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: /备战比赛/ })).toBeChecked();
  await page.screenshot({
    path: testInfo.outputPath("run-question-light.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(2);
  const request = await page.evaluate(() => window.coachStreamFixture.lastBody);
  expect(request.runCommand).toMatchObject({
    kind: "answer",
    runId: run.runId,
    interactionId: interaction.interactionId,
  });
  const submissionId = (request.runCommand as { submissionId: string })
    .submissionId;
  await page.evaluate(
    ({ run, interaction, submissionId }) =>
      window.coachStreamFixture.send([
        {
          type: "start",
          messageId: "attempt-message-2",
          messageMetadata: {
            schemaVersion: 2,
            runId: run.runId,
            attemptId: "attempt-2",
            parentAttemptId: run.attemptId,
          },
        },
        { type: "start-step" },
        {
          type: "data-coach-interaction",
          id: interaction.interactionId,
          data: {
            ...interaction,
            revision: 2,
            status: "resolved",
            submissionId,
            answers: { goal: "race" },
            notes: { goal: "" },
          },
        },
        {
          type: "data-coach-run",
          id: run.runId,
          data: {
            ...run,
            attemptId: "attempt-2",
            messageId: "attempt-message-2",
            revision: 1,
            previousExecutionMs: 1200,
          },
        },
        {
          type: "data-coach-text-segment",
          id: "text-2",
          data: {
            segmentId: "text-2",
            modelStepId: "model-2",
            textOrdinal: 0,
            placement: "answer",
          },
        },
        { type: "text-start", id: "text-2" },
        {
          type: "text-delta",
          id: "text-2",
          delta: "已根据比赛目标安排本周训练。",
        },
        {
          type: "data-coach-run",
          id: run.runId,
          data: {
            ...run,
            attemptId: "attempt-2",
            messageId: "attempt-message-2",
            status: "completed",
            revision: 2,
            previousExecutionMs: 1200,
            executionMs: 2400,
            endedAt: new Date().toISOString(),
          },
        },
      ]),
    { run, interaction, submissionId },
  );
  await page.evaluate(() => window.coachStreamFixture.finish("text-2"));
  await expect(page.locator('[data-run-id="run-fixture"]')).toHaveCount(1);
  await expect(
    page.getByText("已根据比赛目标安排本周训练。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.locator("[data-coach-question-dock]")).toBeHidden();
  await expect(header).toHaveAttribute("aria-expanded", "false"); // manual choice survives updates
  await header.click();
  await expect(
    page.locator("summary").filter({ hasText: "已确认" }),
  ).toBeVisible();
  await expect(page.getByText("读取阈值配置", { exact: true })).toHaveCount(1);
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  });
  await page.screenshot({
    path: testInfo.outputPath("run-receipt-dark.png"),
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("live text renders before SSE finish and survives the next turn without reload", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const historyReads = await openCoachFixture(page);
  const initialHistoryReads = historyReads();
  const text = "嗨！这段回复现在应该逐字显示，结束以后也不会消失。";

  for (let turn = 1; turn <= 2; turn += 1) {
    const reply = `第${turn}轮：${text}`;
    await page.getByRole("textbox").fill(`测试第${turn}轮`);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
      .toBe(turn);
    await page.evaluate(() =>
      window.coachStreamFixture.send([
        {
          type: "data-coach-status",
          id: "coach-status-current",
          data: { status: "model", progress: "thinking" },
        },
        { type: "text-start", id: "coach-text-1" },
      ]),
    );
    await expect(
      page.getByRole("button", { name: "停止", exact: true }),
    ).toBeVisible();
    await page.evaluate(
      (delta) =>
        window.coachStreamFixture.send([
          { type: "text-delta", id: "coach-text-1", delta },
        ]),
      reply,
    );
    // No finish and no persisted assistant row: only the live SSE can show this.
    await expect(page.getByText(reply, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "停止", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`streaming-${turn}.png`),
    });
    await page.evaluate(() => window.coachStreamFixture.finish());
    await expect(
      page.getByRole("button", { name: "停止", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(reply, { exact: true })).toBeVisible();
  }
  expect(historyReads()).toBe(initialHistoryReads);
  expect(errors).toEqual([]);
});

test("metric history charts render from SSE with units, tooltips and body measurements", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openCoachFixture(page);
  // These are deliberately simulated histories, not the signed-in athlete's data.
  const dates = [
    "2026-08-28",
    "2026-09-01",
    "2026-09-05",
    "2026-09-09",
    "2026-09-13",
    "2026-09-17",
    "2026-09-21",
    "2026-09-26",
  ];
  const histories: {
    title: string;
    measure: "VO2_MAX" | "WEIGHT" | "HEIGHT";
    unit: "ml/kg/min" | "kg" | "cm";
    values: number[];
  }[] = [
    {
      title: "最近 30 天最大摄氧量",
      measure: "VO2_MAX",
      unit: "ml/kg/min",
      values: [43.2, 43.6, 44.1, 43.9, 44.6, 45.1, 45.3, 45.8],
    },
    {
      title: "最近 30 天体重",
      measure: "WEIGHT",
      unit: "kg",
      values: [74.2, 74.0, 74.3, 73.8, 73.5, 73.7, 73.3, 73.1],
    },
    {
      title: "最近 30 天身高",
      measure: "HEIGHT",
      unit: "cm",
      values: dates.map(() => 178),
    },
  ];
  for (const [index, history] of histories.entries()) {
    await page.getByRole("textbox").fill(`查看${history.title}变化图表`);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
      .toBe(index + 1);
    const value: TrainingVisualizationV1 = {
      kind: "training_visualization",
      schemaVersion: 1,
      title: history.title,
      subtitle: "模拟数据 · 仅用于展示效果",
      intent: "TREND",
      view: "LINE",
      x: { key: "label", type: "TIME" },
      series: [{ key: history.measure, unit: history.unit }],
      rows: dates.map((date, i) => ({
        key: date,
        label: date,
        values: { [history.measure]: history.values[i] },
      })),
      summary: { [history.measure]: history.values.at(-1)! },
      provenance: {
        source: "METRICS",
        from: dates[0],
        to: dates.at(-1)!,
        timezone: "Asia/Shanghai",
        groupBy: "DAY",
        sportTypes: [],
        ...(history.measure === "VO2_MAX"
          ? { metricSource: "ESTIMATED" as const }
          : {}),
        complete: true,
        truncated: false,
        coverage: { [history.measure]: 8 / 30 },
        fingerprint: `simulated-${history.measure}`,
      },
    };
    await page.evaluate(
      ({ value, index }) => {
        window.coachStreamFixture.send([
          {
            type: "data-coach-tool",
            id: `chart-${index}`,
            data: {
              toolCallId: `chart-${index}`,
              name: "TrainingVisualization",
              input: value,
            },
          },
          { type: "text-start", id: "coach-text-1" },
          {
            type: "text-delta",
            id: "coach-text-1",
            delta:
              "以上为模拟历史记录，图表展示真实记录点，未记录的日期不补零。",
          },
        ]);
        window.coachStreamFixture.finish();
      },
      { value, index },
    );
    await expect(
      page.getByRole("button", { name: "停止", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("[data-chart]")).toHaveCount(0);
    await page.getByRole("button", { name: `${history.title} · 查看图表`, exact: true }).click();
    const chart = page.getByRole("tabpanel", { name: history.title }).locator("[data-chart]");
    await chart.scrollIntoViewIfNeeded();
    await expect(chart.locator(".recharts-line-curve")).toHaveCount(1);
    // Wait for real chart animation to settle before capturing the visual.
    await page.waitForTimeout(1100);
    await chart.hover({ position: { x: 100, y: 75 }, force: true });
    await expect(chart.locator(".recharts-tooltip-wrapper")).toContainText(
      history.unit,
    );
    await page.screenshot({
      path: testInfo.outputPath(`metric-${history.measure}-light.png`),
    });
    if (history.measure === "WEIGHT") {
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.screenshot({
        path: testInfo.outputPath("metric-WEIGHT-dark.png"),
      });
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark"),
      );
    }
    await page.getByRole("button", { name: /关闭.*预览/ }).click();
  }
  expect(errors).toEqual([]);
});

test("exploration charts stream in order with numeric axes, tooltips, pagination and dark mode", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Keep fixed app chrome outside tall card screenshots without changing width.
  await page.setViewportSize({
    width: page.viewportSize()!.width,
    height: 1200,
  });
  await openCoachFixture(page);
  const values = explorationFixtures();
  for (const [index, value] of values.entries()) {
    await page.getByRole("textbox").fill(value.title);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
      .toBe(index + 1);
    await page.evaluate(
      ({ value, index }) => {
        window.coachStreamFixture.send([
          { type: "text-start", id: "coach-text-1" },
          {
            type: "text-delta",
            id: "coach-text-1",
            delta: "下面是模拟数据图表。",
          },
          {
            type: "data-coach-tool",
            id: `explore-${index}`,
            data: {
              toolCallId: `explore-${index}`,
              name: "TrainingVisualization",
              input: value,
            },
          },
        ]);
        window.coachStreamFixture.finish();
      },
      { value, index },
    );
    await expect(
      page.getByRole("button", { name: "停止", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByTestId("exploration-plot")).toHaveCount(0);
    await page.getByRole("button", { name: `${value.title} · 查看图表`, exact: true }).last().click();
    const card = page.getByRole("tabpanel", { name: value.title }).getByTestId("training-exploration-card");
    await expect(card).toBeVisible();
    const plot = card.getByTestId("exploration-plot").first();
    const svg = plot.getByRole("img");
    await svg.scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await svg.focus();
    await svg.press("ArrowRight");
    await expect(plot.getByRole("tooltip")).toBeVisible();
    await expect(plot.getByRole("tooltip")).toContainText(
      value.panels[0].y.unit!,
    );
    await svg.evaluate((node) => node.blur());
    await card
      .locator("..")
      .locator("..")
      .screenshot({
        path: testInfo.outputPath(`exploration-${index + 1}-light.png`),
      });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await card
      .locator("..")
      .locator("..")
      .screenshot({
        path: testInfo.outputPath(`exploration-${index + 1}-dark.png`),
      });
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );
    await svg.press("Escape");
    const details = card.locator("details").first();
    await details.locator("summary").click();
    await expect(details.locator("tbody tr")).toHaveCount(
      Math.min(
        20,
        value.panels[0].series.reduce((n, s) => n + s.points.length, 0),
      ),
    );
    if (index === 0) {
      await details.getByRole("button", { name: "下一页" }).click();
      await expect(details).toContainText("2 / 3");
    }
    await details.locator("summary").click();
    if (index === 0 || index === 6) {
      await card.getByRole("button", { name: "叠加展示", exact: true }).click();
      await expect(card.getByTestId("exploration-plot")).toHaveCount(1);
      await expect(card.getByRole("img")).toHaveCSS("opacity", "1");
      await card
        .locator("..")
        .locator("..")
        .screenshot({
          path: testInfo.outputPath(
            `exploration-${index === 0 ? "dual" : "multi"}-overview.png`,
          ),
        });
      await card.getByRole("img").focus();
      await card.getByRole("img").press("ArrowRight");
      await expect(card.getByRole("tooltip")).toContainText("bpm");
      await expect(card.getByRole("tooltip")).toContainText("min/km");
      if (index === 6)
        await expect(card.getByRole("tooltip")).toContainText("海拔");
      await card.getByRole("img").evaluate((node) => node.blur());
      await card
        .locator("..")
        .locator("..")
        .screenshot({
          path: testInfo.outputPath(
            `exploration-${index === 0 ? "dual" : "multi"}-light.png`,
          ),
        });
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await card.getByRole("img").evaluate((node) => node.blur());
      await card
        .locator("..")
        .locator("..")
        .screenshot({
          path: testInfo.outputPath(
            `exploration-${index === 0 ? "dual" : "multi"}-dark.png`,
          ),
        });
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark"),
      );
      await card.getByRole("button", { name: "分开展示", exact: true }).click();
      await expect(card.getByTestId("exploration-plot")).toHaveCount(
        index === 0 ? 2 : 3,
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: /关闭.*预览/ }).click();
  }
  expect(errors).toEqual([]);
});
