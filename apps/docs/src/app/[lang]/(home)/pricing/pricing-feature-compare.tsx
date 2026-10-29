"use client";

import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";

type CompareRowNormal = {
  label: string;
  free: string;
  plus: string;
  pro: string;
};

type CompareSectionRow = { section: string };

type CompareRow = CompareRowNormal | CompareSectionRow;

type PricingCreditLabels = {
  plus: string;
  pro: string;
};

function isSectionRow(row: CompareRow): row is CompareSectionRow {
  return "section" in row && typeof row.section === "string";
}

type FeatureComparePayload = {
  title: string;
  subtitle: string;
  intro?: string;
  cellYes: string;
  cellNo: string;
  headers: {
    feature: string;
    free: string;
    plus: string;
    pro: string;
  };
  rows: CompareRow[];
};

function replaceCreditPlaceholders(
  value: string,
  creditLabels: PricingCreditLabels,
  newUserGift: { days: number; credits: string },
) {
  return value
    .replaceAll("{plusCredits}", creditLabels.plus)
    .replaceAll("{proCredits}", creditLabels.pro)
    .replaceAll("{giftDays}", String(newUserGift.days))
    .replaceAll("{giftCredits}", newUserGift.credits);
}

function CompareCell({
  value,
  yesLabel,
  noLabel,
}: {
  value: string;
  yesLabel: string;
  noLabel: string;
}) {
  const v = value.trim().toLowerCase();
  if (v === "y" || v === "yes") {
    return (
      <div className="flex justify-center py-0.5" aria-label={yesLabel}>
        <span
          className="inline-flex items-center justify-center rounded-full bg-emerald-600/12 p-1 dark:bg-emerald-500/15"
          aria-hidden
        >
          <Check className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
        </span>
      </div>
    );
  }
  if (v === "n" || v === "no") {
    return (
      <div
        className="flex justify-center py-0.5 text-muted-foreground"
        aria-label={noLabel}
      >
        <span
          className="inline-flex items-center justify-center rounded-full bg-neutral-100 p-1 dark:bg-white/5"
          aria-hidden
        >
          <Minus className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
    );
  }
  return (
    <span className="block px-1 text-center text-xs font-medium leading-snug text-foreground">
      {value}
    </span>
  );
}

export function PricingFeatureCompare({
  creditLabels,
  newUserGift,
}: {
  creditLabels: PricingCreditLabels;
  newUserGift: { days: number; credits: string };
}) {
  const t = useTranslations("pricingPage");
  const fc = t.raw("featureCompare") as FeatureComparePayload;

  return (
    <section
      id="plan-comparison"
      className="mt-14 border-t border-neutral-200 pt-10 dark:border-white/10"
      aria-labelledby="plan-comparison-heading"
    >
      <h2
        id="plan-comparison-heading"
        className="text-center text-xl font-black tracking-tight md:text-2xl"
      >
        {fc.title}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
        {fc.subtitle}
      </p>
      {fc.intro ? (
        <p className="mx-auto mt-3 max-w-3xl text-center text-xs leading-relaxed text-muted-foreground md:text-sm">
          {fc.intro}
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-control border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-card">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <caption className="sr-only">
            {fc.title}: {fc.subtitle}
          </caption>
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/90 text-left dark:border-white/10 dark:bg-secondary/70">
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-[10rem] bg-neutral-50/95 px-3 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground backdrop-blur-sm dark:bg-card/70 md:min-w-[12rem] md:px-4"
              >
                {fc.headers.feature}
              </th>
              <th
                scope="col"
                className="px-2 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground md:px-4"
              >
                {fc.headers.free}
              </th>
              <th
                scope="col"
                className="px-2 py-3 text-center text-xs font-bold uppercase tracking-wide text-emerald-900 dark:text-emerald-200 md:px-4"
              >
                {fc.headers.plus}
              </th>
              <th
                scope="col"
                className="px-2 py-3 text-center text-xs font-bold uppercase tracking-wide text-emerald-900 dark:text-emerald-200 md:px-4"
              >
                {fc.headers.pro}
              </th>
            </tr>
          </thead>
          <tbody>
            {fc.rows.map((row, index) => {
              if (isSectionRow(row)) {
                return (
                  <tr
                    key={`fc-section-${index}`}
                    className="border-b border-neutral-200 dark:border-white/10"
                  >
                    <td
                      colSpan={4}
                      className="bg-neutral-100/95 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-emerald-900 dark:bg-card/70 dark:text-emerald-200 md:px-4"
                    >
                      {row.section}
                    </td>
                  </tr>
                );
              }
              const label = replaceCreditPlaceholders(
                row.label,
                creditLabels,
                newUserGift,
              );
              const free = replaceCreditPlaceholders(
                row.free,
                creditLabels,
                newUserGift,
              );
              const plus = replaceCreditPlaceholders(
                row.plus,
                creditLabels,
                newUserGift,
              );
              const pro = replaceCreditPlaceholders(
                row.pro,
                creditLabels,
                newUserGift,
              );
              return (
                <tr
                  key={`fc-row-${index}-${label}`}
                  className="border-b border-neutral-100 last:border-b-0 dark:border-white/[0.06]"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-white/95 px-3 py-2.5 text-left text-xs font-medium text-foreground backdrop-blur-sm dark:bg-card/70 md:px-4 md:text-sm"
                  >
                    {label}
                  </th>
                  <td className="px-2 py-2.5 align-middle md:px-4">
                    <CompareCell
                      value={free}
                      yesLabel={fc.cellYes}
                      noLabel={fc.cellNo}
                    />
                  </td>
                  <td className="bg-emerald-500/[0.06] px-2 py-2.5 align-middle dark:bg-emerald-500/[0.08] md:px-4">
                    <CompareCell
                      value={plus}
                      yesLabel={fc.cellYes}
                      noLabel={fc.cellNo}
                    />
                  </td>
                  <td className="bg-emerald-500/[0.04] px-2 py-2.5 align-middle dark:bg-emerald-500/[0.06] md:px-4">
                    <CompareCell
                      value={pro}
                      yesLabel={fc.cellYes}
                      noLabel={fc.cellNo}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
