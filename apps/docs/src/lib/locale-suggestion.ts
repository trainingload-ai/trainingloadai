import { LOCALE_OPTIONS, buildLocalePathname } from "@/lib/locale-options";
import type { DocsLocale } from "@/lib/locale-preference";

function matchBrowserLocale(language: string): DocsLocale | null {
  try {
    const locale = new Intl.Locale(language.replaceAll("_", "-"));

    if (locale.language === "zh") {
      return locale.maximize().script === "Hant" ? "zh-hant" : "zh";
    }

    return (
      LOCALE_OPTIONS.find(
        (option) => option.key.split("-")[0] === locale.language,
      )?.key ?? null
    );
  } catch {
    return null;
  }
}

export function getSuggestedLocale(
  languages: readonly string[],
  currentLocale: string,
): DocsLocale | null {
  for (const language of languages) {
    const matched = matchBrowserLocale(language);
    if (matched) return matched === currentLocale ? null : matched;
  }

  return null;
}

export function buildLocaleSuggestionHref(
  pathname: string,
  locale: DocsLocale,
  search = "",
  hash = "",
) {
  return `${buildLocalePathname(pathname, locale)}${search}${hash}`;
}
