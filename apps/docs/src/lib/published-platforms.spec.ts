import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";

describe("published platform support", () => {
  it.each(i18n.languages)(
    "does not promote an unavailable Apple Watch app in %s",
    (locale) => {
      const messages = JSON.parse(
        readFileSync(
          new URL(`../../../../packages/messages/docs/${locale}.json`, import.meta.url),
          "utf8",
        ),
      );
      const calculatorHeroes = Object.values(messages).flatMap((section) => {
        const hero = (section as { page?: { heroProduct?: unknown } })?.page
          ?.heroProduct;
        return hero ? [hero] : [];
      });
      const promotions = {
        footer: messages.footer,
        home: messages.home.heroVisible,
        calculatorHeroes,
        calculatorProduct: messages.calculatorProduct,
      };

      expect(JSON.stringify(promotions)).not.toMatch(/Apple\s*Watch|watchOS/i);
    },
  );

  it("does not illustrate current product features with Apple Watch screens", () => {
    const sources = [
      "../components/calculators/product-preview.tsx",
      ...[
        "ftp-calculator",
        "critical-power-calculator",
        "lactate-threshold-calculator",
        "vo2-max-calculator",
        "css-calculator",
      ].map((route) => `../app/[lang]/(home)/${route}/page.tsx`),
    ];

    for (const source of sources) {
      expect(readFileSync(new URL(source, import.meta.url), "utf8")).not.toContain(
        "/ftp-calculator/watch-",
      );
    }
  });
});
