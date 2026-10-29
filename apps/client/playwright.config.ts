import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL: "http://localhost:3002", trace: "retain-on-failure" },
  webServer: [
    {
      command: "pnpm dev",
      url: "http://localhost:3002/en/login",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "node ../../scripts/auth-e2e-fixture-bridge.mjs",
      url: "http://127.0.0.1:3103/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: "client-auth-chromium",
      testMatch: /auth\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      testMatch: /mobile-shell\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-webkit",
      testMatch: /mobile-shell\.spec\.ts/,
      use: { ...devices["iPhone 15"] },
    },
  ],
});
