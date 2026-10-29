"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "lucide-react";
import { Time } from "./types";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import isoWeek from "dayjs/plugin/isoWeek";
import { useTranslations, useLocale } from "next-intl";
import "dayjs/locale/zh-cn";

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

  if (time.mode === "day") {
    return t("today");
  }

  if (time.mode === "week") {
    return t("thisWeek");
  }

  if (time.mode === "month") {
    return t("thisMonth");
  }

  if (time.mode === "year") {
    return t("thisYear");
  }

  if (time.mode === "all-time") {
    return t("allTime");
  }
};

export function DateSelectorByRange({
  time,
  setTime,
  exclude = [],
}: {
  time: Time;
  setTime: (time: Time) => void;
  exclude?: string[];
}) {
  const t = useTranslations("dateSelector");
  const locale = useLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger size="sm" className="sm:text-sm" variant={"outline"}>
        <Calendar className="hidden sm:block w-4 h-4" />
        {getTimeLabel(time, t, locale)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!exclude.includes("day") && (
          <DropdownMenuItem
            onClick={() =>
              setTime({
                mode: "day",
                day: dayjs().toISOString(),
              })
            }
          >
            {t("day")}
          </DropdownMenuItem>
        )}
        {!exclude.includes("week") && (
          <DropdownMenuItem
            onClick={() =>
              setTime({
                mode: "week",
                week: dayjs().startOf("week").toISOString(),
              })
            }
          >
            {t("week")}
          </DropdownMenuItem>
        )}
        {!exclude.includes("month") && (
          <DropdownMenuItem
            onClick={() =>
              setTime({
                mode: "month",
                month: dayjs().startOf("month").toISOString(),
              })
            }
          >
            {t("month")}
          </DropdownMenuItem>
        )}
        {!exclude.includes("year") && (
          <DropdownMenuItem
            onClick={() =>
              setTime({
                mode: "year",
                year: dayjs().startOf("year").toISOString(),
              })
            }
          >
            {t("year")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
