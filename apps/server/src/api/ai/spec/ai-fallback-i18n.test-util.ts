import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import type { I18nService } from 'nestjs-i18n';
import { resolveSupportedLocale } from '@/utils/locale.util';

type TranslationTree = Record<string, unknown>;

const cache = new Map<string, TranslationTree>();

function messagesRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), '../../packages/messages/server'),
    path.resolve(process.cwd(), 'packages/messages/server'),
    path.resolve(__dirname, '../../../../../../packages/messages/server'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function readAiFallbackMessages(locale: string): TranslationTree {
  const resolved = resolveSupportedLocale(locale);
  const cached = cache.get(resolved);
  if (cached) return cached;
  const messages = JSON.parse(
    readFileSync(
      path.join(messagesRoot(), resolved, 'aiFallback.json'),
      'utf8',
    ),
  ) as TranslationTree;
  cache.set(resolved, messages);
  return messages;
}

function readPath(tree: TranslationTree, key: string): unknown {
  return key.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return (value as TranslationTree)[segment];
  }, tree);
}

export function createAiFallbackI18n(): I18nService {
  return {
    t: (
      key: string,
      options?: { lang?: string; args?: Record<string, unknown> },
    ) => {
      const locale = resolveSupportedLocale(options?.lang);
      const localKey = key.replace(/^aiFallback\./, '');
      const value = readPath(readAiFallbackMessages(locale), localKey);
      if (typeof value !== 'string') return key;
      return value.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => {
        const replacement = options?.args?.[name];
        return replacement === undefined || replacement === null
          ? match
          : String(replacement);
      });
    },
  } as unknown as I18nService;
}
