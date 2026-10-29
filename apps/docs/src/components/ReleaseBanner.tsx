"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { trackMarketingEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  formatNewUserGiftCredits,
  type NewUserGiftValues,
} from "@/lib/offer-content";

export function ReleaseBanner({
  lang,
  className,
  newUserGift,
}: {
  lang: string;
  className?: string;
  newUserGift: NewUserGiftValues;
}) {
  const t = useTranslations("banner.release");
  const giftValues = {
    days: newUserGift.accessDays,
    credits: formatNewUserGiftCredits(newUserGift.bonusCredits, lang),
  };

  return (
    <aside
      aria-label={t("ariaLabel")}
      className={cn(
        "w-full border-y border-border/70 bg-background/95 text-foreground backdrop-blur supports-[backdrop-filter]:bg-background/85",
        className,
      )}
    >
      <div className="mx-auto flex min-h-11 max-w-7xl items-center justify-center gap-2.5 px-4 py-2 text-xs sm:gap-3 sm:text-sm">
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129_/_0.12)] dark:bg-emerald-400"
          />
          <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("eyebrow")}
          </span>
        </div>
        <span
          aria-hidden="true"
          className="hidden h-4 w-px bg-border sm:block"
        />
        <p className="min-w-0 text-pretty font-medium leading-5 text-foreground/85">
          <span className="sm:hidden">{t("mobileMessage", giftValues)}</span>
          <span className="hidden sm:inline">{t("message", giftValues)}</span>
        </p>
        <a
          href={`https://app.trainingload.ai/${lang}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            trackMarketingEvent("marketing_cta_clicked", {
              href: `https://app.trainingload.ai/${lang}`,
              label: t("cta"),
              location: "release_banner",
              campaign: "new_user_gift",
            })
          }
          className="group inline-flex min-h-8 shrink-0 items-center gap-1 rounded-xs px-1.5 py-1 font-semibold text-emerald-700 underline decoration-emerald-600/35 underline-offset-4 transition-colors hover:text-emerald-900 hover:decoration-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 dark:text-emerald-300 dark:decoration-emerald-400/40 dark:hover:text-emerald-200"
        >
          {t("cta")}
          <ArrowRight
            aria-hidden="true"
            className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
          />
        </a>
      </div>
    </aside>
  );
}
