"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  useAiDataConsent,
  useUpdateAiDataConsent,
} from "@/api/ai-data-consent";
import { AiDataConsentDialog } from "@/components/ai-consent/AiDataConsentDialog";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";

export function PrivacyAiSettings() {
  const t = useTranslations("AiDataConsent");
  const locale = useLocale();
  const consentQuery = useAiDataConsent();
  const updateConsent = useUpdateAiDataConsent();
  const [dialogOpen, setDialogOpen] = useState(false);
  const consent = consentQuery.data;
  const enabled = consent?.granted === true;
  const decidedAt = consent?.decidedAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(consent.decidedAt))
    : null;

  const disableAi = async () => {
    try {
      await updateConsent.mutateAsync({
        granted: false,
        source: "ACCOUNT_SETTINGS",
        locale,
      });
    } catch {
      toast.error(t("error"));
    }
  };

  const recipient = consent?.provider
    ? consent.recipient
    : t("recipientUnknown");

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-surface bg-neutral-100 dark:bg-muted/45">
        <div className="flex items-start justify-between gap-4 px-3 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t("toggleTitle")}</h2>
            <p className="mt-1 text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
              {enabled ? t("enabled", { recipient }) : t("disabled")}
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={consentQuery.isLoading || updateConsent.isPending}
            aria-label={t("toggleTitle")}
            onCheckedChange={(next) => {
              if (next) {
                setDialogOpen(true);
              } else {
                void disableAi();
              }
            }}
          />
        </div>

        <dl className="divide-y divide-border/70 border-t border-border/70">
          <div className="grid gap-1 px-3 py-3 pc:grid-cols-[160px_minmax(0,1fr)] pc:items-start">
            <dt className="text-mobile-caption text-muted-foreground pc:text-xs">
              {t("recipientLabel")}
            </dt>
            <dd className="text-sm pc:text-right">{recipient}</dd>
          </div>
          <div className="grid gap-1 px-3 py-3 pc:grid-cols-[160px_minmax(0,1fr)] pc:items-start">
            <dt className="text-mobile-caption text-muted-foreground pc:text-xs">
              {t("consentRecordLabel")}
            </dt>
            <dd className="text-sm pc:text-right">
              {decidedAt ?? t("notRecorded")}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          className="group flex min-h-16 w-full items-center gap-3 border-t border-border/70 px-3 py-3 text-left outline-none transition-colors hover:bg-black/[0.035] focus-visible:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-white/[0.045] dark:focus-visible:bg-white/[0.045]"
          onClick={() => setDialogOpen(true)}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              {t("reviewAction")}
            </span>
            <span className="mt-0.5 block text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
              {t("reviewDescription")}
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
            aria-hidden="true"
          />
        </button>
      </section>

      <section>
        <div className="mb-2 px-1">
          <h2 className="text-base font-semibold">{t("relatedTitle")}</h2>
          <p className="mt-1 text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
            {t("relatedDescription")}
          </p>
        </div>
        <Link
          href="/account/athlete-memory"
          className="group flex min-h-16 items-center gap-3 rounded-surface bg-neutral-100 px-3 py-3 outline-none transition-colors hover:bg-neutral-200/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:bg-muted/45 dark:hover:bg-muted/70"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              {t("memoryAction")}
            </span>
            <span className="mt-0.5 block text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
              {t("memoryDescription")}
            </span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
            aria-hidden="true"
          />
        </Link>
      </section>

      <AiDataConsentDialog
        open={dialogOpen}
        source="ACCOUNT_SETTINGS"
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
