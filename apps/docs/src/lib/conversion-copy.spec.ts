import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";

const directory = fileURLToPath(
  new URL("../../../../packages/messages/docs/", import.meta.url),
);
const locales = readdirSync(directory)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""));
const read = (locale: string) =>
  JSON.parse(readFileSync(`${directory}/${locale}.json`, "utf8"));
const reference = read("en").conversionQuality;

describe("conversion copy in every supported locale", () => {
  it.each(locales)(
    "renders errors, warning counts, and metric names in %s without fallback",
    (locale) => {
      const messages = read(locale);
      expect(messages.conversionQuality).toBeDefined();
      const t = createTranslator({
        locale,
        messages,
        namespace: "conversionQuality",
        onError: (error) => {
          throw error;
        },
      });
      for (const key of Object.keys(reference)) {
        if (key === "metrics") {
          for (const metric of Object.keys(reference.metrics))
            expect(t(`metrics.${metric}`)).toBeTruthy();
        } else {
          for (const count of [1, 2])
            expect(
              t(key, { count, total: 1234, metrics: "A, B" }),
            ).toBeTruthy();
        }
      }
      const inspect = createTranslator({
        locale,
        messages,
        namespace: "fileInspection",
        onError: (error) => {
          throw error;
        },
      });
      for (const key of Object.keys(read("en").fileInspection)) {
        for (const count of [1, 2]) {
          expect(
            inspect(key, {
              format: "FIT",
              activities: count,
              laps: count,
              points: count,
              count,
              status: 500,
            }),
          ).toBeTruthy();
        }
      }
    },
  );

  it("uses singular and plural warning forms in English", () => {
    const t = createTranslator({
      locale: "en",
      messages: read("en"),
      namespace: "conversionQuality",
    });
    expect(t("sourceWarnings", { count: 1 })).toContain("1 parsing warning.");
    expect(t("sourceWarnings", { count: 2 })).toContain("2 parsing warnings.");
    const inspect = createTranslator({
      locale: "en",
      messages: read("en"),
      namespace: "fileInspection",
    });
    expect(inspect("activity", { activities: 1, laps: 1, points: 1 })).toBe(
      "1 activity · 1 lap · 1 record",
    );
  });
});
