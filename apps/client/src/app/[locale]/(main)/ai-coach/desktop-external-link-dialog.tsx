"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LinkSafetyModalProps } from "streamdown";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";
import { Button } from "@/components/ui/button";

export function DesktopExternalLinkDialog({
  url,
  isOpen,
  onClose,
  openExternalLink,
}: LinkSafetyModalProps & {
  openExternalLink?: (url: string) => Promise<void>;
}) {
  const t = useTranslations("AiCoachPage.externalLink");
  const [opening, setOpening] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<"openFailed" | "copyFailed" | null>(null);

  useEffect(() => {
    setError(null);
    setCopied(false);
  }, [isOpen, url]);

  const openLink = async () => {
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      if (!openExternalLink) throw new Error("Desktop link bridge unavailable");
      await openExternalLink(url);
      onClose();
    } catch {
      setError("openFailed");
    } finally {
      setOpening(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError(null);
    } catch {
      setError("copyFailed");
    }
  };

  return (
    <AdaptiveDialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AdaptiveDialogContent className="gap-4 bg-background" desktopClassName="sm:max-w-lg">
        <AdaptiveDialogHeader className="pr-6 text-left">
          <AdaptiveDialogTitle className="text-base">{t("title")}</AdaptiveDialogTitle>
          <AdaptiveDialogDescription className="text-sm leading-6">
            {t("desktopDescription")}
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>
        <p className="break-all rounded-md bg-muted px-3 py-2.5 text-sm leading-6 text-foreground">
          {url}
        </p>
        {error ? <p role="alert" className="text-sm text-destructive">{t(error)}</p> : null}
        <AdaptiveDialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
          <Button variant="outline" onClick={() => void copyLink()}>
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {t(copied ? "copied" : "copy")}
          </Button>
          <Button disabled={opening} onClick={() => void openLink()}>
            <ExternalLink data-icon="inline-start" aria-hidden="true" />
            {t(opening ? "opening" : "openInBrowser")}
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
