"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function CalendarScheduleReloadOverlay({
  children,
  title,
  retryDraft = false,
  disabled = false,
  onReload,
  onReloaded,
}: {
  children: ReactNode;
  title?: string;
  retryDraft?: boolean;
  disabled?: boolean;
  onReload: () => Promise<unknown>;
  onReloaded: () => void;
}) {
  const t = useTranslations("CalendarMove");
  const titleId = useId();
  const detailId = useId();
  const refresh = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (refresh.current?.getClientRects().length)
      refresh.current.focus({ preventScroll: true });
  }, []);

  const reload = useMutation({
    mutationFn: onReload,
    onSuccess: () => {
      if (document.activeElement === refresh.current) {
        refresh.current?.closest<HTMLElement>("[data-calendar-proposal]")
          ?.focus({ preventScroll: true });
      }
      onReloaded();
    },
  });

  return (
    <section
      aria-labelledby={titleId}
      className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-background/75 p-4"
    >
      <div className="w-full max-w-sm space-y-3 rounded-lg border bg-background p-4 shadow-sm sm:p-5">
        <h2 id={titleId} className="font-semibold">{title ?? t("recovery.unavailableTitle")}</h2>
        <fieldset disabled={reload.isPending} className="contents">
          <div id={detailId} className="space-y-2 text-sm text-muted-foreground">
            {children}
          </div>
        </fieldset>
        {reload.isError && <p role="alert" className="text-sm text-destructive">{t("recovery.failed")}</p>}
        <div className="flex justify-end">
          <Button
            ref={refresh}
            type="button"
            size="sm"
            aria-describedby={detailId}
            aria-busy={reload.isPending}
            aria-disabled={disabled || reload.isPending}
            onClick={() => { if (!disabled && !reload.isPending) reload.mutate(); }}
          >
            <RefreshCw aria-hidden="true" className={reload.isPending ? "motion-safe:animate-spin" : undefined} />
            {t(reload.isPending ? "refreshingSchedule" : retryDraft ? "recovery.retryDraft" : "recovery.refreshSchedule")}
          </Button>
        </div>
      </div>
    </section>
  );
}
