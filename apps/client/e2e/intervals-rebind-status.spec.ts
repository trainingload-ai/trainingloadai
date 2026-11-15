import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openCoachFixture } from "./fixtures/coach-page";

for (const width of [1440, 390]) {
  for (const theme of ["light", "dark"] as const) {
    test(`connected account reports import failure separately ${width} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 960 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      await openCoachFixture(page, [], { navigate: false });
      await page.route("**/intervals-icu/status", (route) =>
        route.fulfill({
          json: {
            data: {
              connected: true,
              status: "ACTIVE",
              authType: "api_key",
              credentialLast4: "test",
              discoveryCompletedAt: "2026-11-15T14:21:09Z",
              activitySync: {
                batchId: "test-batch",
                status: "FAILED",
                totalCount: 1,
                successCount: 0,
                failedCount: 1,
                skippedCount: 0,
              },
            },
          },
        }),
      );
      await page.route("**/api/access/features", (route) =>
        route.fulfill({ json: { schemaVersion: 1, features: {} } }),
      );
      await page.goto("/en/account#connections");
      await page.locator("#connections").scrollIntoViewIfNeeded();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText(/Last activity discovery/)).toBeVisible();
      await expect(
        dialog.getByText(/Latest activity import: Failed/),
      ).toBeVisible();
      await expect(dialog.getByText(/0\/1 imported, 1 failed/)).toBeVisible();
      await expect(
        dialog.getByText("Connected", { exact: true }),
      ).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(width);
      await page.addStyleTag({
        content: ".tsqd-parent-container,nextjs-portal{display:none!important}",
      });
      mkdirSync("/private/tmp/intervals-rebind-qa", { recursive: true });
      await page.screenshot({
        path: `/private/tmp/intervals-rebind-qa/status-${width}-${theme}.png`,
      });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
    });
  }
}
