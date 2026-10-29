import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@/public-demo/public-demo-provider": path.resolve(
        __dirname,
        "../../packages/managed-client/src/public-demo/public-demo-provider.tsx",
      ),
      "@/public-demo/public-demo-runtime": path.resolve(
        __dirname,
        "../../packages/managed-client/src/public-demo/public-demo-runtime.ts",
      ),
      "@/public-demo/use-viewer-session": path.resolve(
        __dirname,
        "../../packages/managed-client/src/public-demo/use-viewer-session.ts",
      ),
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../../packages/shared"),
      "@managed-commercial": path.resolve(
        __dirname,
        "../../packages/managed-commercial/src",
      ),
      "@managed-client": path.resolve(
        __dirname,
        "../../packages/managed-client/src",
      ),
      "@deployment/managed-ui": path.resolve(
        __dirname,
        "../../packages/managed-client/src/managed-ui.ts",
      ),
      "@deployment/managed-messages": path.resolve(
        __dirname,
        "../../packages/managed-client/src/managed-messages.ts",
      ),
      "@deployment/auth-client-plugins": path.resolve(
        __dirname,
        "../../packages/managed-client/src/auth-client-plugins.ts",
      ),
      "@deployment/analytics": path.resolve(
        __dirname,
        "../../packages/managed-client/src/analytics.ts",
      ),
      "@deployment/provider-catalog": path.resolve(
        __dirname,
        "../../packages/managed-client/src/provider-catalog.ts",
      ),
      "@deployment/provider-presentation": path.resolve(
        __dirname,
        "../../packages/managed-client/src/provider-presentation.ts",
      ),
      "@deployment/route-policy": path.resolve(
        __dirname,
        "../../packages/managed-client/src/route-policy.ts",
      ),
      "@deployment/registration-attribution": path.resolve(
        __dirname,
        "../../packages/managed-client/src/registration-attribution.ts",
      ),
      "@deployment/map-engine": path.resolve(
        __dirname,
        "../../packages/managed-client/src/map-engine.ts",
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
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
