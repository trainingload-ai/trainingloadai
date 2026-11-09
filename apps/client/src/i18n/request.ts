import { getRequestConfig } from "next-intl/server";
import { DEFAULT_RENDER_TIME_ZONE } from "./config";
import { routing } from "./routing";
import { loadDeploymentMessages } from "@deployment/managed-messages";
import personalEn from "../../../../packages/messages/personal-integrations/en.json";
import personalZh from "../../../../packages/messages/personal-integrations/zh.json";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isObject(base) || !isObject(override)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override)) {
    const prev = out[k];
    out[k] =
      isObject(prev) && isObject(v) ? deepMerge(prev, v) : v;
  }
  return out as T;
}

export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }
  const coreEnMessages = (
    await import(`../../../../packages/messages/client-core/en.json`)
  ).default;
  const enMessages = await loadDeploymentMessages(routing.defaultLocale, coreEnMessages);
  const messages =
    locale === routing.defaultLocale
      ? enMessages
      : deepMerge(
          enMessages,
          await loadDeploymentMessages(locale, (await import(`../../../../packages/messages/client-core/${locale}.json`)).default),
        );

  return {
    locale,
    // New integration namespaces have explicit English fallback for other locales.
    messages: { ...messages, PersonalIntegrations: locale === "zh" ? personalZh : personalEn },
    timeZone: DEFAULT_RENDER_TIME_ZONE,
  };
});
