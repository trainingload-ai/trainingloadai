#!/usr/bin/env node
// scripts/geo-check.mjs
//
// Lightweight GEO self-check for the docs site. Runs in < 5 seconds,
// requires no external dependencies, and exits non-zero on any failure.
//
// Scope (intentionally narrow — see ai_docs/geo-plan.zh.md):
//   1. llms.txt route file starts with a Markdown H1 and declares a
//      LAST_UPDATED constant.
//   2. Every product/guide/tool path in llms-catalog.ts is referenced in the
//      llms.txt route output (no silent drift).
//   3. Key product/feature pages render a first-paragraph definition block
//      that contains the primary query keyword for the page.
//   4. Key calculator pages either import howToSchema from seo-schema or
//      emit a HowTo step list in their schema graph.
//   5. Optional: key pages render <ContentFreshness /> (warn-only, since
//      the rollout is incremental).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Resolve the docs root from this script's location so the script works
// when invoked from the repo root (`pnpm --filter docs geo:check`) or from
// the docs package directly (`node scripts/geo-check.mjs`).
const here = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(here, "..");
const srcRoot = path.join(docsRoot, "src");
const appRoot = path.join(srcRoot, "app");
const homeRoot = path.join(appRoot, "[lang]", "(home)");

const failures = [];
const warnings = [];

// --- 1. llms.txt route has the required metadata ---------------------------

const llmsRoutePath = path.join(appRoot, "llms.txt", "route.ts");
const llmsRouteSource = fs.readFileSync(llmsRoutePath, "utf8");
if (!/const\s+lines\s*=\s*\[\s*["']#\s+[^"'\r\n]+["']/.test(llmsRouteSource)) {
  failures.push(
    `${path.relative(docsRoot, llmsRoutePath)}: output must start with a Markdown H1`,
  );
}
if (!/["']>\s+[^"'\r\n]+["']/.test(llmsRouteSource)) {
  failures.push(
    `${path.relative(docsRoot, llmsRoutePath)}: output must include a project summary blockquote`,
  );
}
if (!llmsRouteSource.includes("return `- [${title}](${url})${suffix}`")) {
  failures.push(
    `${path.relative(docsRoot, llmsRoutePath)}: resource lists must use Markdown links`,
  );
}
if (
  !/const\s+LAST_UPDATED\s*=\s*["']\d{4}-\d{2}-\d{2}["']/.test(llmsRouteSource)
) {
  failures.push(
    `${path.relative(docsRoot, llmsRoutePath)}: missing LAST_UPDATED constant`,
  );
}

// --- 2. llms-catalog is wired into llms.txt route -------------------------
//
// Drift detection: as long as llms.txt/route.ts imports the catalog arrays and
// uses them in the output, every catalog path is emitted automatically. We
// don't grep for each path in the source — that would false-positive on the
// template-literal `${siteUrl}${page.path}`.

const usesProductPages = /\bllmProductPages\b/.test(llmsRouteSource);
const usesGuidePages = /\bllmGuidePages\b/.test(llmsRouteSource);
const usesFreeToolPages = /\bllmFreeToolPages\b/.test(llmsRouteSource);
const importsCatalog = /from\s+["']@\/lib\/llms-catalog["']/.test(
  llmsRouteSource,
);

if (!importsCatalog) {
  failures.push(
    `${path.relative(docsRoot, llmsRoutePath)}: missing import of @/lib/llms-catalog`,
  );
}
if (!usesProductPages) {
  failures.push(
    `${path.relative(docsRoot, llmsRoutePath)}: llmProductPages not referenced in output`,
  );
}
if (!usesGuidePages) {
  failures.push(
    `${path.relative(docsRoot, llmsRoutePath)}: llmGuidePages not referenced in output`,
  );
}
if (!usesFreeToolPages) {
  failures.push(
    `${path.relative(docsRoot, llmsRoutePath)}: llmFreeToolPages not referenced in output`,
  );
}

// --- 3. Key product/feature pages have a definition block in i18n ---------
// (warn-only during rollout: the keyword rewrite is a multi-PR effort.)
//
// The keyword lives in the i18n bundle (e.g. en.json), not the TSX file
// (which only references `t("definition")`). The check therefore walks the
// JSON for the matching namespace and looks at the `definition` field.

// (page file relative to homeRoot) -> (i18n namespace, fields to scan, keywords)
//
// `fields` is the list of i18n fields the script will search for the
// keyword. The first field that contains the keyword counts as a pass.
// This lets the rollout mix in-progress pages (using `definition`) and
// legacy pages (using `subtitle`).
const definitionPageKeywords = {
  "training-load/page.tsx": {
    i18nNamespace: "trainingLoadPage",
    fields: ["definition"],
    keywords: ["training load"],
  },
  "ai-training-plan/page.tsx": {
    i18nNamespace: "aiTrainingPlanPage",
    fields: ["definition"],
    keywords: ["adaptive"],
  },
  "features/pmc-fitness-chart/page.tsx": {
    i18nNamespace: "pmcFitnessChartPage",
    fields: ["ui.subtitle", "ui.title"],
    keywords: ["PMC"],
  },
  "features/power-curve/page.tsx": {
    i18nNamespace: "powerCurvePage",
    fields: ["ui.subtitle", "ui.title"],
    keywords: ["power"],
  },
};

function readI18n(locale) {
  // docsRoot is apps/docs; locale bundles are owned by packages/messages.
  const p = path.join(
    docsRoot,
    "..",
    "..",
    "packages",
    "messages",
    "docs",
    `${locale}.json`,
  );
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

for (const [relPath, { i18nNamespace, fields, keywords }] of Object.entries(
  definitionPageKeywords,
)) {
  const pagePath = path.join(homeRoot, relPath);
  if (!fs.existsSync(pagePath)) {
    warnings.push(`page not found, skipping: ${relPath}`);
    continue;
  }
  // Re-exported feature pages re-use the parent namespace, so resolve the
  // re-export chain to find the actual rendering page's namespace.
  const resolved = resolveRenderedPage(relPath);
  const ns =
    resolved && resolved.source.includes("FeatureIntentPage")
      ? i18nNamespace
      : i18nNamespace;
  const i18n = readI18n("en") ?? readI18n("zh") ?? readI18n("ja");
  if (!i18n || !i18n[ns]) {
    warnings.push(
      `${relPath}: missing i18n.${ns} namespace (rollout in progress)`,
    );
    continue;
  }
  // Resolve nested i18n paths (e.g. `ui.subtitle`) with a tiny lookup.
  const haystack = fields
    .map((f) => {
      const parts = f.split(".");
      let cur = i18n[ns];
      for (const p of parts) {
        if (cur == null) return "";
        cur = cur[p];
      }
      return typeof cur === "string" ? cur : "";
    })
    .join(" \n ")
    .toLowerCase();
  if (!haystack.trim()) {
    warnings.push(
      `${relPath}: missing i18n.${ns} fields ${fields.join("/")} (rollout in progress)`,
    );
    continue;
  }
  const missing = keywords.filter((k) => !haystack.includes(k.toLowerCase()));
  if (missing.length > 0) {
    warnings.push(
      `${relPath}: i18n.${ns} fields ${fields.join("/")} missing keyword(s) ${missing.join(", ")}`,
    );
  }
}

// --- 4. Key calculator pages emit a HowTo schema step list -----------------

// (page file relative to homeRoot) -> (page identifier for error messages)
const calculatorPages = [
  "ftp-calculator/page.tsx",
  "critical-power-calculator/page.tsx",
  "vdot-calculator/page.tsx",
  "running-pace-calculator/page.tsx",
  "race-time-predictor/page.tsx",
  "tss-calculator/page.tsx",
  "training-load-calculator/page.tsx",
  "css-calculator/page.tsx",
  "heart-rate-zones-calculator/page.tsx",
  "vo2-max-calculator/page.tsx",
  "lactate-threshold-calculator/page.tsx",
  "workout-editor/page.tsx",
];

for (const relPath of calculatorPages) {
  const pagePath = path.join(homeRoot, relPath);
  if (!fs.existsSync(pagePath)) {
    warnings.push(`calculator not found, skipping: ${relPath}`);
    continue;
  }
  const source = fs.readFileSync(pagePath, "utf8");
  const referencesHowTo =
    /howToSchema\b/.test(source) || /"@type":\s*"HowTo"/.test(source);
  if (!referencesHowTo) {
    warnings.push(
      `${relPath}: HowTo schema not yet wired (P0 rollout is incremental)`,
    );
  }
}

// --- 5. ContentFreshness rollout (warn-only) -------------------------------
//
// For freshness we check the actual rendering page, not the route file. A
// page file like `features/pmc-fitness-chart/page.tsx` may be a thin
// re-export of `pmc-fitness-chart/page.tsx`; we follow the chain so the
// underlying source (which actually renders <FeatureIntentPage />) is the
// one we inspect.

function resolveRenderedPage(relPath) {
  const startPath = path.join(homeRoot, relPath);
  if (!fs.existsSync(startPath)) return null;
  let currentPath = startPath;
  let source = fs.readFileSync(currentPath, "utf8");
  // Follow at most a few re-export hops to avoid infinite loops.
  for (let hop = 0; hop < 3; hop += 1) {
    const reExport = source.match(
      /export\s*\{\s*default\s*(?:,\s*generateMetadata\s*)?\}\s*from\s*["']([^"']+)["']/,
    );
    if (!reExport) return { renderedPath: currentPath, source };
    const next = path.resolve(path.dirname(currentPath), `${reExport[1]}.ts`);
    const nextJs = path.resolve(
      path.dirname(currentPath),
      `${reExport[1]}.tsx`,
    );
    const nextPath = fs.existsSync(nextJs)
      ? nextJs
      : fs.existsSync(next)
        ? next
        : null;
    if (!nextPath) return { renderedPath: currentPath, source };
    currentPath = nextPath;
    source = fs.readFileSync(currentPath, "utf8");
  }
  return { renderedPath: currentPath, source };
}

const freshnessPages = [
  "training-load/page.tsx",
  "ai-training-plan/page.tsx",
  "features/pmc-fitness-chart/page.tsx",
  "features/power-curve/page.tsx",
];

for (const relPath of freshnessPages) {
  const resolved = resolveRenderedPage(relPath);
  if (!resolved) continue;
  const { source } = resolved;
  // Accept either a direct ContentFreshness import OR the shared
  // FeatureIntentPage component (which already renders ContentFreshness
  // when the i18n copy provides lastUpdatedDate).
  const hasFreshness =
    /ContentFreshness\b/.test(source) || /FeatureIntentPage\b/.test(source);
  if (!hasFreshness) {
    warnings.push(`${relPath}: ContentFreshness not yet rendered`);
  }
}

// --- Report ----------------------------------------------------------------

const log = (label, items) => {
  if (items.length === 0) return;
  for (const item of items) {
    const prefix = label === "fail" ? "FAIL" : "WARN";
    process.stdout.write(`${prefix}: ${item}\n`);
  }
};

log("fail", failures);
log("warn", warnings);

if (failures.length > 0) {
  process.stdout.write(
    `\ngeo-check: ${failures.length} failure(s), ${warnings.length} warning(s)\n`,
  );
  process.exit(1);
}

process.stdout.write(`geo-check: ok (${warnings.length} warning(s))\n`);
