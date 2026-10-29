import { i18n } from "@/lib/i18n";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

const languages = i18n.languages as readonly string[];

function isSupportedLocale(
  value: string,
): value is (typeof i18n.languages)[number] {
  return languages.includes(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isObject(base) || !isObject(override)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override)) {
    const prev = out[k];
    out[k] = isObject(prev) && isObject(v) ? deepMerge(prev, v) : v;
  }
  return out as T;
}

export default getRequestConfig(async ({ locale }) => {
  const resolvedLocale = locale ?? i18n.defaultLanguage;

  if (!isSupportedLocale(resolvedLocale)) {
    notFound();
  }

  const enMessages = (await import(`../../../../packages/messages/docs/en.json`)).default;

  return {
    locale: resolvedLocale,
    messages:
      resolvedLocale === i18n.defaultLanguage
        ? enMessages
        : deepMerge(
            enMessages,
            (await import(`../../../../packages/messages/docs/${resolvedLocale}.json`))
              .default,
          ),
  };
});
