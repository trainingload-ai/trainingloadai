import { resolveSupportedLocale } from './locale.util';
import de = require('../../../../packages/messages/server/de/publicRuntime.json');
import en = require('../../../../packages/messages/server/en/publicRuntime.json');
import es = require('../../../../packages/messages/server/es/publicRuntime.json');
import fr = require('../../../../packages/messages/server/fr/publicRuntime.json');
import it = require('../../../../packages/messages/server/it/publicRuntime.json');
import ja = require('../../../../packages/messages/server/ja/publicRuntime.json');
import ko = require('../../../../packages/messages/server/ko/publicRuntime.json');
import ptBR = require('../../../../packages/messages/server/pt-BR/publicRuntime.json');
import zh = require('../../../../packages/messages/server/zh/publicRuntime.json');
import zhHant = require('../../../../packages/messages/server/zh-hant/publicRuntime.json');

const catalogs = { de, en, es, fr, it, ja, ko, 'pt-BR': ptBR, zh, 'zh-hant': zhHant };

type TodayKey = keyof typeof en.today;
type RootKey = Exclude<keyof typeof en, 'today'>;
export type PublicRuntimeKey = RootKey | `today.${TodayKey}`;

export function publicRuntimeText(
  lang: string | null | undefined,
  key: PublicRuntimeKey,
  args?: Record<string, string | number>,
): string {
  const catalog = catalogs[resolveSupportedLocale(lang)];
  const value = key.startsWith('today.')
    ? catalog.today[key.slice(6) as TodayKey] ?? en.today[key.slice(6) as TodayKey]
    : catalog[key as RootKey] ?? en[key as RootKey];
  return value.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (placeholder, name) =>
    args?.[name] === undefined ? placeholder : String(args[name]),
  );
}
