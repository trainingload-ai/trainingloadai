"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { persistLocalePreference, type DocsLocale } from "@/lib/locale-preference";

export function LocalePreferenceSync() {
  const locale = useLocale() as DocsLocale;

  useEffect(() => {
    persistLocalePreference(locale);
  }, [locale]);

  return null;
}
