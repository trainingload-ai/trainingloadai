import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openCoachFixture } from "./fixtures/coach-page";
const output =
  process.env.COACH_FACT_SCREENSHOT_DIR || "/private/tmp/coach-fact-client-zh";
const headline = "先核对这次跑步对应的课程";
const summary =
  "今早的 5 公里跑步，与「轻松跑」和「有氧耐力跑」两节课程都比较接近，目前还没有自动关联。请打开这次活动，选择实际完成的课程；如果这是额外加练，也可以保持未关联。昨晚的睡眠记录仍在更新，我会等数据补齐后再一起判断下一节课的安排。";
const sid = "fact-guidance-fixture";
async function home(
  page: Page,
  mode: "normal" | "failure" | "expiry" = "normal",
  fresh = false,
) {
  await openCoachFixture(
    page,
    fresh
      ? []
      : [
          {
            id: "coach-explanation",
            role: "assistant",
            content:
              "这次跑步有两节相近的候选课，我没有替你选择。你可以到活动详情中的课程关联处，选择实际完成的那一节；如果只是额外加练，保持未关联即可。睡眠记录还在更新，暂时不把 3 小时当作整晚结果。",
            createdAt: "2026-11-18T00:00:00Z",
          },
        ],
    {
      navigate: false,
      sessions: [
        {
          id: sid,
          title: "核对今日训练",
          updatedAt: "2026-11-18T00:00:00Z",
          pinnedAt: null,
        },
      ],
    },
  );
  let requests = 0,
    contexts = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^\/api\/proxy/,
      "",
    );
    if (path === "/api/v2/home")
      return route.fulfill({
        json: {
          activePlan: null,
          recentActivity: {
            id: "42",
            hashId: "morning-run",
            title: "晨间轻松跑",
            sportType: "RUN",
            startTime: "2026-11-18T00:10:00Z",
            duration: 1800,
            distance: 5000,
            status: "READY",
          },
          fitnessStatus: { ctl: 30, atl: 32, tsb: -2 },
          pmcExtremes: null,
          profile: { timezone: "Asia/Shanghai" },
          weather: { status: "unavailable" },
          aiTodaySuggestion: null,
        },
      });
    if (path === "/ai/today-suggestion") {
      requests++;
      if (mode === "failure")
        return route.fulfill({
          status: 503,
          json: { message: "Fixture unavailable" },
        });
      return route.fulfill({
        json: {
          data: {
            version: 2,
            suggestionId: "advice-current",
            headline:
              mode === "expiry" && requests > 1
                ? "根据最新事实更新建议"
                : headline,
            summary,
            recommendation: { kind: "REVIEW_ACTIVITY" },
            confidence: "MEDIUM",
            evidence: [],
            primaryIntent: {
              type: "OPEN_ACTIVITY_REVIEW",
              label: "核对活动关联",
              activityId: "morning-run",
            },
            secondaryIntents: [
              {
                type: "ASK_COACH",
                label: "和教练聊聊",
                starterCode: "today-context",
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
            tags: [],
            shouldRefresh: false,
            generatedAt: new Date().toISOString(),
          },
        },
      });
    }
    if (path === "/ai/today-suggestion/advice-current/context") {
      contexts++;
      return route.fulfill({
        json: {
          data: {
            status: "CURRENT",
            sessionId: sid,
            resumeExisting: !fresh,
            context: {
              kind: "today_suggestion_context",
              version: 2,
              suggestionId: "advice-current",
              date: "2026-11-18",
              headline,
              summary,
              currentFacts: {
                topic: "workout-match:morning-run",
                activityId: "morning-run",
                date: "2026-11-18",
              },
            },
          },
        },
      });
    }
    if (/\/ai\/today-suggestion\/.*\/interactions$/.test(path))
      return route.fulfill({ json: { data: {} } });
    return route.fallback();
  });
  await page.goto("/zh");
  await page.addStyleTag({
    content: ".tsqd-parent-container,nextjs-portal{display:none!important}",
  });
  return { requests: () => requests, contexts: () => contexts };
}
for (const width of [1440, 390])
  for (const theme of ["light", "dark"] as const)
    test(`Chinese description and full homepage ${width} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      await home(page);
      const advice = page.getByTestId("today-advice");
      await expect(advice.getByText(summary, { exact: true })).toBeVisible();
      await expect(advice).toHaveCount(1);
      expect(
        await advice.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
      ).toBe(true);
      mkdirSync(output, { recursive: true });
      await page.screenshot({
        path: `${output}/home-${width}-${theme}.png`,
        fullPage: true,
      });
      await advice.screenshot({
        path: `${output}/description-${width}-${theme}.png`,
      });
      await advice.getByRole("button", { name: "核对活动关联" }).click();
      await expect(page).toHaveURL(/\/zh\/activities\/morning-run$/);
    });
test("saved discussion opens without browser storage or a duplicate prompt", async ({
  page,
}) => {
  const state = await home(page);
  await expect(page.getByTestId("today-advice")).toBeVisible();
  await page.evaluate(() => sessionStorage.clear());
  await page.getByRole("link", { name: "问教练", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`sid=${sid}`));
  await expect(
    page.getByText(/这次跑步有两节相近的候选课，我没有替你选择/),
  ).toBeVisible();
  expect(state.contexts()).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(0);
  await page.addStyleTag({
    content: ".tsqd-parent-container,nextjs-portal{display:none!important}",
  });
  await page.screenshot({
    path: `${output}/coach-resumed-zh.png`,
    fullPage: true,
  });
});
test("description reflows at 320px and 200 percent text size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await home(page);
  await page.addStyleTag({ content: "html{font-size:200%}" });
  const advice = page.getByTestId("today-advice");
  await expect(advice.getByText(summary, { exact: true })).toBeVisible();
  expect(
    await advice.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  expect((await advice.boundingBox())!.width).toBeGreaterThan(260);
  await page.screenshot({
    path: `${output}/description-320-200pct.png`,
    fullPage: false,
  });
});
test("expiry refreshes from backend without a click", async ({ page }) => {
  await home(page, "expiry");
  await expect(
    page.getByText("根据最新事实更新建议", { exact: true }),
  ).toBeVisible();
});
test("backend failure displays the Chinese failure state", async ({ page }) => {
  await home(page, "failure");
  await expect(page.getByText(/今日建议暂时无法加载/)).toBeVisible();
  await expect(page.getByText(summary, { exact: true })).toHaveCount(0);
});

test("first entry keeps its empty server session and sends exactly one reference-only seed", async ({
  page,
}) => {
  let deletes = 0;
  page.on("request", (request) => {
    if (
      request.method() === "DELETE" &&
      request.url().includes("/coach/sessions/")
    )
      deletes++;
  });
  await home(page, "normal", true);
  await expect(page.getByTestId("today-advice")).toBeVisible();
  await page.getByRole("link", { name: "问教练", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(1);
  expect(deletes).toBe(0);
  expect(
    await page.evaluate(() =>
      JSON.stringify(window.coachStreamFixture.lastBody),
    ),
  ).toContain("advice-current");
  expect(
    await page.evaluate(() =>
      JSON.stringify(window.coachStreamFixture.lastBody),
    ),
  ).not.toContain("昨晚的睡眠记录仍在更新");
  await page.evaluate(() => {
    window.coachStreamFixture.send([
      { type: "start", messageId: "fresh-coach" },
      { type: "start-step" },
      { type: "text-start", id: "coach-text-1" },
      {
        type: "text-delta",
        id: "coach-text-1",
        delta:
          "这次活动有两节接近的候选课。请到活动详情核对实际完成的课程，额外加练可以保持未关联。",
      },
    ]);
    window.coachStreamFixture.finish();
  });
  await expect(
    page.getByText(
      "这次活动有两节接近的候选课。请到活动详情核对实际完成的课程，额外加练可以保持未关联。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`sid=${sid}`));
  expect(deletes).toBe(0);
  await page.screenshot({
    path: `${output}/coach-first-entry-zh.png`,
    fullPage: true,
  });
});
test("a cancelled factual question is visibly inactive rather than marked as a user skip", async ({
  page,
}) => {
  const run = {
    runId: "cancelled-run",
    attemptId: "cancelled-attempt",
    messageId: "cancelled-message",
    revision: 2,
    status: "cancelled",
    startedAt: "2026-11-18T01:00:00Z",
    endedAt: "2026-11-18T01:00:10Z",
    previousExecutionMs: 0,
    executionMs: 100,
    retryBlocked: true,
  };
  const interaction = {
    runId: run.runId,
    interactionId: "cancelled-question",
    questionMessageId: run.messageId,
    questionToolCallId: "sleep-question",
    revision: 2,
    status: "cancelled",
  };
  await openCoachFixture(
    page,
    [
      {
        id: run.messageId,
        role: "assistant",
        content: "",
        createdAt: run.startedAt,
        message: {
          kind: "ui_message",
          version: 2,
          metadata: {
            schemaVersion: 2,
            runId: run.runId,
            attemptId: run.attemptId,
          },
          id: run.messageId,
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "睡眠记录已经更新，之前的问题停止接收回答。我们会结合最新记录继续判断。",
            },
            { type: "data-coach-run", id: run.runId, data: run },
            {
              type: "data-coach-tool",
              id: "sleep-question",
              data: {
                toolCallId: "sleep-question",
                name: "AskUserQuestion",
                input: {
                  questions: [
                    {
                      id: "sleep",
                      header: "睡眠",
                      question: "这 3 小时是否是整晚睡眠？",
                      options: [
                        { value: "yes", label: "是", description: "已经起床" },
                        {
                          value: "no",
                          label: "还在睡",
                          description: "记录尚未完整",
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
          ],
        },
      },
    ],
    {
      readyText:
        "睡眠记录已经更新，之前的问题停止接收回答。我们会结合最新记录继续判断。",
    },
  );
  const header = page
    .locator('[data-run-id="cancelled-run"] button[aria-expanded]')
    .first();
  await header.click();
  await expect(
    page.getByText("此问题已停止接收回答。", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `${output}/coach-question-cancelled-zh.png`,
    fullPage: true,
  });
});
