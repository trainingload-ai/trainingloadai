"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useFormatterBySettings } from "@/hooks/useFormatterBySettings";
import { Bar, Cell, XAxis, YAxis, BarChart, LabelList } from "recharts";

import {
  ChartConfig,
  ChartContainer as RechartsChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { formatter } from "@/lib/utils";
import { PowerZoneValue } from "@/api/use-power";
import { getPowerZoneColorByZone } from "@/utils/util";
import ChartContainer from "@/components/ChartContainer";
import ChartInfo from "@/components/ChartInfo";
interface PowerZoneBarChartProps {
  data: PowerZoneValue[];
  title?: string;
  description?: string;
  isLoading?: boolean;
}

/**
 * 功率区间占比横向柱状图组件
 */
const PowerZoneBarChart: React.FC<PowerZoneBarChartProps> = ({
  data,
  title,
  description,
  isLoading = false,
}) => {
  const t = useTranslations("ActivityPowerPage");
  const { formatValue, getUnit } = useFormatterBySettings();
  // 图表配置
  const chartConfig = {
    power: {
      label: t("chart.power"),
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  // 将后端数据映射为图表渲染数据
  const chartData = useMemo(
    () =>
      (data || []).map((item, i) => {
        const zoneLabel = `z${i + 1}`;
        const percentage = Number(item.percent ?? 0);
        const duration = Number(item.duration ?? 0);
        const averagePower = Number(item.avg ?? 0);
        const color = getPowerZoneColorByZone(item.color, i);

        return {
          type: item.name,
          zoneLabel,
          percentage,
          duration,
          averagePower,
          color,
          description,
          label: `${percentage.toFixed(1)}% (${formatter(
            "elTimeS",
            duration,
          )})`,
        };
      }),
    [data, description],
  );

  return (
    <ChartContainer
      title={title || ""}
      isLoading={isLoading}
      infoContent={
        description ? (
          <ChartInfo title={title || ""}>{description}</ChartInfo>
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
            left: 0,
            right: 50,
          }}
        >
          <XAxis type="number" dataKey="percentage" hide />
          <YAxis
            dataKey="zoneLabel"
            type="category"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            width={40}
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
                    averagePower: number;
                    color: string;
                    description?: string;
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
                    <span className="text-sm font-medium">{row.type}</span>
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
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("tooltip.avgPower")}:
                      </span>
                      <span className="font-medium">
                        {formatValue(row.averagePower, "power")}
                        {getUnit("power")}
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

export default PowerZoneBarChart;
