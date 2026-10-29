"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarSync, Copy, ExternalLink, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  getCalendarSubscription,
  resetCalendarSubscription,
} from "@/api/calendar-subscription";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useRuntimeCapabilities } from "@/api/runtime-capabilities";

/** 日历订阅（webcal / feed URL）等工具栏操作。 */
export function CalendarPlanActions() {
  const t = useTranslations("CalendarHeader");
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const runtime = useRuntimeCapabilities();
  const calendarQueryKey = ["calendar-subscription"] as const;

  const { data: subscription, isLoading } = useQuery({
    queryKey: calendarQueryKey,
    queryFn: getCalendarSubscription,
    enabled: open,
  });

  const resetMutation = useMutation({
    mutationFn: resetCalendarSubscription,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: calendarQueryKey });
      toast.success(t("calendarSubscriptionResetDone"));
    },
  });

  const copyFeedUrl = React.useCallback(async () => {
    if (!subscription?.feedUrl) return;
    await navigator.clipboard.writeText(subscription.feedUrl);
    toast.success(t("calendarSubscriptionCopied"));
  }, [subscription?.feedUrl, t]);

  const openCalendar = React.useCallback(() => {
    if (!subscription?.webcalUrl) return;
    window.location.href = subscription.webcalUrl;
  }, [subscription?.webcalUrl]);

  if (
    Boolean(process.env.NEXT_PUBLIC_SELF_HOST_MODE) ||
    runtime.data?.edition === "self-host"
  ) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 px-2.5">
          <CalendarSync className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t("calendarSubscriptionButton")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium">
              {t("calendarSubscriptionTitle")}
            </div>
            <div className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
              {t("calendarSubscriptionDescription")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              onClick={openCalendar}
              disabled={isLoading || !subscription?.webcalUrl}
            >
              <ExternalLink className="h-4 w-4" />
              {t("calendarSubscriptionOpen")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyFeedUrl}
              disabled={isLoading || !subscription?.feedUrl}
            >
              <Copy className="h-4 w-4" />
              {t("calendarSubscriptionCopy")}
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start px-2 text-muted-foreground"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
          >
            <RotateCcw className="h-4 w-4" />
            {t("calendarSubscriptionReset")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
