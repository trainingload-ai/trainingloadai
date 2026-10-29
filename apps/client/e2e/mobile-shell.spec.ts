import { expect, test } from "@playwright/test";

test("public auth shell fits a phone viewport", async ({ page }) => {
  await page.goto("/en/login");
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Login", exact: true }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
