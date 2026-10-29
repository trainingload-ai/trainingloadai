"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "lucide-react";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Time } from "./types";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import isoWeek from "dayjs/plugin/isoWeek";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { getTimeLabel } from "./DateSelector";
import { useTranslations, useLocale } from "next-intl";
import { zhCN, enUS } from "date-fns/locale";

// 扩展 dayjs 插件
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

export function DateAdd({
  times,
  setTimes,
  exclude = [],
}: {
  times: Time[];
  setTimes: (time: Time[]) => void;
  exclude?: string[];
}) {
  const t = useTranslations("dateSelector");
  const locale = useLocale();
  const dfLocale = locale.startsWith("zh") ? zhCN : enUS;
  // 添加新的时间选择
  const handleAddTime = (newTime: Time) => {
    // 检查是否已达到最大时间段数量限制
    if (times.length >= 5) {
      toast.warning(t("maxTimeRangesWarning"));
      return;
    }
    setTimes([...times, newTime]);
  };

  // 删除时间选择
  const handleRemoveTime = (index: number) => {
    // 如果仅剩一个时间，则不允许移除
    if (times.length <= 1) {
      toast.warning(t("minTimeRangesWarning"));
      return;
    }
    const newTimes = [...times];
    newTimes.splice(index, 1);
    setTimes(newTimes);
  };

  return (
    <div className="flex flex-row flex-wrap gap-2">
      {/* 已选择的时间列表 */}
      {Array.isArray(times) &&
        times?.map((time, index) => (
          <div key={index} className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 justify-between sm:text-sm"
              onClick={() => handleRemoveTime(index)}
            >
              <div className="flex items-center">
                <Calendar className="hidden sm:block w-4 h-4 mr-2" />
                {getTimeLabel(time, t, locale)}
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 ml-2"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </Button>
          </div>
        ))}

      {/* 添加按钮 */}
      <DropdownMenu>
        <DropdownMenuTrigger
          size="sm"
          className="sm:text-sm"
          variant={"outline"}
        >
          {t("addTime")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!exclude.includes("last7Days") && (
            <DropdownMenuItem
              onClick={() =>
                handleAddTime({
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
                handleAddTime({
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
                handleAddTime({
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
                handleAddTime({
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
          {!exclude.includes("thisYear") && (
            <DropdownMenuItem
              onClick={() =>
                handleAddTime({
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
                handleAddTime({
                  mode: "year",
                  year: dayjs()
                    .subtract(1, "year")
                    .startOf("year")
                    .toISOString(),
                })
              }
            >
              {t("lastYear")}
            </DropdownMenuItem>
          )}

          {/* 智能分隔符显示 */}
          {(!exclude.includes("last7Days") ||
            !exclude.includes("last14Days") ||
            !exclude.includes("last30Days") ||
            !exclude.includes("last60Days") ||
            !exclude.includes("thisYear") ||
            !exclude.includes("lastYear")) &&
            (!exclude.includes("allTime") ||
              !exclude.includes("customRange")) && <DropdownMenuSeparator />}
          {!exclude.includes("allTime") && (
            <DropdownMenuItem
              onClick={() =>
                handleAddTime({
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
              <DatePickerWithRange
                onDateChange={(range) => {
                  if (!range) return;
                  if (range.to) {
                    handleAddTime({
                      mode: "range",
                      startDate: dayjs(range.from).format("YYYY-MM-DD"),
                      endDate: dayjs(range.to).format("YYYY-MM-DD"),
                    });
                  } else if (range.from) {
                    handleAddTime({
                      mode: "day",
                      day: dayjs(range.from).format("YYYY-MM-DD"),
                    });
                  }
                }}
                trigger={
                  <Button
                    variant={"ghost"}
                    size="auto"
                    className="w-full justify-start px-2 py-1.5 text-left text-sm font-normal"
                  >
                    {t("customRange")}
                  </Button>
                }
                calendarProps={{
                  locale: dfLocale,
                  numberOfMonths: 1,
                  disabled: { after: new Date() },
                }}
              />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
