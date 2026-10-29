import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { seoDisplayUnits } from "@/lib/seo-metadata";
import { i18n, SEO_INDEXED_LANGUAGES } from "@/lib/i18n";

const LOCKED_TITLE = "VO2 Max Calculator | Cooper, Rockport & Beep";
const LOCKED_DESCRIPTION =
  "Free VO2 max from Cooper, Rockport, or Beep field tests, plus age- and sex-based fitness norms — not a VDOT race predictor.";

function messages(locale: string) {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../../../../../../packages/messages/docs/${locale}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ).vo2MaxCalculator;
}

function textEntries(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    textEntries(child, path ? `${path}.${key}` : key),
  );
}

function placeholders(text: string) {
  return [...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)]
    .map((match) => match[1])
    .sort();
}

describe("vo2 max calculator translations", () => {
  it.each(i18n.languages)(
    "provides %s page, result, and FAQ copy without missing keys or placeholders",
    (locale) => {
      const source = messages("en");
      const translated = messages(locale);
      for (const section of ["page", "client", "jsonLd"] as const) {
        const actual = new Map(textEntries(translated[section]));
        for (const [key, text] of textEntries(source[section])) {
          const localized = actual.get(key);
          expect(localized, `${locale}.${section}.${key}`).toBeTruthy();
          expect(localized, `${locale}.${section}.${key}`).not.toMatch(/VO₂/i);
          expect(
            placeholders(localized!),
            `${locale}.${section}.${key}`,
          ).toEqual(placeholders(text));
        }
      }
      for (const method of [
        "cooper",
        "rockport",
        "beep",
        "restingHr",
        "race",
      ]) {
        expect(translated.page.formulas[method].equation).toBe(
          source.page.formulas[method].equation,
        );
        expect(translated.client.calculation[method]).toBe(
          source.client.calculation[method],
        );
      }
    },
  );
});

describe("vo2 max calculator keyword locks", () => {
  it("locks the English title, H1, and description", () => {
    const copy = messages("en");
    expect(copy.metadata.title).toBe(LOCKED_TITLE);
    expect(copy.metadata.title.startsWith("VO2 Max Calculator")).toBe(true);
    expect(copy.metadata.title).not.toMatch(/^VO2max Calculator/i);
    expect(copy.page.title).toBe("VO2 Max Calculator");
    expect(copy.metadata.description).toBe(LOCKED_DESCRIPTION);
    expect(copy.metadata.keywords).toContain("VO2 Max calculator");
    expect(copy.metadata.keywords).toContain("vo2max calculator");
    expect(JSON.stringify(copy).toLowerCase()).not.toContain(
      "race-pace calculator",
    );
    const faqNames = copy.jsonLd.faq.map((item: { name: string }) => item.name);
    expect(faqNames.join(" ").toLowerCase()).toMatch(/vo2max calculator/);
    expect(JSON.stringify(copy.jsonLd.faq)).toMatch(/51\.3/);
    expect(JSON.stringify(copy.jsonLd.faq)).toMatch(/48\.5/);
    expect(JSON.stringify(copy.jsonLd.faq)).toMatch(/50\.6/);
    expect(JSON.stringify(copy.jsonLd.faq)).toMatch(/49\.8/);
    expect(copy.page.proof).toEqual([
      "No sign-up required",
      "Instant result",
      "Print or share",
    ]);
    expect(copy.page.protocolGuide.rows).toHaveLength(5);
    expect(copy.client.scorecard.kicker).toBe("VO2 SCORECARD");
    expect(copy.client.methods.restingHr.tab).toBe("Resting HR");
    expect(copy.client.methods.race.tab).toBe("Race");
    expect(copy.client.profile.help.toLowerCase()).toContain("required");
  });

  it.each(SEO_INDEXED_LANGUAGES)(
    "keeps %s field-test copy inside the snippet limits",
    (locale) => {
      const copy = messages(locale);
      expect(seoDisplayUnits(copy.metadata.title)).toBeLessThanOrEqual(70);
      expect(copy.page.tests.cooper.text).toMatch(/504\.9|44\.73/);
      expect(copy.page.protocolGuide.rows).toHaveLength(5);
      expect(copy.client.methods.restingHr.tab.length).toBeGreaterThan(0);
      expect(copy.client.methods.race.tab.length).toBeGreaterThan(0);
      expect(copy.client.scorecard.print.length).toBeGreaterThan(0);
      expect(copy.client.scorecard.share.length).toBeGreaterThan(0);
      expect(copy.page.proof).toHaveLength(3);
      expect(JSON.stringify(copy).toLowerCase()).not.toContain(
        "race-pace calculator",
      );
      const descriptionUnits = seoDisplayUnits(copy.metadata.description);
      if (locale === "en") {
        expect(copy.metadata.description).toBe(LOCKED_DESCRIPTION);
      } else {
        expect(descriptionUnits).toBeGreaterThanOrEqual(150);
        expect(descriptionUnits).toBeLessThanOrEqual(160);
        expect(copy.metadata.description).toMatch(/Cooper/);
        expect(copy.metadata.description).toMatch(/Rockport/);
        expect(copy.metadata.description).toMatch(/Beep/);
        expect(copy.metadata.description.toLowerCase()).toMatch(/vdot/);
      }
    },
  );
});
