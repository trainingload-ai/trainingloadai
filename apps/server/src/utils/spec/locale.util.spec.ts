import { describe, expect, it } from '@jest/globals';
import {
  appLocaleEnglishName,
  resolveSupportedLocale,
  SUPPORTED_APP_LOCALES,
} from '../locale.util';

describe('locale util', () => {
  it('exposes the supported locale list in product order', () => {
    expect(SUPPORTED_APP_LOCALES).toEqual([
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
    ]);
  });

  it('resolves known language and region variants', () => {
    const cases: Array<[string, ReturnType<typeof resolveSupportedLocale>]> = [
      ['zh_CN', 'zh'],
      ['zh-Hant-TW', 'zh-hant'],
      ['zh_HK', 'zh-hant'],
      ['JA-jp', 'ja'],
      ['pt_BR', 'pt-BR'],
      ['de-DE', 'de'],
      ['fr-CA', 'fr'],
      ['ko-KR', 'ko'],
      ['es-MX', 'es'],
      ['it-IT', 'it'],
    ];

    for (const [input, expected] of cases) {
      expect(resolveSupportedLocale(input)).toBe(expected);
    }
  });

  it('falls back to English for empty, unknown, or overlong values', () => {
    expect(resolveSupportedLocale(null)).toBe('en');
    expect(resolveSupportedLocale('')).toBe('en');
    expect(resolveSupportedLocale('ru-RU')).toBe('en');
    expect(resolveSupportedLocale(`${'x'.repeat(80)}zh`)).toBe('en');
  });

  it('maps every supported locale to a stable English display name', () => {
    expect(appLocaleEnglishName('zh')).toBe('Simplified Chinese');
    expect(appLocaleEnglishName('zh-hant')).toBe('Traditional Chinese');
    expect(appLocaleEnglishName('pt-BR')).toBe('Brazilian Portuguese');
    expect(SUPPORTED_APP_LOCALES.map(appLocaleEnglishName)).toEqual([
      'English',
      'Simplified Chinese',
      'Traditional Chinese',
      'Japanese',
      'German',
      'French',
      'Korean',
      'Spanish',
      'Brazilian Portuguese',
      'Italian',
    ]);
  });
});
