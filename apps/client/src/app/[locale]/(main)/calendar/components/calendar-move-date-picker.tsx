"use client";

import dayjs from "dayjs";
import type { PlanWorkout } from "@/api/plans";
import { de, enUS, es, fr, it, ja, ko, ptBR, zhCN, zhTW } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { ResponsiveDatePickerCalendar } from "@/components/ui/calendar";
import { useCalendarWeekStartsOn } from "@/lib/calendar-week-start";
import { calendarToday } from "./calendar-move-model";

const pickerLocales: Record<string, typeof enUS> = {
  de, en: enUS, es, fr, it, ja, ko, "pt-BR": ptBR, zh: zhCN, "zh-hant": zhTW,
};

export function CalendarMoveDatePicker({
  scheduledDate,
  pending = false,
  targetWindow,
  onSelect,
}: {
  scheduledDate: string;
  pending?: boolean;
  targetWindow?: PlanWorkout["calendarMoveWindow"];
  onSelect: (date: string) => void;
}) {
  const t = useTranslations("CalendarMove");
  const locale = useLocale();
  const weekStartsOn = useCalendarWeekStartsOn();
  const today = targetWindow?.from ?? calendarToday();
  const current = dayjs(scheduledDate).toDate();
  const earliest = dayjs(today).toDate();
  const limits = [
    { before: earliest },
    current,
    ...(targetWindow?.through ? [{ after: dayjs(targetWindow.through).toDate() }] : []),
    ...(targetWindow?.before ? [{ after: dayjs(targetWindow.before).subtract(1, "day").toDate() }] : []),
  ];

  return (
    <ResponsiveDatePickerCalendar
      mode="single"
      className="mx-auto max-w-sm rounded-md bg-transparent px-1 md:max-w-none"
      aria-label={t("targetDate")}
      locale={pickerLocales[locale] ?? enUS}
      weekStartsOn={weekStartsOn}
      startMonth={earliest}
      defaultMonth={scheduledDate < today ? earliest : current}
      selected={current}
      showOutsideDays={false}
      disabled={pending ? true : limits}
      onSelect={(date) => {
        if (date && !pending) onSelect(dayjs(date).format("YYYY-MM-DD"));
      }}
    />
  );
}
