"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Billing = "monthly" | "yearly";

const DEFAULT_BILLING: Billing = "yearly";
type PlanKey = "free" | "plus" | "pro";

type PricingCreditLabels = {
  plus: string;
  pro: string;
};

type PricingPlansSectionProps = {
  appUrl: string;
  creditLabels: PricingCreditLabels;
  newUserGift: { days: number; credits: string };
  className?: string;
};

type CreditPackItem = {
  name: string;
  credits: string;
  price: string;
  note: string;
};

function planCreditLabel(
  plan: PlanKey,
  creditLabels: PricingCreditLabels,
) {
  if (plan === "plus") return creditLabels.plus;
  if (plan === "pro") return creditLabels.pro;
  return "";
}

function replacePlanCreditPlaceholders(
  value: string,
  plan: PlanKey,
  creditLabels: PricingCreditLabels,
) {
  return value.replaceAll("{credits}", planCreditLabel(plan, creditLabels));
}

export function PricingPlansSection({
  appUrl,
  creditLabels,
  newUserGift,
  className,
}: PricingPlansSectionProps) {
  const t = useTranslations("pricingPage");
  const [billing, setBilling] = useState<Billing>(DEFAULT_BILLING);
  const plans: PlanKey[] = ["free", "plus", "pro"];

  return (
    <section className={cn("mt-9", className)}>
      <div className="mx-auto flex max-w-lg flex-col items-stretch gap-2 sm:max-w-xl">
        <span className="text-center text-xs font-semibold text-muted-foreground">
          {t("billingToggle.label")}
        </span>
        <div
          className="inline-flex self-center rounded-control-lg bg-muted p-1 ring-1 ring-border/80"
          role="group"
          aria-label={t("billingToggle.label")}
        >
          <button
            type="button"
            className={cn(
              "rounded-control px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4",
              billing === "monthly"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={billing === "monthly"}
            onClick={() => setBilling("monthly")}
          >
            {t("billingToggle.monthly")}
          </button>
          <button
            type="button"
            className={cn(
              "rounded-control px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4",
              billing === "yearly"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={billing === "yearly"}
            onClick={() => setBilling("yearly")}
          >
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span>{t("billingToggle.yearly")}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide",
                  billing === "yearly"
                    ? "bg-brand text-brand-foreground"
                    : "bg-brand-soft text-foreground",
                )}
              >
                {t("billingToggle.yearlySave")}
              </span>
            </span>
          </button>
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-5xl gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const items = (t.raw(`plans.${plan}.items`) as string[])
            .slice(0, 4)
            .map((item) =>
              replacePlanCreditPlaceholders(item, plan, creditLabels),
            );
          const isPlus = plan === "plus";
          const isPaid = plan !== "free";
          const description =
            plan === "plus"
              ? t("plans.plus.desc", { credits: creditLabels.plus })
              : plan === "pro"
                ? t("plans.pro.desc", { credits: creditLabels.pro })
                : t("plans.free.desc", newUserGift);

          return (
            <article
              key={plan}
              className={cn(
                "relative flex flex-col rounded-surface bg-card p-5 shadow-xs ring-1 ring-border/80",
                isPlus
                  ? "ring-2 ring-foreground"
                  : "",
              )}
            >
              {isPlus ? (
                <span className="absolute right-3 top-3 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-foreground">
                  {t("plans.plus.badge")}
                </span>
              ) : null}
              <h3 className="pr-20 text-xl font-bold tracking-tight text-foreground">
                {t(`plans.${plan}.name`)}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>

              <div className="mt-5 min-h-24">
                {plan === "free" ? (
                  <div className="text-3xl font-bold tracking-tight text-foreground">
                    {t("plans.free.price")}
                  </div>
                ) : billing === "monthly" ? (
                  <>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(`plans.${plan}.monthlyLabel`)}
                    </div>
                    <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-foreground">
                      {t(`plans.${plan}.priceMonthly`)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t(`plans.${plan}.yearlyLabel`)}
                      </span>
                      <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-brand-foreground">
                        {t(`plans.${plan}.yearlyDiscountBadge`)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline gap-2">
                      <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
                        {t(`plans.${plan}.priceYearly`)}
                      </span>
                      <span className="text-sm text-muted-foreground line-through decoration-border">
                        {t(`plans.${plan}.priceYearlyStrike`)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {t(`plans.${plan}.yearlyCompare`)}
                    </p>
                  </>
                )}
              </div>

              <ul className="mt-5 flex flex-1 flex-col gap-2">
                {items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-foreground" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <Link href={appUrl} className="mt-6 inline-flex">
                <Button
                  className={cn(
                    "h-10 w-full text-sm font-semibold",
                    isPlus && "bg-brand text-brand-foreground hover:bg-brand/88",
                  )}
                  variant={isPaid ? "default" : "outline"}
                >
                  {isPaid
                    ? t(`cta${plan === "plus" ? "Plus" : "Pro"}`)
                    : t("ctaFree")}
                </Button>
              </Link>
            </article>
          );
        })}
      </div>

      <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-5 text-muted-foreground">
        {t("creditNote")}
      </p>
      <p className="mx-auto mt-2 max-w-2xl text-center text-xs leading-5 text-muted-foreground">
        {t("checkoutNote")}
      </p>

      <section className="mx-auto mt-12 max-w-5xl border-t border-border pt-9">
        <div className="mx-auto max-w-2xl text-center">
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            {t("creditPacks.title")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("creditPacks.subtitle")}
          </p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {(t.raw("creditPacks.items") as CreditPackItem[]).map((pack) => (
            <article
              key={pack.credits}
              className="rounded-surface bg-card p-4 ring-1 ring-border/80"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {pack.name}
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                    {pack.credits}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {pack.price}
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {pack.note}
              </p>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-3xl text-center text-xs leading-5 text-muted-foreground">
          {t("creditPacks.memberNote")}
        </p>
      </section>
    </section>
  );
}
