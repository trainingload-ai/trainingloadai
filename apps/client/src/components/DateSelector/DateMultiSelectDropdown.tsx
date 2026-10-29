"use client";

import * as React from "react";
import dayjs from "dayjs";
import { Calendar } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { getTimeLabel } from "@/components/DateSelector/DateSelector";
import { type Time } from "@/components/DateSelector/types";
import { useIsMobile } from "@/hooks/use-mobile";

function timeKey(time: Time): string {
  if (time.mode === "all-time") return "all-time";
  if (time.mode === "year") return `year:${time.year}`;
  if (time.mode === "range" && time.wellKnown) return `range:${time.wellKnown}`;
  if (time.mode === "week") return `week:${time.week}`;
  if (time.mode === "month") return `month:${time.month}`;
  if (time.mode === "day") return `day:${time.day}`;
  if (time.mode === "past-minutes")
    return `past-minutes:${time.pastMinutesStart}:${time.pastMinutesEnd}`;
  return JSON.stringify(time);
}

export function DateMultiSelectDropdown({
  times,
  setTimes,
  exclude = [],
  maxItems = 5,
}: {
  times: Time[];
  setTimes: (times: Time[]) => void;
  exclude?: string[];
  maxItems?: number;
}) {
  const t = useTranslations("dateSelector");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);

  const selectedKeys = new Set((times ?? []).map(timeKey));

  const toggle = (next: Time, checked: boolean) => {
    const k = timeKey(next);

    if (checked) {
      if (selectedKeys.has(k)) return;
      if (times.length >= maxItems) {
        toast.warning(t("maxTimeRangesWarning"));
        return;
      }
      setTimes([...times, next]);
      return;
    }

    if (!selectedKeys.has(k)) return;
    if (times.length <= 1) {
      toast.warning(t("minTimeRangesWarning"));
      return;
    }
    setTimes(times.filter((x) => timeKey(x) !== k));
  };

  const triggerLabel =
    times.length <= 1
      ? getTimeLabel(times[0] ?? { mode: "all-time" }, t, locale)
      : t("selectedCount", { count: times.length });

  const makeRange = (
    wellKnown: "Last 7 days" | "Last 14 days" | "Last 30 days" | "Last 60 days",
  ): Time => {
    const days =
      wellKnown === "Last 7 days"
        ? 6
        : wellKnown === "Last 14 days"
          ? 13
          : wellKnown === "Last 30 days"
            ? 29
            : 59;
    return {
      mode: "range",
      startDate: dayjs().subtract(days, "day").toISOString(),
      endDate: dayjs().toISOString(),
      wellKnown,
    };
  };

  const options: Array<{
    key: string;
    visible: boolean;
    label: string;
    value: Time;
  }> = [
    {
      key: "last7Days",
      visible: !exclude.includes("last7Days"),
      label: t("last7Days"),
      value: makeRange("Last 7 days"),
    },
    {
      key: "last14Days",
      visible: !exclude.includes("last14Days"),
      label: t("last14Days"),
      value: makeRange("Last 14 days"),
    },
    {
      key: "last30Days",
      visible: !exclude.includes("last30Days"),
      label: t("last30Days"),
      value: makeRange("Last 30 days"),
    },
    {
      key: "last60Days",
      visible: !exclude.includes("last60Days"),
      label: t("last60Days"),
      value: makeRange("Last 60 days"),
    },
    {
      key: "thisYear",
      visible: !exclude.includes("thisYear"),
      label: t("thisYear"),
      value: { mode: "year", year: dayjs().startOf("year").toISOString() },
    },
    {
      key: "lastYear",
      visible: !exclude.includes("lastYear"),
      label: t("lastYear"),
      value: {
        mode: "year",
        year: dayjs().subtract(1, "year").startOf("year").toISOString(),
      },
    },
    {
      key: "allTime",
      visible: !exclude.includes("allTime"),
      label: t("allTime"),
      value: { mode: "all-time" },
    },
  ];

  const trigger = (
    <Button type="button" variant="secondary" size="sm">
      <span className="flex min-w-0 items-center gap-2">
        <Calendar className="size-4 shrink-0 opacity-70" />
        <span className="truncate">{triggerLabel}</span>
      </span>
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>{t("addTime")}</DrawerTitle>
            <DrawerDescription className="sr-only">
              {t("addTime")}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2">
            <div className="space-y-1 rounded-md border bg-card p-2">
              {options
                .filter((o) => o.visible)
                .map((o) => {
                  const checked = selectedKeys.has(timeKey(o.value));
                  return (
                    <button
                      key={o.key}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted"
                      onClick={() => toggle(o.value, !checked)}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm">{o.label}</div>
                      </div>
                      <Checkbox checked={checked} aria-label={o.label} />
                    </button>
                  );
                })}
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">{t("confirm")}</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,360px)]">
        {options
          .filter((o) => o.visible)
          .map((o) => {
            const checked = selectedKeys.has(timeKey(o.value));
            return (
              <DropdownMenuCheckboxItem
                key={o.key}
                checked={checked}
                onCheckedChange={(v) => toggle(o.value, !!v)}
              >
                {o.label}
              </DropdownMenuCheckboxItem>
            );
          })}
        <DropdownMenuSeparator />
        <div className="px-2 py-1 text-mobile-caption pc:text-xs text-muted-foreground">
          {t("addTime")}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
