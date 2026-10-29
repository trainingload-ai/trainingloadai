import { expect, test, type Page } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openCoachFixture } from "./fixtures/coach-page";
import {
  visualStates,
  visualTime,
  runRow,
  userRow,
  enduranceBlocks,
  easyBlocks,
} from "./fixtures/coach-visual-states";

test("recent sidebar keeps row spacing after a conversation moves to today", async ({
  page,
}, testInfo) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "Desktop recent sidebar");
  const now = Date.parse(visualTime);
  await page.clock.setFixedTime(new Date(now));
  const session = (id: string, title: string, age: number) => ({
    id,
    title,
    pinnedAt: null,
    updatedAt: new Date(now - age).toISOString(),
  });
  const options = {
    sessions: [
      session("today-one", "我想新做一个周期训练", 0),
      session("today-two", "你好啊", 3600000),
      session("coach-stream-fixture", "你好啊，教练", 86400000),
      ...Array.from({ length: 12 }, (_, i) =>
        session(`past-${i}`, `近期训练回顾 ${i + 1}`, (i + 2) * 86400000),
      ),
    ],
  };
  await openCoachFixture(page, undefined, options);
  const history = page.locator("[data-coach-recent-history]");
  await expect(history.getByText("昨天", { exact: true })).toBeVisible();
  const checkSpacing = async () => {
    const boxes = await history
      .locator("button[title]")
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, height: rect.height };
        }),
      );
    expect(boxes).toHaveLength(15);
    boxes.forEach((box, index) => {
      expect(box.height).toBeGreaterThanOrEqual(40);
      if (index > 0)
        expect(box.top - boxes[index - 1].bottom).toBeGreaterThanOrEqual(4);
    });
  };
  await checkSpacing();
  await page.getByRole("textbox").fill("继续这段对话");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
    .toBe(1);
  options.sessions[2].updatedAt = new Date(now + 1000).toISOString();
  await page.evaluate(() => {
    window.coachStreamFixture.send([
      { type: "start", messageId: "sidebar-spacing" },
      { type: "start-step" },
      { type: "text-start", id: "coach-text-1" },
      {
        type: "text-delta",
        id: "coach-text-1",
        delta: "可以，继续讨论训练安排。",
      },
    ]);
    window.coachStreamFixture.finish();
  });
  await expect(history.getByText("昨天", { exact: true })).toHaveCount(0);
  await expect(history.locator("button[title]").first()).toHaveAttribute(
    "title",
    "你好啊，教练",
  );
  await checkSpacing();
  await page.addStyleTag({
    content: ".tsqd-parent-container, nextjs-portal { display:none!important }",
  });
  const dir = resolve(
    process.cwd(),
    "../artifacts/coach-state-review",
    testInfo.project.name,
  );
  await mkdir(dir, { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((mode) => {
      localStorage.setItem("theme", mode);
      window.dispatchEvent(
        new StorageEvent("storage", { key: "theme", newValue: mode }),
      );
    }, theme);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: resolve(dir, `sidebar-density-${theme}.png`),
      animations: "disabled",
    });
  }
});

const artifactRoot = resolve(
  import.meta.dirname,
  "../../artifacts/coach-state-review",
);

async function scrollThread(page: Page, position: "top" | "bottom") {
  await page.getByRole("log").evaluate((root, position) => {
    const candidates = [root, ...root.querySelectorAll<HTMLElement>("div")];
    for (const node of candidates) {
      if (
        node.scrollHeight > node.clientHeight &&
        /auto|scroll/.test(getComputedStyle(node).overflowY)
      )
        node.scrollTop = position === "top" ? 0 : node.scrollHeight;
    }
  }, position);
}

for (const state of visualStates) {
  test(`visual ${state.id} · ${state.title}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date(visualTime));
    // Chart animation preferences are read at mount, not only at capture time.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const rows = state.empty
      ? []
      : state.live
        ? [userRow(state.title)]
        : [userRow(state.title), runRow(state), ...(state.rowsAfter ?? [])];
    await openCoachFixture(page, rows, {
      readyText: state.title,
      empty: state.empty,
      membershipPlan: state.membershipPlan,
      ...(state.id.startsWith("reasoning-") ? { thinkingEnabled: true } : {}),
    });
    await page.route("**/workout/parse-definition", async (route) => {
      if (state.id === "workout-parsing") return; // intentionally pending until page teardown
      if (state.id === "workout-fallback")
        return route.fulfill({
          status: 422,
          json: { message: "Fixture parse failure" },
        });
      const input = route.request().postDataJSON();
      const blocks = input.text.includes("repeat")
        ? enduranceBlocks
        : easyBlocks;
      await route.fulfill({
        json: {
          data: {
            definition: {
              kind: "ENDURANCE",
              version: 1,
              text: input.text,
              structure: { kind: "ENDURANCE", version: 1, blocks },
              summary: { kind: "ENDURANCE", durationSeconds: 1800 },
              warnings: [],
            },
          },
        },
      });
    });
    // The route's read-only parse effects may have fired before the override.
    // Reload ensures the exact same production mount runs against the fixture.
    if (
      [
        "workout-adjustment",
        "workout-applied",
        "workout-parsing",
        "workout-fallback",
      ].includes(state.id) ||
      state.id.startsWith("decision-")
    ) {
      await page.reload();
      await page.addStyleTag({
        content:
          ".tsqd-parent-container, nextjs-portal { display:none!important }",
      });
      await expect(page.getByText(state.title, { exact: true })).toBeVisible();
    }
    await page.route("**/ai/coach/actions/*/undo", (route) =>
      route.fulfill({
        json: { data: { id: "gallery-action", undoneAt: visualTime } },
      }),
    );
    if (state.live) {
      await page.getByRole("textbox").first().fill("开始执行");
      await page.getByRole("button", { name: "发送", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => window.coachStreamFixture.requests))
        .toBe(1);
      const row = runRow(state);
      const message = row.message as { metadata: unknown; parts: unknown[] };
      await page.evaluate(
        ({ metadata, parts }) =>
          window.coachStreamFixture.send([
            {
              type: "start",
              messageId: "gallery-message",
              messageMetadata: metadata,
            },
            { type: "start-step" },
            ...parts,
          ]),
        message,
      );
      await expect(
        page.getByRole("button", { name: "停止", exact: true }),
      ).toBeVisible();
    }
    if (!state.empty)
      await expect(page.locator('[data-run-id="gallery-run"]')).toBeVisible();
    await expect(
      page
        .locator("[data-coach-composer-layer]")
        .getByText(/^(智能教练|已就绪)$/),
    ).toHaveCount(0);
    if (state.id.startsWith("context-")) {
      const trigger = page.locator("[data-coach-context-trigger]:visible");
      const composer = page.locator("[data-coach-composer-layer]");
      const before = await composer.boundingBox();
      await trigger.click(); // touch works too; no hover-only information
      const panel = page.getByRole("dialog", { name: "上下文窗口" });
      await expect(panel).toBeVisible();
      expect(await composer.boundingBox()).toEqual(before);
      if ((page.viewportSize()?.width ?? 0) >= 1024)
        expect(
          await panel.evaluate((el) =>
            parseFloat(getComputedStyle(el).borderRadius),
          ),
        ).toBeLessThanOrEqual(14);
      await expect(panel).toContainText("不是账户积分或费用");
      await panel.press("Escape");
      await expect(trigger).toBeFocused();
      await trigger.press("Enter");
      await expect(panel).toBeVisible();
      if (state.id === "context-idle")
        await expect(panel.getByRole("progressbar")).toHaveCount(0);
      else
        await expect(panel.getByText("120,000", { exact: true })).toBeVisible();
    }
    if (state.expanded) {
      const closed = page.locator(
        '[data-run-id] button[aria-expanded="false"]',
      );
      while (await closed.count()) await closed.first().click();
    }
    if (state.id.startsWith("reasoning-")) {
      const summary = page.locator("[data-coach-reasoning-summary]");
      await expect(summary).toHaveCount(1);
      const trigger = summary.getByRole("button", { name: /思路摘要/ });
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(summary).toContainText("起始负荷应兼顾近期运动量和恢复状态");
      await expect(summary).not.toContainText("思考了");
      await trigger.focus();
      await trigger.press("Enter");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.press("Enter");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await trigger.blur();
    }
    if (state.id === "question-loading") {
      const activity = page.locator('[data-activity-id="question-tool"]');
      await expect(activity).toContainText("准备确认问题");
      await expect(activity.getByRole("status")).toHaveCount(0);
      await expect(activity.locator('[data-slot="skeleton"]')).toHaveCount(0);
      expect((await activity.boundingBox())!.height).toBeLessThan(60);
      await expect(page.locator("[data-coach-question]")).toHaveCount(0);
    }
    if (["profile-empty", "timeline-zone-empty"].includes(state.id)) {
      const card = page.locator("[data-coach-card]");
      await expect(card).toHaveCount(1);
      await expect(
        card.getByText("当前运动暂无可用区间明细。", { exact: true }),
      ).toHaveCount(1);
      await expect(card.getByRole("button")).toHaveCount(0);
      await expect(card.getByRole("tablist")).toHaveCount(0);
      await expect(card.getByRole("table")).toHaveCount(0);
      if (state.id === "profile-empty") {
        await expect(card).toHaveAttribute("data-coach-card", "result");
        await expect(
          card.getByText("跑步训练区间", { exact: true }),
        ).toBeVisible();
      } else {
        const step = page.locator('[data-activity-id="zones-call"]');
        const toggle = step.getByRole("button");
        await expect(step.locator("[data-coach-card]")).toHaveCount(1);
        await expect(card.locator("header")).toHaveCount(0);
        await toggle.press("Enter");
        await expect(card).toBeHidden();
        await toggle.press("Enter");
        await expect(card).toBeVisible();
        await toggle.blur();
      }
    }
    if (state.id.startsWith("timeline-evidence-")) {
      // No result is duplicated as a detached card below the execution list.
      const details = page.locator("[data-activity-result]");
      const expectedCalls = state.id === "timeline-evidence-events" ? 1 : 2;
      await expect(details).toHaveCount(expectedCalls);
      await expect(page.locator('[data-coach-card="collapsible"]')).toHaveCount(
        0,
      );
      for (const detail of await details.all()) {
        await expect(
          detail.locator('[data-coach-card="details"]'),
        ).toBeVisible();
      }
      const first = page.locator("[data-activity-id]").first();
      await first.getByRole("button").first().focus();
      await first.getByRole("button").first().press("Enter");
      await expect(first.locator("[data-activity-result]")).toBeHidden();
      await first.getByRole("button").first().press("Enter");
      await expect(first.locator("[data-activity-result]")).toBeVisible();
      await first.getByRole("button").first().blur();
    }
    if (state.id === "timeline-evidence-parallel") {
      await expect(
        page.locator('[data-activity-result="recent-one"]'),
      ).toContainText("清晨轻松跑");
      await expect(
        page.locator('[data-activity-result="recent-one"]'),
      ).not.toContainText("室内有氧骑行");
      await expect(
        page.locator('[data-activity-result="recent-two"]'),
      ).toContainText("室内有氧骑行");
    }
    if (state.id === "timeline-evidence-empty") {
      const zones = page.locator('[data-activity-result="zones-call"]');
      await expect(zones.locator("header")).toHaveCount(0);
      await expect(zones.getByRole("table")).toBeVisible();
      await expect(zones.getByText(/^基准：/)).toBeVisible();
      await expect(zones.getByRole("tab", { name: "心率" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(zones.getByRole("tab")).toHaveCount(1);
    }
    if (state.id === "timeline-zone-metrics") {
      const zones = page.locator('[data-activity-result="zones-call"]');
      await expect(zones.getByRole("tab")).toHaveCount(3);
      const pace = zones.getByRole("tab", { name: "配速" });
      await expect(pace).toHaveAttribute("aria-selected", "true");
      await pace.focus();
      await page.keyboard.press("ArrowRight");
      const heartRate = zones.getByRole("tab", { name: "心率" });
      await expect(heartRate).toBeFocused();
      await expect(heartRate).toHaveAttribute("aria-selected", "true");
      await expect(zones.locator("[data-coach-zone-benchmark]")).toHaveText(
        "基准：LTHR 173 bpm",
      );
      await expect(zones.getByRole("table")).toContainText("bpm");
      await page.keyboard.press("ArrowRight");
      await expect(zones.getByRole("tab", { name: "功率" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(zones.locator("[data-coach-zone-benchmark]")).toHaveText(
        "基准：CP 280 W",
      );
      await expect(zones.getByRole("table")).toContainText("W");
      await pace.click();
      await pace.blur();
      await expect(zones.locator("[data-coach-zone-benchmark]")).toHaveText(
        "基准：VO2MAX",
      );
      await expect(zones.getByRole("table")).toContainText("06:12");
    }
    if (
      ["timeline-evidence-empty", "timeline-zone-metrics"].includes(state.id)
    ) {
      const benchmark = page.locator(
        '[data-activity-result="zones-call"] [data-coach-zone-benchmark]',
      );
      const box = (await benchmark.boundingBox())!;
      const toolbar = (await benchmark.locator("..").boundingBox())!;
      expect(
        Math.abs(box.x + box.width - toolbar.x - toolbar.width),
      ).toBeLessThan(2);
    }
    if (state.id === "timeline-plan-delivery") {
      await expect(
        page.locator('[data-activity-result="zones-call"]'),
      ).toBeHidden();
      await expect(
        page.getByRole("button", { name: "保存计划", exact: true }),
      ).toBeVisible();
    }
    const choose = async (role: "radio" | "checkbox", index: number) => {
      const option = page.getByRole(role).nth(index);
      await option.focus();
      await option.press("Space");
      await expect(option).toBeChecked();
    };
    if (state.interaction === "select") await choose("radio", 0);
    if (state.status === "awaiting_input") {
      await expect(
        page.getByRole("log").locator("[data-coach-question]"),
      ).toHaveCount(0);
      await expect(
        page.locator("[data-coach-question-dock] [data-coach-question]"),
      ).toBeVisible();
      await expect(page.locator("[data-coach-composer-layer]")).toHaveAttribute(
        "inert",
        "",
      );
    }
    if (state.id === "question-pending") {
      const anchor = page.locator("[data-coach-question-anchor]");
      const before = await anchor.boundingBox();
      const logBefore = await page.getByRole("log").boundingBox();
      const question = await page
        .locator("[data-coach-question]")
        .boundingBox();
      expect(question!.y).toBeLessThan(before!.y);
      await page.getByRole("button", { name: "暂时收起问题" }).click();
      await expect(page.locator("[data-coach-question-dock]")).toBeHidden();
      expect(await anchor.boundingBox()).toEqual(before);
      expect(await page.getByRole("log").boundingBox()).toEqual(logBefore);
      await page.getByRole("button", { name: "继续回答" }).click();
      await expect(page.locator("[data-coach-question]")).toBeVisible();
      expect(await anchor.boundingBox()).toEqual(before);
      expect(await page.getByRole("log").boundingBox()).toEqual(logBefore);
    }
    if (state.interaction === "dismiss" || state.interaction === "reopen") {
      await choose("radio", 0);
      await page.getByRole("button", { name: "暂时收起问题" }).click();
      await expect(page.locator("[data-coach-question-dock]")).toBeHidden();
      await expect(page.getByRole("textbox", { name: /比如/ })).toBeVisible();
      if (state.interaction === "reopen") {
        await page.getByRole("button", { name: "继续回答" }).click();
        await expect(page.getByRole("radio").first()).toBeChecked();
      }
    }
    if (state.interaction === "next") {
      await choose("radio", 0);
      await page.getByRole("button", { name: "下一步", exact: true }).click();
      await choose("radio", 1);
      await expect(
        page.getByRole("button", { name: "提交", exact: true }),
      ).toBeEnabled();
    }
    if (state.interaction === "multi") {
      await choose("checkbox", 0);
      await choose("checkbox", 1);
    }
    if (state.interaction === "note")
      await page
        .getByRole("textbox", { name: "备注", exact: true })
        .fill("最近刚恢复跑步，希望先从每周两次轻松跑开始。");
    if (state.interaction === "undo") {
      await page.getByRole("button", { name: "撤销", exact: true }).click();
      await expect(page.getByText("已撤销", { exact: true })).toBeVisible();
    }
    if (state.interaction === "collapse-card")
      await page
        .locator('[data-coach-card] button[aria-expanded="true"]')
        .click();
    if (state.interaction === "open-credit-recovery") {
      const actionName =
        state.membershipPlan === "FREE" ? "开通会员" : "补充积分";
      await page.getByRole("button", { name: actionName, exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      if (state.membershipPlan !== "FREE") {
        await expect(
          page.getByRole("dialog").filter({ hasText: "积分补充包" }),
        ).toContainText("5,000 积分");
      }
    }
    if (state.id === "question-inactive")
      await expect(page.getByRole("radio").first()).toBeDisabled();
    if (state.id === "run-running") {
      await expect(
        page.getByText("加载技能 · 训练分析", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("读取最近训练", { exact: true })).toHaveCount(
        2,
      );
      await expect(
        page.getByText(/training-analytics|activity\.recent/),
      ).toHaveCount(0);
    }
    if (state.id === "workout-applied")
      await expect(
        page.getByRole("button", { name: "已应用", exact: true }),
      ).toBeDisabled();
    if (state.id === "plan-saved")
      await expect(
        page.getByRole("button", { name: "已保存", exact: true }),
      ).toBeDisabled();
    if (state.id === "decision-applied")
      await expect(
        page.getByRole("button", { name: "确认并更新计划", exact: true }),
      ).toHaveCount(0);
    if (state.id === "run-write-blocked")
      await expect(
        page.getByRole("button", { name: "继续执行（新尝试）", exact: true }),
      ).toHaveCount(0);
    if (
      state.category === "Workout" &&
      ![
        "workout-rest",
        "workout-fallback",
        "workout-parsing",
        "workout-strength",
        "workout-freeform",
      ].includes(state.id)
    )
      await expect(page.locator(".uplot canvas").first()).toBeVisible();
    if (state.id === "workout-parsing")
      await expect(
        page.locator('[data-coach-workout-preview] [role="status"]').first(),
      ).toBeVisible();
    if (state.id === "workout-fallback")
      await expect(
        page.locator("[data-coach-workout-preview] details[open]").first(),
      ).toBeVisible();
    if (state.category === "体能评估")
      await expect(page.locator("[data-coach-card]").first()).toBeVisible();
    if (state.category === "训练图表")
      await expect(page.getByTestId("training-exploration-card")).toBeVisible();
    if (state.expected)
      await expect(
        page.getByText(state.expected, { exact: false }),
      ).toBeVisible();
    // Result surfaces use background contrast; disclosure rows have no frame.
    for (const card of await page.locator("[data-coach-card]").all()) {
      const presentation = await card.evaluate((el) => {
        const css = getComputedStyle(el);
        return {
          border: css.borderWidth,
          background: css.backgroundColor,
          kind: el.getAttribute("data-coach-card"),
        };
      });
      expect(presentation.border).toBe("0px");
      if (presentation.kind === "result")
        expect(presentation.background).not.toBe("rgba(0, 0, 0, 0)");
      if (presentation.kind === "collapsible")
        expect(presentation.background).toBe("rgba(0, 0, 0, 0)");
    }
    if (
      state.id.startsWith("workout-a") ||
      state.id === "decision-pending" ||
      state.id === "decision-applied"
    )
      await expect(
        page.locator('[data-coach-workout-preview] [role="status"]'),
      ).toHaveCount(0);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const dir = resolve(artifactRoot, testInfo.project.name);
    await mkdir(dir, { recursive: true });
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((theme) => {
        localStorage.setItem("theme", theme);
        // Notify next-themes as a cross-tab theme change, updating context too.
        window.dispatchEvent(
          new StorageEvent("storage", { key: "theme", newValue: theme }),
        );
      }, theme);
      await scrollThread(page, "top");
      // Give charts and next-themes a pair of paint frames; no arbitrary sleep.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await page.screenshot({
        path: resolve(dir, `${state.id}-${theme}.png`),
        animations: "disabled",
        scale: "css",
      });
      const overflow = await page
        .getByRole("log")
        .evaluate((root) =>
          [root, ...root.querySelectorAll<HTMLElement>("div")].some(
            (el) =>
              /auto|scroll/.test(getComputedStyle(el).overflowY) &&
              el.scrollHeight > el.clientHeight + 40,
          ),
        );
      if (overflow) {
        await scrollThread(page, "bottom");
        await page.screenshot({
          path: resolve(dir, `${state.id}-${theme}-bottom.png`),
          animations: "disabled",
          scale: "css",
        });
      } else {
        // Do not show a prior design's long-content capture after this state
        // becomes compact enough to fit in the viewport.
        await rm(resolve(dir, `${state.id}-${theme}-bottom.png`), {
          force: true,
        });
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test.afterAll(async () => {
  await mkdir(artifactRoot, { recursive: true });
  const escape = (s: string) =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  const cards = visualStates
    .map(
      (state) =>
        `<article data-category="${escape(state.category)}" id="${state.id}"><header><span>${escape(state.category)}</span><h2>${escape(state.title)}</h2><code>${state.id}</code></header><a class="capture" target="_blank"><img loading="lazy" alt="${escape(state.title)}"></a><details><summary>查看底部（长内容）</summary><a class="bottom" target="_blank"><img loading="lazy" alt="${escape(state.title)}的底部"></a></details></article>`,
    )
    .join("");
  await writeFile(
    resolve(artifactRoot, "index.html"),
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Coach · 状态截图验收</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f5f5;color:#171717;font:14px/1.6 system-ui,sans-serif}main{max-width:1480px;margin:auto;padding:32px 24px}h1{margin:0;font-size:26px}p{color:#666}nav{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:14px 24px;display:flex;gap:12px;flex-wrap:wrap;z-index:2}select,input{font:inherit;border:1px solid #ccc;border-radius:6px;padding:7px;background:#fff}#grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr));gap:24px}article{min-width:0;background:white;border:1px solid #ddd;border-radius:6px;overflow:hidden}article header{padding:16px}h2{font-size:16px;margin:4px 0}code,header span{color:#777;font-size:12px}img{display:block;width:100%;height:auto;border-top:1px solid #eee}body.phone .capture img,body.phone .bottom img{max-width:412px;margin:auto}details summary{cursor:pointer;padding:10px 16px;color:#666}a{display:block;color:inherit}[hidden]{display:none!important}</style><nav><select id="device" aria-label="设备"><option value="coach-desktop">桌面 1440 × 960</option><option value="coach-phone">手机 412 × 839</option></select><select id="theme" aria-label="主题"><option value="light">浅色</option><option value="dark">暗色</option></select><select id="category" aria-label="类别"><option value="">所有状态</option>${[...new Set(visualStates.map((s) => s.category))].map((c) => `<option>${escape(c)}</option>`).join("")}</select><input id="search" placeholder="搜索状态…" aria-label="搜索状态"><span id="count"></span></nav><main><h1>AI Coach · 状态截图验收</h1><p>${visualStates.length} 个场景 × 桌面 / 手机 × 浅色 / 暗色。来自真实 Next.js Coach 页面和实际渲染器；API、模型输出与运动数据为测试 fixture，未调用真实模型或改动训练。长内容可展开查看底部，点击截图查看原图。</p><div id="grid">${cards}</div></main><script>const device=document.querySelector('#device'),theme=document.querySelector('#theme'),category=document.querySelector('#category'),search=document.querySelector('#search');function update(){document.body.classList.toggle('phone',device.value==='coach-phone');let count=0;document.querySelectorAll('article').forEach(a=>{a.hidden=!!((category.value&&a.dataset.category!==category.value)||(search.value&&!a.textContent.toLowerCase().includes(search.value.toLowerCase())));if(!a.hidden)count++;const base=device.value+'/'+a.id+'-'+theme.value;a.querySelector('.capture').href=base+'.png';a.querySelector('.capture img').src=base+'.png';const bottom=a.querySelector('.bottom img');a.querySelector('.bottom').href=base+'-bottom.png';bottom.onload=()=>a.querySelector('details').hidden=false;bottom.onerror=()=>a.querySelector('details').hidden=true;bottom.src=base+'-bottom.png'});document.querySelector('#count').textContent=count+' 个状态'}[device,theme,category,search].forEach(el=>el.addEventListener('input',update));update();</script></html>`,
  );
});
