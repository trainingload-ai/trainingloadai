import { defineI18n } from "fumadocs-core/i18n";

// Languages we let search engines index. This is deliberately narrower than
// `i18n.languages`: every other locale still renders and stays reachable for
// users, but is excluded from the sitemap, hreflang set, and robots meta.
//
// Only locales with reviewed, natively-written content belong here. Machine or
// partial translations indexed at scale dilute crawl budget across locales and
// read as low-quality duplicates of the English pages.
//
// - en / zh / ja / zh-hant: full reviewed coverage (105 docs pages each) and
//   active search-index targets.
// - ko / de / fr / es / it / pt-BR: full localized docs for users, kept
//   reachable and noindex (excluded from sitemap and hreflang per product
//   policy).
// Product policy (confirmed): only en / zh / ja / zh-hant are index targets.
// Secondary locales stay reachable and noindex. Do not add them to sitemap or
// hreflang as alternate index targets, including one-off landing pages.
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
