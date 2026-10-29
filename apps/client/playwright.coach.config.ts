import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /coach-(streaming|visual-states)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3012",
    trace: "retain-on-failure",
    launchOptions: { channel: "chrome" },
  },
  webServer: {
    command: "COACH_E2E=1 CLIENT_DEV_PORT=3012 pnpm dev",
    url: "http://localhost:3012/zh/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "coach-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
    { name: "coach-phone", use: { ...devices["Pixel 7"] } },
    {
      name: "coach-ipad",
      use: { ...devices["iPad Pro 11"], defaultBrowserType: "chromium" },
    },
  ],
});
