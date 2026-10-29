import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import nextPlugin from "@next/eslint-plugin-next";
import importPlugin from "eslint-plugin-import";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const nextCoreWebVitalsConfig = nextPlugin.flatConfig?.coreWebVitals;
const { name: _nextCoreName, ...nextCoreWebVitals } =
  nextCoreWebVitalsConfig ?? {};

export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-dev/**",
      ".next-coach-e2e/**",
      "playwright-report/**",
      "test-results/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["**/*.{js,cjs,mjs,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      "react-hooks": reactHooksPlugin,
    },
  },
  nextCoreWebVitals,
];
