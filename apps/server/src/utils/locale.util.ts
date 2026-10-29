export const SUPPORTED_APP_LOCALES = [
  'en',
  'zh',
  'zh-hant',
  'ja',
  'de',
  'fr',
  'ko',
  'es',
  'pt-BR',
  'it',
] as const;

export type SupportedAppLocale = (typeof SUPPORTED_APP_LOCALES)[number];

const APP_LOCALE_ENGLISH_NAMES: Record<SupportedAppLocale, string> = {
  en: 'English',
  zh: 'Simplified Chinese',
  'zh-hant': 'Traditional Chinese',
  ja: 'Japanese',
  de: 'German',
  fr: 'French',
  ko: 'Korean',
  es: 'Spanish',
  'pt-BR': 'Brazilian Portuguese',
  it: 'Italian',
};

export function resolveSupportedLocale(raw?: string | null): SupportedAppLocale {
  const candidate = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace('_', '-')
    .slice(0, 64);

  if (
    candidate.includes('zh-tw') ||
    candidate.includes('zh-hk') ||
    candidate.includes('zh-mo') ||
    candidate.includes('zh-hant')
  ) {
    return 'zh-hant';
  }
  if (candidate.includes('zh')) return 'zh';
  if (candidate.includes('ja')) return 'ja';
  if (candidate.includes('pt-br')) return 'pt-BR';
  if (candidate.includes('de')) return 'de';
  if (candidate.includes('fr')) return 'fr';
  if (candidate.includes('ko')) return 'ko';
  if (candidate.includes('es')) return 'es';
  if (candidate.includes('it')) return 'it';
  return 'en';
}

export function appLocaleEnglishName(locale: SupportedAppLocale): string {
  return APP_LOCALE_ENGLISH_NAMES[locale];
}
