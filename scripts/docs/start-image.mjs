import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Public values are part of this immutable build. Keep server-rendered output
// consistent with the values already embedded in browser bundles and HTML.
// DOCS_INTERNAL_API_URL remains an independent runtime-only upstream override.
const configuration = JSON.parse(
  await readFile("/app/DOCS_ARTIFACT_MANIFEST.json", "utf8"),
);
Object.assign(process.env, configuration.environment);
await import(pathToFileURL(resolve("server.js")).href);
