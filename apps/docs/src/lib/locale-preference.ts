import { i18n } from "@/lib/i18n";

export const LOCALE_STORAGE_KEY = "preferred-locale";
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
export const LOCALE_SUGGESTION_COOKIE_NAME = "tl-locale-suggestion-dismissed";
// Version 1 also recorded manual language changes, so it cannot prove dismissal.
const LOCALE_SUGGESTION_DISMISSAL_VERSION = "2";

export type DocsLocale = (typeof i18n.languages)[number];

function isLocale(value: string): value is DocsLocale {
  return i18n.languages.includes(value as DocsLocale);
}

export function getStoredLocale(): DocsLocale | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)?.trim();
  return stored && isLocale(stored) ? stored : null;
}

export function hasDismissedLocaleSuggestion() {
  return (
    typeof document !== "undefined" &&
    document.cookie
      .split(";")
      .some(
        (cookie) =>
          cookie.trim() ===
          `${LOCALE_SUGGESTION_COOKIE_NAME}=${LOCALE_SUGGESTION_DISMISSAL_VERSION}`,
      )
  );
}

export function dismissLocaleSuggestion() {
  if (typeof document === "undefined") return;

  document.cookie = `${LOCALE_SUGGESTION_COOKIE_NAME}=${LOCALE_SUGGESTION_DISMISSAL_VERSION}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

export function persistLocalePreference(locale: DocsLocale) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Cookies can still remember the choice when local storage is unavailable.
  }
  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
