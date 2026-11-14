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
  await page
    .getByRole("button", { name: "复制 Markdown", exact: true })
    .click();
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
