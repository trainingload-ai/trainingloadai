"use client";

import { useLocale } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export type ReviewComparisonPoint = {
  metric: string;
  label: string;
  value: number;
  change: string;
  current: string;
  previous: string;
};

export function ReviewPeriodComparisonChart({
  title,
  currentLabel,
  previousLabel,
  points,
}: {
  title: string;
  currentLabel: string;
  previousLabel: string;
  points: ReviewComparisonPoint[];
}) {
  const locale = useLocale();
  const tick = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const values = points.map((point) => point.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const interval = Math.max((max - min) / 5, 0.001);
  const scale = 10 ** Math.floor(Math.log10(interval));
  const step =
    (interval <= scale
      ? 1
      : interval <= 2 * scale
        ? 2
        : interval <= 5 * scale
          ? 5
          : 10) * scale;
  const firstTick = min === max ? -1 : Math.floor(min / step);
  const lastTick = min === max ? 1 : Math.ceil(max / step);
  const ticks = Array.from(
    { length: lastTick - firstTick + 1 },
    (_, index) => (firstTick + index) * step,
  );

  return (
    <ChartContainer
      config={{
        value: {
          label: title,
          theme: {
            light: "var(--color-palette-teal-700)",
            dark: "var(--color-palette-teal-600)",
          },
        },
      }}
      className="aspect-auto w-full"
      style={{ height: points.length * 32 + 42 }}
    >
      <BarChart
        accessibilityLayer
        layout="vertical"
        data={points}
        margin={{ top: 10, right: 12, bottom: 3, left: 8 }}
      >
        <CartesianGrid
          horizontal={false}
          stroke="var(--border)"
          strokeDasharray="3 3"
          strokeOpacity={0.6}
        />
        <XAxis
          type="number"
          axisLine={false}
          tickLine={false}
          tickMargin={8}
          ticks={ticks}
          tickFormatter={(value: number) => tick.format(value)}
          domain={[ticks[0], ticks.at(-1) ?? step]}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={123}
          axisLine={false}
          tickLine={false}
          tickMargin={8}
          interval={0}
          tick={{ fontSize: 11, width: 112 }}
        />
        <ReferenceLine
          x={0}
          stroke="var(--muted-foreground)"
          strokeOpacity={0.5}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", fillOpacity: 0.45 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_label, payload) => payload[0]?.payload.label}
              formatter={(_value, _name, item) => {
                const point = item.payload as ReviewComparisonPoint;
                return (
                  <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 tabular-nums">
                    <span className="text-muted-foreground">
                      {currentLabel}
                    </span>
                    <span className="text-end font-mono">{point.current}</span>
                    <span className="text-muted-foreground">
                      {previousLabel}
                    </span>
                    <span className="text-end font-mono">{point.previous}</span>
                    <span className="text-muted-foreground">{title}</span>
                    <span className="text-end font-mono font-medium">
                      {point.change}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          radius={2}
          maxBarSize={13}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}
