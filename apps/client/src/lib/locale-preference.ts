import { SUPPORTED_LOCALES, type Locale } from "@/i18n/locales";

export const LOCALE_STORAGE_KEY = "preferred-locale";
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
const DEFAULT_LOCALE: Locale = "en";

function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

function asLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    return isLocale(decoded) ? decoded : null;
  } catch {
    return isLocale(value) ? value : null;
  }
}

export function getStoredLocale(): Locale | null {
  if (typeof window === "undefined") {
    return null;
  }

  return asLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
}

export function persistLocalePreference(locale: Locale) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((item) => item.trim().startsWith("q="));
      const quality = q ? Number(q.trim().slice(2)) : 1;
      return {
        tag: tag.trim().toLowerCase(),
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .toSorted((a, b) => b.quality - a.quality);

  for (const { tag } of candidates) {
    if (!tag || tag === "*") continue;
    if (
      tag === "zh-hant" ||
      tag === "zh-tw" ||
      tag === "zh-hk" ||
      tag === "zh-mo"
    ) {
      return "zh-hant";
    }
    if (tag === "zh" || tag === "zh-cn" || tag === "zh-sg" || tag === "zh-hans") {
      return "zh";
    }
    if (isLocale(tag)) return tag;
    if (tag.startsWith("pt")) return "pt-BR";
    const base = tag.split("-")[0] ?? "";
    if (base === "zh") return "zh";
    if (isLocale(base)) return base;
  }
  return null;
}

export function resolveRequestLocale(input: {
  queryLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  return (
    asLocale(input.queryLocale) ??
    asLocale(input.cookieLocale) ??
    localeFromAcceptLanguage(input.acceptLanguage) ??
    DEFAULT_LOCALE
  );
}
