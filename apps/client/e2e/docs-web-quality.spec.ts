import { expect, test } from "@playwright/test";

test.setTimeout(90_000);

test("docs skip link bypasses the repeated navigation", async ({ page }) => {
  await page.goto("/zh/docs");
  const skip = page.getByRole("link", { name: "跳转到正文", exact: true });
  await skip.focus();
  await expect(skip).toBeVisible();
  await skip.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page.getByRole("main")).toHaveCount(1);
});

test("each documentation TOC link has a rendered heading target", async ({
  page,
}) => {
  await page.goto("/zh/docs");
  const tocLinks = page.locator("#nd-toc a[href], #nd-tocnav a[href]");
  await expect(tocLinks.first()).toBeAttached();
  const missing = await tocLinks.evaluateAll((links) =>
    links
      .filter((link) => {
        const hash = (link as HTMLAnchorElement).hash.slice(1);
        return hash && !document.getElementById(decodeURIComponent(hash));
      })
      .map((link) => link.getAttribute("href")),
  );
  expect(missing).toEqual([]);
});

test("language selection supports keyboard dismissal and preserves the page query", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/zh/docs?source=keyboard");
  const trigger = page.getByRole("button", { name: "语言: 简中", exact: true });
  await trigger.focus();
  await trigger.press("Enter");
  const picker = page.getByRole("dialog", { name: "语言", exact: true });
  await expect(picker).toBeVisible();
  await expect(
    picker.getByRole("link", { name: "English", exact: true }),
  ).toHaveAttribute("href", "/docs?source=keyboard");
  await picker.press("Escape");
  await expect(picker).toBeHidden();
  await expect(trigger).toBeFocused();
});

for (const route of ["/zh/docs", "/zh/tools"]) {
  test(`mobile navigation can be dismissed with Escape on ${route}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    const trigger = page.getByRole("button", {
      name: "打开主菜单",
      exact: true,
    });
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await trigger.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("mobile TOC closes after choosing a heading", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh/docs");
  const toc = page.locator("#nd-tocnav");
  await toc.locator("summary").click();
  await expect(toc).toHaveAttribute("open", "");
  await toc.getByRole("link", { name: "遇到问题时", exact: true }).click();
  await expect(toc).not.toHaveAttribute("open", "");
  const target = page.locator('[id="按真实场景继续"]');
  await expect(target).toBeInViewport();
  const top = await target.evaluate((node) => node.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(90);
});

test("image preview is modal and restores focus without moving the page", async ({
  page,
}) => {
  await page.goto("/zh/blog/what-are-ctl-atl-tsb");
  const trigger = page.getByRole("button", { name: /^预览图片：/ }).first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  const before = await page.evaluate(() => ({
    y: window.scrollY,
    width: document.documentElement.clientWidth,
  }));
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "图片预览", exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "关闭预览", exact: true }),
  ).toBeFocused();
  expect(await dialog.evaluate((node) => node.matches(":modal"))).toBe(true);
  await dialog.press("Tab");
  expect(
    await dialog.evaluate(
      (node) =>
        document.activeElement === document.body ||
        node.contains(document.activeElement),
    ),
  ).toBe(true);
  await dialog.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(
    await page.evaluate(() => ({
      y: window.scrollY,
      width: document.documentElement.clientWidth,
    })),
  ).toEqual(before);
});

test("reduced motion keeps image preview affordances still", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/zh/blog/what-are-ctl-atl-tsb");
  const trigger = page.getByRole("button", { name: /^预览图片：/ }).first();
  await trigger.hover();
  expect(
    await trigger
      .locator("img")
      .evaluate((node) => getComputedStyle(node).transform),
  ).toBe("none");
});

test("Markdown copy announces successful completion", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Clipboard permissions are browser-specific.",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/zh/docs");
  const markdownResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/docs-markdown/zh",
    { timeout: 60_000 },
  );
  await page
    .getByRole("button", { name: "复制 Markdown", exact: true })
    .click();
  const response = await markdownResponse;
  expect(response.ok()).toBe(true);
  const markdown = await response.text();
  expect(markdown).toContain("# Trainingload.ai");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(markdown);
  await expect(
    page.getByRole("status").filter({ hasText: "已复制" }),
  ).toHaveText("已复制");
});

for (const route of [
  "/zh",
  "/zh/tools",
  "/zh/pricing",
  "/zh/blog",
  "/zh/training-load",
]) {
  test(`page owns one main landmark on ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.locator("#main-content")).toHaveCount(1);
  });
}

test("demo modal contains keyboard focus and restores its invoker", async ({
  page,
}) => {
  test.skip(
    (page.viewportSize()?.width ?? 1440) < 768,
    "The desktop Demo preview is intentionally hidden on mobile.",
  );
  await page.goto("/zh/features/pmc-fitness-chart");
  const trigger = page.getByRole("button", {
    name: "展开完整 PMC 桌面端演示",
    exact: true,
  });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  const before = await page.evaluate(() => ({
    y: scrollY,
    width: document.documentElement.clientWidth,
  }));
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "展开完整 PMC 桌面端演示",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "关闭预览", exact: true }),
  ).toBeFocused();
  expect(await dialog.evaluate((node) => node.matches(":modal"))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate(
      (node) =>
        document.activeElement === document.body ||
        node.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate(
      (node) =>
        document.activeElement === document.body ||
        node.contains(document.activeElement),
    ),
  ).toBe(true);
  const help = dialog
    .getByRole("button", { name: "状态分区说明", exact: true })
    .first();
  await help.click();
  const nested = dialog.getByRole("dialog");
  await expect(nested).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nested).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(help).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(
    await page.evaluate(() => ({
      y: scrollY,
      width: document.documentElement.clientWidth,
    })),
  ).toEqual(before);
  await trigger.press("Enter");
  await dialog.click({ position: { x: 80, y: 80 } });
  await expect(dialog).toBeVisible();
  await page.mouse.click(1, 1);
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

for (const tool of ["ftp-calculator", "critical-power-calculator"]) {
  test(`range validation waits for blur and links its explanation on ${tool}`, async ({
    page,
  }) => {
    await page.goto(`/zh/${tool}`);
    const prefix = tool === "ftp-calculator" ? "ftp" : "cp";
    const field = page.locator(`#${prefix}-weight`);
    await field.fill("7");
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("aria-invalid", "false");
    await field.fill("70");
    await field.press("Tab");
    await expect(field).toHaveAttribute("aria-invalid", "false");
    await field.fill("7");
    await expect(field).toHaveAttribute("aria-invalid", "false");
    await field.press("Tab");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAttribute(
      "aria-describedby",
      `${prefix}-weight-error`,
    );
    await expect(page.locator(`#${prefix}-weight-error`)).toContainText("30");
    await field.fill("70");
    await expect(field).toHaveAttribute("aria-invalid", "false");
    await expect(field).not.toHaveAttribute("aria-describedby");
  });
}

test("threshold tabs reveal their associated panels without losing entered data", async ({
  page,
}) => {
  await page.goto("/zh/lactate-threshold-calculator");
  const list = page.getByRole("tablist").first();
  const race = list.getByRole("tab").first();
  await page.locator("#lt-race-time").fill("0:45:00");
  await race.focus();
  await race.press("ArrowRight");
  const selected = list.getByRole("tab").nth(1);
  await expect(selected).toHaveAttribute("aria-selected", "true");
  const panelId = await selected.getAttribute("aria-controls");
  const panel = page.locator(`[id="${panelId}"]`);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("role", "tabpanel");
  await expect(panel).toHaveAttribute(
    "aria-labelledby",
    (await selected.getAttribute("id"))!,
  );
  await selected.press("ArrowLeft");
  await expect(page.locator("#lt-race-time")).toHaveValue("0:45:00");
});

test("editor selectors have persistent field names", async ({ page }) => {
  await page.goto("/zh/workout-editor");
  await expect(page.locator("#workout-sport")).toHaveAccessibleName("运动");
  await page.getByRole("button", { name: "添加步骤", exact: true }).click();
  const selectors = page.getByRole("combobox");
  for (const control of await selectors.all()) {
    await expect(control).toHaveAccessibleName(/.+/);
    const label = page.locator(
      `label[for="${await control.getAttribute("id")}"]`,
    );
    await label.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(control).toBeFocused();
  }
});

test("narrow tables can be scrolled with the keyboard without extra desktop stops", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/zh/ftp-calculator");
  const region = page
    .locator('[role="region"]')
    .filter({ has: page.locator("table") })
    .first();
  await expect(region).toHaveAttribute("tabindex", "0");
  await region.focus();
  await region.press("ArrowRight");
  await expect
    .poll(() => region.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  const table = page.locator("table").first();
  const wrapper = table.locator("..");
  await expect
    .poll(() =>
      wrapper.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    )
    .toBe(true);
  await expect(wrapper).not.toHaveAttribute("tabindex");
});

for (const route of [
  "/zh",
  "/zh/pricing",
  "/zh/features/pmc-fitness-chart",
  "/zh/audit-missing-page",
]) {
  test(`links remain single controls and the footer has a name on ${route}`, async ({
    page,
  }) => {
    await page.goto(route);
    await expect(page.locator("a button, button a")).toHaveCount(0);
    if (route === "/zh/pricing" && (page.viewportSize()?.width ?? 1440) < 640) {
      const region = page.locator("#plan-comparison [role=region]");
      const header = region.locator("th").first();
      expect(
        await header.evaluate((node) => node.getBoundingClientRect().width),
      ).toBeLessThan((await region.evaluate((node) => node.clientWidth)) * 0.8);
      await region.focus();
      await region.press("End");
      await region.press("ArrowRight");
      await expect
        .poll(() => region.evaluate((node) => node.scrollLeft))
        .toBeGreaterThan(0);
    }
    if (route !== "/zh/audit-missing-page")
      await expect(
        page.locator('footer a[href="/zh"]').first(),
      ).toHaveAccessibleName("Trainingload.ai");
  });
}

for (const route of ["/zh", "/zh/docs"]) {
  test(`persisted theme chooses one screenshot resource on ${route}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    const resources: string[] = [];
    page.on("request", (request) => {
      if (
        !request.url().includes("theme-image-preload.js") &&
        /home(?:-dark)?(?:-v2)?/.test(request.url())
      )
        resources.push(decodeURIComponent(request.url()));
    });
    await page.goto(route);
    const image = page.locator("[data-themed-image]").first();
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveCSS(
      "background-image",
      /(?:home-dark-v2|getting-started-home-dark)/,
    );
    await expect
      .poll(
        () =>
          resources.filter((url) =>
            /(?:home-dark-v2|getting-started-home-dark)/.test(url),
          ).length,
      )
      .toBeGreaterThan(0);
    expect(
      resources.filter((url) =>
        /(?:home-v2|getting-started-home\.webp)/.test(url),
      ),
    ).toEqual([]);
    const toggle = page
      .getByRole("button", { name: "主题", exact: true })
      .first();
    // The theme control replaces an SSR placeholder after hydration.
    await expect(
      page.locator('button[aria-label="主题"]').first(),
    ).toBeAttached();
    if (route === "/zh" && (page.viewportSize()?.width ?? 1440) < 1024) {
      await page
        .getByRole("button", { name: "打开主菜单", exact: true })
        .click();
      await page.getByRole("button", { name: "浅色", exact: true }).click();
    } else {
      await expect(toggle).toBeVisible();
      await toggle.click();
    }
    await expect(image).toHaveCSS(
      "background-image",
      /(?:home-v2|getting-started-home\.webp)/,
    );
  });
}

test("forced colors keeps a visible theme focus outline", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Forced colors emulation is checked in Chromium.",
  );
  await page.emulateMedia({ forcedColors: "active" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/zh");
  const trigger = page
    .getByRole("button", { name: "主题", exact: true })
    .first();
  await trigger.focus();
  expect(
    await trigger.evaluate((node) => {
      const css = getComputedStyle(node);
      return css.outlineStyle !== "none" && parseFloat(css.outlineWidth) >= 2;
    }),
  ).toBe(true);
});

for (const { route, field, value } of [
  { route: "css-calculator", field: "css-a-distance", value: "450" },
  {
    route: "lactate-threshold-calculator",
    field: "lt-race-time",
    value: "0:45:00",
  },
  {
    route: "max-heart-rate-calculator",
    field: "max-heart-rate-age",
    value: "40",
  },
  { route: "heart-rate-zones-calculator", field: "hr-max", value: "185" },
  { route: "race-time-predictor", field: "race-minutes", value: "50" },
  { route: "vdot-calculator", field: "vdot-clock", value: "25:00" },
]) {
  test(`input source tabs preserve manual values on ${route}`, async ({
    page,
  }) => {
    await page.goto(`/zh/${route}`);
    const list = page.locator("#calculator").getByRole("tablist").last();
    const manual = list.getByRole("tab").first();
    const file = list.getByRole("tab").last();
    // Observe a completed interaction before editing an SSR-rendered input.
    await file.click();
    await expect(file).toHaveAttribute("aria-selected", "true");
    await manual.click();
    await expect(manual).toHaveAttribute("aria-selected", "true");
    await page.locator(`#${field}`).fill(value);
    await manual.focus();
    await manual.press("ArrowRight");
    await expect(file).toHaveAttribute("aria-selected", "true");
    const panelId = await file.getAttribute("aria-controls");
    const panel = page.locator(`[id="${panelId}"]`);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute(
      "aria-labelledby",
      (await file.getAttribute("id"))!,
    );
    await expect(panel.locator('input[type="file"]')).toBeAttached();
    await file.press("ArrowLeft");
    await expect(page.locator(`#${field}`)).toHaveValue(value);
  });
}

for (const { route, field, metric, imperial, original, converted } of [
  {
    route: "ftp-calculator",
    field: "ftp-weight",
    metric: "ftp-units-metric",
    imperial: "ftp-units-imperial",
    original: "70",
    converted: 154.3,
  },
  {
    route: "css-calculator",
    field: "css-a-distance",
    metric: "css-units-meters",
    imperial: "css-units-yards",
    original: "400",
    converted: 437.4,
  },
]) {
  test(`unit choices retain their conversion and keyboard behavior on ${route}`, async ({
    page,
  }) => {
    await page.goto(`/zh/${route}`);
    const selected = page.locator(`#${metric}`);
    const next = page.locator(`#${imperial}`);
    await next.click();
    await expect(next).toHaveAttribute("aria-checked", "true");
    await selected.click();
    await expect(selected).toHaveAttribute("aria-checked", "true");
    await page.locator(`#${field}`).fill(original);
    await selected.focus();
    await selected.press("ArrowRight", { delay: 50 });
    await expect(next).toBeFocused();
    await expect(next).toHaveAttribute("aria-checked", "true");
    await expect(selected).toHaveAttribute("tabindex", "-1");
    await expect
      .poll(async () => Number(await page.locator(`#${field}`).inputValue()))
      .toBeCloseTo(converted, 0);
    await next.press("ArrowLeft", { delay: 50 });
    await expect(selected).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(async () => Number(await page.locator(`#${field}`).inputValue()))
      .toBeCloseTo(Number(original), 0);
  });
}

test("distance presets follow manual distances and remain mutually exclusive", async ({
  page,
}) => {
  await page.goto("/zh/running-pace-calculator");
  const distance = page.locator("#running-pace-distance");
  const presets = page.locator(
    '[data-slot="tool-choice-group"][data-presentation="chips"]',
  );
  await presets.getByRole("radio").nth(1).click();
  await expect(distance).toHaveValue("10");
  await distance.fill("7");
  await expect(presets.locator('[aria-checked="true"]')).toHaveCount(0);
  await presets.getByRole("radio").first().click();
  await expect(distance).toHaveValue("5");
  await expect(presets.locator('[aria-checked="true"]')).toHaveCount(1);
});

test("profile radio choices retain values without submitting the calculator", async ({
  page,
}) => {
  await page.goto("/zh/vo2-max-calculator");
  const form = page.locator("form").first();
  const age = form.getByRole("spinbutton").first();
  const choices = form.getByRole("radiogroup").last().getByRole("radio");
  await choices.last().click();
  await expect(choices.last()).toHaveAttribute("aria-checked", "true");
  await choices.first().click();
  await expect(choices.first()).toHaveAttribute("aria-checked", "true");
  await form.evaluate((node) => {
    node.setAttribute("data-test-submissions", "0");
    node.addEventListener("submit", () =>
      node.setAttribute(
        "data-test-submissions",
        String(Number(node.getAttribute("data-test-submissions")) + 1),
      ),
    );
  });
  await age.fill("35");
  await choices.first().focus();
  await choices.first().press("ArrowRight", { delay: 50 });
  await expect(choices.last()).toBeFocused();
  await expect(choices.last()).toHaveAttribute("aria-checked", "true");
  await expect(age).toHaveValue("35");
  await expect(form).toHaveAttribute("data-test-submissions", "0");
});

for (const route of [
  "lactate-curve-calculator",
  "race-time-predictor",
  "running-pace-calculator",
]) {
  test(`compact selection groups fit their options on ${route}`, async ({
    page,
  }) => {
    await page.goto(`/zh/${route}`);
    const groups = page.locator(
      '[data-slot="tool-choice-group"][data-presentation="segmented"]:not([data-full-width])',
    );
    await expect(groups.first()).toBeVisible();
    const unusedSpace = await groups.evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        const items = [...node.querySelectorAll('[role="radio"]')];
        const bounds = items.map((item) => item.getBoundingClientRect());
        const occupied =
          Math.max(...bounds.map((box) => box.right)) -
          Math.min(...bounds.map((box) => box.left));
        return (
          node.getBoundingClientRect().width -
          occupied -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight)
        );
      }),
    );
    expect(unusedSpace.every((space) => space < 2)).toBe(true);
  });
}

test("indexes the homepage and tools in every supported locale", async ({
  page,
  request,
}) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  const alternateLocales = [
    "en",
    "de",
    "fr",
    "es",
    "pt-BR",
    "it",
    "ko",
    "ja",
    "zh-Hans",
    "zh-Hant",
    "x-default",
  ].sort();

  const toolPaths = ["/fr", "/fr/tools", "/fr/ftp-calculator", "/fr/fit-to-gpx"];
  for (const path of toolPaths) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /^index, follow$/,
    );
    await expect(page.locator('meta[name="googlebot"]')).toHaveAttribute(
      "content",
      /^index, follow/,
    );
    const alternates = page.locator('link[rel="alternate"][hreflang]');
    await expect(alternates).toHaveCount(alternateLocales.length);
    const hreflangs = await alternates.evaluateAll((links) =>
      links.map((link) => link.getAttribute("hreflang")),
    );
    expect(hreflangs.sort()).toEqual(alternateLocales);
    expect(xml).toContain(`<loc>https://www.trainingload.ai${path}</loc>`);
  }

  for (const path of ["/fr/docs", "/fr/pricing"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /^noindex, follow$/,
    );
    expect(xml).not.toContain(`<loc>https://www.trainingload.ai${path}</loc>`);
  }
  expect(xml).toContain("<loc>https://www.trainingload.ai/ja/docs</loc>");
});

test("renders localized controls in the features demos", async ({
  page,
}) => {
  const translationErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /INVALID_KEY|MISSING_MESSAGE|FORMATTING_ERROR/.test(message.text())
    ) {
      translationErrors.push(message.text());
    }
  });
  await page.goto("/fr/features");

  const planName = "Agrandir la démo: Plan d'entraînement";
  await page.getByRole("button", { name: planName, exact: true }).click();
  const planDialog = page.getByRole("dialog", { name: planName });
  await expect(
    planDialog.getByText("Charge de la semaine", { exact: true }),
  ).toBeVisible();
  await expect(planDialog.getByText("S5", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(planDialog).toBeHidden();

  const calendarName = "Agrandir la démo: Calendrier du plan";
  await page.getByRole("button", { name: calendarName, exact: true }).click();
  const calendarDialog = page.getByRole("dialog", { name: calendarName });
  await expect(
    calendarDialog.getByText("2 séances prévues", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calendarDialog).toBeHidden();

  const coachName = "Agrandir la démo: Revue workout AI";
  await page.getByRole("button", { name: coachName, exact: true }).click();
  const coachDialog = page.getByRole("dialog", { name: coachName });
  await coachDialog
    .getByRole("button", { name: "Plan semi-marathon 12 semaines", exact: true })
    .click();
  await expect(
    coachDialog.getByText("4 semaines · 15 séances", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(coachDialog).toBeHidden();

  const metricName = "Agrandir la démo: Charge d'entraînement";
  await page.getByRole("button", { name: metricName, exact: true }).click();
  const metricDialog = page.getByRole("dialog", { name: metricName });
  await expect(
    metricDialog.getByText("Tous les sports", { exact: true }),
  ).toBeVisible();
  await metricDialog.getByText("Stress d'entraînement", { exact: true }).click();
  await expect(
    metricDialog.getByRole("button", { name: "Recalculer", exact: true }),
  ).toBeVisible();
  await expect(
    metricDialog.getByRole("button", { name: "Retour à l'accueil", exact: true }),
  ).toBeVisible();
  expect(translationErrors).toEqual([]);
});

test("loads the localized metric messages in the standalone PMC preview", async ({
  page,
}) => {
  await page.goto("/zh/features/pmc-fitness-chart");
  const name = "展开完整 PMC 桌面端演示";
  await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name })
      .getByRole("button", { name: "重新计算", exact: true }),
  ).toBeVisible();
});
