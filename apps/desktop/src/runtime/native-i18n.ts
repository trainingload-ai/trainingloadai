import { readFileSync } from "node:fs";
// These modules are generated from Public Core by build-locales.mjs.
import {
  resolveRequestLocale,
  LOCALE_COOKIE_NAME,
} from "../i18n/core-locale.js";

const catalogs = JSON.parse(
  readFileSync(new URL("../i18n/messages.json", import.meta.url), "utf8"),
) as Record<string, Record<string, string>>;
export { LOCALE_COOKIE_NAME };
export type Translate = (
  key: string,
  values?: Record<string, string>,
) => string;

export class NativeI18n {
  locale = "en";
  resolve(cookieLocale?: string, acceptLanguage?: string): string {
    return resolveRequestLocale({ cookieLocale, acceptLanguage });
  }
  setLocale(locale: string): boolean {
    if (!Object.hasOwn(catalogs, locale) || locale === this.locale)
      return false;
    this.locale = locale;
    return true;
  }
  fromUrl(url: string, origin: string): string | null {
    try {
      const parsed = new URL(url);
      const locale = parsed.pathname.split("/")[1];
      return parsed.origin === origin && Object.hasOwn(catalogs, locale)
        ? locale
        : null;
    } catch {
      return null;
    }
  }
  t: Translate = (key, values = {}) => {
    const template = catalogs[this.locale]?.[key] ?? catalogs.en[key];
    if (template === undefined)
      throw new Error(`Unknown native translation: ${key}`);
    return template.replace(
      /\{(\w+)\}/g,
      (_, name: string) => values[name] ?? `{${name}}`,
    );
  };
}
