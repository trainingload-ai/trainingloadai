import { LOCALE_NATIVE_LABELS } from "@shared/locale-display-names";
import { withLocalePath } from "@/lib/locale-url";
import type { DocsLocale } from "@/lib/locale-preference";

export type LocaleOption = {
  key: DocsLocale;
  label: string;
  shortLabel: string;
};

export const LOCALE_OPTIONS: LocaleOption[] = [
  { key: "en", label: LOCALE_NATIVE_LABELS.en, shortLabel: "EN" },
  { key: "de", label: LOCALE_NATIVE_LABELS.de, shortLabel: "DE" },
  { key: "fr", label: LOCALE_NATIVE_LABELS.fr, shortLabel: "FR" },
  { key: "es", label: LOCALE_NATIVE_LABELS.es, shortLabel: "ES" },
  { key: "pt-BR", label: LOCALE_NATIVE_LABELS["pt-BR"], shortLabel: "PT" },
  { key: "it", label: LOCALE_NATIVE_LABELS.it, shortLabel: "IT" },
  { key: "ko", label: LOCALE_NATIVE_LABELS.ko, shortLabel: "KO" },
  { key: "ja", label: LOCALE_NATIVE_LABELS.ja, shortLabel: "JA" },
  { key: "zh", label: LOCALE_NATIVE_LABELS.zh, shortLabel: "简中" },
  { key: "zh-hant", label: LOCALE_NATIVE_LABELS["zh-hant"], shortLabel: "繁體" },
];

const localeKeys = new Set<string>(LOCALE_OPTIONS.map((option) => option.key));

export function isDocsLocale(value: string): value is DocsLocale {
  return localeKeys.has(value);
}

export function buildLocalePathname(pathname: string, target: DocsLocale) {
  const segments = pathname.split("/").filter(Boolean);
  const restSegments =
    segments[0] && isDocsLocale(segments[0]) ? segments.slice(1) : segments;
  const restPath = restSegments.length > 0 ? `/${restSegments.join("/")}` : "/";

  return withLocalePath(target, restPath);
}
