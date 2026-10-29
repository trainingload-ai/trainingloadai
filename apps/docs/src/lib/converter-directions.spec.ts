import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildConverterDirection,
  buildConverterDirections,
  getConverterDirectionSlugs,
  groupRelatedConverterDirections,
  type ConverterDirectionCopy,
} from "./converter-directions";
import {
  SEO_METADATA_LIMITS,
  optimizeSeoText,
  seoDisplayUnits,
} from "./seo-metadata";

const locales = [
  "en",
  "zh",
  "ja",
  "zh-hant",
  "de",
  "es",
  "fr",
  "it",
  "ko",
  "pt-BR",
] as const;

const indexedLocales = ["en", "zh", "ja", "zh-hant"] as const;
const directionSlugs = [
  "fit-to-gpx",
  "gpx-to-fit",
  "tcx-to-gpx",
  "gpx-to-tcx",
  "fit-to-tcx",
  "tcx-to-fit",
] as const;

function messages(locale: string) {
  return JSON.parse(
    readFileSync(new URL(`../../../../packages/messages/docs/${locale}.json`, import.meta.url), "utf8"),
  );
}

function copy(locale: string) {
  return messages(locale).converterDirections.copy as ConverterDirectionCopy;
}

describe("converter direction SEO copy", () => {
  it("locks English direction pages on converter and file-converter variants", () => {
    expect(getConverterDirectionSlugs()).toEqual([...directionSlugs]);

    for (const slug of directionSlugs) {
      const [from, to] = slug.split("-to-") as [string, string];
      const fromLabel = from.toUpperCase();
      const toLabel = to.toUpperCase();
      const label = `${fromLabel} to ${toLabel}`;
      const direction = buildConverterDirection(slug, copy("en"));
      expect(direction).not.toBeNull();
      if (slug === "tcx-to-fit") {
        expect(direction?.title).toBe("Convert TCX to FIT");
        expect(direction?.metadataTitle).toBe(
          "Convert TCX to FIT | Free Online TCX to FIT Converter",
        );
        expect(direction?.metadataDescription).toBe(
          "Free online TCX to FIT converter for endurance activity files. Upload one TCX file up to 16 MB, convert to FIT, and download. Single-file conversion only.",
        );
      } else {
        expect(direction?.title).toBe(`${label} Converter`);
        expect(direction?.metadataTitle).toBe(
          `${label} Converter | Free ${label} File Converter`,
        );
        const description = direction!.metadataDescription.toLowerCase();
        expect(description).toContain(`${from} to ${to}`);
        expect(description).toContain("converter");
        expect(description).toContain("file converter");
        expect(description).toContain("free");
        expect(description).toContain("online");
      }
      expect(direction?.ui.linkLabel).toBe(`${label} converter`);
      expect(direction?.ui.primary).toBe(`Convert ${label}`);
      expect(direction?.keywords).toEqual(
        expect.arrayContaining([
          `${from} to ${to}`,
          `${from} to ${to} converter`,
          `${from} to ${to} file converter`,
          label,
          `convert ${label}`,
          `${label} converter`,
        ]),
      );
      expect(direction?.faq).toHaveLength(8);
      expect(
        direction?.faq.some((item) =>
          item.question.toLowerCase().includes(`how do i convert ${from} to ${to}`),
        ),
      ).toBe(true);
      expect(
        direction?.faq.some((item) =>
          item.question
            .toLowerCase()
            .includes(`${from} to ${to} file converter`),
        ),
      ).toBe(true);
      expect(
        direction?.faq.some((item) =>
          item.question
            .toLowerCase()
            .includes(`is this ${from} to ${to} converter free`),
        ),
      ).toBe(true);
      expect(
        direction?.faq.some((item) =>
          item.question
            .toLowerCase()
            .includes(`what data is preserved when converting ${from} to ${to}`),
        ),
      ).toBe(true);
      expect(
        direction?.faq.some((item) =>
          /garmin|strava|polar|komoot|trainingpeaks/i.test(item.question),
        ),
      ).toBe(true);
      expect(direction?.faq.some((item) => item.answer.includes("16 MB"))).toBe(
        true,
      );
      expect(
        direction?.faq.some((item) => /uploaded/i.test(item.answer)),
      ).toBe(true);
    }
  });

  it("keeps the English hub on converter-cluster keyword locks", () => {
    const hub = messages("en").converter.metadata;
    expect(hub.title).toBe(
      "GPX FIT TCX Converter | Convert Activity Files Online",
    );
    expect(hub.description.toLowerCase()).toContain("free online");
    expect(hub.description).toContain("16 MB");
    expect(hub.keywords).toEqual(
      expect.arrayContaining([
        "gpx fit tcx converter",
        "convert activity files",
        "tcx to fit",
        "fit to tcx",
        "fit to gpx",
        "gpx to fit",
      ]),
    );
  });

  it("does not claim in-browser conversion in English converter copy", () => {
    const en = JSON.stringify({
      converter: messages("en").converter,
      converterDirections: messages("en").converterDirections,
    });
    expect(en.toLowerCase()).not.toMatch(/in your browser|in-browser|privacy-friendly/);
  });

  it.each(locales)(
    "builds every direction with required FAQ and related-link keys for %s",
    (locale) => {
      const localeCopy = copy(locale);
      expect(localeCopy.faq).not.toHaveProperty("batch");
      expect(localeCopy.relatedHub.trim()).not.toBe("");
      expect(localeCopy.relatedFitViewer.trim()).not.toBe("");
      expect(localeCopy.relatedFitCourse.trim()).not.toBe("");
      expect(localeCopy.preservedTitle.trim()).not.toBe("");
      expect(localeCopy.preservedField.trim()).not.toBe("");
      expect(localeCopy.preservedStatus.trim()).not.toBe("");
      expect(localeCopy.scenariosTitle.trim()).not.toBe("");
      expect(localeCopy.comparisonTitle.trim()).not.toBe("");
      expect(localeCopy.relatedSameFromTitle.trim()).not.toBe("");
      expect(localeCopy.relatedSameToTitle.trim()).not.toBe("");
      expect(localeCopy.relatedHubTitle.trim()).not.toBe("");
      expect(localeCopy.relatedOtherTitle.trim()).not.toBe("");
      expect(localeCopy.relatedFitCourseConverter.trim()).not.toBe("");
      expect(localeCopy.uploadNote.trim()).not.toBe("");
      expect(messages(locale).commonLinks.fitFileViewerAction.trim()).not.toBe(
        "",
      );

      for (const slug of getConverterDirectionSlugs()) {
        const direction = buildConverterDirection(slug, localeCopy);
        const expectedFaqLength = (indexedLocales as readonly string[]).includes(
          locale,
        )
          ? 8
          : 6;
        expect(direction?.faq).toHaveLength(expectedFaqLength);
        expect(
          direction?.faq.every((item) => item.question && item.answer),
        ).toBe(true);
        expect(direction?.ui.relatedHub).toBe(localeCopy.relatedHub);
        expect(direction?.ui.linkLabel.trim()).not.toBe("");
      }
    },
  );

  it.each(indexedLocales)(
    "keeps indexed %s converter titles and descriptions in snippet range",
    (locale) => {
      const hub = messages(locale).converter.metadata;
      const hubSeo = optimizeSeoText({
        locale,
        context: "converter",
        title: hub.title,
        description: hub.description,
      });
      expect(seoDisplayUnits(hubSeo.title)).toBeGreaterThanOrEqual(
        SEO_METADATA_LIMITS.title.min,
      );
      expect(seoDisplayUnits(hubSeo.title)).toBeLessThanOrEqual(
        SEO_METADATA_LIMITS.title.max,
      );
      expect(seoDisplayUnits(hubSeo.description)).toBeGreaterThanOrEqual(
        SEO_METADATA_LIMITS.description.min,
      );
      expect(seoDisplayUnits(hubSeo.description)).toBeLessThanOrEqual(
        SEO_METADATA_LIMITS.description.max,
      );

      for (const slug of directionSlugs) {
        const direction = buildConverterDirection(slug, copy(locale));
        const seo = optimizeSeoText({
          locale,
          context: "converter",
          title: direction!.metadataTitle,
          description: direction!.metadataDescription,
        });
        expect(seoDisplayUnits(seo.title)).toBeGreaterThanOrEqual(
          SEO_METADATA_LIMITS.title.min,
        );
        expect(seoDisplayUnits(seo.title)).toBeLessThanOrEqual(
          SEO_METADATA_LIMITS.title.max,
        );
        expect(seoDisplayUnits(seo.description)).toBeGreaterThanOrEqual(
          SEO_METADATA_LIMITS.description.min,
        );
        expect(seoDisplayUnits(seo.description)).toBeLessThanOrEqual(
          SEO_METADATA_LIMITS.description.max,
        );
      }
    },
  );

  it.each(indexedLocales)(
    "keeps indexed %s direction FAQs on converter/file-converter intent",
    (locale) => {
      for (const slug of directionSlugs) {
        const direction = buildConverterDirection(slug, copy(locale));
        expect(direction?.faq).toHaveLength(8);
        const questions = direction!.faq.map((item) => item.question).join("\n");
        if (locale === "en") {
          expect(questions.toLowerCase()).toContain("file converter");
          expect(questions).toMatch(
            /Garmin|Strava|Polar|Komoot|TrainingPeaks/,
          );
        } else if (locale === "ja") {
          expect(questions).toContain("ファイル変換");
          expect(questions).toMatch(
            /Garmin|Strava|Polar|Komoot|TrainingPeaks/,
          );
        } else {
          expect(questions).toMatch(/文件转换器|檔案轉換器/);
          expect(questions).toMatch(
            /Garmin|Strava|Polar|Komoot|TrainingPeaks/,
          );
        }
      }
    },
  );

  it("keeps zh-hant direction page overrides in Traditional Chinese", () => {
    const pages = JSON.stringify(copy("zh-hant").pages ?? {});
    expect(pages).toContain("檔案轉換器");
    expect(pages).not.toMatch(
      /转|会保留|时间|時间|踏频|这些|常见|源檔案里|这一個|简单|支持的|线上转|一次转|旧 Garmin|設備檔案/,
    );
  });

  it.each(indexedLocales)(
    "adds preserved-data, use-case, and format-comparison modules for indexed %s pages",
    (locale) => {
      for (const slug of directionSlugs) {
        const direction = buildConverterDirection(slug, copy(locale));
        expect(direction?.preserved).not.toBeNull();
        expect(direction?.preserved?.rows.length).toBeGreaterThanOrEqual(6);
        expect(direction?.preserved?.intro.trim()).not.toBe("");
        expect(direction?.scenarios).not.toBeNull();
        expect(direction?.scenarios?.items.length).toBeGreaterThanOrEqual(3);
        expect(direction?.scenarios?.items.length).toBeLessThanOrEqual(5);
        expect(direction?.comparison).not.toBeNull();
        expect(direction?.comparison?.body.trim()).not.toBe("");
        expect(direction?.ui.relatedSameFromTitle).toContain(
          direction!.sourceInfo.label,
        );
        expect(direction?.ui.relatedSameToTitle).toContain(
          direction!.targetInfo.label,
        );
        if (slug === "gpx-to-fit") {
          expect(direction?.comparison?.courseNote).toMatch(/FIT Course/);
        } else {
          expect(direction?.comparison?.courseNote).toBe("");
        }
      }
    },
  );

  it("groups related converters by the same source and target formats", () => {
    const directions = buildConverterDirections(copy("en"));
    const current = directions.find((item) => item.slug === "fit-to-gpx");
    expect(current).toBeDefined();
    const related = directions.filter((item) => item.slug !== current!.slug);
    const grouped = groupRelatedConverterDirections(current!, related);
    expect(grouped.sameFrom.map((item) => item.slug)).toEqual(["fit-to-tcx"]);
    expect(grouped.sameTo.map((item) => item.slug)).toEqual(["tcx-to-gpx"]);
    expect(
      grouped.sameFrom.every((item) => item.ui.linkLabel.endsWith("converter")),
    ).toBe(true);
    expect(
      grouped.sameTo.every((item) => item.ui.linkLabel.endsWith("converter")),
    ).toBe(true);
  });
});
