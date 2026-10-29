import { expect, type APIRequestContext, type Page } from "@playwright/test";

const bridgeOrigin = "http://127.0.0.1:3103";

export type FixtureState = {
  users: number;
  accounts: number;
  sessions: number;
  otpAttempts: number | null;
  hasOTP: boolean;
};

export function uniqueClientEmail(scenario: string) {
  const suffix = crypto.randomUUID().slice(0, 8);
  return `victor+client-e2e-${scenario}-${Date.now()}-${suffix}@trainingload.ai`;
}

export function testPassword() {
  return `E2E${crypto.randomUUID().slice(0, 8)}9a!`;
}

export async function createLoginFixture(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const response = await request.post(`${bridgeOrigin}/fixture-user`, {
    params: { email },
    data: { email, password },
  });
  expect(response.status(), await response.text()).toBe(201);
}

export async function cleanupFixture(
  request: APIRequestContext,
  email: string,
) {
  const response = await request.delete(`${bridgeOrigin}/fixture-user`, {
    params: { email },
    data: { email },
  });
  expect(response.status(), await response.text()).toBe(200);
}

export async function primeLoginRateLimit(
  request: APIRequestContext,
  email: string,
) {
  const response = await request.post(`${bridgeOrigin}/prime-login-rate-limit`, {
    params: { email },
    data: { email },
  });
  expect(response.status(), await response.text()).toBe(200);
}

export async function fixtureState(
  request: APIRequestContext,
  email: string,
): Promise<FixtureState> {
  const response = await request.get(`${bridgeOrigin}/state`, {
    params: { email },
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<FixtureState>;
}

export async function waitForOTP(
  request: APIRequestContext,
  email: string,
) {
  let otp = "";
  await expect
    .poll(
      async () => {
        const response = await request.get(`${bridgeOrigin}/otp`, {
          params: { email },
        });
        otp = response.status() === 200 ? await response.text() : "";
        return otp;
      },
      { timeout: 60_000 },
    )
    .toMatch(/^\d{6}$/);
  return otp;
}

export function wrongOTP(actualOTP: string) {
  const last = Number(actualOTP.at(-1));
  return `${actualOTP.slice(0, -1)}${(last + 1) % 10}`;
}

export async function openLogin(page: Page) {
  await page.goto("/zh/login");
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
}

export async function openRegistration(page: Page) {
  await page.goto("/zh/signup");
  await expect(page.getByRole("heading", { name: "注册" })).toBeVisible();
}

export async function fillRegistration(
  page: Page,
  values: {
    email: string;
    otp: string;
    password: string;
    confirmPassword: string;
  },
) {
  const form = page.locator("form");
  await form.getByRole("textbox", { name: "邮箱", exact: true }).fill(values.email);
  await form.getByRole("textbox", { name: "验证码", exact: true }).fill(values.otp);
  await form.getByLabel("密码", { exact: true }).fill(values.password);
  await form
    .getByLabel("确认密码", { exact: true })
    .fill(values.confirmPassword);
  await form.getByRole("checkbox").check();
}

export async function expectOnboarding(page: Page) {
  await expect(page).toHaveURL(/\/zh\/onboarding(?:\?|$)/, {
    timeout: 30_000,
  });
}
