import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /marketing-5k-preview\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3016",
    trace: "retain-on-failure",
    launchOptions: { channel: "chrome" },
  },
  webServer: {
    command:
      "NODE_OPTIONS=--no-experimental-webstorage NEXT_PUBLIC_SELF_HOST_MODE=core-local COACH_E2E=1 MARKETING_CAPTURE=1 pnpm exec next dev --hostname localhost -p 3016",
    url: "http://localhost:3016/robots.txt",
    reuseExistingServer: process.env.MARKETING_CAPTURE_REUSE === "1",
    timeout: 120_000,
  },
  projects: [
    {
      name: "marketing-5k-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
