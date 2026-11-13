import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: /athlete-state-settings\.spec\.ts/,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3013",
    launchOptions: { channel: "chrome" },
  },
  webServer: {
    command:
      "NODE_OPTIONS=--no-experimental-webstorage NEXT_PUBLIC_SELF_HOST_MODE=core-local COACH_E2E=1 pnpm exec next dev --hostname 127.0.0.1 -p 3013",
    url: "http://localhost:3013/zh/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
