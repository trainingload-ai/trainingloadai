import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";
import { SUPPORTED_LOCALES, type Locale } from "./locales";

export {
  isSupportedLocale,
  LOCALE_NATIVE_LABELS,
  LOCALE_PATH_PATTERN,
  localeNativeLabel,
  SUPPORTED_LOCALES,
} from "./locales";
export type { Locale };

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: SUPPORTED_LOCALES,

  // Used when no locale matches
  defaultLocale: "en",
});

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
