import { expect, test, type Page } from "@playwright/test";
import type { CalendarAdjustment, PlanCalendarEditsInput, PlanCalendarMovePreview } from "@trainingloadai/shared/plan-proposal";
import { openCoachFixture } from "./fixtures/coach-page";

test.use({ timezoneId: "Asia/Shanghai" });

const from = "2026-11-22";
const to = "2026-11-24";
const today = "2026-11-20";
const yesterday = "2026-11-19";
const coachingDate = "2026-11-26";
const workoutId = "calendar-workout";
const planId = "calendar-plan";
const previewId = "calendar-preview";
const createdAt = "2026-11-20T10:00:00+08:00";
const enduranceStructure = {
  kind: "ENDURANCE",
  version: 1,
  blocks: [
    {
      type: "work",
      steps: [
        { duration: 300, stepKind: "WARMUP" },
        { duration: 1200, stepKind: "WORK" },
        { duration: 300, stepKind: "COOLDOWN" },
      ],
    },
  ],
} as const;
const workout = {
  id: workoutId,
  planId,
  revision: 4,
  dayOffset: 6,
  weekIndex: 1,
  dayIndex: 7,
  sessionIndex: 1,
  scheduledDate: from,
  name: "周末轻松跑",
  text: "30m easy",
  sportType: "RUN",
  status: "PLANNED",
  structureKind: "ENDURANCE",
  dslVersion: 1,
  structure: enduranceStructure,
  summary: {
    kind: "ENDURANCE",
    durationSeconds: 1800,
    stepCount: 3,
    hardSession: false,
  },
  estimatedLoad: 24,
  capabilities: { postpone: true, skip: true, delete: true },
};
const totals = {
  sessions: 1,
  trainingDays: 1,
  durationMinutes: 30,
  estimatedLoad: 24,
};
const emptyTotals = {
  sessions: 0,
  trainingDays: 0,
  durationMinutes: 0,
  estimatedLoad: 0,
};
const move: PlanCalendarMovePreview = {
  previewId,
  state: "PENDING",
  expiresAt: "2026-11-21T10:00:00+08:00",
  receipt: null,
  impact: {
    workoutId,
    from,
    to,
    reasons: ["WEEKLY_DISTRIBUTION_CHANGED"],
    weeks: [
      { weekStart: "2026-11-16", before: totals, after: emptyTotals },
      { weekStart: "2026-11-23", before: emptyTotals, after: totals },
    ],
  },
  presentation: {
    title: "移动轻松跑",
    summary: "移动一节轻松跑",
    mode: "SCHEDULE",
    rows: [
      {
        workoutId,
        beforeScheduledDate: from,
        name: workout.name,
        sportType: "RUN",
        disposition: "APPLY",
        changeKind: "CHANGED",
        scheduledDate: to,
        before: workout.text,
        after: workout.text,
        rationale: "",
      },
    ],
    counts: { total: 1, changed: 1, preserved: 0, skipped: 0, protected: 0 },
    facts: [],
    warnings: [],
    syncImpact: "",
  },
};

async function mockCalendarAdjustment(
  page: Page,
  onSave: (input: PlanCalendarEditsInput) => void,
  onConfirm: () => void,
  initial?: CalendarAdjustment,
) {
  let current = initial;
  await page.route(`**/plans/${planId}/calendar-adjustments/*`, (route) => {
    if (route.request().method() === "GET") {
      return current
        ? route.fulfill({ json: { data: current } })
        : route.fulfill({ status: 404, json: { message: "No adjustment" } });
    }
    if (route.request().method() !== "PUT") return route.fallback();
    const { versionId, edits } = route.request().postDataJSON();
    onSave({ batchId: versionId, edits });
    const first = edits.find((item: { workoutId?: string }) => item.workoutId === workoutId);
    const presentation = current?.presentation ?? move.presentation;
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    current = {
      id, planId, versionId, currentVersionId: versionId,
      state: "READY", isVersioned: true, expiresAt: move.expiresAt,
      conflicts: [], operationKeys: [workoutId], receipt: null,
      presentation: {
        ...presentation,
        rows: first ? presentation.rows.map((row) => row.workoutId === workoutId
          ? { ...row, scheduledDate: first.targetDate, name: first.workout?.name ?? row.name }
          : row) : presentation.rows,
      },
    };
    return route.fulfill({ json: { data: current } });
  });
  await page.route(`**/plans/${planId}/calendar-adjustments/*/versions/*/confirm`, (route) => {
    onConfirm();
    const receipt = {
      planId, versionId: current!.versionId, readbackVerified: true as const,
      changedWorkoutCount: 1, addedWorkoutCount: 0, deletedWorkoutCount: 0,
    };
    current = { ...current!, state: "APPLIED", receipt };
    return route.fulfill({ json: { data: receipt } });
  });
}

async function openCalendar(
  page: Page,
  withCoach: boolean,
  sourceDate = from,
  waitForPreview?: Promise<void>,
  additionalWorkout?: { id: string; scheduledDate: string; status?: string; name?: string },
) {
  const rows: Array<Record<string, unknown>> = [];
  const rejectedDecisionIds: string[] = [];
  let currentDate = sourceDate;
  let currentName = workout.name;
  let receipt: PlanCalendarMovePreview["receipt"] = null;
  let confirms = 0;
  let previewBody: unknown;
  const applyMove = (name = workout.name) => {
    currentDate = to;
    currentName = name;
    receipt = {
      planId,
      previewId,
      readbackVerified: true,
      identityMap: [{ workoutId, scheduledDate: to, revision: 5 }],
    };
    return receipt;
  };
  await page.clock.setFixedTime(new Date(createdAt));
  await openCoachFixture(page, rows, {
    navigate: false,
    membershipPlan: withCoach ? "PLUS" : "FREE",
  });
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^\/api\/proxy/,
      "",
    );
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path === "/api/access/features")
      return route.fulfill({
        json: {
          schemaVersion: 1,
          features: {
            "ai.coach": { allowed: withCoach },
            "ai.planAdvice": { allowed: withCoach },
          },
        },
      });
    if (path === "/plans/active") return reply(null);
    if (path === "/activities") {
      const activities = withCoach
        ? [
            {
              id: 1,
              hashId: "calendar-recorded-run",
              activityName: "已记录跑步",
              sportType: "RUN",
              startTime: createdAt,
            },
          ]
        : [];
      return reply({ activities, total: activities.length });
    }
    if (path === "/competition-events") return reply({ events: [] });
    if (path === "/workout/parse-definition") {
      return reply({
        definition: {
          kind: "ENDURANCE",
          version: 1,
          text: workout.text,
          structure: workout.structure,
          summary: workout.summary,
          warnings: [],
        },
      });
    }
    const rejection = /^\/ai\/coach\/decisions\/([^/]+)\/reject$/.exec(path);
    if (rejection) {
      rejectedDecisionIds.push(rejection[1]);
      for (const row of rows) {
        const message = row.message as
          | {
              parts?: Array<{
                data?: { input?: { decisionId?: string; state?: string } };
              }>;
            }
          | undefined;
        for (const part of message?.parts ?? []) {
          if (part.data?.input?.decisionId === rejection[1])
            part.data.input.state = "REJECTED";
        }
      }
      return reply({ decision: { id: rejection[1], state: "REJECTED" } });
    }
    if (path === "/plans/scheduled-workouts")
      return reply({
        inPlan: [
          {
            ...workout,
            capabilities: undefined,
            name: currentName,
            revision: receipt ? 5 : workout.revision,
            scheduledDate: currentDate,
          },
          ...(additionalWorkout ? [{ ...workout, ...additionalWorkout }] : []),
        ],
        independent: [],
      });
    if (path === `/plans/${planId}/workouts/${workoutId}`)
      return reply({
        workout: {
          ...workout,
          name: currentName,
          revision: receipt ? 5 : workout.revision,
          scheduledDate: currentDate,
          capabilities: { postpone: true, skip: true, delete: true },
        },
      });
    if (path === `/plans/${planId}/workouts/${workoutId}/calendar-move`) {
      previewBody = route.request().postDataJSON();
      await waitForPreview;
      return reply(move);
    }
    const previewPath = `/plans/${planId}/calendar-moves/${previewId}`;
    if (path === previewPath) {
      return reply(
        route.request().method() === "DELETE"
          ? { ...move, state: "CANCELLED" }
          : receipt
            ? { ...move, state: "APPLIED", receipt }
            : move,
      );
    }
    if (path === `${previewPath}/coach`) {
      return reply({
        sid: "calendar-move:calendar-preview",
        planId,
        previewId,
        impact: move.impact,
        range: { from, to: "2026-11-29" },
      });
    }
    if (path === `${previewPath}/confirm`) {
      confirms += 1;
      return reply(applyMove());
    }
    return route.fallback();
  });
  await page.goto("/zh/calendar");
  await page.addStyleTag({
    content:
      ".tsqd-parent-container, nextjs-portal { display: none !important; }",
  });
  return {
    applyMove,
    rows,
    rejectedDecisionIds,
    confirms: () => confirms,
    previewBody: () => previewBody,
  };
}

function cardOn(page: Page, date: string) {
  return page.locator(
    `[data-calendar-date="${date}"] [data-calendar-workout="${workoutId}"]`,
  );
}

async function openPublishedCalendarThread(page: Page, sid: string, title: string, answer: string) {
  await page.clock.setFixedTime(new Date(createdAt));
  await openCoachFixture(page, [
    { id: "request", role: "user", content: "我能看下日历吗？", createdAt },
    {
      id: "reply", role: "assistant", content: answer, createdAt,
      message: {
        kind: "ui_message", version: 2, role: "assistant", providerReplay: false,
        parts: [
          { type: "data-coach-tool", id: "plan-calendar", data: {
            toolCallId: "plan-calendar", name: "PlanCalendarView",
            input: { planId, title, initialDate: from },
          } },
          { type: "text", text: answer },
        ],
      },
    },
  ], { navigate: false, sessions: [{ id: sid, title, updatedAt: createdAt, pinnedAt: null }] });
}

test("coalesces narrow calendar moves across months using either side of the comparison", async ({ page }) => {
  test.setTimeout(60_000);
  const sid = "cross-month-calendar";
  const lastDate = "2026-12-02";
  let publishedDate = from;
  const submissions: PlanCalendarEditsInput[] = [];
  await page.setViewportSize({ width: 390, height: 820 });
  await openPublishedCalendarThread(page, sid, "训练课表", "这是你的训练课表。");
  await page.route("**/plans/scheduled-workouts*", (route) =>
    route.fulfill({ json: { data: { inPlan: [{ ...workout, scheduledDate: publishedDate }], independent: [] } } }),
  );
  await mockCalendarAdjustment(page, (input) => submissions.push(input), () => { publishedDate = lastDate; });
  await page.goto(`/zh/ai-coach?sid=${sid}`);
  await page.getByRole("button", { name: /查看日历/ }).click();
  const calendar = page.locator("[data-calendar-proposal]");
  const grid = calendar.locator("[data-calendar-date-grid]");
  const day = (date: string) => grid.locator(`button[data-calendar-date="${date}"]`);
  const handle = (id: string) => calendar.locator(`[data-calendar-draggable-workout="${id}"]`).getByRole("button", { name: "移动课程" });
  const marker = (date: string, side: "before" | "after") => day(date).locator(`[data-calendar-marker-change="${side}"]`);
  const startDrag = async (id: string) => {
    await handle(id).scrollIntoViewIfNeeded();
    const start = (await handle(id).boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 - 10, { steps: 3 });
    await expect(grid).toHaveAttribute("data-calendar-dragging", "");
  };
  const dropOn = async (date: string) => {
    const end = (await day(date).boundingBox())!;
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 });
    await expect(day(date).locator("..")).toHaveAttribute("data-workout-drop", "target");
    await page.mouse.up();
    await expect(grid).not.toHaveAttribute("data-calendar-dragging");
  };

  const background = await grid.evaluate((element) => getComputedStyle(element).backgroundColor);
  const workoutCard = calendar.locator(`[data-calendar-draggable-workout="${workoutId}"]`);
  const cardBox = (await workoutCard.locator("article").boundingBox())!;
  const rowBox = (await workoutCard.boundingBox())!;
  const gripBox = (await handle(workoutId).boundingBox())!;
  const chartBox = (await workoutCard.getByTestId("workout-mini-chart").boundingBox())!;
  expect(cardBox.width).toBeCloseTo(rowBox.width, 0);
  expect(gripBox.y - cardBox.y).toBeGreaterThanOrEqual(0);
  expect(gripBox.y - cardBox.y).toBeLessThan(8);
  const rightInset = cardBox.x + cardBox.width - (gripBox.x + gripBox.width);
  expect(rightInset).toBeGreaterThanOrEqual(0);
  expect(rightInset).toBeLessThan(8);
  expect(chartBox.x + chartBox.width).toBeLessThanOrEqual(gripBox.x);
  await startDrag(workoutId);
  await expect(grid).not.toHaveCSS("background-color", background);
  const blocked = day(yesterday).locator("..");
  await expect(blocked).toHaveAttribute("data-workout-drop", "blocked");
  await expect(day(from).locator("..")).toHaveAttribute("data-workout-drop", "blocked");
  const available = day(to).locator("..");
  await expect(available).toHaveAttribute("data-workout-drop", "available");
  const blockedColor = await blocked.evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect(available).not.toHaveCSS("background-color", blockedColor);
  await dropOn(to);
  await expect(marker(from, "before")).toBeVisible();
  await expect(marker(to, "after")).toBeVisible();

  await expect(handle(workoutId)).toBeVisible();
  await startDrag(`original:${workoutId}`);
  await expect(day(from).locator("..")).toHaveAttribute("data-workout-drop", "available");
  await expect(day(to).locator("..")).toHaveAttribute("data-workout-drop", "blocked");
  await dropOn(lastDate);
  await expect(calendar.getByRole("button", { name: "2026年12月" })).toBeVisible();
  await expect(marker(lastDate, "after")).toBeVisible();
  const comparison = calendar.locator('[data-calendar-comparison="after"]');
  await expect(comparison.getByRole("button", { name: /调整前.*11-22/ })).toBeVisible();
  await expect(comparison.getByRole("button", { name: /调整后.*12-02/ })).toBeVisible();
  await calendar.getByRole("button", { name: "上一月" }).click();
  await expect(day(to).locator("[data-calendar-marker]")).toHaveCount(0);
  await expect(marker(from, "before")).toBeVisible();
  expect(submissions).toHaveLength(0);
  await calendar.getByRole("button", { name: "核对计划变更" }).click();
  await calendar.getByRole("button", { name: "确认计划变更" }).click();
  await expect(calendar.getByRole("button", { name: "确认计划变更" })).toHaveCount(0);
  expect(submissions).toHaveLength(1);
  expect(submissions[0].edits).toEqual([
    { kind: "UPDATE", workoutId, expectedRevision: workout.revision, targetDate: lastDate },
  ]);
  await expect(marker(from, "before")).toHaveCount(0);
});

test("creates and edits workouts in the conversation pane before saving one draft", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openCalendar(page, true);
  const sid = "coach-workout-editor";
  const title = "持续跑步课表";
  const answer = "我们可以调整这周的安排。";
  await openPublishedCalendarThread(page, sid, title, answer);
  await page.route("**/plans/scheduled-workouts*", (route) =>
    route.fulfill({ json: { data: { inPlan: [workout], independent: [] } } }));
  await page.route("**/workout/parse-definition", (route) => route.fulfill({ json: { data: { definition: {
    kind: "ENDURANCE", version: 1, text: workout.text, structure: enduranceStructure, summary: workout.summary, warnings: [],
  } } } }));
  const submissions: PlanCalendarEditsInput[] = [];
  await mockCalendarAdjustment(page, (input) => submissions.push(input), () => {});
  await page.goto(`/zh/ai-coach?sid=${sid}`);
  await page.getByRole("button", { name: /查看日历/ }).click();
  const panel = page.getByRole("tabpanel");
  const calendar = panel.locator("[data-calendar-proposal]");
  await calendar.getByRole("button", { name: workout.name, exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "编辑训练" }).click();
  const editor = panel.getByRole("region", { name: workout.name });
  await expect(editor).toBeVisible();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await editor.getByRole("textbox").first().fill("修改后的训练");
  await editor.getByRole("button", { name: "加入草稿" }).click();
  await expect(editor).toHaveCount(0);
  await calendar.locator(`[data-calendar-date="${to}"]`).filter({ visible: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "添加训练" }).click();
  const create = panel.getByRole("region", { name: "创建训练" });
  await create.getByRole("textbox").first().fill("新建的训练");
  await create.getByRole("tab", { name: "规则输入" }).click();
  await create.getByRole("button", { name: "加入草稿" }).click();
  await expect(create).toHaveCount(0);
  expect(submissions).toEqual([]);
  await calendar.getByRole("button", { name: "核对计划变更" }).click();
  await expect.poll(() => submissions[0]?.edits).toMatchObject([
    { kind: "UPDATE", workoutId, expectedRevision: workout.revision, workout: { name: "修改后的训练" } },
    { kind: "ADD", targetDate: to, workout: { name: "新建的训练" } },
  ]);
});

test("creates and edits an independent workout without leaving the conversation", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openCalendar(page, true);
  const sid = "independent-workout-editor";
  const answer = "这节训练可以独立安排。";
  await openCoachFixture(page, [{ id: "answer", role: "assistant", content: answer, createdAt }], {
    navigate: false, sessions: [{ id: sid, title: "计划外训练", updatedAt: createdAt, pinnedAt: null }],
  });
  let independent: Record<string, unknown>[] = [];
  const requests: Array<{ idempotencyKey: string }> = [];
  await page.route("**/plans/scheduled-workouts*", (route) =>
    route.fulfill({ json: { data: { inPlan: [], independent } } }));
  await page.route("**/workout/parse-definition", (route) => route.fulfill({ json: { data: { definition: {
    kind: "ENDURANCE", version: 1, text: workout.text, structure: enduranceStructure, summary: workout.summary, warnings: [],
  } } } }));
  const independentId = "standalone-workout";
  await page.route("**/plans/workouts/independent", (route) => {
    const input = route.request().postDataJSON();
    requests.push(input);
    if (requests.length === 1) return route.fulfill({ status: 503, json: { message: "Temporary failure" } });
    independent = [{ ...workout, id: independentId, planId: null, name: input.name, scheduledDate: input.scheduledDate,
      capabilities: { ...workout.capabilities, edit: true } }];
    return route.fulfill({ json: { data: { workout: independent[0] } } });
  });
  const edits: unknown[] = [];
  await page.route(`**/plans/workouts/independent/${independentId}`, (route) => {
    const input = route.request().postDataJSON();
    edits.push(input);
    if (edits.length === 2) {
      independent = [{ ...independent[0], name: "另一窗口更新的独立课", revision: workout.revision + 2 }];
      return route.fulfill({ status: 409, json: { message: "Independent workout changed" } });
    }
    independent = [{ ...independent[0], name: input.name, scheduledDate: input.scheduledDate, revision: workout.revision + 1 }];
    return route.fulfill({ json: { data: { workout: independent[0] } } });
  });
  await page.goto(`/zh/ai-coach?sid=${sid}`);
  await page.getByRole("button", { name: "计划外", exact: true }).click();
  // HTTP self-host origins do not expose crypto.randomUUID.
  expect(await page.evaluate(() => {
    Reflect.deleteProperty(Crypto.prototype, "randomUUID");
    return "randomUUID" in crypto;
  })).toBe(false);
  const pane = page.getByRole("region", { name: "计划外", exact: true });
  await pane.getByRole("button", { name: "创建训练" }).click();
  const create = pane.getByRole("region", { name: "创建训练" });
  await expect(page.getByText(answer)).toBeVisible();
  await create.getByRole("textbox").first().fill("独立课");
  await create.getByRole("tab", { name: "规则输入" }).click();
  const save = create.getByRole("button", { name: "创建", exact: true });
  await save.click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(create.getByRole("alert")).toBeVisible();
  await expect(create.getByRole("textbox").first()).toHaveValue("独立课");
  await save.click();
  await expect(create).toHaveCount(0);
  expect(requests[0].idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(requests[1].idempotencyKey).toBe(requests[0].idempotencyKey);
  await expect(pane.getByText("独立课", { exact: true })).toBeVisible();
  const openEditor = pane.getByRole("button", { name: "编辑训练" });
  const editor = pane.getByRole("region", { name: "编辑训练" });
  const name = editor.getByRole("textbox", { name: "训练名称（可选）" });
  const saveEdit = editor.getByRole("button", { name: "保存训练" });
  await openEditor.click();
  await name.fill("取消的修改");
  await editor.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(pane.getByText("独立课", { exact: true })).toBeVisible();
  expect(edits).toHaveLength(0);

  await openEditor.click();
  await name.fill("已编辑的独立课");
  await editor.getByLabel(/^排期日期/).fill(to);
  await expect(name).toHaveValue("已编辑的独立课");
  await saveEdit.click();
  await expect(pane.getByText("已编辑的独立课", { exact: true })).toBeVisible();
  expect(edits[0]).toMatchObject({ name: "已编辑的独立课", scheduledDate: to, expectedRevision: workout.revision });

  await openEditor.click();
  await name.fill("另一窗口会抢先保存");
  await saveEdit.click();
  await pane.getByRole("button", { name: "刷新课表" }).click();
  await expect(pane.getByText("另一窗口更新的独立课", { exact: true })).toBeVisible();
  expect(edits).toHaveLength(2);
});

test("resumes a coach-generated independent workout after refreshing and confirms the saved version", async ({ page }) => {
  test.setTimeout(90_000);
  const sid = "independent-coach-draft";
  const id = "independent-draft-1";
  const messages = [{
    id: "reply", role: "assistant", content: "有一份训练草稿。", createdAt,
    message: {
      kind: "ui_message", version: 2, role: "assistant", providerReplay: false,
      parts: [{ type: "data-coach-tool", id: "workout-draft", data: {
        toolCallId: "workout-draft", name: "PresentIndependentWorkoutDraft", input: { draftId: id },
      } }],
    },
  }] as const;
  const definition = { kind: "ENDURANCE", version: 1, source: "STRUCTURE", structure: enduranceStructure };
  let draft = {
    id, revision: 1, state: "READY", workoutId: null as string | null,
    workout: { name: "教练生成的轻松跑", scheduledDate: from, sportType: "RUN", text: workout.text, definition },
  };
  const mutations: unknown[] = [];
  async function openDraftWindow(tab: Page, width: number) {
    await tab.setViewportSize({ width, height: 900 });
    await openCalendar(tab, true);
    await openCoachFixture(tab, [...messages], { navigate: false, sessions: [
      { id: sid, title: "计划外训练草稿", updatedAt: createdAt, pinnedAt: null },
    ] });
    await tab.route("**/workout/parse-definition", (route) =>
      route.fulfill({ json: { data: { definition: {
        ...definition, text: workout.text, summary: workout.summary, warnings: [],
      } } } }));
    await tab.route(`**/plans/workouts/independent-drafts/${id}`, (route) => {
      if (route.request().method() === "PUT") {
        const input = route.request().postDataJSON();
        mutations.push(input);
        if (input.action === "CONFIRM" && draft.state === "APPLIED" && input.expectedRevision + 1 === draft.revision) {
          return route.fulfill({ json: { data: draft } });
        }
        if (input.expectedRevision !== draft.revision) return route.fulfill({ status: 409 });
        draft = input.action === "SAVE"
          ? { ...draft, workout: { ...draft.workout, ...input.workout }, revision: draft.revision + 1 }
          : { ...draft, state: "APPLIED", workoutId: "confirmed-workout", revision: draft.revision + 1 };
      }
      return route.fulfill({ json: { data: draft } });
    });
    await tab.goto(`/zh/ai-coach?sid=${sid}`);
    const resume = tab.getByRole("button", { name: "继续编辑", exact: true });
    await resume.click();
    const pane = tab.getByRole("region", { name: "计划外", exact: true });
    await pane.getByRole("button", { name: "编辑训练" }).click();
    return { resume, pane, editor: pane.getByRole("region", { name: "编辑训练" }) };
  }
  const secondPage = await page.context().newPage();
  const first = await openDraftWindow(page, 1600);
  const second = await openDraftWindow(secondPage, 390);
  await first.editor.getByRole("textbox", { name: "训练名称（可选）" }).fill("保存后的轻松跑");
  await first.editor.getByRole("button", { name: "保存草稿" }).click();
  await expect(first.pane.getByRole("heading", { name: "保存后的轻松跑" })).toBeVisible();
  expect(mutations).toHaveLength(1);
  await second.editor.getByRole("textbox", { name: "训练名称（可选）" }).fill("旧窗口的编辑");
  await second.editor.getByRole("button", { name: "保存草稿" }).click();
  await second.pane.getByRole("button", { name: "刷新重试" }).click();
  await expect(second.pane.getByRole("heading", { name: "保存后的轻松跑" })).toBeVisible();

  await page.reload();
  await first.resume.click();
  await expect(first.pane.getByRole("heading", { name: "保存后的轻松跑" })).toBeVisible();
  const create = (pane: typeof first.pane) => pane.getByRole("button", { name: "创建", exact: true });
  await Promise.all([create(first.pane).click(), create(second.pane).click()]);
  await expect(first.pane.getByRole("status").filter({ hasText: "已生效" })).toBeVisible();
  await expect(second.pane.getByRole("status").filter({ hasText: "已生效" })).toBeVisible();
  expect(mutations.slice(2)).toEqual(Array.from({ length: 2 }, () => ({ action: "CONFIRM", expectedRevision: 2 })));
  expect(draft.revision).toBe(3);
});

test("stages several calendar edits in the conversation and saves them together", async ({ page }) => {
  test.setTimeout(60_000);
  const sid = "published-calendar-fixture";
  const title = "持续跑步课表";
  const answer = "这周有两次跑步。";
  const second = { ...workout, id: "same-day-workout", name: "同日加练", sessionIndex: 2 };
  const missed = { ...workout, id: "missed-workout", name: "错过的训练", scheduledDate: yesterday };
  const submissions: PlanCalendarEditsInput[] = [];
  let secondDate = from;
  let firstDate = from;
  await openPublishedCalendarThread(page, sid, title, answer);
  await page.route("**/api/access/features", (route) =>
    route.fulfill({ json: { schemaVersion: 1, features: { "ai.planAdvice": { allowed: false } } } }),
  );
  await page.route("**/plans/scheduled-workouts*", (route) =>
    route.fulfill({ json: { data: {
      inPlan: [missed, { ...workout, scheduledDate: firstDate }, { ...second, scheduledDate: secondDate }, { ...workout, id: "other-workout", planId: "other-plan", name: "另外一份计划的课" }],
      independent: [],
    } } }),
  );
  await page.route(`**/plans/${planId}/workouts/${workoutId}`, (route) =>
    route.fulfill({ json: { data: { workout } } }),
  );
  await mockCalendarAdjustment(page, (input) => submissions.push(input), () => {
    firstDate = coachingDate;
    secondDate = to;
  });
  const url = `/zh/ai-coach?sid=${sid}`;
  await page.goto(url);
  const card = page.getByRole("button", { name: /查看日历/ });
  const calendar = page.locator("[data-calendar-proposal]");
  await expect(card).toBeVisible();
  const answerBox = await page.getByText(answer, { exact: true }).boundingBox();
  expect((await card.boundingBox())!.y).toBeGreaterThan(answerBox!.y);
  await expect(calendar).toHaveCount(0);
  await card.press("Enter");
  await expect(page.getByRole("tab", { name: title })).toHaveAttribute("aria-selected", "true");
  await expect(calendar.getByRole("button", { name: workout.name })).toBeVisible();
  await expect(calendar.getByText("另外一份计划的课")).toHaveCount(0);
  await expect(calendar.getByRole("button", { name: missed.name })).toHaveClass(/amber-100/);
  await expect(page).toHaveURL(url);
  const secondCard = calendar.getByRole("button", { name: second.name, exact: true });
  const day = (date: string) => calendar.locator(`[data-calendar-date="${date}"]`).filter({ visible: true });
  const draftCard = (date: string, id: string, side: string) =>
    day(date).locator(`[data-calendar-workout="${id}"][data-calendar-change="${side}"]`);
  await secondCard.click({ button: "right" });
  await page.getByRole("menuitem", { name: "移动课程" }).click();
  const picker = page.getByRole("dialog", { name: "调整训练日期" });
  await expect(picker.getByText("选择这节课的新日期。")).toBeVisible();
  const months = picker.getByRole("grid");
  await expect(months).toHaveCount(2);
  const [november, december] = await Promise.all([months.nth(0).boundingBox(), months.nth(1).boundingBox()]);
  const pickerBounds = (await picker.boundingBox())!;
  expect(pickerBounds.x + pickerBounds.width / 2).toBeCloseTo(page.viewportSize()!.width / 2, 0);
  expect(december!.x).toBeGreaterThanOrEqual(november!.x + november!.width);
  expect(december!.y).toBeCloseTo(november!.y, 0);
  await picker.getByRole("button", { name: "关闭" }).click();
  await secondCard.click();
  const details = page.getByRole("dialog", { name: second.name });
  await details.locator('[data-slot="dialog-footer"]').getByRole("button", { name: "更多操作" }).click();
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["编辑训练", "移动课程", "删除"]);
  await page.getByRole("menuitem", { name: "移动课程" }).click();
  await expect(picker.getByRole("button", { name: /2026年11月19日/ })).toBeDisabled();
  await expect(picker.getByRole("button", { name: /2026年11月22日/ })).toBeDisabled();
  await picker.getByRole("button", { name: /2026年11月24日/ }).click();
  await expect(picker).toHaveCount(0);
  await expect(draftCard(from, `original:${second.id}`, "before")).toBeVisible();
  await expect(draftCard(to, second.id, "after")).toBeVisible();
  const before = draftCard(from, `original:${second.id}`, "before");
  const after = draftCard(to, second.id, "after");
  await expect(before).toHaveCSS("background-image", /repeating-linear-gradient/);
  const color = await before.evaluate((card) => getComputedStyle(card).getPropertyValue("--proposal-color").trim());
  expect(color).not.toBe("");
  await expect(after).toHaveCSS("--proposal-color", color);
  const beforeBackground = await before.evaluate((card) => getComputedStyle(card).backgroundColor);
  await expect(after).not.toHaveCSS("background-color", beforeBackground);
  await expect(after).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.getByRole("button", { name: "关闭预览" }).click();
  const keepEditing = page.getByRole("alertdialog", { name: "保存这次课表调整？" });
  await expect(keepEditing).toBeVisible();
  await keepEditing.getByRole("button", { name: "继续编辑" }).click();
  await expect(after).toBeVisible();

  await page.getByRole("tab", { name: `日历 ${title}`, exact: true }).press("Delete");
  await expect(calendar).toHaveCount(0);
  await expect(card).toBeFocused();
  expect(submissions).toHaveLength(0);
  await card.click();
  await expect(after).toBeVisible();

  await page.setViewportSize({ width: 390, height: 820 });
  await page.getByRole("button", { name: "日历", exact: true }).click();
  await day(yesterday).click();
  const missedMarker = day(yesterday).locator('[data-calendar-marker="workout"]');
  await expect(missedMarker).toHaveCSS("background-color", "rgb(245, 158, 11)");
  await expect(calendar.locator("[data-calendar-draggable-workout]")).toHaveCount(0);
  await day(from).click();
  const beforePair = calendar.locator('[data-calendar-comparison="before"]');
  await expect(beforePair.locator("article").first()).toHaveAttribute("data-calendar-change-side", "before");
  await expect(beforePair.getByText("计划负荷", { exact: true })).toHaveCount(0);
  const handle = beforePair.locator('[data-calendar-change-side="after"]').getByRole("button", { name: "移动课程" });
  const mouseDrag = async (target: string) => {
    await handle.scrollIntoViewIfNeeded();
    const start = (await handle.boundingBox())!;
    const end = (await day(target).boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 15 });
    await page.mouse.up();
  };
  await mouseDrag(yesterday);
  await expect(beforePair).toBeVisible();
  await mouseDrag(coachingDate);
  const afterPair = calendar.locator('[data-calendar-comparison="after"]');
  await expect(afterPair.locator("article").first()).toHaveAttribute("data-calendar-change-side", "after");
  await expect(afterPair.locator("article").last()).toHaveAttribute("data-calendar-change-side", "before");
  const afterHandle = afterPair.locator('[data-calendar-change-side="after"]').getByRole("button", { name: "移动课程" });
  await afterHandle.click();
  await expect(picker.getByRole("grid")).toHaveCount(1);
  await picker.getByRole("button", { name: "关闭" }).click();
  await expect(afterHandle).toBeFocused();
  await afterHandle.scrollIntoViewIfNeeded();
  const grip = (await afterHandle.boundingBox())!;
  const destination = (await day(to).boundingBox())!;
  const touch = await page.context().newCDPSession(page);
  await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await expect(afterHandle).toHaveCSS("touch-action", "none");
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  for (let step = 1; step <= 12; step += 1) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: start.x + (destination.x + destination.width / 2 - start.x) * step / 12,
        y: start.y + (destination.y + destination.height / 2 - start.y) * step / 12,
      }],
    });
  }
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await touch.detach();
  await expect(day(to)).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(draftCard(to, second.id, "after")).toBeVisible();
  await calendar.getByRole("button", { name: "取消", exact: true }).click();
  await expect(secondCard).toBeVisible();
  expect(submissions).toHaveLength(0);

  await secondCard.dragTo(day(to), { targetPosition: { x: 20, y: 22 } });
  await expect(draftCard(to, second.id, "after")).toBeVisible();
  await calendar.getByRole("button", { name: workout.name, exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "移动课程" }).click();
  await picker.getByRole("button", { name: /2026年11月26日/ }).click();
  await expect(draftCard(coachingDate, workoutId, "after")).toBeVisible();
  const confirm = calendar.getByRole("button", { name: "核对计划变更" });
  const confirmPosition = await confirm.boundingBox();
  const scroll = calendar.locator("[data-calendar-scroll]").filter({ visible: true });
  await scroll.hover();
  await page.mouse.wheel(0, 1100);
  await expect(calendar.getByRole("button", { name: /2026年12月/ })).toBeVisible();
  await expect(confirm).toBeInViewport();
  expect((await confirm.boundingBox())?.y).toBeCloseTo(confirmPosition!.y, 0);
  await page.mouse.wheel(0, -1100);
  await expect(calendar.getByRole("button", { name: /2026年11月/ })).toBeVisible();
  await expect(draftCard(from, `original:${workoutId}`, "before")).toBeVisible();
  await expect(draftCard(coachingDate, workoutId, "after")).toBeVisible();
  await expect(draftCard(coachingDate, workoutId, "after")).not.toHaveCSS("--proposal-color", color);
  expect(submissions).toHaveLength(0);
  await confirm.click();
  await expect.poll(() => submissions.length).toBe(1);
  await calendar.getByRole("button", { name: "确认计划变更" }).click();
  await expect(calendar.getByRole("button", { name: "确认计划变更" })).toHaveCount(0);
  expect(submissions).toHaveLength(1);
  expect(submissions[0].edits).toEqual([
    { kind: "UPDATE", workoutId: second.id, expectedRevision: second.revision, targetDate: to },
    { kind: "UPDATE", workoutId, expectedRevision: workout.revision, targetDate: coachingDate },
  ]);
  await expect(day(to).getByRole("button", { name: second.name })).toBeVisible();
  await expect(day(coachingDate).getByRole("button", { name: workout.name })).toBeVisible();
  await page.getByRole("button", { name: "关闭预览" }).click();
  await expect(calendar).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 820 });
  await card.click();
  await expect(calendar).toBeVisible();
  await expect(calendar.getByRole("button", { name: "添加训练" })).toBeVisible();
  const dayHeading = await calendar.getByText(/11月22日/).boundingBox();
  const addWorkout = await calendar.getByRole("button", { name: "添加训练" }).boundingBox();
  expect(Math.abs(addWorkout!.y - dayHeading!.y)).toBeLessThan(40);
  await expect(card).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(calendar.getByRole("button", { name: /2026年11月/ })).toBeVisible();
  await expect(calendar.getByRole("button", { name: missed.name })).toBeInViewport();
  expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(0);
});

for (const rollback of [false, true]) {
  test(rollback
    ? "rolls back the entire unsaved batch when one workout became immutable"
    : "explains a calendar conflict in the conversation pane and retries the staged edit", async ({ page }) => {
    const sid = "calendar-edit-conflict";
    const title = "训练课表";
    const answer = "这是你的训练课表。";
    const companion = { ...workout, id: "companion-edit", name: "草稿里的第二节训练" };
    let revision = workout.revision;
    let failReload = false;
    await page.clock.setFixedTime(new Date(createdAt));
    await openCoachFixture(page, [{
      id: "reply", role: "assistant", content: answer, createdAt,
      message: {
        kind: "ui_message", version: 2, role: "assistant", providerReplay: false,
        parts: [
          { type: "data-coach-tool", id: "calendar", data: {
            toolCallId: "calendar", name: "PlanCalendarView", input: { planId, title, initialDate: from },
          } },
          { type: "text", text: answer },
        ],
      },
    }], { navigate: false, sessions: [{ id: sid, title, updatedAt: createdAt, pinnedAt: null }] });
    await page.route("**/plans/scheduled-workouts*", (route) => failReload
      ? route.fulfill({ status: 503, json: { message: "Unavailable" } })
      : route.fulfill({ json: { data: {
          inPlan: [
            { ...workout, revision, name: revision === workout.revision ? workout.name : "更新后的课",
              status: rollback && revision !== workout.revision ? "DONE" : "PLANNED" },
            ...(rollback ? [companion] : []),
          ],
          independent: [],
        } } }));
    await page.route(`**/plans/${planId}/calendar-adjustments/*`, (route) => {
      revision = workout.revision + 1;
      return route.fulfill({ status: 409, json: { message: "Schedule changed" } });
    });
    await page.goto(`/zh/ai-coach?sid=${sid}`);
    await page.getByRole("button", { name: /查看日历/ }).click();
    const calendar = page.locator("[data-calendar-proposal]");
    await calendar.getByRole("button", { name: workout.name, exact: true })
      .dragTo(calendar.locator(`[data-calendar-date="${to}"]`).filter({ visible: true }));
    if (rollback) {
      await calendar.getByRole("button", { name: companion.name, exact: true })
        .dragTo(calendar.locator(`[data-calendar-date="${coachingDate}"]`).filter({ visible: true }));
    }
    const confirm = calendar.getByRole("button", { name: "核对计划变更" });
    await confirm.click();
    const overlay = calendar.getByRole("region", { name: "课表已变化" });
    await expect(overlay).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(overlay.getByText(/课表已变化或当前安排无法保存/)).toBeVisible();
    failReload = true;
    const reload = overlay.getByRole("button", { name: "刷新重试", exact: true });
    await expect(reload).toBeFocused();
    await reload.click();
    await expect(overlay.getByText("无法加载最新课表，请重试。")).toBeVisible();
    failReload = false;
    await reload.click();
    await expect(overlay).toHaveCount(0);
    if (rollback) {
      await expect(page.getByRole("status").filter({ hasText: "本次未保存的调课已整批撤回" }))
        .toContainText("更新后的课 · 训练状态已变化");
      await expect(calendar.locator('[data-calendar-change="after"]')).toHaveCount(0);
      await expect(confirm).toHaveCount(0);
    } else {
      await expect(calendar.locator('[data-calendar-change="after"]')).toContainText("更新后的课");
      await expect(confirm).toBeEnabled();
    }
  });
}

test("opens the coach dialog for an unrecoverable move and refreshes only when requested", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ planId, previewId }) => {
    localStorage.setItem("trainingload:calendar-move:fixture-user", JSON.stringify({ planId, previewId, coach: true }));
  }, { planId, previewId });
  await openCalendar(page, true);
  await page.route(`**/ai/coach/sessions/${encodeURIComponent(`calendar-move:${previewId}`)}/messages*`, (route) =>
    route.fulfill({ json: { data: [{ id: "old-request", content: "上次想把这节课改到周二", role: "user", createdAt }] } }));
  const writes: string[] = [];
  await page.route(`**/plans/${planId}/calendar-moves/${previewId}*`, (route) => {
    if (route.request().method() !== "GET") writes.push(route.request().method());
    return route.fulfill({ json: { data: { ...move, state: "EXPIRED", recoveryBlockedReason: "datesPassed" } } });
  });
  const resume = page.getByRole("button", { name: "继续上次调课" });
  await resume.click();
  const dialog = page.getByRole("dialog", { name: "对话" });
  await expect(dialog.getByText("上次想把这节课改到周二")).toBeVisible();
  await expect(dialog).toHaveCSS("opacity", "1");
  const calendar = dialog.locator("[data-calendar-proposal]");
  await expect(calendar.getByText("原日期或目标日期已经过去，无法继续这次调课。")).toBeVisible();
  const refresh = calendar.getByRole("button", { name: "刷新课表" });
  await expect(refresh).toBeEnabled();
  await expect(calendar.locator(":scope > [inert]")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 820 });
  await expect(refresh).toBeInViewport();
  let refreshes = 0;
  await page.route("**/plans/scheduled-workouts*", (route) => {
    refreshes += 1;
    return refreshes === 1
      ? route.fulfill({ status: 503, json: { message: "Temporary load error" } })
      : route.fulfill({ json: { data: { inPlan: [{ ...workout, name: "刷新后的周末轻松跑" }], independent: [] } } });
  });
  expect(refreshes).toBe(0);
  await refresh.click();
  await expect(calendar.getByText("无法加载最新课表，请重试。")).toBeVisible();
  await refresh.click();
  await expect(refresh).toHaveCount(0);
  await expect(calendar.getByRole("button", { name: /刷新后的周末轻松跑/ }).first()).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(resume).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "今天", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("trainingload:calendar-move:fixture-user"))).toBeNull();
  expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(0);
  expect(writes).toEqual([]);
});

test("reports the last invalid operation after confirmation conflicts and shows the current schedule", async ({ page }) => {
  await openCalendar(page, true);
  const draft: CalendarAdjustment = {
    id: previewId, planId, versionId: previewId, currentVersionId: previewId,
    state: "READY", isVersioned: true, expiresAt: move.expiresAt,
    presentation: move.presentation, conflicts: [], operationKeys: [workoutId], receipt: null,
  };
  let current = draft;
  let confirms = 0;
  await page.route("**/plans/active", (route) => route.fulfill({ json: { data: { plan: {
    id: planId, title: "持续跑步课表", status: "ACTIVE",
    startDate: "2026-11-16", endDate: "2026-12-31",
    currentWeekIndex: 1, currentDayIndex: 5, periodWeeks: 7, workouts: [],
  } } } }));
  await page.route(`**/plans/${planId}/calendar-adjustments`, (route) => route.fulfill({ json: { data: [current] } }));
  await page.route(`**/plans/${planId}/calendar-adjustments/${previewId}`, (route) => route.fulfill({ json: { data: current } }));
  await page.route(`**/plans/${planId}/calendar-adjustments/${previewId}/versions/${previewId}/confirm`, (route) => {
    confirms += 1;
    current = { ...draft, state: "INVALIDATED", conflicts: [{ key: workoutId, reason: "HISTORY" }], recoverableOperationKeys: [] };
    return route.fulfill({ status: 422, json: { message: "The calendar adjustment needs to be refreshed" } });
  });
  await page.reload();
  await page.getByRole("button", { name: today, exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "调整课表", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "调整课表" });
  await editor.getByRole("button", { name: /待确认/ }).click();
  await editor.getByRole("button", { name: "确认计划变更" }).click();
  await expect(editor.getByText("周末轻松跑 · 训练日期已过")).toBeVisible();
  await expect(editor.getByText("这份调课草稿已失效，未改动正式课表。你可以按当前课表重新调整。")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  const refresh = editor.getByRole("button", { name: "刷新课表", exact: true });
  await expect(refresh).toBeEnabled();
  await refresh.click();
  await expect(refresh).toHaveCount(0);
  await expect(editor.locator('[data-calendar-change="after"]')).toHaveCount(0);
  await editor.getByRole("button", { name: "新建调整" }).click();
  await expect(editor.getByText("周末轻松跑 · 训练日期已过")).toHaveCount(0);
  expect(confirms).toBe(1);
});

test("refreshes the eligible part of a mixed draft and waits for confirmation", async ({ page }) => {
  const otherId = "eligible-workout";
  await openCalendar(page, true, from, undefined, { id: otherId, scheduledDate: to, name: "可恢复的训练" });
  await page.route("**/plans/active", (route) => route.fulfill({ json: { data: { plan: {
    id: planId, title: "持续跑步课表", status: "ACTIVE",
    startDate: "2026-11-16", endDate: "2026-12-31", currentWeekIndex: 1, currentDayIndex: 5,
    periodWeeks: 7, workouts: [],
  } } } }));
  let draft: CalendarAdjustment = {
    id: previewId, planId, versionId: previewId, currentVersionId: previewId,
    state: "INVALIDATED", isVersioned: true, expiresAt: move.expiresAt,
    presentation: { ...move.presentation, rows: [...move.presentation.rows, {
      ...move.presentation.rows[0], workoutId: otherId, name: "可恢复的训练", scheduledDate: coachingDate,
    }] },
    conflicts: [{ key: workoutId, reason: "ACTIVITY_LINKED" }],
    operationKeys: [workoutId, otherId], recoverableOperationKeys: [otherId], receipt: null,
  };
  await page.route(`**/plans/${planId}/calendar-adjustments`, (route) => route.fulfill({ json: { data: [draft] } }));
  await page.route(`**/plans/${planId}/calendar-adjustments/${previewId}`, (route) => route.fulfill({ json: { data: draft } }));
  let rebaseRequests = 0;
  await page.route(`**/plans/${planId}/calendar-adjustments/${previewId}/rebase`, (route) => {
    const input = route.request().postDataJSON();
    expect(input).toMatchObject({ baseVersionId: previewId, operationKeys: [otherId] });
    rebaseRequests += 1;
    draft = { ...draft, versionId: input.versionId, currentVersionId: input.versionId, state: "READY", conflicts: [],
      presentation: { ...draft.presentation, rows: draft.presentation.rows.filter(({ workoutId }) => workoutId === otherId) },
      operationKeys: [otherId], recoverableOperationKeys: undefined };
    return route.fulfill({ json: { data: draft } });
  });
  await page.reload();
  await page.getByRole("button", { name: today, exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "调整课表", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "调整课表" });
  await editor.getByRole("button", { name: /已失效/ }).click();
  const overlay = editor.getByRole("region", { name: "已失效" });
  await expect(overlay.getByText("周末轻松跑 · 训练已关联活动")).toBeVisible();
  const refresh = overlay.getByRole("button", { name: "刷新重试" });
  const candidate = overlay.getByRole("checkbox", { name: "可恢复的训练" });
  await candidate.uncheck();
  await expect(refresh).toBeDisabled();
  expect(rebaseRequests).toBe(0);
  await candidate.check();
  await refresh.click();
  await expect(overlay).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "确认计划变更" })).toBeEnabled();
  expect(rebaseRequests).toBe(1);
});

test("saves a batch draft from the main calendar and resumes it from the same calendar", async ({ page }) => {
  await openCalendar(page, true);
  await page.route("**/plans/active", (route) => route.fulfill({ json: { data: { plan: {
    id: planId, title: "持续跑步课表", status: "ACTIVE",
    startDate: "2026-11-16", endDate: "2026-12-31",
    currentWeekIndex: 1, currentDayIndex: 5, periodWeeks: 7, workouts: [],
  } } } }));
  const requests: PlanCalendarEditsInput[] = [];
  let saved: CalendarAdjustment | undefined;
  let committed = false;
  await mockCalendarAdjustment(page, (input) => {
    requests.push(input);
    saved = {
      id: input.batchId, planId, versionId: input.batchId, currentVersionId: input.batchId,
      state: "READY", isVersioned: true, expiresAt: move.expiresAt,
      presentation: move.presentation, conflicts: [], operationKeys: [workoutId], receipt: null,
    };
  }, () => { committed = true; });
  await page.route(`**/plans/${planId}/calendar-adjustments`, (route) =>
    route.fulfill({ json: { data: saved && !committed ? [saved] : [] } }));
  await page.reload();
  await expect(page.getByRole("button", { name: "调整课表", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "订阅", exact: true })).toHaveCount(0);
  const openAdjustment = async () => {
    await page.getByRole("button", { name: today, exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "调整课表", exact: true }).click();
  };
  await openAdjustment();
  const calendar = page.locator("[data-calendar-proposal]");
  await calendar.getByRole("button", { name: workout.name, exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "移动课程" }).click();
  const picker = page.getByRole("dialog", { name: "调整训练日期" });
  await picker.getByRole("button", { name: /2026年11月24日/ }).click();
  await expect(calendar.locator('[data-calendar-change="after"]')).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "调整课表" });
  await dialog.getByRole("button", { name: "关闭" }).click();
  const confirmClose = page.getByRole("alertdialog", { name: "保存这次课表调整？" });
  await confirmClose.getByRole("button", { name: "保存草稿" }).click();
  await expect(dialog).toHaveCount(0);
  expect(committed).toBe(false);
  expect(requests).toHaveLength(1);
  await openAdjustment();
  await dialog.getByRole("button", { name: /待确认/ }).click();
  await expect(calendar.locator('[data-calendar-change="after"]')).toBeVisible();
  await calendar.getByRole("button", { name: "确认计划变更" }).click();
  await expect.poll(() => committed).toBe(true);
  await expect(calendar.getByRole("button", { name: "确认计划变更" })).toHaveCount(0);
  expect(requests).toHaveLength(1);
});

test("shows and opens each planned workout in the same main calendar cell", async ({ page }) => {
  const secondWorkoutId = "second-planned-workout";
  await openCalendar(page, false, from, undefined, {
    id: secondWorkoutId,
    scheduledDate: from,
    name: "晨间耐力跑",
  });
  const date = page.locator(`[data-calendar-date="${from}"]`);
  const first = cardOn(page, from);
  const second = date.locator(`[data-calendar-workout="${secondWorkoutId}"]`);
  await expect(date.getByTestId("workout-mini-chart")).toHaveCount(2);
  await expect(first).toHaveAccessibleName(workout.name);
  await expect(second).toHaveAccessibleName("晨间耐力跑");
  await expect(second).toHaveAttribute("draggable", "true");
  await second.press("Enter");
  await expect(page.getByRole("dialog", { name: /查看训练/ })).toBeVisible();
});

test("prevents dragging missed or completed workouts", async ({
  page,
}) => {
  const completedId = "completed-workout";
  const fixture = await openCalendar(page, false, yesterday, undefined, {
    id: completedId,
    scheduledDate: today,
    status: "DONE",
  });
  const pastWorkout = cardOn(page, yesterday);
  const completedWorkout = page.locator(`[data-calendar-workout="${completedId}"]`);
  const target = page.locator(`[data-calendar-date="${to}"]`);
  await expect(pastWorkout).toHaveAttribute("draggable", "false");
  await expect(completedWorkout).toHaveAttribute("draggable", "false");
  await pastWorkout.dragTo(target);
  await completedWorkout.dragTo(target);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(pastWorkout).toBeVisible();
  await expect(completedWorkout).toBeVisible();
  expect(fixture.previewBody()).toBeUndefined();

  await pastWorkout.press("Enter");
  const details = page.getByRole("dialog");
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "更多操作" }).press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "移动课程" })).toHaveCount(0);
});

test("previews and confirms a refreshed move in the original conversation without another coach turn", async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.clock.setFixedTime(new Date(createdAt));
  const sid = `calendar-move:${previewId}`;
  const runId = "expired-move-run";
  const attemptId = "expired-move-attempt";
  const firstMessage = "请帮我调整长跑日期";
  const companion = {
    ...workout,
    id: "calendar-companion",
    scheduledDate: coachingDate,
    name: "原节奏跑",
  };
  await openCoachFixture(page, [
    { id: "original-request", role: "user", content: firstMessage, createdAt },
    {
      id: attemptId, role: "assistant", content: "", createdAt,
      message: {
        kind: "ui_message", version: 2, role: "assistant", providerReplay: false,
        metadata: { schemaVersion: 2, runId, attemptId },
        parts: [
          { type: "data-coach-run", id: runId, data: { runId, attemptId, messageId: attemptId, revision: 2, status: "failed", startedAt: createdAt, endedAt: createdAt, previousExecutionMs: 0, executionMs: 20 } },
          { type: "data-coach-turn-error", data: { code: "calendar_move_expired" } },
        ],
      },
    },
  ], {
    navigate: false,
    sessions: [{ id: sid, title: "训练计划调整", updatedAt: createdAt, pinnedAt: null }],
  });
  await page.route("**/plans/scheduled-workouts*", (route) =>
    route.fulfill({ json: { data: { inPlan: [workout, companion], independent: [] } } }),
  );
  let refreshes = 0;
  let confirms = 0;
  let revisions = 0;
  const editedDate = "2026-11-27";
  const current: PlanCalendarMovePreview = {
    ...move,
    planId,
    requiresCoachConfirmation: true,
    confirmationId: "18b8a1d4-a436-497e-8cd0-9f92e2671f7a",
    expiresAt: "2026-11-20T10:30:00+08:00",
    presentation: {
      ...move.presentation,
      rows: [
        ...move.presentation.rows,
        {
          ...move.presentation.rows[0],
          workoutId: companion.id,
          beforeName: companion.name,
          name: "调整后的节奏跑",
          beforeScheduledDate: coachingDate,
          scheduledDate: coachingDate,
        },
      ],
    },
  };
  await page.route(`**/ai/coach/sessions/${encodeURIComponent(sid)}/calendar-move*`,
    (route) => route.fulfill({ json: { data: refreshes ? current : { ...move, state: "EXPIRED" } } }),
  );
  await page.route(`**/ai/coach/sessions/${encodeURIComponent(sid)}/calendar-move/refresh`, (route) => {
    expect(route.request().method()).toBe("POST");
    refreshes += 1;
    return route.fulfill({ json: { data: { status: "refreshed", preview: current } } });
  });
  await mockCalendarAdjustment(page, (input) => {
    expect(input.edits).toEqual([{ kind: "UPDATE", workoutId, expectedRevision: workout.revision, targetDate: editedDate }]);
    revisions += 1;
  }, () => { confirms += 1; }, {
    id: previewId, planId, versionId: previewId, currentVersionId: previewId,
    isVersioned: false, state: "READY", expiresAt: current.expiresAt, conflicts: [],
    operationKeys: [workoutId, companion.id], presentation: current.presentation, receipt: null,
  });
  const sessionUrl = `/zh/ai-coach?sid=${encodeURIComponent(sid)}`;
  await page.goto(sessionUrl);
  await expect(page.getByText("调课预览已过期", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "加载最新课表" }).click();
  const preview = page.getByRole("region", { name: "调课预览", exact: true });
  await expect(preview.getByRole("button", { name: /调整前.*11-22/ })).toBeVisible();
  await expect(preview.getByRole("button", { name: /调整后.*11-24/ })).toBeVisible();
  await expect(preview.getByRole("button", { name: /调整前.*原节奏跑/ })).toBeVisible();
  await expect(preview.getByRole("button", { name: /调整后.*调整后的节奏跑/ })).toBeVisible();
  await expect(preview.getByRole("button", { name: "查看课表" })).toBeVisible();
  const calendar = page.locator("[data-calendar-proposal]");
  await expect(calendar).toBeVisible();
  const panelWidth = () => calendar.evaluate((el) =>
    el.closest("[data-panel]")!.getBoundingClientRect().width,
  );
  const divider = page.getByRole("separator", { name: "调整对话和预览宽度" });
  const dividerBox = (await divider.boundingBox())!;
  await page.mouse.move(dividerBox.x, dividerBox.y + dividerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dividerBox.x - 350, dividerBox.y + dividerBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(panelWidth).toBeLessThanOrEqual(961);
  await expect(calendar.locator('[data-calendar-change="before"]')).toHaveCount(2);
  await expect(calendar.locator('[data-calendar-change="after"]')).toHaveCount(2);
  const original = calendar.locator(`[data-calendar-workout="original:${workoutId}"]`);
  const adjusted = calendar.locator(`[data-calendar-workout="${workoutId}"]`);
  const secondAdjusted = calendar.locator(`[data-calendar-workout="${companion.id}"]`);
  await expect(original).toBeVisible();
  await expect(original).toHaveCSS("border-top-width", "0px");
  await expect(adjusted).toHaveCSS("border-top-width", "0px");
  await expect(original).toHaveCSS("background-image", /repeating-linear-gradient/);
  await expect(adjusted).toHaveCSS("background-image", "none");
  const firstColor = await original.evaluate((el) => getComputedStyle(el).getPropertyValue("--proposal-color").trim());
  expect(firstColor).not.toBe("");
  await expect(adjusted).toHaveCSS("--proposal-color", firstColor);
  await expect(secondAdjusted).not.toHaveCSS("--proposal-color", firstColor);
  const normalBackground = await adjusted.evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect(original).not.toHaveCSS("background-color", normalBackground);
  await expect(preview.getByRole("button", { name: "确认计划变更" })).toBeEnabled();
  await expect(page.getByText(firstMessage)).toBeVisible();
  expect(confirms).toBe(0);
  await expect(page).toHaveURL(sessionUrl);
  await expect(original).toHaveAttribute("draggable", "true");
  await original.dragTo(calendar.locator(`[data-calendar-date="${editedDate}"]`).filter({ visible: true }), {
    targetPosition: { x: 20, y: 26 },
  });
  await expect(preview.getByRole("button", { name: "确认计划变更" })).toBeDisabled();
  await expect(preview.getByRole("button", { name: /调整后.*11-24/ })).toBeVisible();
  await calendar.getByRole("button", { name: "保存草稿" }).click();
  await expect(preview.getByRole("button", { name: /调整后.*11-27/ })).toBeVisible();
  await expect(preview.getByRole("button", { name: "确认计划变更" })).toBeEnabled();
  expect(revisions).toBe(1);
  expect(confirms).toBe(0);
  await page.setViewportSize({ width: 390, height: 820 });
  await page.reload();
  await expect(preview.getByRole("button", { name: /调整前.*11-22/ })).toBeVisible();
  await expect(preview.getByRole("button", { name: /调整后.*11-27/ })).toBeVisible();
  await preview.getByRole("button", { name: "查看课表" }).click();
  const originalDay = calendar.locator(`button[data-calendar-date="${from}"]`).filter({ visible: true });
  const adjustedDay = calendar.locator(`button[data-calendar-date="${editedDate}"]`).filter({ visible: true });
  await expect(originalDay.locator('[data-calendar-marker-change="before"]')).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const afterMarker = adjustedDay.locator('[data-calendar-marker-change="after"]');
  await expect(afterMarker).toHaveCSS("--proposal-color", firstColor);
  await expect(afterMarker).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await originalDay.click();
  const originalCard = calendar.getByRole("article").filter({ has: page.getByRole("button", { name: /调整前.*1/ }) });
  await expect(originalCard).toHaveCSS("background-image", /repeating-linear-gradient/);
  await expect(originalCard).toHaveCSS("border-left-width", "0px");
  const compactBeforeBackground = await originalCard.evaluate((card) => getComputedStyle(card).backgroundColor);
  await adjustedDay.click();
  const adjustedCard = calendar.getByRole("article").filter({ has: page.getByRole("button", { name: /调整后.*1/ }) });
  await expect(adjustedCard).toHaveCSS("--proposal-color", firstColor);
  await expect(adjustedCard).not.toHaveCSS("background-color", compactBeforeBackground);
  await page.getByRole("button", { name: "对话", exact: true }).click();
  await preview.getByRole("button", { name: "确认计划变更" }).click();
  const applied = preview.getByRole("button", { name: /已生效.*调课预览/ });
  await expect(applied).toHaveAttribute("aria-expanded", "false");
  await expect(preview.getByRole("button", { name: /调整后.*11-27/ })).toBeHidden();
  await applied.press("Enter");
  await expect(preview.getByRole("button", { name: /调整后.*11-27/ })).toBeVisible();
  await expect(preview.getByRole("button", { name: "确认计划变更" })).toHaveCount(0);
  expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(0);
  expect(refreshes).toBe(1);
  expect(confirms).toBe(1);
});

test("cancels a recovered move from its conversation card", async ({ page }) => {
  const sid = `calendar-move:${previewId}`;
  const title = "调课对话";
  let current: PlanCalendarMovePreview = {
    ...move, planId, expiresAt: new Date(Date.now() + 60_000).toISOString(),
    confirmationId: "18b8a1d4-a436-497e-8cd0-9f92e2671f7a",
    requiresCoachConfirmation: true,
  };
  await openCoachFixture(page, [
    { id: "request", role: "user", content: "帮我改期", createdAt },
    { id: "reply", role: "assistant", content: "请确认这次调课。", createdAt },
  ], { navigate: false, sessions: [{ id: sid, title, updatedAt: createdAt, pinnedAt: null }] });
  await page.route(`**/ai/coach/sessions/${encodeURIComponent(sid)}/calendar-move*`,
    (route) => route.fulfill({ json: { data: current } }),
  );
  let cancellations = 0;
  await page.route(`**/plans/${planId}/calendar-moves/${previewId}`, (route) => {
    expect(route.request().method()).toBe("DELETE");
    cancellations += 1;
    if (cancellations === 1) return route.fulfill({ status: 503, json: { message: "Unavailable" } });
    current = { ...current, state: "CANCELLED" };
    return route.fulfill({ json: { data: current } });
  });
  const url = `/zh/ai-coach?sid=${encodeURIComponent(sid)}`;
  await page.goto(url);
  const card = page.getByRole("region", { name: "调课预览" });
  const cancel = card.getByRole("button", { name: "取消", exact: true });
  await expect(page.locator("[data-calendar-proposal]")).toBeVisible();
  await cancel.click();
  await expect(card.getByText("无法关闭本次调整，请重试。")).toBeVisible();
  await expect(card.getByRole("button", { name: "确认计划变更" })).toBeEnabled();
  await cancel.click();
  await expect(card.getByText("这次调课已放弃。")).toBeVisible();
  await expect(page.locator("[data-calendar-proposal]")).toHaveCount(0);
  await page.reload();
  await expect(card.getByText("这次调课已放弃。")).toBeVisible();
  await expect(card.getByRole("button", { name: "确认计划变更" })).toHaveCount(0);
  expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(0);
});

test("shows valid drop feedback and refuses dates before today", async ({
  page,
}) => {
  const fixture = await openCalendar(page, false);
  const original = cardOn(page, from);
  const earlier = page.locator(`[data-calendar-date="${yesterday}"]`);
  const current = page.locator(`[data-calendar-date="${today}"]`);
  const future = page.locator(`[data-calendar-date="${to}"]`);
  await expect(original).toHaveAttribute("draggable", "true");
  const background = await earlier.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await expect(earlier).not.toHaveAttribute("data-workout-drop", "blocked");
  await original.hover();
  const sourceBox = (await original.boundingBox())!;
  const center = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  await page.mouse.down();
  await page.mouse.move(center.x + 12, center.y, { steps: 4 });
  await expect(earlier).toHaveAttribute("data-workout-drop", "blocked");
  await expect(earlier).not.toHaveCSS("background-color", background);

  const dragOver = async (day: typeof current) => {
    const box = (await day.boundingBox())!;
    await page.mouse.move(box.x + 24, box.y + 29, { steps: 12 });
  };
  await dragOver(current);
  await expect(current).toHaveAttribute("data-workout-drop", "target");
  await dragOver(future);
  await expect(future).toHaveAttribute("data-workout-drop", "target");
  await expect(future).not.toHaveCSS("box-shadow", "none");
  await expect(current).not.toHaveAttribute("data-workout-drop", "target");

  await dragOver(earlier);
  await expect(future).not.toHaveAttribute("data-workout-drop", "target");
  await page.mouse.up();
  await expect(earlier).not.toHaveAttribute("data-workout-drop", "blocked");
  await page.getByTestId("calendar-page").hover({ position: { x: 8, y: 8 } });
  await expect(earlier).toHaveCSS("background-color", background);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(fixture.previewBody()).toBeUndefined();
});

test("opens the change preview directly after a drop and commits only after confirmation", async ({
  page,
}) => {
  let releasePreview!: () => void;
  const waitForPreview = new Promise<void>((resolve) => {
    releasePreview = resolve;
  });
  const fixture = await openCalendar(page, false, from, waitForPreview);
  const original = cardOn(page, from);
  await expect(original).toHaveAttribute("draggable", "true");
  await original.dragTo(page.locator(`[data-calendar-date="${to}"]`));
  const dialog = page.getByRole("dialog");
  try {
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`把这节课从 ${from} 移到 ${to}。`)).toBeVisible();
    await expect.poll(() => fixture.previewBody()).toEqual({
      targetDate: to,
      expectedRevision: 4,
    });
    await expect(dialog.getByRole("grid")).toHaveCount(0, { timeout: 1000 });
  } finally {
    releasePreview();
  }
  await expect(dialog.getByText("这次移动会影响训练安排。")).toBeVisible();
  const sourceWeek = dialog.getByRole("table", { name: /移出周/ });
  const targetWeek = dialog.getByRole("table", { name: /移入周/ });
  await expect(sourceWeek).toHaveAccessibleName(/16.*22/);
  await expect(targetWeek).toHaveAccessibleName(/23.*29/);
  await expect(sourceWeek.getByRole("columnheader")).toHaveText([
    "指标",
    "调整前",
    "调整后",
    "变化",
  ]);
  await expect(
    sourceWeek.getByRole("row", { name: /训练天数/ }).getByRole("cell"),
  ).toHaveText(["1", "0", "-1"]);
  await expect(
    targetWeek.getByRole("row", { name: /预计负荷/ }).getByRole("cell"),
  ).toHaveText(["0", "24", "+24"]);
  expect(fixture.previewBody()).toEqual({
    targetDate: to,
    expectedRevision: 4,
  });
  expect(fixture.confirms()).toBe(0);
  await expect(original).toHaveCount(1);
  await expect(cardOn(page, to)).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "请教练一起调整" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "确认调整" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cardOn(page, to)).toBeVisible();
  await expect(original).toHaveCount(0);
  expect(fixture.confirms()).toBe(1);
});

test("shows direct-save progress and reviews a fresh move after a calendar conflict", async ({ page }) => {
  const fixture = await openCalendar(page, true);
  const path = `/plans/${planId}/calendar-moves/${previewId}`;
  await page.route("**/calendar-moves/*/coach", (route) =>
    route.fulfill({ status: 403, json: { message: "Coach unavailable" } }),
  );
  const refreshedId = "refreshed-direct-preview";
  let release!: () => void;
  const waitForConfirm = new Promise<void>((resolve) => { release = resolve; });
  const attempts: string[] = [];
  await page.route(`**${path}/confirm`, async (route) => {
    attempts.push(previewId);
    await waitForConfirm;
    return route.fulfill({ status: 409, json: { code: 10018 } });
  });
  const nextRevision = workout.revision + 1;
  await page.route(`**/plans/${planId}/workouts/${workoutId}`, (route) =>
    route.fulfill({ json: { data: { workout: { ...workout, revision: nextRevision } } } }),
  );
  await page.route(`**/plans/${planId}/workouts/${workoutId}/calendar-move`, (route) => {
    if (!attempts.length) return route.fallback();
    expect(route.request().postDataJSON()).toEqual({ targetDate: to, expectedRevision: nextRevision });
    return route.fulfill({ json: { data: { ...move, previewId: refreshedId } } });
  });
  await page.route(`**/calendar-moves/${refreshedId}/confirm`, (route) => {
    attempts.push(refreshedId);
    return route.fulfill({ json: { data: { ...fixture.applyMove(), previewId: refreshedId } } });
  });

  const original = cardOn(page, from);
  await expect(original).toHaveAttribute("draggable", "true");
  await original.dragTo(page.locator(`[data-calendar-date="${to}"]`), {
    targetPosition: { x: 20, y: 26 },
  });
  const dialog = page.getByRole("dialog", { name: "调整训练日期" });
  const moveButton = dialog.getByRole("button", { name: "确认调整" });
  await moveButton.click();
  try {
    await expect(dialog.getByRole("button", { name: "正在保存…" })).toBeDisabled();
    await expect(dialog.getByText("处理中…", { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "请教练一起调整" })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(moveButton).toHaveCount(0);
  await dialog.getByRole("button", { name: "加载最新课表" }).click();
  await expect(dialog.getByText(`把这节课从 ${from} 移到 ${to}。`)).toBeVisible();
  await expect(moveButton).toBeEnabled();
  await expect(cardOn(page, from)).toBeVisible();
  expect(attempts).toEqual([previewId]);
  await moveButton.click();
  await expect(dialog).toHaveCount(0);
  await expect(cardOn(page, to)).toBeVisible();
  expect(attempts).toEqual([previewId, refreshedId]);
  expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(0);
});

test("drags a future workout upwards to an earlier week", async ({ page }) => {
  const fixture = await openCalendar(page, false, to);
  const original = cardOn(page, to);
  await expect(original).toHaveAttribute("draggable", "true");
  await original.dragTo(page.locator(`[data-calendar-date="${from}"]`), {
    targetPosition: { x: 20, y: 26 },
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(fixture.previewBody()).toEqual({
    targetDate: from,
    expectedRevision: 4,
  });
});

test("accepts an earlier drop on a buffered week revealed during a drag", async ({
  page,
}) => {
  const fixture = await openCalendar(page, false, to);
  const viewport = page.locator("[data-calendar-scroll]");
  await viewport.focus();
  for (const week of ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]) {
    await viewport.press("ArrowDown");
    await expect.poll(() => readTopWeek(viewport)).toBe(week);
  }
  const original = cardOn(page, to);
  const targetWeek = viewport.locator('[data-calendar-week="2026-11-16"]');
  await expect(targetWeek).toHaveAttribute("inert", "");
  await original.hover();
  const source = (await original.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(
    source.x + source.width / 2 + 12,
    source.y + source.height / 2,
    { steps: 4 },
  );
  await expect(targetWeek).not.toHaveAttribute("inert", "");

  await viewport.evaluate((element) => {
    element.scrollTop -= 52;
  });
  const target = (await viewport
    .locator(`[data-calendar-date="${from}"]`)
    .boundingBox())!;
  const scroll = (await viewport.boundingBox())!;
  await page.mouse.move(target.x + 22, scroll.y + 41, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(fixture.previewBody()).toEqual({
    targetDate: from,
    expectedRevision: 4,
  });
});

test("uses the workout menu on a course and the creation menu on a day", async ({
  page,
}) => {
  const fixture = await openCalendar(page, false);
  const original = cardOn(page, from);
  await expect(original).toHaveAttribute("draggable", "true");
  const menu = page.getByRole("menu");
  for (const [label, title] of [
    ["推迟", "推迟训练？"],
    ["跳过", "跳过训练？"],
    ["删除", "删除这条训练？"],
  ] as const) {
    await original.click({ button: "right" });
    await expect(menu.getByRole("menuitem")).toHaveText([
      "推迟",
      "跳过",
      "移动课程",
      "删除",
    ]);
    await menu.getByRole("menuitem", { name: label }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(
      confirmation.getByRole("heading", { name: title }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
  }
  await original.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "移动课程" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("grid")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(fixture.previewBody()).toBeUndefined();

  for (const kind of ["添加训练", "添加赛事"] as const) {
    await page
      .locator('[data-calendar-date="2026-11-25"]')
      .click({ button: "right" });
    await expect(menu.getByRole("menuitem")).toHaveText([
      "添加训练",
      "添加赛事",
    ]);
    await menu.getByRole("menuitem", { name: kind }).click();
    await expect(
      dialog
        .getByText(kind === "添加训练" ? "创建训练" : kind, { exact: true })
        .first(),
    ).toBeVisible();
    await expect(dialog.getByText(/2026[-/]11[-/]25/).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("saves a Sunday start and uses it in both calendar grids", async ({
  page,
}) => {
  await openCalendar(page, false);
  await page.goto("/zh/settings");
  const weekStart = page.getByRole("combobox", { name: "每周起始日" });
  await expect(weekStart).toHaveText("周一");
  await weekStart.click();
  await expect(page.getByRole("option")).toHaveText(["周一", "周日"]);
  await page.getByRole("option", { name: "周日", exact: true }).click();
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("trainingload:calendar-week-start"),
      ),
    )
    .toBe("sunday");
  await page.goto("/zh/calendar");
  await expect
    .poll(() => readTopWeek(page.locator("[data-calendar-scroll]")))
    .toBe("2026-11-01");
  await cardOn(page, from).click({ button: "right" });
  await page.getByRole("menuitem", { name: "移动课程" }).click();
  const grid = page.getByRole("dialog").getByRole("grid");
  await expect(
    grid.getByRole("row").first().getByRole("gridcell").first(),
  ).toHaveAccessibleName("2026年11月1日 星期日");
});

test("shows weekly load above today's training and clamps the advice to three lines", async ({
  page,
}) => {
  await openCalendar(page, false);
  const summary = "今天的训练建议包含足够长的说明，用来检查首页只保留三行摘要。".repeat(12);
  await page.route("**/api/proxy/ai/today-suggestion", (route) =>
    route.fulfill({
      json: { data: { summary, tags: [], source: "generated" } },
    }),
  );
  await page.route(/\/api\/v2\/home(?:\?|$)/, (route) =>
    route.fulfill({
      json: {
        activePlan: {
          id: planId,
          title: "持续跑步测试",
          planningMode: "ROLLING",
          generatedThrough: "2026-12-06",
          todayWorkouts: [],
          currentWeekWorkouts: [workout],
        },
        todayDate: today,
        aiTodaySuggestion: { summary, tags: [], source: "generated" },
        weather: { status: "unavailable" },
      },
    }),
  );
  await page.goto("/zh");

  const execution = page.getByRole("heading", { name: "今日训练", exact: true });
  const load = page.getByRole("heading", { name: "本周负荷", exact: true });
  const chart = page.getByRole("img", { name: "本周实际负荷与计划负荷" });
  await expect(execution).toBeVisible();
  await expect(load).toBeVisible();
  await expect(page.getByText("本周训练负荷", { exact: true })).toBeVisible();
  await expect(page.getByText("周训练次数", { exact: true })).toBeVisible();
  await expect(chart).toBeVisible();
  const chartBox = (await chart.boundingBox())!;
  expect(chartBox.y + chartBox.height).toBeLessThan((await execution.boundingBox())!.y);

  const advice = page.getByTestId("today-advice");
  const plan = page.getByRole("link", { name: /持续跑步测试/ });
  await expect(plan).toBeVisible();
  await expect(advice.locator("p")).toHaveText(summary);
  await expect(advice.locator("p")).toHaveCSS("-webkit-line-clamp", "3");
  const adviceBox = (await advice.boundingBox())!;
  const planBox = (await plan.boundingBox())!;
  expect(Math.abs(adviceBox.height - planBox.height)).toBeLessThanOrEqual(1);
  const viewSuggestion = advice.getByRole("button", { name: "查看今日教练建议" });
  await page.mouse.click(adviceBox.x + adviceBox.width - 8, adviceBox.y + 8);
  const suggestionDialog = page.getByRole("dialog");
  await expect(suggestionDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(suggestionDialog).toBeHidden();
  await expect(viewSuggestion).toBeFocused();
  await viewSuggestion.press("Enter");
  await expect(suggestionDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(suggestionDialog).toBeHidden();
  const planBadge = plan.getByText("持续计划", { exact: true });
  await expect(planBadge).toBeVisible();
  await expect(plan.getByText(/已生成至/)).toHaveCount(0);
  const header = plan.getByRole("heading");
  const todayRow = plan.getByText("今日安排", { exact: true }).locator("..");
  const titleBox = (await header.boundingBox())!;
  const tagBox = (await planBadge.boundingBox())!;
  const todayBox = (await todayRow.boundingBox())!;
  expect(tagBox.x).toBeGreaterThan(titleBox.x);
  expect(tagBox.y).toBeLessThan(todayBox.y);
  expect(Math.abs(todayBox.x - titleBox.x)).toBeLessThanOrEqual(1);
  const innerWidth = planBox.width - 2 * (todayBox.x - planBox.x);
  expect(Math.abs(todayBox.width - innerWidth)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1100, height: 880 });
  await expect(planBadge).toBeVisible();
  expect(
    await plan.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(advice).toBeVisible();
  await expect(plan).toBeHidden();
});

function readTopWeek(viewport: ReturnType<Page["locator"]>) {
  return viewport.evaluate((element) => {
    const rows = [
      ...element.querySelectorAll<HTMLElement>("[data-calendar-week]"),
    ];
    const topRow = rows.find(
      (row) => Math.abs(row.offsetTop - element.scrollTop) <= 2,
    );
    return topRow?.dataset.calendarWeek;
  });
}

test("draws the selected date ring inside cells along all four calendar edges", async ({
  page,
}) => {
  await openCalendar(page, false);
  const viewport = page.locator("[data-calendar-scroll]");
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");

  for (const date of ["2026-11-01", "2026-11-02", "2026-11-22", "2026-11-30"]) {
    const cell = viewport.locator(`[data-calendar-date="${date}"]`);
    await cell.click({ position: { x: 12, y: 12 } });
    await expect(cell).toHaveCSS("box-shadow", /\b2px inset\b/);
  }
});

test("selects a visible day from the adjacent month without shifting the calendar", async ({
  page,
}) => {
  await openCalendar(page, false);
  const viewport = page.locator("[data-calendar-scroll]");
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");
  const day = (date: string) =>
    viewport.getByRole("button", { name: date, exact: true });
  const cell = (date: string) =>
    viewport.locator(`[data-calendar-date="${date}"]`);
  const outsideMonth = /(?:^|\s)bg-secondary(?:\s|$)/;

  await day("2026-10-30").click();
  await expect(page.getByRole("button", { name: "2026年10月" })).toBeVisible();
  await page.getByRole("button", { name: "下一月" }).click();
  await expect(page.getByRole("button", { name: "2026年11月" })).toBeVisible();
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");

  await viewport.hover({ position: { x: 45, y: 68 } });
  await page.mouse.wheel(0, 320);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-16");
  await expect(page.getByRole("button", { name: "2026年12月" })).toBeVisible();

  await day("2026-11-17").click();
  await expect(day("2026-11-17")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "2026年11月" })).toBeVisible();
  await expect(cell("2026-11-18")).not.toHaveClass(outsideMonth);
  await expect(cell("2026-12-03")).toHaveClass(outsideMonth);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-16");

  await page.mouse.wheel(0, 112);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-23");
  await expect(page.getByRole("button", { name: "2026年12月" })).toBeVisible();
  await expect(cell("2026-12-03")).not.toHaveClass(outsideMonth);
});

test("follows a continuous scroll during the gesture and then snaps to the nearest week", async ({
  page,
}) => {
  await openCalendar(page, false);
  const viewport = page.locator("[data-calendar-scroll]");
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");
  await viewport.hover({ position: { x: 45, y: 68 } });
  const initialTop = await viewport.evaluate((element) => element.scrollTop);
  const positions: number[] = [];
  for (let index = 0; index < 8; index++) {
    await page.mouse.wheel(0, 27);
    positions.push(
      await viewport.evaluate(async (element) => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        return element.scrollTop;
      }),
    );
  }
  expect(positions[0]).toBeGreaterThan(initialTop);
  expect(positions[0] - initialTop).toBeLessThan(116);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(positions.at(-1)! - initialTop).toBeGreaterThan(116);
  expect(positions.at(-1)! - initialTop).toBeLessThan(232);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-09");

  const settledTop = await viewport
    .locator('[data-calendar-week="2026-11-09"]')
    .evaluate((row: HTMLElement) => row.offsetTop);
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBe(settledTop);
  const motion = await viewport.evaluateHandle((element) => {
    const frames: { at: number; top: number }[] = [];
    const record = () =>
      frames.push({ at: performance.now(), top: element.scrollTop });
    element.addEventListener("scroll", record, { passive: true });
    return {
      frames,
      stop: () => element.removeEventListener("scroll", record),
    };
  });
  await page.mouse.wheel(0, 28);
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(settledTop);
  await expect
    .poll(() => motion.evaluate(({ frames }) => frames.at(-1)?.top))
    .toBe(settledTop);
  const frames = await motion.evaluate(({ frames, stop }) => {
    stop();
    return frames;
  });
  await motion.dispose();
  const peak = Math.max(...frames.map(({ top }) => top));
  const peakIndex = frames.findLastIndex(({ top }) => top === peak);
  const returning = frames.slice(peakIndex + 1);
  expect(returning.length).toBeGreaterThan(2);
  const snapDelayMs = returning[0].at - frames[peakIndex].at;
  const snapDurationMs = returning.at(-1)!.at - returning[0].at;
  await test.info().attach("week-snap-timing", {
    body: JSON.stringify({ snapDelayMs, snapDurationMs }),
    contentType: "application/json",
  });
  expect(snapDelayMs).toBeLessThan(160);
  expect(snapDelayMs + snapDurationMs).toBeLessThan(300);

  await page.mouse.wheel(0, 140);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-16");
  await expect(page.getByRole("button", { name: "2026年12月" })).toBeVisible();

  await page.mouse.wheel(0, -83);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-09");
});

test("keeps the displayed month when the viewport briefly crosses the month threshold", async ({
  page,
}) => {
  await openCalendar(page, false);
  const viewport = page.locator("[data-calendar-scroll]");
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");
  await viewport.hover({ position: { x: 45, y: 68 } });
  const heading = page.getByRole("button", { name: "2026年11月" });
  const observed = await heading.evaluateHandle((button) => {
    const months = new Set([button.textContent?.trim()]);
    const observer = new MutationObserver(() => {
      months.add(button.textContent?.trim());
    });
    observer.observe(button, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return { months, stop: () => observer.disconnect() };
  });

  await page.mouse.wheel(0, 266);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-09");
  const months = await observed.evaluate(({ months, stop }) => {
    stop();
    return Array.from(months);
  });
  await observed.dispose();
  expect(months).toEqual(["2026年11月"]);
});

test("shows the month with the most visible dates after snapping", async ({
  page,
}) => {
  await openCalendar(page, false);
  const viewport = page.locator("[data-calendar-scroll]");
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");
  await viewport.hover({ position: { x: 45, y: 68 } });
  const fadingDates = await viewport.evaluateHandle((element) => {
    const fades = {
      dates: new Set<string>(),
      offsetAtFirstFade: null as number | null,
    };
    element.addEventListener("transitionrun", (event) => {
      if (event.propertyName !== "color" || !(event.target instanceof Element))
        return;
      const date = event.target.closest<HTMLElement>("[data-calendar-date]")
        ?.dataset.calendarDate;
      if (date !== "2026-11-17" && date !== "2026-12-01") return;
      fades.dates.add(date);
      const target = element.querySelector<HTMLElement>(
        '[data-calendar-week="2026-11-16"]',
      );
      if (target) {
        fades.offsetAtFirstFade ??= Math.abs(
          element.scrollTop - target.offsetTop,
        );
      }
    });
    return fades;
  });

  await page.mouse.wheel(0, 320);
  await expect(page.getByRole("button", { name: "2026年12月" })).toBeVisible();
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-16");
  const outsideMonth = /(?:^|\s)bg-secondary(?:\s|$)/;
  await expect(
    viewport.locator('[data-calendar-date="2026-11-17"]'),
  ).toHaveClass(outsideMonth);
  await expect(
    viewport.locator('[data-calendar-date="2026-12-01"]'),
  ).not.toHaveClass(outsideMonth);
  await expect
    .poll(() =>
      fadingDates.evaluate(
        ({ dates }) => dates.has("2026-11-17") && dates.has("2026-12-01"),
      ),
    )
    .toBe(true);
  const offsetAtFirstFade = await fadingDates.evaluate(
    (fades) => fades.offsetAtFirstFade,
  );
  expect(offsetAtFirstFade).not.toBeNull();
  expect(offsetAtFirstFade).toBeLessThanOrEqual(1);
  await fadingDates.dispose();

  await page.mouse.wheel(0, 546);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-12-21");
  await expect(page.getByRole("button", { name: "2027年1月" })).toBeVisible();

  await page.mouse.wheel(0, -320);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-30");
  await expect(page.getByRole("button", { name: "2026年12月" })).toBeVisible();
});

test("fast trackpad flicks land on the same month page as the header buttons", async ({
  page,
}) => {
  await openCalendar(page, false);
  const viewport = page.locator("[data-calendar-scroll]");
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");
  const selectedDay = viewport.locator('[data-calendar-date="2026-11-22"]');
  await selectedDay.click({ position: { x: 12, y: 12 } });
  await page.getByRole("button", { name: "下一月" }).click();
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-30");
  await page.getByRole("button", { name: "上一月" }).click();
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");
  await selectedDay.click({ position: { x: 12, y: 12 } });

  const box = (await viewport.boundingBox())!;
  const input = await page.context().newCDPSession(page);
  const scroll = (yDistance: number, speed: number) =>
    input.send("Input.synthesizeScrollGesture", {
      x: box.x + 45,
      y: box.y + 68,
      yDistance,
      speed,
      gestureSourceType: "mouse",
    });

  const motion = await viewport.evaluateHandle((element) => {
    const offsets: number[] = [];
    const rebases: number[] = [];
    const firstWeek = () => element.querySelector("[data-calendar-week]");
    let first = firstWeek();
    const targetOffset = () => {
      const target = element.querySelector<HTMLElement>(
        '[data-calendar-week="2026-11-30"]',
      );
      return target ? element.scrollTop - target.offsetTop : undefined;
    };
    const observer = new MutationObserver(() => {
      const next = firstWeek();
      if (next === first) return;
      first = next;
      const offset = targetOffset();
      if (offset !== undefined) rebases.push(offset);
    });
    observer.observe(element, { childList: true, subtree: true });
    const record = () => {
      const offset = targetOffset();
      if (offset !== undefined) offsets.push(offset);
    };
    element.addEventListener("scroll", record, { passive: true });
    return {
      offsets,
      rebases,
      stop: () => {
        observer.disconnect();
        element.removeEventListener("scroll", record);
      },
    };
  });
  await scroll(-1050, 3200);
  await expect(page.getByRole("button", { name: "2026年12月" })).toBeVisible();
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-30");
  await page.waitForTimeout(450);
  expect(await readTopWeek(viewport)).toBe("2026-11-30");
  const { offsets, rebases } = await motion.evaluate(
    ({ offsets, rebases, stop }) => {
      stop();
      return { offsets, rebases };
    },
  );
  await motion.dispose();
  expect(offsets.length).toBeGreaterThan(2);
  expect(Math.max(...offsets)).toBeLessThanOrEqual(2);
  expect(rebases.length).toBeGreaterThan(0);
  expect(Math.max(...rebases.map(Math.abs))).toBeLessThanOrEqual(2);

  await scroll(430, 3200);
  await expect(page.getByRole("button", { name: "2026年11月" })).toBeVisible();
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");

  await scroll(-320, 1000);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-16");
  await input.detach();
});

test("keeps paging in the same direction without moving the pointer", async ({
  page,
}) => {
  await openCalendar(page, false);
  const viewport = page.locator("[data-calendar-scroll]");
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");
  const box = (await viewport.boundingBox())!;
  const point = { x: box.x + 45, y: box.y + 68 };
  await page.mouse.move(point.x, point.y);
  const input = await page.context().newCDPSession(page);

  for (const week of ["2026-11-30", "2026-12-28", "2027-02-01"]) {
    await input.send("Input.synthesizeScrollGesture", {
      ...point,
      yDistance: -1050,
      speed: 3200,
      gestureSourceType: "mouse",
    });
    await expect.poll(() => readTopWeek(viewport)).toBe(week);
  }

  await input.detach();
});

test("keeps a long ordinary scroll going past the initially rendered weeks", async ({
  page,
}) => {
  await openCalendar(page, false);
  const viewport = page.locator("[data-calendar-scroll]");
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");
  const lastReachableWeek = await viewport.evaluate((element) => {
    const limit = element.scrollHeight - element.clientHeight;
    return [
      ...element.querySelectorAll<HTMLElement>("[data-calendar-week]"),
    ].findLast((row) => row.offsetTop <= limit)?.dataset.calendarWeek;
  });
  expect(lastReachableWeek).toBeDefined();
  const box = (await viewport.boundingBox())!;
  const input = await page.context().newCDPSession(page);
  await input.send("Input.synthesizeScrollGesture", {
    x: box.x + 45,
    y: box.y + 68,
    yDistance: -1344,
    speed: 1000,
    gestureSourceType: "mouse",
  });
  await input.detach();
  await expect
    .poll(async () => {
      const week = await readTopWeek(viewport);
      return Boolean(week && lastReachableWeek && week > lastReachableWeek);
    })
    .toBe(true);
});

test("scrolls past the drag edge and lets the original workout drop in the next window", async ({
  page,
}) => {
  const fixture = await openCalendar(page, false);
  const viewport = page.locator("[data-calendar-scroll]");
  const original = cardOn(page, from);
  await expect(original).toHaveAttribute("draggable", "true");
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");
  await original.hover();
  const source = (await original.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(
    source.x + source.width / 2 + 12,
    source.y + source.height / 2,
    { steps: 4 },
  );
  const moveToEdge = async (bottom: boolean) => {
    const box = (await viewport.boundingBox())!;
    await page.mouse.move(
      box.x + 30,
      bottom ? box.y + box.height - 14 : box.y + 14,
      { steps: 12 },
    );
  };
  await moveToEdge(true);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-02");
  await moveToEdge(false);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-10-26");
  await moveToEdge(true);
  await expect.poll(() => readTopWeek(viewport)).toBe("2026-11-02");
  const futureDate = "2026-12-07";
  const target = (await page
    .locator(`[data-calendar-date="${futureDate}"]`)
    .boundingBox())!;
  const edge = (await viewport.boundingBox())!;
  await page.mouse.move(
    target.x + 20,
    Math.min(target.y + 20, edge.y + edge.height - 6),
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("dialog").getByText("这次移动会影响训练安排。"),
  ).toBeVisible();
  expect(fixture.previewBody()).toEqual({
    targetDate: futureDate,
    expectedRevision: 4,
  });
});

test("moves the keyboard action into the workout details menu and restores focus after cancellation", async ({
  page,
}) => {
  const fixture = await openCalendar(page, false);
  const original = cardOn(page, from);
  await expect(original).toHaveAttribute("draggable", "true");
  await page
    .locator(`[data-calendar-date="${from}"]`)
    .click({ position: { x: 15, y: 12 } });
  await expect(page.getByRole("button", { name: "移动课程" })).toHaveCount(0);
  await original.press("Enter");
  const actions = page.getByRole("button", { name: "更多操作" });
  await actions.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText([
    "推迟",
    "跳过",
    "移动课程",
    "删除",
  ]);
  await menu.getByRole("menuitem", { name: "移动课程" }).press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("grid")).toHaveCount(2);
  const datePicker = dialog.getByRole("grid").first();
  await expect(
    datePicker.getByRole("button", { name: /2026年11月19日/ }),
  ).toBeDisabled();
  await expect(
    datePicker.getByRole("button", { name: /2026年11月22日/ }),
  ).toBeDisabled();
  await datePicker.getByRole("button", { name: /2026年11月24日/ }).click();
  await expect(dialog.getByText("这次移动会影响训练安排。")).toBeVisible();
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(original).toBeFocused();
  expect(fixture.confirms()).toBe(0);
});

test("edits a planned workout from the main calendar using its inspected revision", async ({ page }) => {
  await openCalendar(page, false);
  const name = "更新后的轻松跑";
  let updatedName = workout.name;
  let request: unknown;
  await page.route(`**/plans/${planId}/workouts/${workoutId}`, (route) => {
    if (route.request().method() === "PUT") {
      request = route.request().postDataJSON();
      updatedName = name;
    }
    return route.fulfill({ json: { data: { workout: {
      ...workout, revision: request ? 5 : workout.revision,
      name: updatedName, capabilities: { ...workout.capabilities, edit: true },
    } } } });
  });
  await cardOn(page, from).press("Enter");
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "编辑训练" }).click();
  const editor = page.getByRole("dialog", { name: "编辑训练" });
  await editor.getByRole("textbox").first().fill(name);
  await editor.getByRole("button", { name: "保存训练" }).click();
  await expect.poll(() => request).toMatchObject({
    expectedRevision: workout.revision, weekIndex: 1, dayIndex: 7, sessionIndex: 1, name,
  });
  await expect(editor).toHaveCount(0);
});

test("fits the move date picker to a narrow calendar dialog", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 690 });
  await openCalendar(page, false);
  await page
    .getByTestId("calendar-agenda-scroll")
    .locator(`[data-date="${from}"]`)
    .click();
  await page.getByRole("button", { name: /周末轻松跑/ }).click();
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "移动课程" }).click();

  const dialog = page.getByRole("dialog", { name: "调整训练日期" });
  const picker = dialog.getByRole("grid");
  const date = picker.getByRole("button", { name: /2026年11月24日/ });
  await expect(date).toBeVisible();
  const [bounds, grid] = await Promise.all([dialog.boundingBox(), picker.boundingBox()]);
  expect(grid!.x).toBeGreaterThan(bounds!.x);
  expect(grid!.x + grid!.width).toBeLessThan(bounds!.x + bounds!.width);
  expect(grid!.width).toBeGreaterThan(bounds!.width * 0.85);
  await date.click();
  await expect(picker).toHaveCount(0);
  await expect(dialog.getByText("这次移动会影响训练安排。")).toBeVisible();
});

async function sendScheduleDraft(
  page: Page,
  fixture: Awaited<ReturnType<typeof openCalendar>>,
  decisionId = "decision-calendar",
  name = workout.name,
  moveOnly = false,
) {
  const assistantId = `assistant:${decisionId}`;
  if (!fixture.rows.length)
    fixture.rows.push({
      id: "move-intent",
      role: "user",
      content: "请检查本次移动",
      createdAt,
    });
  const presentation = {
    ...move.presentation,
    summary: "教练已为相邻课程调整恢复安排",
    ...(moveOnly ? { calendarMoveOnly: true } : {}),
    startDate: from,
    calendarTimeZone: "Asia/Shanghai",
    calendarDraft: {
      title: "调课草案",
      periodWeeks: 1,
      workouts: [
        {
          weekIndex: 1,
          dayIndex: 5,
          sessionIndex: 1,
          sportType: "RUN",
          name: "恢复跑",
          text: "15m easy",
          structure: enduranceStructure,
          structureKind: "ENDURANCE",
          dslVersion: 1,
        },
      ],
    },
    rows: moveOnly ? move.presentation.rows : [
      ...move.presentation.rows.map((row) => ({ ...row, name })),
      {
        name: "恢复跑",
        sportType: "RUN",
        scheduledDate: coachingDate,
        disposition: "APPLY",
        changeKind: "ADDED",
        before: "",
        after: "15m easy",
        rationale: "保留恢复时间",
      },
    ],
  };
  const draft = {
    type: "data-coach-tool",
    id: decisionId,
    data: {
      toolCallId: decisionId,
      name: "CoachDecisionDraft",
      input: {
        kind: "coach_decision_draft",
        decisionId,
        branchId: "calendar-branch",
        state: "PENDING",
        riskTier: "HIGH",
        decisionType: "PLAN_SCHEDULE",
        payload: { planId, presentation },
      },
    },
  };
  fixture.rows.push({
    id: assistantId,
    role: "assistant",
    content: "已预览调整",
    createdAt,
    message: {
      kind: "ui_message",
      version: 2,
      role: "assistant",
      parts: [draft, { type: "text", text: "已预览调整" }],
    },
  });
  await page.evaluate(
    ({ part, assistantId }) => {
      window.coachStreamFixture.send([
        { type: "start", messageId: assistantId },
        { type: "start-step" },
        part,
      ]);
      window.coachStreamFixture.finish(null);
    },
    { part: draft, assistantId },
  );
  return assistantId;
}

test("saves the original move when the background coach proposes no extra edits", async ({ page }) => {
  const fixture = await openCalendar(page, true);
  await expect(cardOn(page, from)).toHaveAttribute("draggable", "true");
  await cardOn(page, from).dragTo(page.locator(`[data-calendar-date="${to}"]`));
  const dialog = page.getByRole("dialog", { name: "调整训练日期" });
  await dialog.getByRole("button", { name: "确认调整" }).click();
  await expect(dialog.getByRole("button", { name: "教练正在检查训练安排…" })).toBeDisabled();
  await expect(page.getByRole("dialog", { name: "对话", exact: true })).toHaveCount(0);
  expect(fixture.confirms()).toBe(0);
  await expect.poll(() => page.evaluate(() => window.coachStreamFixture.requests)).toBe(1);
  await sendScheduleDraft(page, fixture, "move-only", workout.name, true);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "对话", exact: true })).toHaveCount(0);
  await expect(cardOn(page, to)).toBeVisible();
  expect(fixture.confirms()).toBe(1);
});

test("shows the coach proposal in the calendar and restores the draft after closing", async ({
  page,
}) => {
  const fixture = await openCalendar(page, true);
  const original = cardOn(page, from);
  await expect(
    page.locator(`[data-calendar-date="${today}"]`).getByText(/活动 \+/),
  ).toBeVisible();
  await expect(original).toHaveAttribute("draggable", "true");
  await original.dragTo(page.locator(`[data-calendar-date="${to}"]`));
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "确认调整" }).click();
  await expect(
    dialog.getByRole("heading", { name: "调整训练日期", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "教练正在检查训练安排…" })).toBeDisabled();
  await expect(dialog.locator("[data-calendar-proposal]")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "日历", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(1);
  await sendScheduleDraft(page, fixture);
  await expect(dialog.getByRole("heading", { name: "对话", exact: true })).toBeVisible();
  expect(fixture.confirms()).toBe(0);
  const displayedDraft = dialog.locator(
    `[data-calendar-date="${to}"] [data-calendar-workout="${workoutId}"]`,
  );
  await expect(displayedDraft).toBeVisible();
  const ghost = dialog.locator(
    `[data-calendar-date="${from}"] [data-calendar-change="before"]`,
  );
  await expect(ghost).toHaveText(/调整前/);
  await expect(displayedDraft).toHaveAttribute("data-calendar-change", "after");
  await expect(ghost).toHaveCSS("border-top-width", "0px");
  await expect(ghost).toHaveCSS("background-image", /repeating-linear-gradient/);
  await expect(ghost).toHaveCSS(
    "--proposal-color",
    await displayedDraft.evaluate(
      (element) => getComputedStyle(element).getPropertyValue("--proposal-color").trim(),
    ),
  );
  await expect(dialog.getByRole("heading", { name: "AI 教练" })).toHaveCount(0);
  await expect(displayedDraft.getByTestId("workout-mini-chart")).toBeVisible();
  await expect(dialog.getByRole("textbox")).toBeVisible();
  const previewPanel = await dialog
    .locator("[data-calendar-proposal]")
    .boundingBox();
  await expect(
    dialog.locator("[data-calendar-proposal]").getByText(/活动 \+/),
  ).toHaveCount(0);
  const composer = await dialog.getByRole("textbox").boundingBox();
  expect(composer!.x + composer!.width).toBeLessThan(previewPanel!.x);
  const separator = dialog.getByRole("separator", {
    name: "调整对话和预览宽度",
  });
  await separator.hover();
  const divider = (await separator.boundingBox())!;
  const dividerX = divider.x + divider.width / 2;
  const dividerY = divider.y + divider.height / 2;
  await page.mouse.move(dividerX, dividerY);
  await page.mouse.down();
  await page.mouse.move(dividerX + 70, dividerY, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await separator.boundingBox())!.x)
    .toBeGreaterThan(divider.x + 30);
  const resizedDivider = (await separator.boundingBox())!;
  const dialogBounds = (await dialog.boundingBox())!;
  const resizedX = resizedDivider.x + resizedDivider.width / 2;
  await page.mouse.move(resizedX, dividerY);
  await page.mouse.down();
  await page.mouse.move(resizedX - 55, dialogBounds.y - 16, { steps: 10 });
  await page.mouse.up();
  const closePrompt = page.getByRole("alertdialog", {
    name: "是否保留这次调整，稍后继续？",
  });
  await expect(
    page.getByText("是否保留这次调整，稍后继续？", { exact: true }),
  ).toHaveCount(0);
  const compactCalendar = dialog.getByRole("region", { name: "2026年11月" });
  const narrowDivider = (await separator.boundingBox())!;
  await page.mouse.move(narrowDivider.x + narrowDivider.width / 2, dividerY);
  await page.mouse.down();
  await page.mouse.move(dialogBounds.x + dialogBounds.width - 80, dividerY, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(compactCalendar).toBeVisible();
  await expect(displayedDraft).toBeHidden();
  const expandedDivider = (await separator.boundingBox())!;
  await page.mouse.move(
    expandedDivider.x + expandedDivider.width / 2,
    dividerY,
  );
  await page.mouse.down();
  await page.mouse.move(dividerX, dividerY, { steps: 10 });
  await page.mouse.up();
  await expect(compactCalendar).toBeHidden();
  await expect(displayedDraft).toBeVisible();
  await dialog.getByRole("button", { name: "关闭预览" }).click();
  await expect(dialog.locator("[data-calendar-proposal]")).toHaveCount(0);
  await expect(dialog.getByRole("textbox")).toBeVisible();
  await dialog.getByRole("button", { name: "查看课表" }).click();
  await expect(
    dialog.getByRole("button", { name: "确认计划变更" }),
  ).toBeEnabled();
  for (const label of [
    "调整范围",
    "日历时区",
    "采用的数据",
    "设备同步影响",
    "安排依据",
  ])
    await expect(dialog.getByText(label, { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: /^调整前/ }).click();
  const details = page.getByRole("dialog", { name: "训练计划变更" });
  await expect(details.getByText(from, { exact: true })).toBeVisible();
  await expect(details.getByText(to, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  const added = dialog.locator(
    `[data-calendar-date="${coachingDate}"] [data-calendar-workout^="preview:"]`,
  );
  await expect(added.getByTestId("workout-mini-chart")).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "移动轻松跑" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const cardLink = dialog.getByRole("button", { name: "查看课表" });
  await expect(cardLink).toBeVisible();
  await dialog.getByRole("button", { name: "关闭预览" }).click();
  await expect(added).toHaveCount(0);
  await cardLink.click();
  await expect(added.getByTestId("workout-mini-chart")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(compactCalendar).toBeVisible();
  await expect
    .poll(async () => {
      const bounds = await dialog.boundingBox();
      return Boolean(
        bounds && bounds.x >= -1 && bounds.x + bounds.width <= 391,
      );
    })
    .toBe(true);
  await expect(added).toBeHidden();
  await expect(
    compactCalendar.getByRole("button", { name: /调整后 · 1/ }),
  ).toBeVisible();
  const mobileConfirm = dialog.getByRole("button", { name: "确认计划变更" });
  await expect(mobileConfirm).toBeInViewport({ ratio: 1 });
  await compactCalendar.locator(`[data-calendar-date="${from}"]`).click();
  await expect(
    compactCalendar.getByRole("button", { name: /调整前 · 1/ }),
  ).toBeVisible();
  await expect(dialog.getByRole("textbox")).toBeHidden();
  await dialog.getByRole("button", { name: "对话", exact: true }).click();
  await expect(dialog.getByRole("textbox")).toBeVisible();
  await expect(compactCalendar).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(original).toHaveCount(1);
  const closeButton = dialog.getByRole("button", { name: "关闭", exact: true });
  await closeButton.click();
  await expect(closePrompt).toBeVisible();
  await closePrompt.getByRole("button", { name: "继续编辑" }).click();
  await expect(closePrompt).toHaveCount(0);
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(closePrompt).toBeVisible();
  await closePrompt.getByRole("button", { name: "稍后继续" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "继续上次调课" }).click();
  await expect(
    dialog.getByText("教练已为相邻课程调整恢复安排").first(),
  ).toBeVisible();
  await expect(original).toHaveCount(1);
  expect(fixture.confirms()).toBe(0);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect
    .poll(() => fixture.rejectedDecisionIds)
    .toEqual(["decision-calendar"]);
  await expect(dialog.locator("[data-calendar-proposal]")).toHaveCount(0);
  await expect(displayedDraft).toHaveCount(0);
  await expect(ghost).toHaveCount(0);
  await expect(dialog.getByRole("textbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await closePrompt.getByRole("button", { name: "放弃调整" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "继续上次调课" })).toHaveCount(
    0,
  );
});

test("edits and confirms a coach calendar proposal without a second coach turn", async ({ page }) => {
  const fixture = await openCalendar(page, true);
  await mockCalendarAdjustment(page, (input) => {
    expect(input.edits).toMatchObject([{ kind: "UPDATE", workoutId, expectedRevision: workout.revision,
      targetDate: to, workout: { name: "更新轻松跑" } }]);
  }, () => { fixture.applyMove("更新轻松跑"); }, {
    id: "decision-calendar", planId, versionId: "original-version", currentVersionId: "original-version",
    isVersioned: false, state: "READY", expiresAt: move.expiresAt, conflicts: [],
    operationKeys: [workoutId], presentation: move.presentation, receipt: null,
  });
  await cardOn(page, from).click();
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "移动课程" }).click();
  const moveDialog = page.getByRole("dialog", { name: "调整训练日期" });
  await moveDialog.getByRole("grid").first().getByRole("button", { name: /2026年11月24日/ }).click();
  await moveDialog.getByRole("button", { name: "确认调整" }).click();
  await expect.poll(() => page.evaluate(() => window.coachStreamFixture.requests)).toBe(1);
  await sendScheduleDraft(page, fixture);

  const proposal = page.getByRole("dialog", { name: "对话", exact: true });
  const calendar = proposal.locator("[data-calendar-proposal]");
  await calendar.locator(`[data-calendar-date="${to}"] [data-calendar-workout="${workoutId}"]`).click();
  const details = page.getByRole("dialog", { name: workout.name, exact: true });
  await details.locator('[data-slot="dialog-footer"]').getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "编辑训练" }).click();
  const editor = calendar.getByRole("region", { name: workout.name, exact: true });
  await editor.getByRole("textbox", { name: "训练名称（可选）" }).fill("更新轻松跑");
  await editor.getByRole("button", { name: "加入草稿" }).click();
  await expect(editor).toHaveCount(0);
  await calendar.getByRole("button", { name: "保存草稿" }).click();
  await expect(proposal.getByRole("button", { name: /调整后.*更新轻松跑/ })).toBeVisible();
  await calendar.getByRole("button", { name: "确认计划变更" }).click();
  await expect(proposal.getByText("已生效", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.coachStreamFixture.requests)).toBe(1);
});

async function sendNewPlanDraft(page: Page) {
  await page.evaluate(
    (part) => {
      window.coachStreamFixture.send([
        { type: "start", messageId: "assistant-new-plan" },
        { type: "start-step" },
        part,
      ]);
      window.coachStreamFixture.finish(null);
    },
    {
      type: "data-coach-tool",
      id: "new-plan-call",
      data: {
        toolCallId: "new-plan-call",
        name: "PresentCoachPlanDraft",
        input: {
          title: "独立跑步计划",
          periodWeeks: 1,
          workouts: [
            {
              weekIndex: 1,
              dayIndex: 1,
              sessionIndex: 1,
              sportType: "RUN",
              name: "新计划起步跑",
              text: "work 30m hr z2",
              structureKind: "ENDURANCE",
              structure: enduranceStructure,
            },
          ],
        },
      },
    },
  );
}

test("keeps adjustment and new-plan calendar instances independent", async ({
  page,
}) => {
  const fixture = await openCalendar(page, true);
  await expect(cardOn(page, from)).toHaveAttribute("draggable", "true");
  await cardOn(page, from).dragTo(page.locator(`[data-calendar-date="${to}"]`));
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "确认调整" }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(1);
  await sendScheduleDraft(page, fixture);

  const panel = dialog.getByRole("tabpanel");
  await expect(panel.getByRole("button", { name: "2026年11月" })).toBeVisible();
  await panel.getByRole("button", { name: "下一月" }).click();
  await expect(panel.getByRole("button", { name: "2026年12月" })).toBeVisible();
  await dialog.getByRole("textbox").fill("也帮我生成一个新计划");
  await dialog.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(2);
  await sendNewPlanDraft(page);

  const newPlan = dialog.getByRole("tab", { name: "独立跑步计划" });
  const adjustment = dialog.getByRole("tab", { name: "移动轻松跑" });
  await expect(newPlan).toHaveAttribute("aria-selected", "true");
  await expect(adjustment).toHaveAccessibleName("课表预览 移动轻松跑");
  await expect(newPlan).toHaveAccessibleName("计划草案 独立跑步计划");
  await expect(
    panel.getByRole("button", { name: /^新计划起步跑/ }),
  ).toBeVisible();
  await expect(panel.locator("[data-calendar-proposal]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭 计划草案 独立跑步计划", exact: true }).click();
  await expect(newPlan).toHaveCount(0);
  await expect(adjustment).toHaveAttribute("aria-selected", "true");
  await expect(adjustment).toBeFocused();
  await dialog.getByRole("button", { name: "独立跑步计划 查看课表", exact: true }).click();
  await expect(newPlan).toHaveAttribute("aria-selected", "true");
  await adjustment.click();
  await expect(panel.getByRole("button", { name: "2026年12月" })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "确认计划变更" }),
  ).toBeEnabled();
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect
    .poll(() => fixture.rejectedDecisionIds)
    .toEqual(["decision-calendar"]);
  await expect(adjustment).toHaveCount(0);
  await expect(newPlan).toHaveAttribute("aria-selected", "true");
  await expect(
    panel.getByRole("button", { name: /^新计划起步跑/ }),
  ).toBeVisible();
  await expect(dialog.getByRole("textbox")).toBeVisible();
});

test("ordinary coach conversation opens a calendar only for a structured draft", async ({
  page,
}) => {
  await openCoachFixture(page);
  await expect(page.getByRole("tab", { name: "独立跑步计划" })).toHaveCount(0);
  const composer = page.getByRole("textbox").first();
  await composer.fill("请在日历里预览新计划");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(1);
  await expect(page.getByRole("button", { name: "关闭预览" })).toHaveCount(0);
  await sendNewPlanDraft(page);

  await expect(page.getByRole("tab", { name: "独立跑步计划" })).toBeVisible();
  await expect(
    page.getByRole("tabpanel").getByRole("button", { name: /^新计划起步跑/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭预览" }).click();
  await expect(page.getByRole("tabpanel")).toHaveCount(0);
  await page.getByRole("button", { name: "独立跑步计划 查看课表" }).click();
  await expect(page.getByRole("tab", { name: "独立跑步计划" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByTestId("coach-plan-draft-mobile-calendar"),
  ).toBeVisible();
});
