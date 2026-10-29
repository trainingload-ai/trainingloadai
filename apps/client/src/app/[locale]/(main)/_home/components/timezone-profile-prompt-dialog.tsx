"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { getTimezonePrompt } from "@/api/timezone-prompt";
import { updateUserProfile } from "@/api/settings";
import { queryKeys } from "@/lib/query-keys";
import {
  clearTimezoneProfilePromptSnooze,
  isTimezoneProfilePromptSnoozed,
  snoozeTimezoneProfilePrompt,
} from "@/lib/timezone-prompt-storage";
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
import { ensureUserTimezoneInitialized } from "@/lib/initialize-user-timezone";

function formatTimezoneLabel(tz: string, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      timeZoneName: "long",
    }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    return name ? `${name} (${tz})` : tz;
  } catch {
    return tz;
  }
}

export function TimezoneProfilePromptDialog() {
  const t = useTranslations("V2HomePage.timezonePrompt");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  /** 本会话内已关闭过，避免 shouldPrompt 仍为 true 时反复弹出 */
  const [localDismissed, setLocalDismissed] = useState(false);
  const initializationAttemptedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const snoozed = mounted && isTimezoneProfilePromptSnoozed();

  const { data } = useQuery({
    queryKey: queryKeys.timezone.prompt(),
    queryFn: getTimezonePrompt,
    enabled: mounted && !snoozed,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!data || data.profileTimezone || initializationAttemptedRef.current) {
      return;
    }
    initializationAttemptedRef.current = true;
    void ensureUserTimezoneInitialized()
      .then(async (result) => {
        if (!result?.timezone) return;
        clearTimezoneProfilePromptSnooze();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.timezone.prompt(),
          }),
        ]);
      })
      .catch(() => {
        initializationAttemptedRef.current = false;
      });
  }, [data, queryClient]);

  useEffect(() => {
    if (localDismissed) return;
    if (data?.profileTimezone && data.shouldPrompt && data.suggestedTimezone) {
      setOpen(true);
    }
  }, [
    data?.profileTimezone,
    data?.shouldPrompt,
    data?.suggestedTimezone,
    localDismissed,
  ]);

  const label = useMemo(() => {
    const tz = data?.suggestedTimezone;
    if (!tz) return "";
    return formatTimezoneLabel(tz, locale);
  }, [data?.suggestedTimezone, locale]);

  const handleUpdate = async () => {
    const tz = data?.suggestedTimezone;
    if (!tz || updating) return;
    try {
      setUpdating(true);
      await updateUserProfile({ timezone: tz });
      clearTimezoneProfilePromptSnooze();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.user.profile(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.timezone.prompt(),
      });
      setLocalDismissed(true);
      setOpen(false);
      toast.success(t("success"));
    } catch (e) {
      toast.error(t("error"));
    } finally {
      setUpdating(false);
    }
  };

  const handleLater = () => {
    snoozeTimezoneProfilePrompt();
    setLocalDismissed(true);
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && !updating) {
      setLocalDismissed(true);
    }
  };

  if (!data?.profileTimezone || !data.shouldPrompt || !data.suggestedTimezone) {
    return null;
  }

  return (
    <AdaptiveDialog open={open} onOpenChange={handleOpenChange}>
      <AdaptiveDialogContent desktopClassName="sm:max-w-md">
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>{t("title", { label })}</AdaptiveDialogTitle>
          <AdaptiveDialogDescription>
            {t("snoozeHint")}
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>
        <AdaptiveDialogFooter className={adaptiveDialogFooterActionsClassName}>
          <Button
            type="button"
            variant="outline"
            size="dialog-action"
            disabled={updating}
            onClick={handleLater}
            className={adaptiveDialogFooterActionButtonClassName}
          >
            {t("later")}
          </Button>
          <Button
            type="button"
            size="dialog-action"
            disabled={updating}
            onClick={handleUpdate}
            className={adaptiveDialogFooterActionButtonClassName}
          >
            {t("update")}
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
