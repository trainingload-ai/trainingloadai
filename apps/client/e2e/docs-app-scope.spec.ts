import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fit = readFileSync(
  resolve(
    process.cwd(),
    "../server/src/importing/spec/fixtures/conversion-gps.fit",
  ),
);
const copy = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "../../packages/messages/docs/zh.json"),
    "utf8",
  ),
);
const inspection = {
  format: "fit",
  kinds: ["activity"],
  byteLength: fit.length,
  extensionFormat: "fit",
  extensionMismatch: false,
  metadata: {},
  warnings: [],
  activity: {
    activityCount: 1,
    lapCount: 0,
    recordCount: 2,
    coordinateCount: 2,
    sports: ["cycling"],
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "doNotTrack", { get: () => "1" }),
  );
});

test("independent tool and education templates retain one main landmark", async ({
  page,
}) => {
  for (const route of [
    "converter",
    "fit-course-converter",
    "fit-to-gpx",
    "tss-calculator",
    "rpe-scale",
    "brick-workout",
  ]) {
    await page.goto(`/zh/${route}`);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.locator("main main")).toHaveCount(0);
  }
});

test("plan showcase panels support keyboard selection and find-in-page reveal", async ({
  page,
}) => {
  await page.goto("/zh/5k-training-plan");
  const tabs = page
    .getByRole("tablist", { name: "Trainingload.ai", exact: true })
    .getByRole("tab");
  await tabs.nth(0).press("ArrowDown");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel");
  await expect(panel).toHaveAttribute(
    "aria-labelledby",
    (await tabs.nth(1).getAttribute("id")) as string,
  );
  await expect(
    page.locator('[role="tabpanel"][hidden="until-found"]'),
  ).toHaveCount(2);
  await page
    .locator('[role="tabpanel"][hidden="until-found"]')
    .last()
    .evaluate((node) => node.dispatchEvent(new Event("beforematch")));
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toBeVisible();
});

test("plan weeks expose headings and a visible keyboard disclosure focus", async ({
  page,
}) => {
  await page.goto("/zh/5k-to-10k-training-plan");
  const toggle = page.locator('input[id$="week-2-toggle"]');
  await expect(
    page.getByRole("heading", { level: 3, name: "第 2 周", exact: true }),
  ).toBeVisible();
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await expect
    .poll(() =>
      toggle.evaluate(
        (node) => getComputedStyle(node.nextElementSibling!).outlineStyle,
      ),
    )
    .not.toBe("none");
  await toggle.press("Space");
  await expect(toggle).toBeChecked();
  await expect(page.locator('[id$="week-2-details"]')).toBeVisible();
});

for (const [route, selector, valid] of [
  ["max-heart-rate-calculator", "#max-heart-rate-age", "35"],
  ["heart-rate-zones-calculator", "#hr-max", "190"],
  ["zone-2-heart-rate-calculator", "#zone2-maxHr", "190"],
  ["power-zones-calculator", "#pz-watts", "250"],
  ["css-calculator", "#css-a-distance", "400"],
  ["running-pace-calculator", "#running-pace-distance", "5"],
] as const) {
  test(`${route} shows range errors after blur and clears them on correction`, async ({
    page,
  }) => {
    await page.goto(`/zh/${route}`);
    const field = page.locator(selector);
    await field.fill("0");
    await expect(field).not.toHaveAttribute("aria-invalid", "true");
    await field.press("Tab");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    const ids = (await field.getAttribute("aria-describedby"))!.split(" ");
    await expect(page.locator(`[id="${ids.at(-1)}"]`)).toBeVisible();
    await field.fill(valid);
    await expect(field).not.toHaveAttribute("aria-invalid", "true");
    expect((await field.getAttribute("aria-describedby")) ?? "").not.toContain(
      "error",
    );
  });
}

test("omitted power comparison tables scroll with keyboard on narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/zh/power-zones-calculator");
  const region = page
    .locator('[role="region"][tabindex="0"]')
    .filter({ has: page.locator("table") })
    .first();
  await region.focus();
  await region.press("ArrowRight");
  await expect
    .poll(() => region.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
});

test("upload picker is native and long filenames remain readable during inspection", async ({
  page,
}) => {
  let finishInspection!: () => void;
  const ready = new Promise<void>((resolve) => {
    finishInspection = resolve;
  });
  await page.route(
    "**/api/proxy/public/inspect-activity-file",
    async (route) => {
      await ready;
      await route.fulfill({ json: { data: inspection } });
    },
  );
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/zh/converter");
  const picker = page.locator('[data-slot="file-dropzone"]');
  expect(await picker.evaluate((node) => node.tagName)).toBe("BUTTON");
  const chooserPromise = page.waitForEvent("filechooser");
  await picker.press("Space");
  const chooser = await chooserPromise;
  const name = `${"local-fixture-".repeat(14)}.fit`;
  await chooser.setFiles({
    name,
    mimeType: "application/octet-stream",
    buffer: fit,
  });
  const progress = page.getByRole("progressbar");
  await expect(progress).toHaveCount(1);
  await expect(progress).not.toHaveAttribute("value");
  await expect(progress).not.toHaveAttribute("aria-valuenow");
  const filename = page.getByText(name, { exact: true });
  await expect(filename).toBeVisible();
  expect(
    await filename.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  finishInspection();
  await expect(progress).toHaveCount(0);
});

test("conversion completion dialog is modal and Escape returns focus to conversion", async ({
  page,
}) => {
  await page.route("**/api/proxy/public/inspect-activity-file", (route) =>
    route.fulfill({ json: { data: inspection } }),
  );
  await page.route("**/api/proxy/public/convert", (route) =>
    route.fulfill({
      contentType: "application/gpx+xml",
      headers: {
        "content-disposition": 'attachment; filename="fixture.gpx"',
        "X-TrackSwap-Conversion-Report": JSON.stringify({
          version: 1,
          targetFormat: "gpx",
          files: [
            {
              sourceFormat: "fit",
              inputRecords: 2,
              outputRecords: 2,
              warnings: [],
            },
          ],
        }),
      },
      body: "<gpx/>",
    }),
  );
  await page.goto("/zh/converter");
  await page.locator('input[type="file"]').setInputFiles({
    name: "fixture.fit",
    mimeType: "application/octet-stream",
    buffer: fit,
  });
  const convert = page.getByRole("button", {
    name: copy.converter.page.buttons.convertAria,
    exact: true,
  });
  await expect(convert).toBeEnabled();
  await convert.click();
  const dialog = page.getByRole("dialog", {
    name: copy.converter.page.trainingPlanPrompt.title,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((node) => node.matches(":modal"))).toBe(true);
  await expect(
    dialog.getByRole("button", { name: "关闭", exact: true }),
  ).toBeFocused();
  await dialog.press("Tab");
  // A native modal may move focus to browser chrome, but never to page controls.
  expect(
    await dialog.evaluate(
      (node) =>
        document.activeElement === document.body ||
        node.contains(document.activeElement),
    ),
  ).toBe(true);
  await dialog.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(convert).toBeFocused();
});

test("home carousel can stay paused after keyboard focus leaves", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/zh");
  const pause = page.getByRole("button", { name: "暂停自动播放", exact: true });
  await pause.click();
  const resume = page.getByRole("button", {
    name: "继续自动播放",
    exact: true,
  });
  await expect(resume).toBeVisible();
  const selected = page
    .locator("#home-product-panel")
    .getAttribute("aria-labelledby");
  await page.getByRole("heading", { level: 1 }).click();
  // The interval must exceed one complete carousel cycle.
  await page.waitForTimeout(7500);
  expect(
    await page.locator("#home-product-panel").getAttribute("aria-labelledby"),
  ).toBe(await selected);
});

test("reduced motion makes explicit calculator navigation instantaneous", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Element.prototype.scrollIntoView = function (options) {
      (window as unknown as { lastScroll: unknown }).lastScroll = options;
    };
  });
  await page.goto("/zh/max-heart-rate-calculator");
  await page.locator("#max-heart-rate-age").fill("35");
  await page.locator('#calculator button[type="submit"]').click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { lastScroll: { behavior: string } }).lastScroll
          .behavior,
    ),
  ).toBe("instant");
});

test("AI review result metric controls expose button state", async ({
  page,
}) => {
  await page.route(
    "**/api/proxy/public/ai-workout-review-admissions",
    (route) =>
      route.fulfill({
        json: {
          data: { status: "eligible", admissionToken: "local-test-fixture" },
        },
      }),
  );
  const visualization = {
    sport: "CYCLING",
    verticalExaggeration: 1,
    warnings: [],
    trends: [
      {
        index: 0,
        elapsedSec: 0,
        distanceM: 0,
        speedMps: 5,
        heartRateBpm: 130,
        powerW: 150,
      },
      {
        index: 1,
        elapsedSec: 60,
        distanceM: 300,
        speedMps: 6,
        heartRateBpm: 140,
        powerW: 170,
      },
    ],
  };
  const review = {
    schemaVersion: "1.0",
    language: "zh",
    sport: "CYCLING",
    verdict: "Local fixture",
    overview: "Synthetic review",
    workoutType: { label: "Endurance", rationale: "Fixture" },
    keyFindings: [],
    intensityAssessment: "Steady",
    recoverySuggestion: "Fixture",
    nextWorkoutSuggestion: "Fixture",
    limitations: [],
    disclaimer: "Synthetic fixture",
  };
  await page.route("**/api/proxy/public/ai-workout-reviews", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body:
        [
          { type: "visualization", data: visualization },
          { type: "result", data: review },
        ]
          .map((event) => JSON.stringify(event))
          .join("\n") + "\n",
    }),
  );
  await page.goto("/zh/free-ai-workout-review");
  await page.locator('input[type="file"]').setInputFiles({
    name: "fixture.fit",
    mimeType: "application/octet-stream",
    buffer: fit,
  });
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: "开始复盘", exact: true }).click();
  const metrics = page
    .getByRole("group")
    .filter({ has: page.locator("button[aria-pressed]") });
  await expect(metrics).toHaveCount(1);
  const buttons = metrics.getByRole("button");
  await buttons.nth(1).press("Space");
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(buttons.nth(0)).toHaveAttribute("aria-pressed", "false");
});

test("MDX code viewports keep copying and narrow-screen keyboard scrolling", async ({
  page,
  context,
  browserName,
}) => {
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/docs/metrics/training-load/training-impulse");
  const viewport = page
    .locator('[data-docs-code-viewport][tabindex="0"]')
    .first();
  await viewport.focus();
  await viewport.press("ArrowRight");
  await expect
    .poll(() => viewport.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
  if (browserName === "chromium") {
    await page
      .getByRole("button", { name: "Copy Text", exact: true })
      .first()
      .click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain("TRIMP");
  }
});

test("embedded metric preview buttons have meaningful names", async ({
  page,
}) => {
  await page.goto("/docs/metrics/pmc/acute-to-chronic-workload-ratio");
  const empty = page
    .getByRole("main")
    .getByRole("button", { name: "", exact: true });
  await expect(empty).toHaveCount(0);
});

test("FIT results stay operable after local worker parsing", async ({
  page,
}) => {
  await page.goto("/zh/fit-file-viewer");
  await page.locator('input[type="file"]').setInputFiles({
    name: "scope-fixture.fit",
    mimeType: "application/octet-stream",
    buffer: fit,
  });
  await page
    .getByRole("button", {
      name: copy.fitFileViewer.page.buttons.inspect,
      exact: true,
    })
    .click();
  const tabs = page.getByRole("tablist").getByRole("tab");
  await expect(tabs.first()).toBeVisible();
  await tabs.first().press("End");
  await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toBeVisible();
  expect(await page.getByRole("main").count()).toBe(1);
});
