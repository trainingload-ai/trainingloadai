import { defineConfig } from "@playwright/test";

const baseURL = process.env.LACTATE_TOOL_BASE_URL ?? "http://localhost:3024";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "public-lactate-curve.spec.ts",
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  workers: 1,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: process.env.LACTATE_TOOL_BASE_URL
    ? undefined
    : {
        command: "pnpm --dir ../docs exec next dev --port 3024",
        url: `${baseURL}/lactate-curve-calculator`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium-desktop-light",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
        colorScheme: "light",
      },
    },
    {
      name: "chromium-mobile-dark",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "webkit-desktop-dark",
      use: {
        browserName: "webkit",
        viewport: { width: 1440, height: 900 },
        colorScheme: "dark",
      },
    },
    {
      name: "webkit-mobile-light",
      use: {
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
