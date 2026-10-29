"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CardLoader from "@/components/ui/CardLoader";
import { useHeartRateDurationCurve } from "@/api/use-heart-rate";
import { Time } from "@/components/DateSelector/types";
import { getTimeLabel } from "@/components/DateSelector/DateSelector";
import { SportType } from "@/lib/store";
import { useLocale } from "next-intl";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HeartRateTableProps {
  className?: string;
  times?: Time[]; // 动态时间区间
  sportType?: "all" | SportType;
}

export function HeartRateTable({
  times = [],
  sportType = "all",
}: HeartRateTableProps) {
  const t = useTranslations("HeartRateTable");
  const tDate = useTranslations("dateSelector");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const { data = [], isLoading } = useHeartRateDurationCurve(times, sportType);

  const segments = [
    { key: "5s", label: t("fiveSeconds") },
    { key: "30s", label: t("thirtySeconds") },
    { key: "1m", label: t("oneMinute") },
    { key: "3m", label: t("threeMinutes") },
    { key: "5m", label: t("fiveMinutes") },
    { key: "10m", label: t("tenMinutes") },
    { key: "20m", label: t("twentyMinutes") },
    { key: "60m", label: t("sixtyMinutes") },
    { key: "2h", label: t("twoHours") },
    { key: "3h", label: t("threeHours") },
    { key: "6h", label: t("sixHours") },
  ] as const;

  if (isMobile) {
    return (
      <div className="grid grid-cols-2 gap-2 md:hidden">
        {isLoading && <CardLoader />}
        {segments.map((seg) => {
          const values = times.map((_time, idx) =>
            Number((data[idx] as any)?.[seg.key] ?? 0),
          );
          const max = values.reduce(
            (acc, v) => (Number.isFinite(v) ? Math.max(acc, v) : acc),
            0,
          );
          const hasMax = Number.isFinite(max) && max > 0;

          return (
            <Card key={seg.key} className="overflow-hidden rounded-surface border-0 bg-neutral-100 dark:bg-muted/45">
              <CardHeader className="space-y-0 p-3 pb-1">
                <CardTitle className="text-sm font-medium">{seg.label}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div>
                  {times.map((time, idx) => {
                    const row = data[idx] ?? {};
                    const timeLabel = getTimeLabel(time, tDate, locale);
                    const v = Number((row as any)[seg.key] ?? 0);
                    const isMax =
                      hasMax &&
                      Number.isFinite(v) &&
                      v > 0 &&
                      Math.abs(v - max) < 1e-9;

                    return (
                      <div
                        key={`${seg.key}-${idx}`}
                        className={cn(
                            "flex flex-col items-start gap-1 px-3 pb-3 pt-1",
                        )}
                      >
                        <div className="min-w-0 truncate text-xs text-muted-foreground">
                          {timeLabel}
                        </div>
                        <div
                          className={cn(
                            "shrink-0 font-mono text-base font-semibold tabular-nums",
                            isMax
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-foreground",
                          )}
                        >
                          {Number.isFinite(v) && v > 0
                            ? Math.round(v).toLocaleString()
                            : "--"}
                          {Number.isFinite(v) && v > 0 ? (
                            <span className="ml-1 text-mobile-caption pc:text-xs font-normal text-muted-foreground">
                              bpm
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto overflow-hidden rounded-md border relative">
      {isLoading && <CardLoader />}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-mobile-caption pc:text-xs">{t("timeRangeHeartRate")}</TableHead>
            {segments.map((s) => (
              <TableHead key={s.key} className="text-right text-mobile-caption pc:text-xs">
                {s.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {times.map((time, idx) => {
            const row = data[idx] ?? {};
            return (
              <TableRow
                key={`${getTimeLabel(time, tDate, locale)}-${idx}`}
              >
                <TableCell className="font-medium">
                  {getTimeLabel(time, tDate, locale)}
                </TableCell>
                {segments.map((s) => (
                  <TableCell key={`${s.key}-${idx}`} className="text-right">
                    {(row as any)[s.key] || 0}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
