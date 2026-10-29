import { describe, expect, it } from '@jest/globals';
import { SUPPORTED_APP_LOCALES } from '@/utils/locale.util';
import { readAiFallbackMessages } from './ai-fallback-i18n.test-util';

function flatten(
  tree: Record<string, unknown>,
  prefix = '',
): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      entries.set(path, value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [childPath, childValue] of flatten(
        value as Record<string, unknown>,
        path,
      )) {
        entries.set(childPath, childValue);
      }
    }
  }
  return entries;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
    .map((match) => match[1])
    .sort();
}

describe('AI deterministic fallback messages', () => {
  it.each(SUPPORTED_APP_LOCALES)(
    '%s defines every fallback message instead of relying on English',
    (locale) => {
      const english = flatten(readAiFallbackMessages('en'));
      const localized = flatten(readAiFallbackMessages(locale));

      expect([...localized.keys()].sort()).toEqual([...english.keys()].sort());
      for (const [key, value] of localized) {
        expect(value.trim()).not.toBe('');
        expect(value).not.toBe(key);
        expect(placeholders(value)).toEqual(
          placeholders(english.get(key) ?? ''),
        );
      }
      if (locale !== 'en') {
        expect(localized.get('today.decision.proposed')).not.toBe(
          english.get('today.decision.proposed'),
        );
        expect(localized.get('planExecution.noPlan')).not.toBe(
          english.get('planExecution.noPlan'),
        );
      }
    },
  );
});
