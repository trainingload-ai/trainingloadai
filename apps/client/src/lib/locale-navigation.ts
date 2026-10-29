import { LOCALE_PATH_PATTERN } from "@/i18n/locales";

export type LocaleNavigationQuery = Record<string, string | string[]>;

const LOCALE_PREFIX_PATTERN = new RegExp(
  `^/(?:${LOCALE_PATH_PATTERN})(?=/|$)`,
  "i",
);

/** Preserve the current URL query when changing locale, including repeated keys. */
export function localeNavigationQuery(
  search: string,
): LocaleNavigationQuery | undefined {
  const query: LocaleNavigationQuery = {};

  new URLSearchParams(search).forEach((value, key) => {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      query[key] = [existing, value];
    }
  });

  return Object.keys(query).length > 0 ? query : undefined;
}

/** Build a locale-prefixed URL for flows that require a full document reload. */
export function localeNavigationHref(
  locale: string,
  pathname: string,
  search: string,
): string {
  const normalizedPathname = pathname.startsWith("/")
    ? pathname
    : `/${pathname}`;
  const unprefixedPathname =
    normalizedPathname.replace(LOCALE_PREFIX_PATTERN, "") || "/";
  const normalizedSearch =
    search && !search.startsWith("?") ? `?${search}` : search;
  return `/${locale}${unprefixedPathname}${normalizedSearch}`;
}

export function replaceBrowserLocation(href: string): void {
  window.location.replace(href);
}
