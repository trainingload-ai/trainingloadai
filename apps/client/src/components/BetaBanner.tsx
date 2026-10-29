"use client";

import { useTranslations } from "next-intl";

export function BetaBanner() {
  const t = useTranslations("banner");
  return (
    <div className="flex w-full items-center justify-center gap-2 border-b border-orange-500/20 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 px-4 py-2.5 text-center text-sm font-medium text-orange-700 backdrop-blur-sm dark:text-orange-300">
      <span className="animate-pulse">⚠️</span>
      <span>{t("betaWarning")}</span>
    </div>
  );
}
