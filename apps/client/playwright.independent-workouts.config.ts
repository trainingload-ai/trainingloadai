import { defineConfig } from "@playwright/test";
import homeConfig from "./playwright.today-suggestion.config";

export default defineConfig({
  ...homeConfig,
  testMatch: /independent-workouts\.spec\.ts/,
});
