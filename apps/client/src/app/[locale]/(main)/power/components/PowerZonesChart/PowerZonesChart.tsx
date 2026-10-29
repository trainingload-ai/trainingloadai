"use client";

import React, { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import ChartContainer from "@/components/ChartContainer";
import {
  ChartConfig,
  ChartContainer as RechartsChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { SportType } from "@/lib/store";
import { Time } from "@/components/DateSelector/types";
import { getTimeLabel } from "@/components/DateSelector/DateSelector";
import { usePowerZonesDistribution } from "@/api/use-power";
import { useUserZone } from "@/hooks/useUserZones";
import { ZONE_TYPES } from "@/app/[locale]/(main)/account/component/zoneEditor";
import { timeToRange } from "@/lib/timeRange";
import { getPowerZoneColorByZone } from "@/utils/util";
import { useIsMobile } from "@/hooks/use-mobile";

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function PowerZonesChart({
  times,
  sportType,
}: {
  times: Time[];
  sportType: SportType;
}) {
  const t = useTranslations("power");
  const tDate = useTranslations("dateSelector");
  const locale = useLocale();
  const isMobile = useIsMobile();

  const { data: zoneSetting } = useUserZone(sportType, ZONE_TYPES.POWER);

  const {
    data = [],
    isLoading,
    error,
  } = usePowerZonesDistribution(times, sportType);
  const seriesMeta = useMemo(() => {
    const usedKeys = new Map<string, number>();
    const makeKey = (range: { start?: string; end?: string }) =>
      `${range.start ?? ""}__${range.end ?? ""}`;

    return times.map((time, i) => {
      const range = timeToRange(time) ?? { start: undefined, end: undefined };
      const rangeKey = makeKey(range);
      const count = usedKeys.get(rangeKey) ?? 0;
      usedKeys.set(rangeKey, count + 1);
      const dataKey = count > 0 ? `${rangeKey}__${count}` : rangeKey;

      return {
        key: dataKey,
        rangeKey,
        label: getTimeLabel(time, tDate, locale),
        color: SERIES_COLORS[i % SERIES_COLORS.length]!,
      };
    });
  }, [locale, tDate, times]);

  const zoneLabels = useMemo(() => {
    const configured = zoneSetting?.zones ?? [];
    if (configured.length > 0) {
      return configured.map((z, i) => ({
        idx: i,
        label: z.name || `z${i + 1}`,
      }));
    }

    const first = data?.[0]?.zones ?? [];
    return first
      .slice()
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map((_z, i) => ({ idx: i, label: `z${i + 1}` }));
  }, [data, zoneSetting?.zones]);

  const chartData = useMemo(() => {
    const zonesByRange = data ?? [];
    if (!zonesByRange.length) return [];

    const makeKey = (range: { start?: string; end?: string }) =>
      `${range.start ?? ""}__${range.end ?? ""}`;
    const rangeMap = new Map(
      zonesByRange.map(
        (item) => [makeKey(item.timeRange ?? {}), item] as const,
      ),
    );

    return zoneLabels.map((z) => {
      const row: Record<string, number | string> = {
        zone: z.label,
      };

      for (let i = 0; i < seriesMeta.length; i += 1) {
        const seriesKey = seriesMeta[i]!.key;
        const zones = rangeMap.get(seriesMeta[i]!.rangeKey)?.zones ?? [];
        const ordered = zones
          .slice()
          .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
        const percent = Number(ordered[z.idx]?.percent ?? 0);
        row[seriesKey] = Number.isFinite(percent) ? percent : 0;
      }

      return row;
    });
  }, [data, seriesMeta, zoneLabels]);

  const zoneColors = useMemo(() => {
    const configured = zoneSetting?.zones ?? [];
    return zoneLabels.map((z) =>
      getPowerZoneColorByZone(configured[z.idx]?.color, z.idx + 1),
    );
  }, [zoneLabels, zoneSetting?.zones]);

  const maxByZoneIdx = useMemo(() => {
    return chartData.map((row) => {
      let max = 0;
      for (const s of seriesMeta) {
        const v = Number(row[s.key]);
        if (Number.isFinite(v)) max = Math.max(max, v);
      }
      return max;
    });
  }, [chartData, seriesMeta]);

  const chartConfig = useMemo(() => {
    return seriesMeta.reduce((acc, s) => {
      acc[s.key] = { label: s.label, color: s.color };
      return acc;
    }, {} as ChartConfig);
  }, [seriesMeta]);

  if (error || chartData.length === 0) {
    return (
      <ChartContainer appearance="mobile-soft" title={t("zones")} isLoading={isLoading}>
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          {t("noData")}
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer appearance="mobile-soft" title={t("zones")} isLoading={isLoading}>
      <RechartsChartContainer
        config={chartConfig}
        className="aspect-auto h-full"
      >
        <BarChart
          data={chartData}
          margin={
            isMobile
              ? { left: 6, right: 6, top: 6, bottom: 0 }
              : { left: 10, right: 10, top: 10 }
          }
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="zone"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: isMobile ? 10 : 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: isMobile ? 10 : 12 }}
            tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
            domain={[0, 100]}
          />
          <ChartTooltip
            cursor={false}
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const items = payload
                .filter(
                  (p) =>
                    typeof p.value === "number" && Number.isFinite(p.value),
                )
                .map((p) => {
                  const configLabel = chartConfig[String(p.dataKey)]?.label;
                  const labelText =
                    typeof configLabel === "string"
                      ? configLabel
                      : String(p.dataKey);
                  return {
                    key: String(p.dataKey),
                    label: labelText,
                    value: Number(p.value),
                    color: String(p.color || ""),
                  };
                });

              return (
                <div className="rounded-md border bg-background p-3 shadow-md">
                  <div className="mb-2 text-sm font-medium">
                    {String(label)}
                  </div>
                  <div className="space-y-1 text-mobile-caption pc:text-xs">
                    {items.map((it) => (
                      <div
                        key={it.key}
                        className="flex items-center justify-between gap-6"
                      >
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: it.color }}
                          />
                          {it.label}
                        </span>
                        <span className="font-mono font-medium tabular-nums">
                          {it.value.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }}
          />
          {seriesMeta.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill="transparent"
              radius={[4, 4, 0, 0]}
              maxBarSize={isMobile ? 32 : 48}
            >
              {chartData.map((row, idx) => {
                const max = Number(maxByZoneIdx[idx] ?? 0);
                const v = Number(row[s.key]);
                const opacity =
                  max > 0 && Number.isFinite(v)
                    ? v >= max - 1e-9
                      ? 1
                      : 0.6
                    : 1;
                return (
                  <Cell
                    key={`${s.key}-${idx}`}
                    fill={zoneColors[idx] ?? "#94a3b8"}
                    opacity={opacity}
                  />
                );
              })}
            </Bar>
          ))}
        </BarChart>
      </RechartsChartContainer>
    </ChartContainer>
  );
}

export default PowerZonesChart;
