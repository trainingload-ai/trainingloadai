import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@/.source": fileURLToPath(
        new URL("./.source/index.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("../../packages/shared", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
