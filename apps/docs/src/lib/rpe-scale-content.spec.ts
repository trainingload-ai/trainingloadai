import { describe, expect, it } from "vitest";
import {
  getRpeScaleContent,
  RPE_SCALE_CONTENT_LOCALES,
  RPE_SCALE_PATH,
} from "./rpe-scale-content";

describe("RPE scale content", () => {
  it("owns one stable canonical route", () => {
    expect(RPE_SCALE_PATH).toBe("/rpe-scale");
  });

  it.each(RPE_SCALE_CONTENT_LOCALES)(
    "provides complete reviewed content for %s",
    (locale) => {
      const copy = getRpeScaleContent(locale);
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

  it("falls back to English without making unreviewed locales indexable", () => {
    expect(getRpeScaleContent("de")).toBe(getRpeScaleContent("en"));
  });

  it("keeps every FAQ answer visible and schema-ready", () => {
    for (const locale of RPE_SCALE_CONTENT_LOCALES) {
      for (const [question, answer] of getRpeScaleContent(locale).faq) {
        expect(question.length).toBeGreaterThan(8);
        expect(answer.length).toBeGreaterThan(24);
      }
    }
  });
});
