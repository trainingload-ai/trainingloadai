"use client";

import * as React from "react";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, Trophy, Calendar } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatter } from "@/lib/utils";

dayjs.extend(duration);

interface PerformanceRecord {
  timeRangeLabel: string;
  timeRangeStart?: string;
  timeRangeEnd?: string;
  timeSec: number;
  paceSec: number;
  distanceM?: number;
  activityId?: number;
  activityTime?: string;
  rank?: number; // 1 for the best among the list
}

interface BestPerformanceTableProps {
  records: PerformanceRecord[];
  distanceLabel: string;
  mode?: "distance" | "time";
}

const formatTime = (seconds: number) => {
  if (!seconds) return "-";
  const d = dayjs.duration(seconds, "seconds");
  if (seconds >= 3600) {
    return d.format("H:mm:ss");
  }
  return d.format("mm:ss");
};

const formatDistance = (meters: number) => {
  if (!meters) return "-";
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)}km`;
  }
  return `${meters.toFixed(0)}m`;
};

export function BestPerformanceTable({
  records,
  distanceLabel,
  mode = "distance",
}: BestPerformanceTableProps) {
  const t = useTranslations("bestDistance");
  const locale = useLocale();
  const isTimeMode = mode === "time";

  const sortedRecords = [...records].sort((a, b) => {
    if (isTimeMode) {
      return (b.distanceM || 0) - (a.distanceM || 0);
    }
    return a.timeSec - b.timeSec;
  });

  sortedRecords.forEach((r, i) => {
    if (!r.rank) r.rank = i + 1;
  });

  const bestRecord = sortedRecords[0];

  if (!records.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md bg-neutral-100 py-12 text-sm text-muted-foreground dark:bg-muted/45">
        <p>{t("noRecords", { distance: distanceLabel })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {bestRecord && (
        <section className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Trophy className="h-4 w-4 text-emerald-500" />
            <h2>{t("allTimeBest", { distance: distanceLabel })}</h2>
          </div>
          <div className="rounded-md bg-background/70 p-3 dark:bg-background/35">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="font-mono text-2xl font-semibold text-foreground md:text-4xl">
                {isTimeMode
                  ? formatDistance(bestRecord.distanceM || 0)
                  : formatTime(bestRecord.timeSec)}
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                {bestRecord.paceSec
                  ? formatter("pace", bestRecord.paceSec)
                  : "-"}
                /km
              </div>
              <div className="flex-1" />
              {bestRecord.activityId && (
                <div className="flex flex-wrap items-center gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {bestRecord.activityTime
                      ? new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                        }).format(new Date(bestRecord.activityTime))
                      : "-"}
                  </span>
                  <Link
                    href={`/activities/${bestRecord.activityId}`}
                    className="flex items-center gap-1 font-medium text-foreground hover:underline"
                  >
                    {t("viewActivity")}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="space-y-2 md:hidden">
        {sortedRecords.map((record) => (
          <div
            key={`${record.rank}-${record.activityId}`}
            className="rounded-md bg-neutral-100 p-3 dark:bg-muted/45"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex h-7 min-w-10 shrink-0 items-center justify-center rounded-md bg-background/75 px-2 text-mobile-caption pc:text-xs font-semibold text-foreground dark:bg-background/35">
                #{record.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-mono text-lg font-semibold text-foreground">
                    {isTimeMode
                      ? formatDistance(record.distanceM || 0)
                      : formatTime(record.timeSec)}
                  </div>
                  <div className="shrink-0 font-mono text-mobile-caption pc:text-xs text-muted-foreground">
                    {record.paceSec ? formatter("pace", record.paceSec) : "-"}/
                    km
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-mobile-caption pc:text-xs text-muted-foreground">
                  <span className="truncate">
                    {record.activityTime
                      ? new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                        }).format(new Date(record.activityTime))
                      : "-"}
                  </span>
                  {record.activityId && (
                    <Link
                      href={`/activities/${record.activityId}`}
                      aria-label={t("viewActivity")}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background/75 hover:text-foreground dark:hover:bg-background/35"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-md bg-neutral-100 dark:bg-muted/45 md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-background/75 dark:bg-background/30">
              <TableHead className="w-[80px]">{t("rank")}</TableHead>
              <TableHead className="text-right">
                {isTimeMode ? t("distance") : t("time")}
              </TableHead>
              <TableHead className="text-right">{t("pace")}</TableHead>
              <TableHead className="text-right">{t("date")}</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRecords.map((record) => (
              <TableRow key={`${record.rank}-${record.activityId}`}>
                <TableCell className="font-medium text-neutral-900 dark:text-neutral-100">
                  <span className="inline-flex min-w-10 items-center justify-center rounded-md bg-background/75 px-2 py-1 text-mobile-caption pc:text-xs dark:bg-background/35">
                    #{record.rank}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {isTimeMode
                    ? formatDistance(record.distanceM || 0)
                    : formatTime(record.timeSec)}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {record.paceSec ? formatter("pace", record.paceSec) : "-"}/km
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {record.activityTime
                    ? new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                      }).format(new Date(record.activityTime))
                    : "-"}
                </TableCell>
                <TableCell>
                  {record.activityId && (
                    <Link
                      href={`/activities/${record.activityId}`}
                      className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
