"use client";

import { useTranslations } from "next-intl";

export function BetaBanner() {
  const t = useTranslations("banner");
  return (
    <div className="w-full bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 backdrop-blur-sm border-b border-orange-500/20 text-orange-700 dark:text-orange-300 px-4 py-2.5 text-center text-sm font-medium flex items-center justify-center gap-2 shadow-sm">
      <span className="animate-pulse">⚠️</span>
      <span>{t("betaWarning")}</span>
    </div>
  );
}
