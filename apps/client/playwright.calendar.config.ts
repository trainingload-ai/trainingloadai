import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /calendar-move\.spec\.ts/,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3002",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3002/en/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
