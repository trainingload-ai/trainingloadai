import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const messagesDirectory = path.resolve(
  scriptDirectory,
  "..",
  "..",
  "..",
  "packages",
  "messages",
  "docs",
);

// Keep this list intentionally narrow. Some locales use the English fallback
// for content still awaiting review, but strings rendered by every locale must
// exist explicitly when their absence would otherwise only log during SSG.
const requiredLocalizedStrings = [
  "languageSuggestion.label",
  "languageSuggestion.message",
  "languageSuggestion.switch",
  "languageSuggestion.dismiss",
  "header.searchDocs",
  "header.openDocsMenu",
  "alternatives.ctaTitle",
  "alternatives.ctaText",
  "home.bottomCta.secondaryButton",
  "home.pricingPreview.eyebrow",
  "home.pricingPreview.title",
  "home.pricingPreview.subtitle",
  "home.pageModules.modules.0.cta",
  "home.pageModules.modules.2.cta",
  "home.pageModules.modules.3.cta",
  "privacy.page.sections.contact.email",
  "terms.page.sections.contact.email",
];
const supportedLocales = [
  "en",
  "de",
  "fr",
  "es",
  "pt-BR",
  "it",
  "ko",
  "ja",
  "zh",
  "zh-hant",
];

function readPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return current[segment];
  }, value);
}

function collectStrings(value, dottedPath, output) {
  if (typeof value === "string") {
    output.push({ path: dottedPath, value });
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    collectStrings(child, dottedPath ? `${dottedPath}.${key}` : key, output);
  }
}

// Shared calculator copy must be complete in each indexed language. Other
// supported languages deliberately retain the existing English fallback.
const indexedLocales = ["en", "ja", "zh", "zh-hant"];
const englishMessages = JSON.parse(
  fs.readFileSync(path.join(messagesDirectory, "en.json"), "utf8"),
);
const toolCopyPaths = [];
for (const key of [
  "recordingAlt",
  "watchAlt",
  "planAlt",
  "webPlanAlt",
  "webLoadAlt",
  "fitnessAlt",
  "loadAlt",
  "cta",
  "demoNote",
  "learnMore",
]) {
  toolCopyPaths.push({ path: `calculatorProduct.${key}` });
}
for (const key of [
  "title",
  "example",
  "print",
  "share",
  "copied",
  "copyError",
  "empty",
  "average",
  "normalized",
  "duration",
  "minutes",
  "averageNote",
]) {
  toolCopyPaths.push({ path: `tssCalculator.client.report.${key}` });
}
for (const key of [
  "checking",
  "recognized",
  "activity",
  "health",
  "network",
  "failed",
])
  toolCopyPaths.push({ path: `fileInspection.${key}` });
for (const kind of ["load", "files", "plans"]) {
  for (const key of ["title", "body"])
    toolCopyPaths.push({ path: `toolExperience.${kind}.hero.${key}` });
  for (const key of ["title", "lead", "actionTitle", "actionBody"])
    toolCopyPaths.push({ path: `toolExperience.${kind}.promo.${key}` });
  for (let index = 0; index < 3; index++) {
    for (const key of ["title", "body"])
      toolCopyPaths.push({
        path: `toolExperience.${kind}.promo.steps.${index}.${key}`,
      });
  }
}
const variables = (value) =>
  [
    ...new Set(
      (value.match(/\{([a-zA-Z_][a-zA-Z0-9_]*)[},]/g) ?? []).map((match) =>
        match.slice(1, -1),
      ),
    ),
  ]
    .sort()
    .join(",");

for (const namespace of [
  "heartRateZonesCalculator",
  "maxHeartRateCalculator",
  "zone2HeartRateCalculator",
  "runningPaceCalculator",
  "raceTimePredictor",
  "powerZonesCalculator",
  "vdotCalculator",
  "workoutEditor",
  "trainingLoadCalculator",
]) {
  const promoPath = `${namespace}.page.promo`;
  for (const key of ["title", "lead", "actionTitle", "actionBody"])
    toolCopyPaths.push({ path: `${promoPath}.${key}` });
  for (let index = 0; index < 3; index++) {
    for (const key of ["title", "body"])
      toolCopyPaths.push({ path: `${promoPath}.steps.${index}.${key}` });
  }
}

const errors = [];

for (const locale of supportedLocales) {
  const localeFile = `${locale}.json`;
  const filePath = path.join(messagesDirectory, localeFile);
  if (!fs.existsSync(filePath)) {
    errors.push(`${locale}: missing locale file`);
    continue;
  }
  let messages;
  try {
    messages = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${locale}: invalid JSON (${error.message})`);
    continue;
  }

  for (const requiredPath of requiredLocalizedStrings) {
    const value = readPath(messages, requiredPath);
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${locale}: missing non-empty ${requiredPath}`);
    }
  }

  if (indexedLocales.includes(locale)) {
    for (const entry of toolCopyPaths) {
      const value = readPath(messages, entry.path);
      if (typeof value !== "string" || !value.trim()) {
        errors.push(`${locale}: missing tool copy ${entry.path}`);
      } else {
        const reference = readPath(englishMessages, entry.path);
        if (
          typeof reference === "string" &&
          variables(reference) !== variables(value)
        )
          errors.push(`${locale}: mismatched placeholders in ${entry.path}`);
      }
    }
  }

  for (const emailPath of [
    "privacy.page.sections.contact.email",
    "terms.page.sections.contact.email",
  ]) {
    if (readPath(messages, emailPath) !== "support@trainingload.ai") {
      errors.push(`${locale}: ${emailPath} must be support@trainingload.ai`);
    }
  }

  const legalStrings = [];
  collectStrings(messages.privacy?.page, "privacy.page", legalStrings);
  collectStrings(messages.terms?.page, "terms.page", legalStrings);
  for (const entry of legalStrings) {
    if (/\[email\s*protected\]/i.test(entry.value)) {
      errors.push(`${locale}: protected email placeholder in ${entry.path}`);
    } else if (/\[[^\]\n]+\]/.test(entry.value)) {
      errors.push(
        `${locale}: template-style square-bracket placeholder in ${entry.path}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("Docs message contract failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Docs message contract ok: ${supportedLocales.length} locales, ${requiredLocalizedStrings.length} required strings, ${toolCopyPaths.length} tool strings in ${indexedLocales.length} indexed locales`,
);
