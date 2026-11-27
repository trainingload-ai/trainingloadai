"use client";

import { useId, type ReactNode } from "react";
import dayjs from "dayjs";
import { useFormatter, useTranslations } from "next-intl";
import CalendarSelect from "@/components/calendar-select";
import { DialogFooter } from "@/components/ui/dialog";
import { useCalendarWeekStartsOn } from "@/lib/calendar-week-start";

export function PlanStartCalendarFooter({
  dateId,
  startDate,
  earliestStartDate,
  canChangeDate,
  onChangeDate,
  notice,
  children,
}: {
  dateId?: string;
  startDate: string;
  earliestStartDate: string;
  canChangeDate: boolean;
  onChangeDate: (date: string) => void;
  notice?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("PlanStartConversation");
  const fmt = useFormatter();
  const dateLabelId = useId();
  const weekStartsOn = useCalendarWeekStartsOn();
  const earliest = dayjs(earliestStartDate);

  return (
    <DialogFooter className="shrink-0 flex-col border-t border-border/60 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] sm:flex-col sm:pt-3 pc:pb-3">
      {notice}
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <div role="group" aria-labelledby={dateLabelId} className="flex min-w-fit flex-1 items-center gap-2 sm:flex-none sm:gap-3">
          <span id={dateLabelId} className="shrink-0 text-sm text-muted-foreground">
            {t("dateLabel")}
          </span>
          <CalendarSelect
            id={dateId}
            title={t("dateLabel")}
            date={dayjs(startDate).hour(12).toDate()}
            dateLabel={fmt.dateTime(new Date(`${startDate}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}
            fromDate={earliest.toDate()}
            fromYear={earliest.year()}
            weekStartsOn={weekStartsOn}
            size="default"
            className="sm:w-auto"
            disabled={!canChangeDate || { before: earliest.toDate() }}
            onSelect={(date) => {
              if (!canChangeDate || !date) return;
              const value = dayjs(date).format("YYYY-MM-DD");
              if (value >= earliestStartDate && value !== startDate) onChangeDate(value);
            }}
          />
        </div>
        {children}
      </div>
    </DialogFooter>
  );
}
