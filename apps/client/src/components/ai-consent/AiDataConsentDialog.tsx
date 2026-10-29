"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  type AiDataConsentSource,
  useAiDataConsent,
  useUpdateAiDataConsent,
} from "@/api/ai-data-consent";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  adaptiveDialogFooterActionButtonClassName,
  adaptiveDialogFooterActionsClassName,
} from "@/components/ui/adaptive-dialog";
import { Button } from "@/components/ui/button";

import { AiDataConsentDisclosure } from "./AiDataConsentDisclosure";

export function AiDataConsentDialog({
  open,
  source,
  onOpenChange,
  onDecision,
}: {
  open: boolean;
  source: AiDataConsentSource;
  onOpenChange: (open: boolean) => void;
  onDecision?: (granted: boolean) => void;
}) {
  const t = useTranslations("AiDataConsent");
  const locale = useLocale();
  const consentQuery = useAiDataConsent({ enabled: open });
  const updateConsent = useUpdateAiDataConsent();
  const [error, setError] = useState<string | null>(null);
  const consent = consentQuery.data;

  const decide = async (granted: boolean) => {
    setError(null);
    try {
      await updateConsent.mutateAsync({
        granted,
        source,
        locale,
      });
      onDecision?.(granted);
      onOpenChange(false);
    } catch {
      setError(t("error"));
    }
  };

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!updateConsent.isPending) onOpenChange(next);
      }}
    >
      <AdaptiveDialogContent
        className="grid max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 pc:p-0"
        desktopClassName="sm:max-w-xl"
      >
        <AdaptiveDialogHeader className="px-4 pb-4 pt-5 pr-14 pc:px-6 pc:pt-6">
          <AdaptiveDialogTitle>{t("title")}</AdaptiveDialogTitle>
          <AdaptiveDialogDescription>{t("summary")}</AdaptiveDialogDescription>
        </AdaptiveDialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 pc:px-6">
          <AiDataConsentDisclosure
            recipient={
              consent?.provider ? consent.recipient : t("recipientUnknown")
            }
          />

          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <AdaptiveDialogFooter
          className={`${adaptiveDialogFooterActionsClassName} border-t border-border bg-background p-4 pc:px-6`}
        >
          <Button
            type="button"
            variant="outline"
            className={adaptiveDialogFooterActionButtonClassName}
            disabled={updateConsent.isPending}
            onClick={() => void decide(false)}
          >
            {t("decline")}
          </Button>
          <Button
            type="button"
            className={adaptiveDialogFooterActionButtonClassName}
            disabled={
              updateConsent.isPending ||
              consentQuery.isLoading ||
              consent?.state === "UNAVAILABLE"
            }
            onClick={() => void decide(true)}
          >
            {t("accept")}
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
