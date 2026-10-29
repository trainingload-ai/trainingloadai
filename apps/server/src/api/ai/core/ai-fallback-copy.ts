import type { I18nService } from 'nestjs-i18n';
import type { SupportedAppLocale } from '@/utils/locale.util';

export function aiFallbackText(
  i18n: I18nService,
  locale: SupportedAppLocale,
  key: string,
  args?: Record<string, string | number>,
): string {
  const translationKey = `aiFallback.${key}`;
  const value = i18n.t(translationKey, { lang: locale, args });
  return typeof value === 'string' && value !== translationKey ? value : key;
}

export function aiFallbackEnumText(
  i18n: I18nService,
  locale: SupportedAppLocale,
  group: 'importance' | 'impact' | 'phase' | 'sport',
  value: string,
): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return '';
  const translated = aiFallbackText(
    i18n,
    locale,
    `enum.${group}.${normalized}`,
  );
  return translated === `enum.${group}.${normalized}` ? value : translated;
}
