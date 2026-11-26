import type { Metadata } from "next";
import { getConverterDirectionSlugs } from "@/lib/converter-directions";
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

export const ALL_LOCALE_INDEXED_PATHS = [
  "/",
  "/tools",
  "/free-ai-workout-review",
  "/workout-editor",
  "/fit-file-viewer",
  "/converter",
  "/fit-course-converter",
  "/ftp-calculator",
  "/critical-power-calculator",
  "/lactate-threshold-calculator",
  "/lactate-curve-calculator",
  "/max-heart-rate-calculator",
  "/heart-rate-zones-calculator",
  "/zone-2-heart-rate-calculator",
  "/css-calculator",
  "/vo2-max-calculator",
  "/vdot-calculator",
  "/daniels-running-formula",
  "/running-pace-calculator",
  "/race-time-predictor",
  "/power-zones-calculator",
  "/tss-calculator",
  "/training-load-calculator",
  "/brick-workout",
  ...getConverterDirectionSlugs().map((slug) => `/${slug}`),
] as const;

const allLocaleIndexedPaths = new Set<string>(ALL_LOCALE_INDEXED_PATHS);

export function seoIndexedLanguagesForPath(path: string): readonly string[] {
  return allLocaleIndexedPaths.has(normalizeSitePath(path))
    ? i18n.languages
    : SEO_INDEXED_LANGUAGES;
}

export function robotsForPublicPath(
  locale: string,
  path: string,
): Metadata["robots"] {
  const index = seoIndexedLanguagesForPath(path).includes(locale);
  return {
    index,
    follow: true,
    googleBot: {
      index,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  };
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
      seoIndexedLanguagesForPath(path).map((locale) => [
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
    seoIndexedLanguagesForPath(path),
  );
}
