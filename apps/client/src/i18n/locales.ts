import type { LocaleWithNativeLabel } from "@shared/locale-display-names";

export {
  LOCALE_NATIVE_LABELS,
  localeNativeLabel,
} from "@shared/locale-display-names";

export const SUPPORTED_LOCALES = [
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
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

type Assert<T extends true> = T;
type _AssertNativeLabelsCoverLocales = Assert<
  Locale extends LocaleWithNativeLabel
    ? LocaleWithNativeLabel extends Locale
      ? true
      : false
    : false
>;

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

export function isSupportedLocale(value: string | undefined): value is Locale {
  return value != null && SUPPORTED_LOCALE_SET.has(value);
}

export const LOCALE_PATH_PATTERN = SUPPORTED_LOCALES.map((locale) =>
  locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
).join("|");
