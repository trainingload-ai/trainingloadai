import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /today-suggestion-lifecycle\.spec\.ts/,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3127",
    launchOptions: { channel: "chrome" },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "NODE_OPTIONS=--no-experimental-webstorage NEXT_PUBLIC_SELF_HOST_MODE=core-local COACH_E2E=1 pnpm exec next dev -p 3127",
    url: "http://localhost:3127/en/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
