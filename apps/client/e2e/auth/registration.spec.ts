import { expect, test } from "@playwright/test";

import {
  cleanupFixture,
  expectOnboarding,
  fillRegistration,
  fixtureState,
  openRegistration,
  testPassword,
  uniqueClientEmail,
  waitForOTP,
  wrongOTP,
} from "./auth-e2e-support";

test("CLIENT-REG-001 注册页包含全部必要控件", async ({ page }) => {
  await openRegistration(page);
  const form = page.locator("form");
  await expect(form.getByRole("textbox", { name: "邮箱", exact: true })).toBeVisible();
  await expect(form.getByRole("textbox", { name: "验证码", exact: true })).toBeVisible();
  await expect(form.getByLabel("密码", { exact: true })).toBeVisible();
  await expect(form.getByLabel("确认密码", { exact: true })).toBeVisible();
  await expect(form.getByRole("checkbox")).toBeVisible();
  await expect(form.getByRole("button", { name: "发送验证码" })).toBeVisible();
  await expect(form.getByRole("button", { name: "注册", exact: true })).toBeVisible();
});

test("CLIENT-REG-002 使用数据库 OTP 完成注册", async ({ page, request }) => {
  const email = uniqueClientEmail("register");
  const password = testPassword();

  try {
    await openRegistration(page);
    const form = page.locator("form");
    await form.getByRole("textbox", { name: "邮箱", exact: true }).fill(email);
    await form.getByRole("button", { name: "发送验证码" }).click();
    const otp = await waitForOTP(request, email);

    await fillRegistration(page, {
      email,
      otp,
      password,
      confirmPassword: password,
    });
    await form.getByRole("button", { name: "注册", exact: true }).click();

    await expectOnboarding(page);
    const state = await fixtureState(request, email);
    expect(state.users).toBe(1);
    expect(state.accounts).toBe(1);
    expect(state.sessions).toBeGreaterThanOrEqual(1);
    expect(state.hasOTP).toBe(false);
  } finally {
    await cleanupFixture(request, email);
  }
});

test("CLIENT-REG-ERR-001 错误验证码不创建用户", async ({
  page,
  request,
}) => {
  const email = uniqueClientEmail("wrong-otp");
  const password = testPassword();

  try {
    await openRegistration(page);
    const form = page.locator("form");
    await form.getByRole("textbox", { name: "邮箱", exact: true }).fill(email);
    await form.getByRole("button", { name: "发送验证码" }).click();
    const otp = await waitForOTP(request, email);
    await fillRegistration(page, {
      email,
      otp: wrongOTP(otp),
      password,
      confirmPassword: password,
    });
    await form.getByRole("button", { name: "注册", exact: true }).click();

    await expect(page.getByText(/验证码无效/).first()).toBeVisible();
    const state = await fixtureState(request, email);
    expect(state.users).toBe(0);
    expect(state.accounts).toBe(0);
    expect(state.sessions).toBe(0);
    expect(state.otpAttempts).toBe(1);
    expect(state.hasOTP).toBe(true);
  } finally {
    await cleanupFixture(request, email);
  }
});

test("CLIENT-REG-ERR-002 非 6 位验证码在浏览器端被拦截", async ({
  page,
  request,
}) => {
  const email = uniqueClientEmail("short-otp");
  const password = testPassword();

  try {
    await openRegistration(page);
    const form = page.locator("form");
    await fillRegistration(page, {
      email,
      otp: "12345",
      password,
      confirmPassword: password,
    });
    await form.getByRole("button", { name: "注册", exact: true }).click();

    await expect(page.getByText("验证码长度为6位", { exact: true })).toBeVisible();
    const state = await fixtureState(request, email);
    expect(state.users).toBe(0);
    expect(state.hasOTP).toBe(false);
  } finally {
    await cleanupFixture(request, email);
  }
});

test("CLIENT-REG-ERR-003 两次密码不一致在浏览器端被拦截", async ({
  page,
  request,
}) => {
  const email = uniqueClientEmail("password-mismatch");
  const password = testPassword();

  try {
    await openRegistration(page);
    const form = page.locator("form");
    await fillRegistration(page, {
      email,
      otp: "123456",
      password,
      confirmPassword: "DifferentPassword9a!",
    });
    await form.getByRole("button", { name: "注册", exact: true }).click();

    await expect(page.getByText("密码不匹配", { exact: true })).toBeVisible();
    const state = await fixtureState(request, email);
    expect(state.users).toBe(0);
    expect(state.hasOTP).toBe(false);
  } finally {
    await cleanupFixture(request, email);
  }
});
