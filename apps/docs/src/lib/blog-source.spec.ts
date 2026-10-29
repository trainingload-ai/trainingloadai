import { describe, expect, it, vi } from "vitest";

const { pages, source } = vi.hoisted(() => {
  const articleSlug = ["what-are-ctl-atl-tsb"];
  const nativePages = [
    {
      path: "en/what-are-ctl-atl-tsb",
      slugs: articleSlug,
      data: { title: "What Are CTL, ATL, and TSB?" },
    },
    {
      path: "zh/what-are-ctl-atl-tsb",
      slugs: articleSlug,
      data: { title: "什么是 CTL、ATL、TSB？" },
    },
  ];

  return {
    pages: nativePages,
    source: {
      getPage(slug: string[], lang: string) {
        const slugKey = slug.join("/");
        return (
          nativePages.find((page) => page.path === `${lang}/${slugKey}`) ??
          nativePages.find((page) => page.path === `en/${slugKey}`)
        );
      },
      getPages() {
        return nativePages;
      },
      generateParams() {
        return nativePages.map((page) => ({
          lang: page.path.split("/")[0]!,
          slug: page.slugs,
        }));
      },
    },
  };
});

vi.mock("@/.source", () => ({ blog: {} }));
vi.mock("fumadocs-core/source", () => ({
  loader: () => source,
}));
import {
  blogAlternatesForSlug,
  blogIndexAlternates,
  generateBlogParamsWithFallback,
  getBlogPageWithFallback,
  getNativeBlogLanguages,
} from "@/lib/blog-source";

const ARTICLE_SLUG = ["what-are-ctl-atl-tsb"];

describe("blog localization and SEO", () => {
  it("serves native English and Chinese articles", () => {
    const english = getBlogPageWithFallback(ARTICLE_SLUG, "en");
    const chinese = getBlogPageWithFallback(ARTICLE_SLUG, "zh");

    expect(english?.contentLanguage).toBe("en");
    expect(english?.isFallback).toBe(false);
    expect(chinese?.contentLanguage).toBe("zh");
    expect(chinese?.isFallback).toBe(false);
  });

  it("falls back to English for locales without a native translation", () => {
    const fallback = getBlogPageWithFallback(ARTICLE_SLUG, "de");

    expect(fallback?.contentLanguage).toBe("en");
    expect(fallback?.isFallback).toBe(true);
    expect(fallback?.page.data.title).toContain("CTL");
    expect(pages).toHaveLength(2);
  });

  it("keeps fallback locales out of hreflang and sitemap locale sets", () => {
    expect(getNativeBlogLanguages()).toEqual(["en", "zh"]);
    expect(blogIndexAlternates("https://www.trainingload.ai/")).toEqual({
      en: "https://www.trainingload.ai/blog",
      "zh-Hans": "https://www.trainingload.ai/zh/blog",
      "x-default": "https://www.trainingload.ai/blog",
    });
    expect(
      blogAlternatesForSlug("https://www.trainingload.ai/", ARTICLE_SLUG),
    ).toEqual({
      en: "https://www.trainingload.ai/blog/what-are-ctl-atl-tsb",
      "zh-Hans": "https://www.trainingload.ai/zh/blog/what-are-ctl-atl-tsb",
      "x-default": "https://www.trainingload.ai/blog/what-are-ctl-atl-tsb",
    });
  });

  it("pre-renders the article for every supported locale", () => {
    const params = generateBlogParamsWithFallback().filter(
      ({ slug }) => slug.join("/") === ARTICLE_SLUG.join("/"),
    );

    expect(params).toHaveLength(10);
    expect(params.map(({ lang }) => lang)).toContain("de");
    expect(params.map(({ lang }) => lang)).toContain("zh-hant");
  });
});
