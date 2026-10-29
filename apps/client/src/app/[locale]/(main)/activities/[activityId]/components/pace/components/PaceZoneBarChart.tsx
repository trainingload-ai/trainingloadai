import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Bar, Cell, XAxis, YAxis, BarChart, LabelList } from "recharts";
import {
  ChartConfig,
  ChartContainer as RechartsChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import ChartContainer from "@/components/ChartContainer";
import ChartInfo from "@/components/ChartInfo";
import { formatter } from "@/lib/utils";
import type { PaceZoneValue } from "@/api/use-pace";
import { getPowerZoneColorByZone } from "@/utils/util";

interface PaceZoneBarChartProps {
  data: PaceZoneValue[];
  title?: string;
  description?: string;
  isLoading?: boolean;
}

/**
 * 配速区间分布横向柱状图组件
 * 显示各配速区间的占比分布
 */
const PaceZoneBarChart: React.FC<PaceZoneBarChartProps> = ({
  data,
  title = "",
  description,
  isLoading = false,
}) => {
  const t = useTranslations("PacePage");

  const chartConfig = {
    pace: {
      label: t("pace"),
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  const chartData = useMemo(
    () =>
      data?.map((item, i) => {
        const zoneKey = item.name?.toLowerCase?.() ?? "";
        const zoneLabel = item.name?.toUpperCase?.() ?? "";
        const shortLabel = (() => {
          const first = zoneLabel.split(" ")[0];
          return first.length > 4 ? `${first.slice(0, 4)}…` : first;
        })();
        const percentage = Number(item.percent ?? 0);
        const duration = Number(item.duration ?? 0);
        const color = getPowerZoneColorByZone(item.color, i);
        const description = t.has(`zones.${zoneKey}`)
          ? t(`zones.${zoneKey}`)
          : "";
        return {
          type: item.name,
          zoneLabel,
          shortLabel,
          percentage,
          duration,
          color,
          description,
          label: `${percentage.toFixed(1)}% (${formatter(
            "elTimeS",
            duration,
          )})`,
        };
      }),
    [data, t],
  );
  return (
    <ChartContainer
      title={title}
      isLoading={isLoading}
      infoContent={
        description ? (
          <ChartInfo title={title}>{description}</ChartInfo>
        ) : undefined
      }
    >
      <RechartsChartContainer
        config={chartConfig}
        className="aspect-auto h-full w-full"
      >
        <BarChart
          accessibilityLayer
          data={chartData}
          layout="vertical"
          margin={{
            left: 12,
            right: 50,
          }}
        >
          <XAxis type="number" dataKey="percentage" hide />
          <YAxis
            dataKey="shortLabel"
            type="category"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            width={56}
            tick={(props: unknown) => {
              type ChartRow = {
                type: string;
                zoneLabel: string;
                shortLabel: string;
                percentage: number;
                duration: number;
                color: string;
                description?: string;
                label: string;
              };
              const p = props as {
                x: number;
                y: number;
                payload: { value: string; payload?: ChartRow };
              };
              const val = p?.payload?.value ?? "";
              const full = p?.payload?.payload?.zoneLabel ?? val;
              return (
                <text
                  x={p.x}
                  y={p.y}
                  dy={4}
                  textAnchor="end"
                  className="fill-muted-foreground text-mobile-caption pc:text-xs"
                >
                  <tspan>{val}</tspan>
                  <title>{full}</title>
                </text>
              );
            }}
          />
          <ChartTooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) {
                return null;
              }

              const row = payload[0]?.payload as
                | {
                    type: string;
                    zoneLabel: string;
                    percentage: number;
                    duration: number;
                    color: string;
                  }
                | undefined;
              if (!row) return null;

              return (
                <div className="rounded-md border bg-background p-3 shadow-md">
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="text-sm font-medium">{row.zoneLabel}</span>
                  </div>
                  <div className="space-y-1 text-mobile-caption pc:text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("tooltip.percentage")}:
                      </span>
                      <span className="font-medium">
                        {row.percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("tooltip.duration")}:
                      </span>
                      <span className="font-medium">
                        {formatter("elTimeS", row.duration)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }}
          />
          <Bar
            dataKey="percentage"
            layout="vertical"
            radius={5}
            barSize={32}
            background={{ fill: "transparent" }}
          >
            <LabelList
              dataKey="label"
              position="right"
              className="fill-foreground text-mobile-unit pc:text-[10px]"
              offset={10}
            />
            {chartData?.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </RechartsChartContainer>
    </ChartContainer>
  );
};

export default PaceZoneBarChart;
