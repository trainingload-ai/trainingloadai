"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { getStoredLocale, persistLocalePreference } from "@/lib/locale-preference";
import { routing, type Locale } from "@/i18n/routing";

export function LocalePreferenceSync() {
  const locale = useLocale() as Locale;

  useEffect(() => {
    const stored = getStoredLocale();
    // 无前缀公开页若落到 defaultLocale，不要把用户已经选过的语言覆盖掉。
    if (
      stored &&
      stored !== locale &&
      locale === routing.defaultLocale
    ) {
      return;
    }
    persistLocalePreference(locale);
  }, [locale]);

  return null;
}
