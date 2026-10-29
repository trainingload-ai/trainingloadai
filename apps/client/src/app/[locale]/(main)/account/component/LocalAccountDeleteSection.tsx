"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useSelfHostSessionPolicy } from "@/api/self-host-bootstrap";

type AccountDeletionAccepted = {
  accepted: true;
  requestId: string;
};

function deletionRequestKey() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function LocalAccountDeleteSection() {
  const { canDeleteAccount } = useSelfHostSessionPolicy();
  const t = useTranslations("AccountInner.deleteAccount");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  if (!canDeleteAccount) return null;

  const deleteLocalAccount = async () => {
    setDeleting(true);
    try {
      const result = await apiFetch<AccountDeletionAccepted>(
        "/users/account-deletion",
        {
          method: "POST",
          headers: { "Idempotency-Key": deletionRequestKey() },
          body: JSON.stringify({
            confirmPermanentDeletion: true,
            acknowledgeAsyncDeletion: true,
            acknowledgeExternalObligations: true,
          }),
          suppressErrorToast: true,
        },
      );
      if (!result?.accepted) throw new Error("ACCOUNT_DELETION_NOT_ACCEPTED");
      setAccepted(true);
    } catch {
      toast.error(t("deleteFailedMessage"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <section className="rounded-surface bg-neutral-100 p-3 dark:bg-muted/45">
        <div className="flex flex-col gap-3 rounded-surface bg-background px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">
                {t("localSectionTitle")}
              </h2>
              <p className="mt-1 max-w-2xl text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
                {t("localSectionDescription")}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="destructive"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => setOpen(true)}
          >
            <Trash2 />
            {t("localAction")}
          </Button>
        </div>
      </section>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!deleting && !accepted) setOpen(next);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {accepted ? t("localAcceptedTitle") : t("localFinalTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              {accepted ? t("localAcceptedDetail") : t("localFinalDetail")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {accepted ? (
              <Button
                type="button"
                size="sm"
                onClick={() => window.location.replace(`/${locale}/onboarding`)}
              >
                {t("localBackToOnboarding")}
              </Button>
            ) : (
              <>
                <AlertDialogCancel
                  disabled={deleting}
                >
                  {t("cancel")}
                </AlertDialogCancel>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={deleting}
                  onClick={() => void deleteLocalAccount()}
                >
                  {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {t("localAction")}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
