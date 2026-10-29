"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type FormulaComparisonDatum = {
  key: string;
  name: string;
  bpm: number;
  isRecommended: boolean;
  isApplicable: boolean;
};

type FormulaComparisonChartProps = {
  data: FormulaComparisonDatum[];
  domain: readonly [number, number];
  recommendedBpm: number | null;
  markerLabel: string;
  chartTitle: string;
  chartHint: string;
  sexSpecificNote?: string;
};

const CHART_CONFIG = {
  bpm: {
    color: "var(--muted-foreground)",
  },
  recommended: {
    color: "var(--chart-recovery)",
  },
} satisfies ChartConfig;

export function FormulaComparisonChart({
  data,
  domain,
  recommendedBpm,
  markerLabel,
  chartTitle,
  chartHint,
  sexSpecificNote,
}: FormulaComparisonChartProps) {
  return (
    <div className="p-4 bg-white dark:bg-card border-b border-neutral-200/70 dark:border-border">
      <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
        {chartTitle}
      </div>
      <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
        {chartHint}
      </div>
      <div className="mt-4">
        <ChartContainer
          className="aspect-auto h-[220px] w-full min-w-0"
          config={CHART_CONFIG}
          initialDimension={{ width: 640, height: 220 }}
        >
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 2, right: 2, top: 4, bottom: 4 }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <XAxis
              type="number"
              domain={domain}
              tickLine={false}
              axisLine={false}
            />
            {recommendedBpm != null && (
              <ReferenceLine
                x={recommendedBpm}
                stroke="var(--color-recommended)"
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{
                  value: markerLabel,
                  position: "insideTopRight",
                  fill: "var(--color-recommended)",
                  stroke: "hsl(var(--background))",
                  strokeWidth: 4,
                  paintOrder: "stroke",
                  fontSize: 11,
                }}
              />
            )}
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="bpm" radius={4}>
              {data.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={
                    entry.isRecommended
                      ? "var(--color-recommended)"
                      : "var(--color-bpm)"
                  }
                  fillOpacity={
                    entry.isRecommended ? 1 : entry.isApplicable ? 0.6 : 0.25
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
      {sexSpecificNote && (
        <div className="mt-3 text-[11px] text-neutral-500 dark:text-neutral-400">
          {sexSpecificNote}
        </div>
      )}
    </div>
  );
}
