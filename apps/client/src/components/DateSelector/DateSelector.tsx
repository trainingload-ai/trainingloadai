"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar, Check } from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { zhCN, enUS } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import React from "react";
import { Time } from "./types";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import isoWeek from "dayjs/plugin/isoWeek";
import { useTranslations, useLocale } from "next-intl";
import "dayjs/locale/zh-cn";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";
import { useIsMobile } from "@/hooks/use-mobile";

// 扩展 dayjs 插件
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

export const getTimeLabel = (
  time: Time,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
  locale: string,
) => {
  const dayjsLocale = locale === "zh" ? "zh-cn" : "en";
  dayjs.locale(dayjsLocale);

  if (time.mode === "range") {
    if (time.wellKnown) {
      switch (time.wellKnown) {
        case "Last 3 days":
          return t("last3Days");
        case "Last 7 days":
          return t("last7Days");
        case "Last 14 days":
          return t("last14Days");
        case "Last 30 days":
          return t("last30Days");
        case "Last 60 days":
          return t("last60Days");
        default:
          return `${time.wellKnown}`;
      }
    }
    const startFormatted = dayjs(time.startDate).format("dddd, MMM D");
    const endFormatted = dayjs(time.endDate).format("dddd, MMM D");
    return `${startFormatted} - ${endFormatted}`;
  }

  if (time.mode === "past-minutes") {
    if (time.pastMinutesStart >= 60) {
      const hours = Math.floor(time.pastMinutesStart / 60);
      return hours === 1
        ? t("lastHour", { count: hours })
        : t("lastHours", { count: hours });
    }
    const minutes = time.pastMinutesStart;
    return minutes === 1
      ? t("lastMinute", { count: minutes })
      : t("lastMinutes", { count: minutes });
  }

  if (time.mode === "day") {
    const today = dayjs().toISOString();
    const yesterday = dayjs().subtract(1, "day").toISOString();
    if (dayjs(time.day).isSame(today, "day")) {
      return t("today");
    }
    if (dayjs(time.day).isSame(yesterday, "day")) {
      return t("yesterday");
    }
    return dayjs(time.day).format("YYYY/MM/DD");
  }

  if (time.mode === "week") {
    const thisWeek = dayjs().startOf("week").toISOString();
    const lastWeek = dayjs().subtract(1, "week").startOf("week").toISOString();

    if (dayjs(time.week).isSame(thisWeek, "week")) {
      return t("thisWeek");
    }
    if (dayjs(time.week).isSame(lastWeek, "week")) {
      return t("lastWeek");
    }
    const startDate = dayjs(time.week).format("YYYY/MM/DD");
    const endDate = dayjs(time.week).endOf("week").format("YYYY/MM/DD");
    return `${startDate} - ${endDate}`;
  }

  if (time.mode === "month") {
    const thisMonth = dayjs().startOf("month").toISOString();
    const lastMonth = dayjs()
      .subtract(1, "month")
      .startOf("month")
      .toISOString();

    if (dayjs(time.month).isSame(thisMonth, "month")) {
      return t("thisMonth");
    }
    if (dayjs(time.month).isSame(lastMonth, "month")) {
      return t("lastMonth");
    }
    return dayjs(time.month).format("YYYY/MM");
  }

  if (time.mode === "year") {
    const thisYear = dayjs().startOf("year").toISOString();

    if (dayjs(time.year).isSame(thisYear, "year")) {
      return t("thisYear");
    }
    const lastYear = dayjs().subtract(1, "year").startOf("year").toISOString();
    if (dayjs(time.year).isSame(lastYear, "year")) {
      return t("lastYear");
    }
    return dayjs(time.year).format("YYYY");
  }

  if (time.mode === "all-time") {
    return t("allTime");
  }
};

export function DateSelector({
  time,
  setTime,
  exclude = [],
  triggerClassName,
  triggerSize = "sm",
}: {
  time: Time;
  setTime: (time: Time) => void;
  exclude?: string[];
  triggerClassName?: string;
  triggerSize?: ButtonProps["size"];
}) {
  const t = useTranslations("dateSelector");
  const locale = useLocale();
  const dfLocale = locale.startsWith("zh") ? zhCN : enUS;
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);

  const date = React.useMemo<DateRange | undefined>(() => {
    if (time.mode === "range") {
      return {
        from: new Date(time.startDate),
        to: new Date(time.endDate),
      };
    }
    if (time.mode === "day") {
      return {
        from: new Date(time.day),
        to: undefined,
      };
    }
    return undefined;
  }, [time]);

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size={triggerSize}
      className={triggerClassName}
    >
      <Calendar className="hidden sm:block w-4 h-4" />
      {getTimeLabel(time, t, locale)}
    </Button>
  );

  if (isMobile) {
    const options = [
      {
        key: "last7Days",
        visible: !exclude.includes("last7Days"),
        label: t("last7Days"),
        isSelected: time.mode === "range" && time.wellKnown === "Last 7 days",
        onSelect: () =>
          setTime({
            mode: "range",
            startDate: dayjs().subtract(6, "day").toISOString(),
            endDate: dayjs().toISOString(),
            wellKnown: "Last 7 days",
          }),
      },
      {
        key: "last14Days",
        visible: !exclude.includes("last14Days"),
        label: t("last14Days"),
        isSelected: time.mode === "range" && time.wellKnown === "Last 14 days",
        onSelect: () =>
          setTime({
            mode: "range",
            startDate: dayjs().subtract(13, "day").toISOString(),
            endDate: dayjs().toISOString(),
            wellKnown: "Last 14 days",
          }),
      },
      {
        key: "last30Days",
        visible: !exclude.includes("last30Days"),
        label: t("last30Days"),
        isSelected: time.mode === "range" && time.wellKnown === "Last 30 days",
        onSelect: () =>
          setTime({
            mode: "range",
            startDate: dayjs().subtract(29, "day").toISOString(),
            endDate: dayjs().toISOString(),
            wellKnown: "Last 30 days",
          }),
      },
      {
        key: "last60Days",
        visible: !exclude.includes("last60Days"),
        label: t("last60Days"),
        isSelected: time.mode === "range" && time.wellKnown === "Last 60 days",
        onSelect: () =>
          setTime({
            mode: "range",
            startDate: dayjs().subtract(59, "day").toISOString(),
            endDate: dayjs().toISOString(),
            wellKnown: "Last 60 days",
          }),
      },
      {
        key: "thisMonth",
        visible: !exclude.includes("thisMonth"),
        label: t("thisMonth"),
        isSelected:
          time.mode === "month" && dayjs(time.month).isSame(dayjs(), "month"),
        onSelect: () =>
          setTime({
            mode: "month",
            month: dayjs().startOf("month").toISOString(),
          }),
      },
      {
        key: "thisYear",
        visible: !exclude.includes("thisYear"),
        label: t("thisYear"),
        isSelected:
          time.mode === "year" && dayjs(time.year).isSame(dayjs(), "year"),
        onSelect: () =>
          setTime({
            mode: "year",
            year: dayjs().startOf("year").toISOString(),
          }),
      },
      {
        key: "lastYear",
        visible: !exclude.includes("lastYear"),
        label: t("lastYear"),
        isSelected:
          time.mode === "year" &&
          dayjs(time.year).isSame(dayjs().subtract(1, "year"), "year"),
        onSelect: () =>
          setTime({
            mode: "year",
            year: dayjs().subtract(1, "year").startOf("year").toISOString(),
          }),
      },
      {
        key: "allTime",
        visible: !exclude.includes("allTime"),
        label: t("allTime"),
        isSelected: time.mode === "all-time",
        onSelect: () =>
          setTime({
            mode: "all-time",
          }),
      },
    ].filter((o) => o.visible);

    const showCalendar = !exclude.includes("customRange");

    return (
      <AdaptiveDialog open={open} onOpenChange={setOpen}>
        <AdaptiveDialogTrigger asChild>{trigger}</AdaptiveDialogTrigger>
        <AdaptiveDialogContent mobileClassName="p-0">
          <AdaptiveDialogHeader className="px-4 pt-4">
            <AdaptiveDialogTitle className="text-base font-medium">
              {getTimeLabel(time, t, locale)}
            </AdaptiveDialogTitle>
          </AdaptiveDialogHeader>
          <div className="p-2">
            <div className="space-y-1">
              {options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={cn(
                    "w-full flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-neutral-200 dark:hover:bg-muted",
                  )}
                  onClick={() => {
                    o.onSelect();
                    setOpen(false);
                  }}
                >
                  <span>{o.label}</span>
                  {o.isSelected && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>

            {showCalendar && (
              <div className="mt-3 border-t pt-3">
                <div className="px-2 pb-2 text-sm text-muted-foreground">
                  {t("customRange")}
                </div>
                <CalendarPicker
                  mode="range"
                  selected={date}
                  onSelect={(range) => {
                    if (!range) return;
                    if (range.to) {
                      setTime({
                        mode: "range",
                        startDate: dayjs(range.from).format("YYYY-MM-DD"),
                        endDate: dayjs(range.to).format("YYYY-MM-DD"),
                      });
                      setOpen(false);
                    } else if (range.from) {
                      setTime({
                        mode: "day",
                        day: dayjs(range.from).format("YYYY-MM-DD"),
                      });
                    }
                  }}
                  numberOfMonths={1}
                  locale={dfLocale}
                  disabled={{ after: new Date() }}
                  className="w-full"
                />
              </div>
            )}
          </div>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger size="sm" className="sm:text-sm" variant={"outline"}>
        <Calendar className="hidden sm:block w-4 h-4" />
        {getTimeLabel(time, t, locale)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!exclude.includes("last7Days") && (
          <DropdownMenuItem
            onClick={() =>
              setTime({
                mode: "range",
                startDate: dayjs().subtract(6, "day").toISOString(),
                endDate: dayjs().toISOString(),
                wellKnown: "Last 7 days",
              })
            }
          >
            {t("last7Days")}
          </DropdownMenuItem>
        )}
        {!exclude.includes("last14Days") && (
          <DropdownMenuItem
            onClick={() =>
              setTime({
                mode: "range",
                startDate: dayjs().subtract(13, "day").toISOString(),
                endDate: dayjs().toISOString(),
                wellKnown: "Last 14 days",
              })
            }
          >
            {t("last14Days")}
          </DropdownMenuItem>
        )}
        {!exclude.includes("last30Days") && (
          <DropdownMenuItem
            onClick={() =>
              setTime({
                mode: "range",
                startDate: dayjs().subtract(29, "day").toISOString(),
                endDate: dayjs().toISOString(),
                wellKnown: "Last 30 days",
              })
            }
          >
            {t("last30Days")}
          </DropdownMenuItem>
        )}
        {!exclude.includes("last60Days") && (
          <DropdownMenuItem
            onClick={() =>
              setTime({
                mode: "range",
                startDate: dayjs().subtract(59, "day").toISOString(),
                endDate: dayjs().toISOString(),
                wellKnown: "Last 60 days",
              })
            }
          >
            {t("last60Days")}
          </DropdownMenuItem>
        )}

        {(!exclude.includes("thisMonth") ||
          !exclude.includes("thisYear") ||
          !exclude.includes("allTime")) && <DropdownMenuSeparator />}
        {!exclude.includes("thisMonth") && (
          <DropdownMenuItem
            onClick={() =>
              setTime({
                mode: "month",
                month: dayjs().startOf("month").toISOString(),
              })
            }
          >
            {t("thisMonth")}
          </DropdownMenuItem>
        )}
        {!exclude.includes("thisYear") && (
          <DropdownMenuItem
            onClick={() =>
              setTime({
                mode: "year",
                year: dayjs().startOf("year").toISOString(),
              })
            }
          >
            {t("thisYear")}
          </DropdownMenuItem>
        )}
        {!exclude.includes("lastYear") && (
          <DropdownMenuItem
            onClick={() =>
              setTime({
                mode: "year",
                year: dayjs().subtract(1, "year").startOf("year").toISOString(),
              })
            }
          >
            {t("lastYear")}
          </DropdownMenuItem>
        )}
        {!exclude.includes("allTime") && (
          <DropdownMenuItem
            onClick={() =>
              setTime({
                mode: "all-time",
              })
            }
          >
            {t("allTime")}
          </DropdownMenuItem>
        )}
        {!exclude.includes("customRange") && (
          <>
            <DropdownMenuSeparator />
            <CalendarPicker
              mode="range"
              selected={date}
              onSelect={(range) => {
                if (!range) return;
                if (range.to) {
                  setTime({
                    mode: "range",
                    startDate: dayjs(range.from).format("YYYY-MM-DD"),
                    endDate: dayjs(range.to).format("YYYY-MM-DD"),
                  });
                } else if (range.from) {
                  setTime({
                    mode: "day",
                    day: dayjs(range.from).format("YYYY-MM-DD"),
                  });
                }
              }}
              numberOfMonths={1}
              locale={dfLocale}
              disabled={{ after: new Date() }}
              className="w-[320px]"
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
