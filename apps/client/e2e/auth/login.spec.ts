import { expect, test } from "@playwright/test";

import {
  cleanupFixture,
  createLoginFixture,
  expectOnboarding,
  fixtureState,
  openLogin,
  primeLoginRateLimit,
  testPassword,
  uniqueClientEmail,
} from "./auth-e2e-support";

test("CLIENT-LOGIN-001 已有账号可正常登录", async ({ page, request }) => {
  const email = uniqueClientEmail("login-success");
  const password = testPassword();
  await createLoginFixture(request, email, password);

  try {
    await openLogin(page);
    const form = page.locator("form");
    await form.getByRole("textbox", { name: "邮箱", exact: true }).fill(email);
    await form.getByLabel("密码", { exact: true }).fill(password);
    await form.getByRole("button", { name: "登录", exact: true }).click();

    await expectOnboarding(page);
    const state = await fixtureState(request, email);
    expect(state.users).toBe(1);
    expect(state.accounts).toBe(1);
    expect(state.sessions).toBeGreaterThanOrEqual(2);
  } finally {
    await cleanupFixture(request, email);
  }
});

test("CLIENT-LOGIN-SEC-001 登录尝试超限显示可恢复提示且不创建 session", async ({
  page,
  request,
}) => {
  const email = uniqueClientEmail("login-rate-limited");
  const password = testPassword();
  await createLoginFixture(request, email, password);

  try {
    await primeLoginRateLimit(request, email);
    await openLogin(page);
    const form = page.locator("form");
    await form.getByRole("textbox", { name: "邮箱", exact: true }).fill(email);
    await form.getByLabel("密码", { exact: true }).fill(password);
    await form.getByRole("button", { name: "登录", exact: true }).click();

    await expect(
      page.getByText("尝试次数过多，请稍后再试。", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/zh\/login/);
    const state = await fixtureState(request, email);
    expect(state.sessions).toBe(1);
  } finally {
    await cleanupFixture(request, email);
  }
});

test("CLIENT-LOGIN-002 密码错误不会创建 session", async ({
  page,
  request,
}) => {
  const email = uniqueClientEmail("login-wrong-password");
  const password = testPassword();
  await createLoginFixture(request, email, password);

  try {
    await openLogin(page);
    const form = page.locator("form");
    await form.getByRole("textbox", { name: "邮箱", exact: true }).fill(email);
    await form.getByLabel("密码", { exact: true }).fill("WrongPassword9a!");
    await form.getByRole("button", { name: "登录", exact: true }).click();

    await expect(page.getByText("邮箱或密码错误", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/zh\/login/);
    const state = await fixtureState(request, email);
    expect(state.users).toBe(1);
    expect(state.accounts).toBe(1);
    expect(state.sessions).toBe(1);
  } finally {
    await cleanupFixture(request, email);
  }
});
