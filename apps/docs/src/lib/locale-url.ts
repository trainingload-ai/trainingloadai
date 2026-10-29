import { i18n, SEO_INDEXED_LANGUAGES } from "@/lib/i18n";

const HREFLANG_CODE_BY_LOCALE: Readonly<Record<string, string>> = {
  zh: "zh-Hans",
  "zh-hant": "zh-Hant",
};

export function isDefaultLocale(locale: string) {
  return locale === i18n.defaultLanguage;
}

/** as-needed locale prefix (default locale has no prefix) */
export function localePrefix(locale: string) {
  return isDefaultLocale(locale) ? "" : `/${locale}`;
}

/** SEO-only mapping; product routes, APIs, storage, and translations keep route locale ids. */
export function seoHreflangCodeForLocale(locale: string) {
  return HREFLANG_CODE_BY_LOCALE[locale] ?? locale;
}

function normalizeSitePath(path: string) {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash === "/"
    ? "/"
    : withLeadingSlash.replace(/\/+$/, "");
}

/** Build a site-relative path with as-needed locale prefix */
export function withLocalePath(locale: string, path: string) {
  const normalized = normalizeSitePath(path);
  if (normalized === "/") return localePrefix(locale) || "/";
  return `${localePrefix(locale)}${normalized}`;
}

/** Build a canonical absolute URL without redirecting trailing slashes. */
export function absoluteLocalizedUrl(
  siteUrl: string,
  locale: string,
  path: string,
) {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}${withLocalePath(locale, path)}`;
}

export function absoluteAlternatesForLocales(
  siteUrl: string,
  path: string,
  locales: readonly string[],
  xDefaultLocale: string | null = i18n.defaultLanguage,
) {
  return {
    ...Object.fromEntries(
      locales.map((locale) => [
        seoHreflangCodeForLocale(locale),
        absoluteLocalizedUrl(siteUrl, locale, path),
      ]),
    ),
    ...(xDefaultLocale
      ? {
          "x-default": absoluteLocalizedUrl(siteUrl, xDefaultLocale, path),
        }
      : {}),
  };
}

export function alternatesLanguagesForPath(path: string) {
  return {
    ...Object.fromEntries(
      SEO_INDEXED_LANGUAGES.map((locale) => [
        seoHreflangCodeForLocale(locale),
        withLocalePath(locale, path),
      ]),
    ),
    "x-default": withLocalePath(i18n.defaultLanguage, path),
  };
}

export function absoluteAlternatesForPath(siteUrl: string, path: string) {
  return absoluteAlternatesForLocales(
    siteUrl,
    path,
    SEO_INDEXED_LANGUAGES,
  );
}
