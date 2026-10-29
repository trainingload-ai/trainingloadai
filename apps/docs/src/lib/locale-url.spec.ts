import { describe, expect, it } from "vitest";
import {
  absoluteAlternatesForLocales,
  absoluteAlternatesForPath,
  absoluteLocalizedUrl,
  alternatesLanguagesForPath,
  seoHreflangCodeForLocale,
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

  it("builds one consistent localized URL set for metadata and sitemaps", () => {
    expect(alternatesLanguagesForPath("/")).toEqual({
      en: "/",
      "zh-Hans": "/zh",
      ja: "/ja",
      "zh-Hant": "/zh-hant",
      "x-default": "/",
    });
    expect(absoluteAlternatesForPath("https://example.com/", "/")).toEqual({
      en: "https://example.com/",
      "zh-Hans": "https://example.com/zh",
      ja: "https://example.com/ja",
      "zh-Hant": "https://example.com/zh-hant",
      "x-default": "https://example.com/",
    });
  });

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
