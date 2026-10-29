"use client";

import type { ReactNode } from "react";
import CardLoader from "@/components/ui/CardLoader";
import { formatter } from "@/lib/utils";

export type ActivityZoneTableRow = {
  id: string;
  label: string;
  range: string;
  percent: number;
  duration: number;
  color: string;
  average?: string;
};

type ActivityZoneTableProps = {
  rows: ActivityZoneTableRow[];
  isLoading?: boolean;
  zoneLabel: string;
  rangeLabel: string;
  distributionLabel: string;
  durationLabel: string;
  averageLabel?: string;
  action?: ReactNode;
  emptyLabel: string;
};

/**
 * 心率、功率和配速共用的紧凑区间分布表。
 * 进度条始终采用 0–100% 的共同尺度，便于直接比较各区间占比。
 */
export function ActivityZoneTable({
  rows,
  isLoading = false,
  zoneLabel,
  rangeLabel,
  distributionLabel,
  durationLabel,
  averageLabel,
  action,
  emptyLabel,
}: ActivityZoneTableProps) {
  const showAverage = Boolean(averageLabel);
  const gridClass = showAverage
    ? "grid-cols-[minmax(110px,150px)_150px_minmax(240px,1fr)_82px_104px]"
    : "grid-cols-[minmax(110px,150px)_150px_minmax(240px,1fr)_82px]";

  return (
    <section className="relative overflow-hidden border border-border/60 bg-card">
      {isLoading ? <CardLoader /> : null}
      <div className="overflow-x-auto no-scrollbar">
        <div className={showAverage ? "min-w-[740px]" : "min-w-[640px]"}>
          <div
            className={`grid ${gridClass} items-center border-b border-border/60 bg-muted/55 px-3 py-2 text-mobile-caption font-medium text-muted-foreground pc:text-xs dark:bg-muted/35`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span>{zoneLabel}</span>
              {action}
            </div>
            <div>{rangeLabel}</div>
            <div>{distributionLabel}</div>
            <div className="text-right">{durationLabel}</div>
            {showAverage ? (
              <div className="text-right">{averageLabel}</div>
            ) : null}
          </div>

          {rows.length > 0 ? (
            <div>
              {rows.map((row) => {
                const safePercent = Math.min(100, Math.max(0, row.percent));
                return (
                  <div
                    key={row.id}
                    className={`relative grid ${gridClass} min-h-11 items-center border-t border-border/45 bg-card px-3 py-1.5 text-mobile-caption pc:text-xs`}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 opacity-[0.04] dark:opacity-[0.08]"
                      style={{ backgroundColor: row.color }}
                    />
                    <div className="relative z-[1] flex min-w-0 items-center gap-2 pr-3">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <div className="truncate font-medium text-foreground">
                        {row.label}
                      </div>
                    </div>
                    <div className="relative z-[1] truncate pr-4 tabular-nums text-foreground/75">
                      {row.range}
                    </div>
                    <div className="relative z-[1] pr-4">
                      <div className="relative h-[22px] w-full overflow-hidden rounded-xs">
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 opacity-10 dark:opacity-[0.16]"
                          style={{ backgroundColor: row.color }}
                        />
                        <div
                          aria-label={`${row.label} ${safePercent.toFixed(1)}%`}
                          className="absolute inset-y-0 left-0 overflow-hidden rounded-xs transition-[width] duration-300"
                          role="img"
                          style={{ width: `${safePercent}%` }}
                        >
                          <span
                            aria-hidden="true"
                            className="absolute inset-0 opacity-25"
                            style={{ backgroundColor: row.color }}
                          />
                          <span
                            aria-hidden="true"
                            className="absolute inset-0 opacity-40"
                            style={{
                              backgroundImage: `repeating-linear-gradient(118deg, transparent 0, transparent 9px, ${row.color} 9px, ${row.color} 11px)`,
                            }}
                          />
                        </div>
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-end px-2.5 text-[11px] font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                          {safePercent.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="relative z-[1] text-right tabular-nums text-foreground/80">
                      {formatter("elTimeS", row.duration)}
                    </div>
                    {showAverage ? (
                      <div className="relative z-[1] text-right tabular-nums text-foreground/80">
                        {row.average ?? "–"}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : !isLoading ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </div>
          ) : (
            <div className="h-24" />
          )}
        </div>
      </div>
    </section>
  );
}
