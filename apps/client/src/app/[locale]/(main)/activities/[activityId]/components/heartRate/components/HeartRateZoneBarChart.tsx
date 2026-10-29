import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Bar, Cell, XAxis, YAxis, BarChart, LabelList } from "recharts";
import {
  ChartConfig,
  ChartContainer as RechartsChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import ChartContainer from "@/components/ChartContainer";
import { formatter } from "@/lib/utils";
import { HeartRateZoneValue } from "@/api/use-heart-rate";
import { getHeartRateZoneColorByZone } from "@/utils/util";
import { HeartRateZoneModel } from "@/api/settings";
import { HeartRateZoneHelpDialog } from "@/components/HeartRateZoneHelpDialog";

interface HeartRateZoneBarChartProps {
  data: HeartRateZoneValue[];
  title?: string;
  description?: string;
  currentModel?: HeartRateZoneModel | string;
}

/**
 * 心率区间分布横向柱状图组件
 * 显示各心率区间的占比分布
 */
const HeartRateZoneBarChart: React.FC<HeartRateZoneBarChartProps> = ({
  data,
  title = "",
  currentModel,
}) => {
  const t = useTranslations("HeartRatePage");

  const chartConfig = {
    heartRate: {
      label: t("heartRate"),
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  const chartData = useMemo(
    () =>
      data?.map((item, i) => {
        const zoneLabel = item.name;
        const percentage = Number(item.percent ?? 0);
        const duration = Number(item.duration ?? 0);
        const color = getHeartRateZoneColorByZone(i);
        return {
          type: zoneLabel,
          zoneLabel,
          percentage,
          duration,
          color,
          label: `${percentage.toFixed(1)}% (${formatter(
            "elTimeS",
            duration,
          )})`,
        };
      }),
    [data],
  );
  return (
    <ChartContainer
      title={title}
      infoContent={
        <div className="flex gap-2">
          <HeartRateZoneHelpDialog
            currentModel={currentModel || HeartRateZoneModel.MHR}
          />
        </div>
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
            dataKey="type"
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

export default HeartRateZoneBarChart;
