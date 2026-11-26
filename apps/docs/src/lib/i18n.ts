import { defineI18n } from "fumadocs-core/i18n";

// Default search-indexing locales for docs, blog, and product pages.
// The homepage and public tools use path-specific eligibility in locale-url.ts.
export const SEO_INDEXED_LANGUAGES = ["en", "zh", "ja", "zh-hant"] as const;

const SEO_INDEXED_LANGUAGE_SET = new Set<string>(SEO_INDEXED_LANGUAGES);

export function isSeoIndexedLanguage(lang: string) {
  return SEO_INDEXED_LANGUAGE_SET.has(lang);
}

export const i18n = defineI18n({
  defaultLanguage: "en",
  hideLocale: "default-locale",
  languages: [
    "en",
    "de",
    "fr",
    "es",
    "pt-BR",
    "it",
    "ko",
    "ja",
    "zh",
    "zh-hant",
  ],
  parser: "dir",
});
