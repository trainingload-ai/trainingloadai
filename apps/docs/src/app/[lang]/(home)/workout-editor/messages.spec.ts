import { describe, expect, it } from "vitest";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { optimizeSeoText } from "@/lib/seo-metadata";
import en from "../../../../../../../packages/messages/docs/en.json";
import ja from "../../../../../../../packages/messages/docs/ja.json";
import zhHant from "../../../../../../../packages/messages/docs/zh-hant.json";
import zh from "../../../../../../../packages/messages/docs/zh.json";

const messages = {
  en,
  ja,
  zh,
  "zh-hant": zhHant,
} as const;

const LOCKED_TITLE = "Workout Editor & Builder | Structured Endurance Sessions";
const LOCKED_H1 = "Workout Editor";
const LOCKED_DESCRIPTION =
  "Free structured workout builder for run, bike, and swim. Add steps and intervals, preview the timeline, then export Garmin FIT, intervals.icu JSON, or Trainingload DSL.";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      leafPaths(item, `${prefix}.${index}`),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      leafPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

function assertNonEmpty(value: unknown) {
  if (typeof value === "string") {
    expect(value.trim().length).toBeGreaterThan(0);
    return;
  }
  if (Array.isArray(value)) {
    expect(value.length).toBeGreaterThan(0);
    value.forEach(assertNonEmpty);
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(assertNonEmpty);
  }
}

describe("workout editor messages", () => {
  it("keeps the same message shape and non-empty copy in every indexed locale", () => {
    const englishPaths = leafPaths(en.workoutEditor);
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].workoutEditor;
      expect(leafPaths(copy)).toEqual(englishPaths);
      assertNonEmpty(copy);
      expect(copy.page.proof).toHaveLength(3);
      expect(copy.page.faq.length).toBe(en.workoutEditor.page.faq.length);
      expect(new Set(copy.page.faq.map((item) => item.question)).size).toBe(
        copy.page.faq.length,
      );
    }
  });

  it("locks the English title, H1, and description", () => {
    expect(en.workoutEditor.metadata.title).toBe(LOCKED_TITLE);
    expect(en.workoutEditor.page.title).toBe(LOCKED_H1);
    expect(en.workoutEditor.metadata.description).toBe(LOCKED_DESCRIPTION);
    expect(en.workoutEditor.metadata.openGraph.title).toBe(LOCKED_TITLE);
    expect(en.workoutEditor.metadata.openGraph.description).toBe(
      LOCKED_DESCRIPTION,
    );
    const seo = optimizeSeoText({
      locale: "en",
      context: "calculator",
      title: en.workoutEditor.metadata.title,
      description: en.workoutEditor.metadata.description,
    });
    expect(seo.title).toBe(LOCKED_TITLE);
    expect(seo.description).toBe(LOCKED_DESCRIPTION);
  });
});
