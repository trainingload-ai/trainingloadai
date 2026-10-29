"use client";

import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

export function AiDataConsentDisclosure({
  recipient,
  showPrivacyLink = true,
}: {
  recipient: string;
  showPrivacyLink?: boolean;
}) {
  const t = useTranslations("AiDataConsent");
  const locale = useLocale();

  return (
    <div>
      <div className="flex items-center gap-3 rounded-xl bg-teal-50 px-4 py-3.5 dark:bg-teal-950/40">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-teal-700 dark:text-teal-300">
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-teal-800 dark:text-teal-300">
            {t("recipientLabel")}
          </div>
          <div className="mt-0.5 text-lg font-semibold text-foreground">
            {recipient}
          </div>
        </div>
      </div>

      <dl className="mt-2 divide-y divide-border/70">
        <div className="py-3.5">
          <dt className="text-sm font-semibold text-foreground">
            {t("dataLabel")}
          </dt>
          <dd className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {t("dataValue")}
          </dd>
        </div>
        <div className="py-3.5">
          <dt className="text-sm font-semibold text-foreground">
            {t("purposeLabel")}
          </dt>
          <dd className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {t("purposeValue")}
          </dd>
        </div>
        <div className="py-3.5">
          <dt className="text-sm font-semibold text-foreground">
            {t("processingLabel")}
          </dt>
          <dd className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {t("processingValue")}
          </dd>
        </div>
        <div className="py-3.5">
          <dt className="text-sm font-semibold text-foreground">
            {t("protectionLabel")}
          </dt>
          <dd className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {t("protectionValue")}
          </dd>
        </div>
      </dl>

      <div className="flex items-start gap-2.5 rounded-xl bg-muted px-3.5 py-3">
        <LockKeyhole
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-sm leading-5 text-muted-foreground">{t("choice")}</p>
      </div>

      {showPrivacyLink ? (
        <a
          href={`https://www.trainingload.ai/${locale}/privacy`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-10 items-center rounded-sm text-sm font-semibold text-primary underline decoration-primary/60 decoration-1 underline-offset-4 transition-[text-decoration-color] hover:decoration-primary hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("privacyPolicy")}
        </a>
      ) : null}
    </div>
  );
}
