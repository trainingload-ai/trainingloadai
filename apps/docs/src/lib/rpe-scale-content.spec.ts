import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import {
  getRpeScaleContent,
  RPE_SCALE_CONTENT_LOCALES,
  RPE_SCALE_PATH,
} from "./rpe-scale-content";

vi.mock("next-intl/server", () => ({
  getTranslations: ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace: string;
  }) => {
    const path = new URL(
      `../../../../packages/messages/docs/${locale}.json`,
      import.meta.url,
    );
    const messages = JSON.parse(readFileSync(path, "utf8"));
    return Promise.resolve(createTranslator({ locale, namespace, messages }));
  },
}));

describe("RPE scale content", () => {
  it("owns one stable canonical route", () => {
    expect(RPE_SCALE_PATH).toBe("/rpe-scale");
  });

  it.each(RPE_SCALE_CONTENT_LOCALES)(
    "provides complete reviewed content for %s",
    async (locale) => {
      const copy = await getRpeScaleContent(locale);
      const rowIds = copy.scaleRows.map((row) => row.id);

      expect(copy.title).toBeTruthy();
      expect(copy.metadataTitle).toContain("Trainingload.ai");
      expect(copy.scaleRows).toHaveLength(6);
      expect(new Set(rowIds).size).toBe(rowIds.length);
      expect(rowIds).toContain("rpe-3-4");
      expect(copy.plans).toHaveLength(3);
      expect(copy.faq.length).toBeGreaterThanOrEqual(8);
      expect(copy.tocItems.some(([id]) => id === "faq")).toBe(true);
      expect(copy.related.some(([, href]) => href === "/training-load")).toBe(
        true,
      );
    },
  );

  it("falls back to English for an unsupported locale", async () => {
    expect(await getRpeScaleContent("nl")).toEqual(await getRpeScaleContent("en"));
  });

  it("keeps every FAQ answer visible and schema-ready", async () => {
    for (const locale of RPE_SCALE_CONTENT_LOCALES) {
      const copy = await getRpeScaleContent(locale);
      for (const [question, answer] of copy.faq) {
        expect(question.length).toBeGreaterThan(8);
        expect(answer.length).toBeGreaterThan(24);
      }
    }
  });
});
