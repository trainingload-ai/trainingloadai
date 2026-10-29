"use client";

import React, { useMemo } from "react";
import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import {
  useActivityMetricSeries,
  type ChartValue,
} from "@/api/useActivityMetric";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer as RechartsChartContainer,
  ChartTooltip,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import ChartContainer from "@/components/ChartContainer";
import { useActivityId } from "@/hooks/useActivityId";
import { getUnit } from "@/hooks/useFormatterBySettings";
import { formatter } from "@/lib/utils";
import { formatSlope, SLOPE_ZONES } from "@/lib/slopeUtils";

// 简化的统计组件，用于功率数据展示
const Stat = ({
  title,
  value,
  unit,
  color,
}: {
  title: string;
  value: string | number;
  unit?: string;
  color?: string;
}) => {
  return (
    <div className="flex flex-col border-r border-b border-neutral-100 dark:border-neutral-600 text-nowrap last:border-r-0 md:last:border-r-0 md:border-b-0 ">
      <div className="flex flex-col px-2 md:px-3 py-2 gap-2 md:gap-6">
        <div className="text-mobile-caption pc:text-xs md:text-sm font-medium text-muted-foreground text-center md:text-left flex items-center gap-1">
          {color && (
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
          )}
          {title}
        </div>
        <div className="text-lg md:text-2xl font-medium flex gap-1 md:gap-2 items-center justify-center md:justify-between">
          <div className="flex gap-1 items-baseline">
            <span className="font-medium text-foreground">{value || "--"}</span>
            {unit && (
              <span className="text-muted-foreground text-mobile-caption pc:text-xs">{unit}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface SlopeChartProps {
  slopeData?: ChartValue[];
  avg?: string;
}

const SlopeChart = React.memo(({ slopeData, avg }: SlopeChartProps) => {
  // 准备图表数据 - 采样以提高性能，并使用真实海拔数据
  const chartData = useMemo(() => {
    if (!slopeData || slopeData.length === 0) return [];
    const step = Math.max(1, Math.floor(slopeData.length / 200)); // 最多200个数据点
    const sampledSlopeData = slopeData.filter((_, index) => index % step === 0);

    return sampledSlopeData.map((dataPoint, index) => {
      const dataObj = dataPoint as unknown as Record<string, unknown>;

      // 直接使用原始distance值（已经是累计距离）
      const distance = dataObj.distance ? Number(dataObj.distance) : 0;

      // 同时处理增强海拔数据和原始海拔数据
      const enhancedElevation = dataObj.enhancedelevation
        ? Number(dataObj.enhancedelevation)
        : null;
      const originalElevation = dataObj.elevation
        ? Number(dataObj.elevation)
        : null;

      // 增强海拔数据
      let enhancedElevationValue: number | undefined;
      let enhancedElevationFormatted: string = "";
      if (enhancedElevation !== null && Number.isFinite(enhancedElevation)) {
        enhancedElevationValue = enhancedElevation;
        enhancedElevationFormatted = `${Math.round(enhancedElevation)}m (修正)`;
      }

      // 原始海拔数据
      let originalElevationValue: number | undefined;
      let originalElevationFormatted: string = "";
      if (originalElevation !== null && Number.isFinite(originalElevation)) {
        originalElevationValue = originalElevation;
        originalElevationFormatted = `${Math.round(originalElevation)}m (原始)`;
      }

      return {
        index, // 用于 X 轴的索引
        time: dataPoint.time, // 保留原始时间用于 tooltip
        distance: distance, // 直接使用原始累计距离
        slope: Number(dataObj.slope), // 坡度百分比
        enhancedElevation: enhancedElevationValue, // 增强海拔（米）
        originalElevation: originalElevationValue, // 原始海拔（米）
        timeFormatted: dataPoint.time
          ? formatter("time", dataPoint.time)
          : undefined,
        distanceFormatted: `${(distance / 1000).toFixed(1)}km`,
        slopeFormatted: formatSlope(Number(dataObj.slope)),
        enhancedElevationFormatted: enhancedElevationFormatted,
        originalElevationFormatted: originalElevationFormatted,
      };
    });
  }, [slopeData]);
  // 计算平均坡度（用于辅助线）
  const averageSlope = useMemo(() => {
    if (avg) {
      const n = Number(avg);
      if (Number.isFinite(n)) return n;
    }
    if (!slopeData || slopeData.length === 0) return 0;
    const slopes = slopeData
      .map((d) => {
        const obj = d as unknown as Record<string, unknown>;
        const raw = obj.slope as unknown;
        const n = Number(raw);
        return n;
      })
      .filter((v) => Number.isFinite(v));
    if (slopes.length === 0) return 0;
    return slopes.reduce((sum, slope) => sum + slope, 0) / slopes.length;
  }, [slopeData, avg]);

  if (!slopeData || slopeData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        暂无坡度数据
      </div>
    );
  }

  // 自定义 Tooltip 内容
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: unknown[];
  }) => {
    if (active && payload && payload.length) {
      const data = (
        payload[0] as {
          payload: {
            timeFormatted: string;
            slopeFormatted: string;
            enhancedElevationFormatted: string;
            originalElevationFormatted: string;
            slope: number;
          };
        }
      ).payload;

      // 找到对应的坡度区间
      const slopeNum = Number(data.slope);
      const zone = SLOPE_ZONES.find(
        (z) => slopeNum >= z.minSlope && slopeNum < z.maxSlope,
      );

      return (
        <div className="bg-background border border-border rounded-md p-3 shadow-md">
          <div className="font-medium text-sm mb-2">坡度数据</div>
          <div className="text-mobile-caption pc:text-xs text-muted-foreground space-y-1">
            <div>时间: {data.timeFormatted}</div>
            <div>坡度: {data.slopeFormatted}</div>
            {data.enhancedElevationFormatted && (
              <div>海拔: {data.enhancedElevationFormatted}</div>
            )}
            {data.originalElevationFormatted && (
              <div>海拔: {data.originalElevationFormatted}</div>
            )}
            {zone && (
              <div>
                类型: {zone.name} ({zone.description})
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1">
        <RechartsChartContainer
          config={{
            slope: {
              label: "坡度",
              color: "#8b5cf6", // 紫色线条
            },
            enhancedElevation: {
              label: "修正海拔",
              color: "#06b6d4", // 青色线条
            },
            originalElevation: {
              label: "原始海拔",
              color: "#10b981", // 绿色线条
            },
          }}
          className="aspect-auto h-full w-full"
        >
          <LineChart
            data={chartData}
            syncId="slopeChart"
            margin={{
              left: 20,
              right: 10, // 进一步增加右边距以容纳海拔Y轴
              top: 10,
              bottom: 20, // 增加底部边距以容纳Brush组件
            }}
          >
            {/* 背景区域 - 按坡度区间着色 */}
            <ReferenceArea
              yAxisId="slope"
              y1={-15}
              y2={-6}
              fill="#0ea5e9"
              fillOpacity={0.12}
            />
            <ReferenceArea
              yAxisId="slope"
              y1={-6}
              y2={-2}
              fill="#06b6d4"
              fillOpacity={0.12}
            />
            <ReferenceArea
              yAxisId="slope"
              y1={-2}
              y2={2}
              fill="#10b981"
              fillOpacity={0.12}
            />
            <ReferenceArea
              yAxisId="slope"
              y1={2}
              y2={6}
              fill="#f59e0b"
              fillOpacity={0.12}
            />
            <ReferenceArea
              yAxisId="slope"
              y1={6}
              y2={15}
              fill="#f97316"
              fillOpacity={0.12}
            />

            {/* 参考线 */}
            <ReferenceLine
              yAxisId="slope"
              y={0}
              stroke="#6b7280"
              strokeDasharray="2 2"
              strokeOpacity={0.6}
            />
            <ReferenceLine
              yAxisId="slope"
              y={-6}
              stroke="#0ea5e9"
              strokeDasharray="1 1"
              strokeOpacity={0.4}
            />
            <ReferenceLine
              yAxisId="slope"
              y={-2}
              stroke="#06b6d4"
              strokeDasharray="1 1"
              strokeOpacity={0.4}
            />
            <ReferenceLine
              yAxisId="slope"
              y={2}
              stroke="#f59e0b"
              strokeDasharray="1 1"
              strokeOpacity={0.4}
            />
            <ReferenceLine
              yAxisId="slope"
              y={6}
              stroke="#f97316"
              strokeDasharray="1 1"
              strokeOpacity={0.4}
            />

            {/* 平均坡度辅助线 */}
            <ReferenceLine
              yAxisId="slope"
              y={averageSlope}
              stroke="#ec4899"
              strokeWidth={2.5}
              strokeDasharray="8 4"
              strokeOpacity={0.85}
              label={{
                value: `平均坡度: ${formatSlope(averageSlope)}`,
                position: "insideBottomLeft",
                style: {
                  fill: "#ec4899",
                  fontSize: "12px",
                  fontWeight: "600",
                },
              }}
            />

            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="distance"
              type="number"
              scale="linear"
              tickFormatter={(value) => formatter("distance", value)}
              tick={{ fontSize: 11 }}
              axisLine={false}
            />
            <YAxis
              yAxisId="slope"
              domain={["dataMin - 2", "dataMax + 2"]}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
            />
            <YAxis
              yAxisId="elevation"
              orientation="right"
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickFormatter={(value) => `${Math.round(Number(value))}m`}
              domain={["dataMin - 10", "dataMax + 10"]}
            />
            <ChartTooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "var(--muted-foreground)",
                strokeWidth: 1,
              }}
            />
            <Line
              yAxisId="slope"
              type="monotone"
              dataKey="slope"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#8b5cf6" }}
            />
            <Line
              yAxisId="elevation"
              type="monotone"
              dataKey="enhancedElevation"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#06b6d4" }}
              strokeDasharray="5 5"
            />
            <Line
              yAxisId="elevation"
              type="monotone"
              dataKey="originalElevation"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#10b981" }}
              strokeDasharray="3 3"
            />

            {/* 图例 */}
            <ChartLegend
              content={<ChartLegendContent className="gap-4 text-mobile-caption pc:text-xs" />}
              verticalAlign="bottom"
              align="center"
            />
          </LineChart>
        </RechartsChartContainer>
      </div>
    </div>
  );
});

SlopeChart.displayName = "SlopeChart";

const SlopeAnalysis = () => {
  const activityId = useActivityId();

  // 获取坡度时间序列数据
  const { isLoading, data } = useActivityMetricSeries(
    activityId || "",
    "slope",
  );
  // 获取爬升高度和距离
  const { data: climbData } = useActivityMetricSeries(
    activityId || "",
    "climb",
  );
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0 lg:p-0 w-full border-b border-neutral-100 dark:border-neutral-600">
          <div className="grid grid-cols-3 gap-0 items-center">
            <Stat
              title={"爬升高度"}
              value={climbData?.metadata.sum || 0}
              unit={getUnit("climb")}
            />
            <Stat
              title={"平均坡度"}
              value={
                Number(data?.metadata.avg?.split("/")?.[1]) ||
                Number(data?.metadata.avg?.split("/")?.[0]) ||
                0
              }
              unit={getUnit("slope")}
            />
            <Stat
              title={"最大坡度"}
              value={
                Number(data?.metadata.max?.split("/")?.[1]) ||
                Number(data?.metadata.max?.split("/")?.[0]) ||
                0
              }
              unit={getUnit("slope")}
            />
          </div>
        </CardContent>
      </Card>

      {/* 坡度图表 */}
      <ChartContainer title="坡度分析" isLoading={isLoading} height="h-96">
        <SlopeChart
          slopeData={data?.rows}
          avg={data?.metadata.avg?.toString()}
        />
      </ChartContainer>
    </div>
  );
};

export default SlopeAnalysis;
