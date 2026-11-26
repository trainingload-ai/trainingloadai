import { describe, expect, it } from "vitest";
import {
  absoluteAlternatesForLocales,
  absoluteAlternatesForPath,
  absoluteLocalizedUrl,
  alternatesLanguagesForPath,
  robotsForPublicPath,
  seoHreflangCodeForLocale,
  seoIndexedLanguagesForPath,
  withLocalePath,
} from "@/lib/locale-url";

describe("locale URL SEO helpers", () => {
  it("uses canonical, non-redirecting locale root paths", () => {
    expect(withLocalePath("en", "/")).toBe("/");
    expect(withLocalePath("zh", "/")).toBe("/zh");
    expect(withLocalePath("zh-hant", "/")).toBe("/zh-hant");
    expect(withLocalePath("zh", "/training-load/")).toBe(
      "/zh/training-load",
    );
  });

  it("maps Chinese route locales to explicit script hreflang codes", () => {
    expect(seoHreflangCodeForLocale("zh")).toBe("zh-Hans");
    expect(seoHreflangCodeForLocale("zh-hant")).toBe("zh-Hant");
    expect(seoHreflangCodeForLocale("en")).toBe("en");
  });

  it.each(["/", "/tools", "/fit-to-gpx", "/lactate-curve-calculator"])(
    "uses all ten locales for links and robots on %s",
    (path) => {
      expect(seoIndexedLanguagesForPath(path)).toHaveLength(10);
      expect(robotsForPublicPath("fr", path)).toMatchObject({
        index: true,
        googleBot: { index: true },
      });
      const alternates = alternatesLanguagesForPath(path);
      expect(alternates).toHaveProperty("fr", withLocalePath("fr", path));
      expect(alternates).toHaveProperty("pt-BR", withLocalePath("pt-BR", path));
      expect(absoluteAlternatesForPath("https://example.com/", path)).toEqual(
        Object.fromEntries(
          Object.entries(alternates).map(([lang, url]) => [lang, `https://example.com${url}`]),
        ),
      );
    },
  );

  it.each(["/docs", "/docs/metrics", "/blog", "/pricing"])(
    "keeps four index targets on %s",
    (path) => {
      expect(seoIndexedLanguagesForPath(path)).toEqual(["en", "zh", "ja", "zh-hant"]);
      expect(Object.keys(alternatesLanguagesForPath(path))).toEqual([
        "en", "zh-Hans", "ja", "zh-Hant", "x-default",
      ]);
      expect(robotsForPublicPath("fr", path)).toMatchObject({
        index: false,
        googleBot: { index: false },
      });
    },
  );

  it("supports content-specific locale sets and x-default locales", () => {
    expect(
      absoluteAlternatesForLocales(
        "https://example.com/",
        "/guide/",
        ["en", "zh-hant"],
        "zh-hant",
      ),
    ).toEqual({
      en: "https://example.com/guide",
      "zh-Hant": "https://example.com/zh-hant/guide",
      "x-default": "https://example.com/zh-hant/guide",
    });
    expect(absoluteLocalizedUrl("https://example.com/", "zh", "/")).toBe(
      "https://example.com/zh",
    );
  });
});
