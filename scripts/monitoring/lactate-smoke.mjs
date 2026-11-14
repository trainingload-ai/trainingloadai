import { spawnSync } from "node:child_process";

const input = process.argv[2];
const env = { ...process.env };
if (input) {
  const url = new URL(input);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "Use an HTTPS origin, or an HTTP localhost origin, without credentials, path or query",
    );
  }
  env.LACTATE_TOOL_BASE_URL = url.origin;
}
const result = spawnSync(
  "pnpm",
  [
    "--filter",
    "@trainingloadai/client",
    "exec",
    "playwright",
    "test",
    "--config",
    "playwright.docs-tools.config.ts",
    "--project",
    "chromium-desktop-light",
  ],
  { env, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
