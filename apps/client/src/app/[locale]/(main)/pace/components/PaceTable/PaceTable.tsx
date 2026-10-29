"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CardLoader from "@/components/ui/CardLoader";
import { Time } from "@/components/DateSelector/types";
import { getTimeLabel } from "@/components/DateSelector/DateSelector";
import { SportType, useStore } from "@/lib/store";
import { usePaceDistancePerformance, usePaceCS } from "@/api/use-pace";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PaceTableProps {
  className?: string;
  times?: Time[];
  sportType?: SportType;
}

const RUN_CYCLING_LABELS = [
  { key: "400m", label: "400m" },
  { key: "800m", label: "800m" },
  { key: "1500m", label: "1500m" },
  { key: "1mi", label: "1mi" },
  { key: "3k", label: "3k" },
  { key: "5k", label: "5k" },
  { key: "10k", label: "10k" },
  { key: "20k", label: "20k" },
  { key: "42.2k", label: "42.2k" },
] as const;

const SWIM_LABELS = [
  { key: "50m", label: "50m" },
  { key: "100m", label: "100m" },
  { key: "200m", label: "200m" },
  { key: "400m_swim", label: "400m" },
  { key: "800m_swim", label: "800m" },
  { key: "1500m_swim", label: "1500m" },
] as const;

export function PaceTable({ times = [], sportType = "all" }: PaceTableProps) {
  const t = useTranslations("PaceTable");
  const tPaceChart = useTranslations("PaceChart");
  const tDate = useTranslations("dateSelector");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const { systemUnit } = useStore();
  const { data = [], isLoading } = usePaceDistancePerformance(times, sportType);
  const { data: csProfile } = usePaceCS(sportType);

  const labels = sportType === "SWIM" ? SWIM_LABELS : RUN_CYCLING_LABELS;

  if (isMobile) {
    // 移动端：按距离段卡片化，每个卡片里按时间范围两列行展示（label / pace + time）
    // sportType=all 时本就不会 enabled 发请求，这里也直接提示无数据即可
    if (sportType === "all") {
      return (
        <div className="rounded-md border p-3 text-sm text-muted-foreground">
          {tPaceChart("noData") ?? "暂无数据"}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2 md:hidden">
        {isLoading && <CardLoader />}

        {(labels as readonly { key: string; label: string }[]).map(({ key, label }) => {
          // 当前距离段：找到各时间范围的值，找出“最快配速”（paceSec 最小）做高亮
          const paceSecs = times.map((_time, idx) => {
            const row = data[idx] ?? {};
            const val = (row as any)[key] as
              | { paceSec: number; timeSec: number }
              | undefined;
            return typeof val?.paceSec === "number" ? val.paceSec : Infinity;
          });
          const best = paceSecs.reduce((acc, v) => Math.min(acc, v), Infinity);
          const hasBest = Number.isFinite(best) && best > 0 && best < Infinity;

          return (
            <Card key={key} className="overflow-hidden rounded-surface border-0 bg-neutral-100 dark:bg-muted/45">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div>
                  {times.map((time, idx) => {
                    const row = data[idx] ?? {};
                    const timeLabel = getTimeLabel(time, tDate, locale);
                    const val = (row as any)[key] as
                      | { paceSec: number; timeSec: number }
                      | undefined;
                    const paceText = val ? formatSecondsToTime(val.paceSec) : "--";
                    const timeText = val
                      ? formatSecondsToTime(val.timeSec, { showHours: true })
                      : "--";
                    const isBest =
                      hasBest &&
                      val &&
                      Number.isFinite(val.paceSec) &&
                      Math.abs(val.paceSec - best) < 1e-9;

                    return (
                      <div
                        key={`${key}-${idx}`}
                        className="flex flex-col items-start gap-1 px-3 pb-3 pt-1"
                      >
                        <div className="min-w-0 truncate text-xs text-muted-foreground">
                          {timeLabel}
                        </div>
                        <div className="shrink-0 text-left leading-tight">
                          <div
                            className={cn(
                              "font-mono text-base font-semibold tabular-nums",
                              isBest
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-foreground",
                            )}
                          >
                            {paceText}
                          </div>
                          <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                            {timeText}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {csProfile ? null : null}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto overflow-hidden rounded-md border relative">
      {isLoading && <CardLoader />}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-mobile-caption pc:text-xs">{t("segment")}</TableHead>
            {labels.map(({ key, label }) => (
              <TableHead key={key} className="text-right text-mobile-caption pc:text-xs">
                {label}
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
                {labels.map(({ key }) => {
                  const val = (row as any)[key] as
                    | { paceSec: number; timeSec: number }
                    | undefined;
                  const paceText = val ? formatSecondsToTime(val.paceSec) : "--";
                  const timeText = val
                    ? formatSecondsToTime(val.timeSec, { showHours: true })
                    : "--";
                  return (
                    <TableCell key={`${key}-col-${idx}`} className="text-right">
                      <div className="flex flex-col items-end leading-tight">
                        <div className="font-medium">{paceText}</div>
                        <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                          {timeText}
                        </div>
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}

          {/* CS 预测行：与旧版“最后一列 CS”信息等价，只是转置后更适合做成一行 */}
          {csProfile ? (
            <TableRow>
              <TableCell className="font-semibold">
                {tPaceChart("cs")}
              </TableCell>
              {labels.map(({ key }) => {
                const pred = csProfile.predictions?.find((p) => p.key === key);
                if (!pred) {
                  return (
                    <TableCell key={`cs-${key}`} className="text-right">
                      <span className="text-muted-foreground">--</span>
                    </TableCell>
                  );
                }
                const paceText = formatSecondsToTime(pred.paceSec);
                const timeText = formatSecondsToTime(pred.timeSec, {
                  showHours: true,
                });
                return (
                  <TableCell key={`cs-${key}`} className="text-right">
                    <div className="flex flex-col items-end leading-tight">
                      <div className="font-semibold">{paceText}</div>
                      <div className="text-mobile-caption pc:text-xs text-muted-foreground">
                        {timeText}
                      </div>
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
