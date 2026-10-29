import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { IOS_APP_STORE_URL } from "@/lib/app-links";
import { Footer } from "./Footer";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace: string;
  }) =>
    createTranslator({
      locale,
      namespace,
      messages: JSON.parse(
        readFileSync(
          new URL(`../../../../packages/messages/docs/${locale}.json`, import.meta.url),
          "utf8",
        ),
      ),
      onError: (error) => {
        throw error;
      },
    }),
}));

const locales = [
  "en",
  "zh",
  "zh-hant",
  "ja",
  "de",
  "es",
  "fr",
  "it",
  "ko",
  "pt-BR",
];

describe("compact footer navigation", () => {
  it.each(locales)(
    "renders localized, crawlable category links in %s",
    async (lang) => {
      const html = renderToStaticMarkup(await Footer({ lang }));
      const prefix = lang === "en" ? "" : `/${lang}`;
      const links = [...html.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map(
        (match) => match[1],
      );
      expect(links.length).toBeLessThanOrEqual(30);
      expect(new Set(links).size).toBe(links.length);
      expect(html.match(/<nav\s/g)).toHaveLength(5);
      expect(html).not.toMatch(/<button|<details/);
      for (const route of [
        "/couch-to-5k-training-plan",
        "/5k-training-plan",
        "/10k-training-plan",
        "/half-marathon-training-plan",
        "/marathon-training-plan",
        "/cycling-training-plan",
        "/swim-training-plan",
        "/ironman-70-3-training-plan",
        "/olympic-triathlon-training-plan",
        "/brick-workout",
        "/plan",
        "/tools",
        "/privacy",
        "/terms-and-conditions",
        "/contact",
      ]) {
        expect(links).toContain(`${prefix}${route}`);
        expect(
          existsSync(
            new URL(`../app/[lang]/(home)${route}/page.tsx`, import.meta.url),
          ),
        ).toBe(true);
      }
      expect(links).toContain(IOS_APP_STORE_URL);
      expect(links).toContain("mailto:support@trainingload.ai");
      expect(html).not.toContain("/improve");
      expect(html).not.toContain("/target");
      expect(html).not.toContain("/intermediate");
    },
  );

  it("uses matching navigation keys in every locale", () => {
    const messages = locales.map((lang) =>
      JSON.parse(
        readFileSync(
          new URL(`../../../../packages/messages/docs/${lang}.json`, import.meta.url),
          "utf8",
        ),
      ),
    );
    const keys = Object.keys(messages[0].footer.navigation).sort();
    for (const copy of messages) {
      expect(Object.keys(copy.footer.navigation).sort()).toEqual(keys);
      for (const value of Object.values(copy.footer.navigation)) {
        expect(typeof value).toBe("string");
        expect(String(value).trim().length).toBeGreaterThan(0);
      }
    }
  });
});
