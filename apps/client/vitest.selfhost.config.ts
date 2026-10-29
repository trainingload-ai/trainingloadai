import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@/public-demo/public-demo-provider": path.resolve(
        __dirname,
        "src/deployment/public-demo-provider.tsx",
      ),
      "@/public-demo/public-demo-runtime": path.resolve(
        __dirname,
        "src/deployment/public-demo-runtime.ts",
      ),
      "@/public-demo/use-viewer-session": path.resolve(
        __dirname,
        "src/deployment/use-viewer-session.ts",
      ),
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../../packages/shared"),
      "@deployment/managed-ui": path.resolve(
        __dirname,
        "src/deployment/managed-ui.tsx",
      ),
      "@deployment/managed-messages": path.resolve(
        __dirname,
        "src/deployment/managed-messages.ts",
      ),
      "@deployment/auth-client-plugins": path.resolve(
        __dirname,
        "src/deployment/auth-client-plugins.ts",
      ),
      "@deployment/analytics": path.resolve(
        __dirname,
        "src/deployment/analytics.ts",
      ),
      "@deployment/provider-catalog": path.resolve(
        __dirname,
        "src/deployment/provider-catalog.ts",
      ),
      "@deployment/provider-presentation": path.resolve(
        __dirname,
        "src/deployment/provider-presentation.ts",
      ),
      "@deployment/route-policy": path.resolve(
        __dirname,
        "src/deployment/route-policy.ts",
      ),
      "@deployment/registration-attribution": path.resolve(
        __dirname,
        "src/deployment/registration-attribution.ts",
      ),
      "@deployment/map-engine": path.resolve(
        __dirname,
        "src/deployment/map-engine.ts",
      ),
      "next/navigation": path.resolve(
        __dirname,
        "../../node_modules/next/navigation.js",
      ),
    },
  },
  ssr: { noExternal: ["next-intl"] },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/lib/ai-operation-errors.test.ts",
      "src/lib/api.test.ts",
      "src/lib/bff-upstream-headers.test.ts",
      "src/lib/proxy-upstream.test.ts",
      "src/lib/config.test.ts",
      "src/lib/auth-callback.test.ts",
      "src/lib/today-suggestion-coach-context.test.ts",
      "src/app/[locale]/(main)/ai-coach/coach-turn-error-model.test.ts",
      "src/app/[locale]/(main)/ai-coach/coach-turn-error-card.test.tsx",
      "src/app/[locale]/(main)/account/component/AccountPrivacyDataLinks.test.tsx",
      "src/app/[locale]/(main)/account/athlete-memory/AthleteMemorySettings.test.tsx",
      "src/app/[locale]/(main)/settings/component/SelfHostAiSettings.test.tsx",
      "src/app/[locale]/(main)/_home/components/home-suggestion-card-stack.test.tsx",
      "src/components/plan/create-plan-mode-dialog.test.tsx",
      "src/deployment/analytics.test.ts",
      "src/lib/product-analytics.test.ts",
      "src/lib/map/map-provider.test.ts",
    ],
  },
});
