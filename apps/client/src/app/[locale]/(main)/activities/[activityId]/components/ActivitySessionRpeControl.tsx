"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CircleHelp, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import type { Activity } from "@/api/activities";
import { updateActivitySessionRpe } from "@/api/activity";
import { queryKeys } from "@/lib/query-keys";
import { invalidateActivityDerivedCaches } from "@/lib/query-invalidation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

const RPE_NONE = "__none__";
const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

type Props = {
  activity: Activity;
  variant?: "chip" | "card";
};

function normalizeSessionRpe(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  const n = Math.round(raw);
  if (n < 1 || n > 10) return null;
  return n;
}

export function ActivitySessionRpeControl({
  activity,
  variant = "chip",
}: Props) {
  const t = useTranslations("ActivityDetail.sessionRpe");
  const publicDemo = usePublicDemo();
  const queryClient = useQueryClient();
  const hashId = activity.hashId ?? "";

  const storedRpe = useMemo(
    () => normalizeSessionRpe(activity.sessionRpe),
    [activity.sessionRpe],
  );

  const selectValue = storedRpe != null ? String(storedRpe) : RPE_NONE;

  const mutation = useMutation({
    mutationFn: async (sessionRpe: number | null) => {
      const res = await updateActivitySessionRpe(hashId, sessionRpe);
      if (!res) throw new Error("__TOASTED__");
      return res;
    },
    onSuccess: (data) => {
      const cleared = data.sessionRpe === null;
      toast.success(cleared ? t("cleared") : t("saved"));
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.activity.detail(hashId),
        }),
        invalidateActivityDerivedCaches(queryClient),
      ]);
    },
    onError: (e: Error) => {
      if (e.message === "__TOASTED__") return;
      toast.error(e.message?.trim() ? e.message : t("failed"));
    },
  });

  const handleValueChange = (value: string) => {
    if (publicDemo.active || !hashId || mutation.isPending) return;
    if (value === RPE_NONE) {
      if (storedRpe === null) return;
      mutation.mutate(null);
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 10) return;
    if (storedRpe === n) return;
    mutation.mutate(n);
  };

  if (!hashId) return null;

  const options = (
    <SelectContent>
      <SelectItem
        value={RPE_NONE}
        className="py-1 text-mobile-caption pc:text-[11px]"
        title={t("notSet")}
      >
        {t("notSetShort")}
      </SelectItem>
      {RPE_VALUES.map((n) => (
        <SelectItem
          key={n}
          value={String(n)}
          className="text-mobile-caption pc:text-xs"
        >
          {n}
        </SelectItem>
      ))}
    </SelectContent>
  );

  const help = (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={t("helpAriaLabel")}
        >
          <CircleHelp className="h-3.5 w-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[min(280px,calc(100vw-2rem))] text-left font-normal leading-snug"
      >
        {t("hint")}
      </TooltipContent>
    </Tooltip>
  );

  if (variant === "card") {
    return (
      <div className="flex min-h-[64px] min-w-0 flex-col rounded-md bg-muted/45 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2 text-mobile-caption font-medium text-muted-foreground pc:text-xs">
          <span className="truncate">{t("label")}</span>
          {mutation.isPending ? (
            <Loader2
              className="h-3.5 w-3.5 shrink-0 animate-spin"
              aria-hidden
            />
          ) : (
            help
          )}
        </div>
        <div className="mt-auto flex items-end gap-1.5 pt-1">
          <Select
            value={selectValue}
            onValueChange={handleValueChange}
            disabled={publicDemo.active || mutation.isPending}
          >
            <SelectTrigger
              size="sm"
              aria-label={
                selectValue === RPE_NONE
                  ? t("notSet")
                  : `${t("chipLabel")} ${storedRpe}`
              }
              className="!h-auto !min-h-0 w-auto min-w-[3.5rem] border-0 bg-transparent !p-0 text-base font-semibold tabular-nums shadow-none focus-visible:ring-1 pc:text-base [&_svg]:size-3.5"
            >
              <SelectValue />
            </SelectTrigger>
            {options}
          </Select>
          {storedRpe !== null ? (
            <span className="pb-0.5 text-mobile-caption font-medium text-muted-foreground pc:text-xs">
              /10
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="inline-flex shrink-0 items-center gap-2 rounded-md bg-neutral-100 px-2 py-1 text-mobile-caption pc:text-xs font-medium dark:bg-muted/45">
      <span className="whitespace-nowrap text-muted-foreground">
        {t("chipLabel")}
      </span>
      <Select
        value={selectValue}
        onValueChange={handleValueChange}
        disabled={publicDemo.active || mutation.isPending}
      >
        <SelectTrigger
          size="sm"
          aria-label={
            selectValue === RPE_NONE
              ? t("notSet")
              : `${t("chipLabel")} ${storedRpe}`
          }
          className="!h-5 !min-h-5 w-[2.125rem] max-w-[2.125rem] shrink-0 border-0 bg-transparent !px-1 !py-0 text-mobile-unit font-medium tabular-nums leading-none shadow-none ring-offset-background focus-visible:ring-1 data-[size=sm]:!h-5 data-[size=sm]:!min-h-5 data-[size=sm]:!px-1 data-[size=sm]:!py-0 data-[size=sm]:!text-mobile-unit pc:text-[10px] pc:data-[size=sm]:!text-[10px] [&_svg]:size-3 [&_svg]:opacity-60"
        >
          <SelectValue />
        </SelectTrigger>
        {options}
      </Select>
      {mutation.isPending ? (
        <Loader2
          className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
          aria-hidden
        />
      ) : null}
      {help}
    </div>
  );
}
