/**
 * Native endonyms for product locales. Language pickers must render these
 * labels as-is — never translate them into the active UI locale.
 */
export const LOCALE_NATIVE_LABELS = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  "pt-BR": "Português (Brasil)",
  it: "Italiano",
  ko: "한국어",
  ja: "日本語",
  zh: "简体中文",
  "zh-hant": "繁體中文",
} as const;

export type LocaleWithNativeLabel = keyof typeof LOCALE_NATIVE_LABELS;

export function isLocaleWithNativeLabel(
  locale: string,
): locale is LocaleWithNativeLabel {
  return Object.prototype.hasOwnProperty.call(LOCALE_NATIVE_LABELS, locale);
}

export function localeNativeLabel(locale: string): string {
  return isLocaleWithNativeLabel(locale)
    ? LOCALE_NATIVE_LABELS[locale]
    : locale;
}
