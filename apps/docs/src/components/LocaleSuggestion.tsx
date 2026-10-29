"use client";

import { Languages, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { LOCALE_OPTIONS } from "@/lib/locale-options";
import {
  dismissLocaleSuggestion,
  hasDismissedLocaleSuggestion,
  persistLocalePreference,
  type DocsLocale,
} from "@/lib/locale-preference";
import {
  buildLocaleSuggestionHref,
  getSuggestedLocale,
} from "@/lib/locale-suggestion";

export function LocaleSuggestion() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("languageSuggestion");
  const [suggestion, setSuggestion] = useState<{
    locale: DocsLocale;
    pathname: string;
  } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const preferred = hasDismissedLocaleSuggestion()
        ? null
        : getSuggestedLocale(
            navigator.languages?.length
              ? navigator.languages
              : [navigator.language],
            locale,
          );
      setSuggestion(preferred ? { locale: preferred, pathname } : null);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [locale, pathname]);

  if (
    !suggestion ||
    suggestion.locale === locale ||
    suggestion.pathname !== pathname
  ) {
    return null;
  }

  const language = LOCALE_OPTIONS.find(
    (option) => option.key === suggestion.locale,
  )!.label;

  function dismiss() {
    dismissLocaleSuggestion();
    setSuggestion(null);
  }

  function switchLanguage() {
    if (!suggestion) return;

    const href = buildLocaleSuggestionHref(
      pathname,
      suggestion.locale,
      window.location.search,
      window.location.hash,
    );
    persistLocalePreference(suggestion.locale);
    setSuggestion(null);
    router.push(href, { scroll: false });
  }

  return (
    <aside
      aria-label={t("label")}
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-xl grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-3 rounded-surface border border-border bg-card p-4 text-card-foreground shadow-sm sm:grid-cols-[auto_1fr_auto_auto]"
    >
      <Languages aria-hidden="true" className="size-5 text-muted-foreground" />
      <p role="status" className="text-sm leading-6">
        {t("message", { language })}
      </p>
      <Button
        size="default"
        onClick={switchLanguage}
        className="col-start-2 row-start-2 justify-self-start sm:col-start-3 sm:row-start-1"
      >
        {t("switch")}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("dismiss")}
        onClick={dismiss}
        className="col-start-3 row-start-1 sm:col-start-4"
      >
        <X aria-hidden="true" />
      </Button>
    </aside>
  );
}
