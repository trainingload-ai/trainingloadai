"use client";

import { useLocale, useTranslations } from "next-intl";
import { addCalendarDays } from "@shared/plan-calendar";
import { isoWeekStart } from "@shared/rolling-plan";
import type { CalendarAdjustmentWeek, PlanCalendarMoveImpact } from "@shared/plan-proposal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CalendarMoveWeekComparison({
  impact,
  batchWeeks,
}: {
  impact?: PlanCalendarMoveImpact;
  batchWeeks?: CalendarAdjustmentWeek[];
}) {
  const locale = useLocale();
  const t = useTranslations("CalendarMove");
  const from = impact && isoWeekStart(impact.from);
  const to = impact && isoWeekStart(impact.to);
  const formatDate = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const formatNumber = new Intl.NumberFormat(locale);
  const formatChange = new Intl.NumberFormat(locale, {
    signDisplay: "exceptZero",
  });
  const weeks = batchWeeks ?? impact?.weeks ?? [];

  return (
    <div className="grid gap-2">
      {weeks.map(({ weekStart, before, after }) => {
        const title = batchWeeks ? t("affectedWeek") :
          from === to
            ? t("sameWeek")
            : weekStart === from
              ? t("sourceWeek")
              : t("destinationWeek");
        const dateRange = formatDate.formatRange(
          new Date(`${weekStart}T00:00:00Z`),
          new Date(`${addCalendarDays(weekStart, 6)}T00:00:00Z`),
        );
        const metrics = [
          ...(batchWeeks ? [
            { label: t("workoutCount"), before: before.sessions, after: after.sessions },
            { label: t("workoutMinutes"), before: before.durationMinutes, after: after.durationMinutes },
          ] : []),
          {
            label: t("trainingDays"),
            before: before.trainingDays,
            after: after.trainingDays,
          },
          {
            label: t("estimatedLoad"),
            before: before.estimatedLoad,
            after: after.estimatedLoad,
          },
        ];
        return (
          <section
            key={weekStart}
            className="min-w-0 overflow-hidden rounded-md border"
          >
            <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 bg-muted/65 px-2.5 py-1.5 text-sm font-semibold">
              {title}
              <span className="text-xs font-normal text-muted-foreground">
                {dateRange}
              </span>
            </h3>
            <Table
              aria-label={`${title} · ${dateRange}`}
              className="table-fixed text-xs tabular-nums"
            >
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="h-7 w-[38%]">
                    <span className="sr-only">{t("metric")}</span>
                  </TableHead>
                  <TableHead scope="col" className="h-7 text-right">
                    {t("before")}
                  </TableHead>
                  <TableHead scope="col" className="h-7 text-right">
                    {t("after")}
                  </TableHead>
                  <TableHead scope="col" className="h-7 text-right">
                    {t("change")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((metric) => {
                  const beforeValue =
                    metric.before === null ? null : Math.round(metric.before);
                  const afterValue =
                    metric.after === null ? null : Math.round(metric.after);
                  return (
                    <TableRow key={metric.label}>
                      <TableHead scope="row" className="h-7 px-2.5">
                        {metric.label}
                      </TableHead>
                      <TableCell className="py-1 text-right text-muted-foreground">
                        {beforeValue === null
                          ? t("unknown")
                          : formatNumber.format(beforeValue)}
                      </TableCell>
                      <TableCell className="py-1 text-right font-semibold">
                        {afterValue === null
                          ? t("unknown")
                          : formatNumber.format(afterValue)}
                      </TableCell>
                      <TableCell className="py-1 text-right">
                        {beforeValue === null || afterValue === null
                          ? "—"
                          : formatChange.format(afterValue - beforeValue)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        );
      })}
    </div>
  );
}
