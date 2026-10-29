import { defineConfig } from "@playwright/test";
import coachConfig from "./playwright.coach.config";

// Same isolated Next build directory and mocked API harness as Coach visual tests.
export default defineConfig({
  ...coachConfig,
  testMatch: /plan-regressions\.spec\.ts/,
  projects: coachConfig.projects?.filter(
    (project) => project.name !== "coach-ipad",
  ),
});
