"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from "recharts";

const CP = 250;
const W_PRIME = 15000; // Adjusted to 15kJ for more realistic amateur profile
const P_MAX = 1000; // Realistic 1s peak power

type CustomTooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: number | string }>;
  label?: number;
};

// Generate data points with more density in the lower range for log scale
const POINTS_SECONDS = [
  ...Array.from({ length: 60 }, (_, i) => i + 1), // 1s to 60s
  ...Array.from({ length: 59 }, (_, i) => (i + 2) * 60), // 2min to 60min
  ...[90, 150, 210, 270, 330, 390, 450, 510, 570], // Additional points between minutes
];

const DATA = POINTS_SECONDS.map((t) => {
  let p: number;

  if (t < 60) {
    // Hybrid Model: Use Power Law for short durations (< 1min) to simulate neuromuscular fatigue
    // P(t) = P_MAX * t^k
    // We calibrate k so that P(60) matches the CP model value to ensure continuity
    const p60 = W_PRIME / 60 + CP; // Value at 60s from CP model
    const k = Math.log(p60 / P_MAX) / Math.log(60); // Solve for k: P_MAX * 60^k = p60
    p = P_MAX * Math.pow(t, k);
  } else {
    // Standard 2-parameter CP model for longer durations
    // P(t) = CP + W'/t
    p = W_PRIME / t + CP;
  }

  return {
    time: t,
    power: Math.round(p),
    cp: CP,
  };
}).sort((a, b) => a.time - b.time);

const formatTime = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  // const secs = seconds % 60; // Simplified for the specific ticks requested
  if (mins < 60) return `${mins}m`;
  return `${mins / 60}h`;
};

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length && typeof label === "number") {
    // Re-format label for tooltip to be precise if needed, or use the same format
    const formattedLabel =
      label < 60
        ? `${label}s`
        : label < 3600
          ? `${Math.floor(label / 60)}m${label % 60 > 0 ? (label % 60) + "s" : ""}`
          : `${label / 3600}h`;

    return (
      <div className="bg-popover p-3 border border-border rounded-compact shadow-md">
        <p className="text-sm font-medium text-popover-foreground mb-2">
          Duration: {formattedLabel}
        </p>
        <div className="space-y-1">
          <p className="text-sm text-primary font-bold">
            Max Power: {payload[0]?.value}W
          </p>
          <p className="text-xs text-muted-foreground">CP (Threshold): {CP}W</p>
        </div>
      </div>
    );
  }
  return null;
};

// 1s,5s,10s,30s,1m,2m,3m,5m,10m,20m,30m,1h
const TICKS = [
  1,
  5,
  10,
  30,
  60, // 1m
  120, // 2m
  180, // 3m
  300, // 5m
  600, // 10m
  1200, // 20m
  1800, // 30m
  3600, // 1h
];

export function PDCChart() {
  return (
    <div className="w-full bg-card rounded-compact border border-border p-4 py-8 shadow-sm">
      <div className="mb-6 text-center">
        <h3 className="text-base font-semibold text-card-foreground">
          Power Duration Curve Model
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          CP = {CP}W, W&apos; = {W_PRIME / 1000}kJ
        </p>
      </div>
      <div className="w-full h-[400px] min-h-[220px]">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={320}
          minHeight={300}
          initialDimension={{ width: 960, height: 400 }}
        >
          <LineChart
            data={DATA}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border/50"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              label={{
                value: "Duration (Log Scale)",
                position: "insideBottom",
                offset: -10,
                className: "fill-muted-foreground text-xs",
              }}
              type="number"
              scale="log"
              domain={[1, 3600]}
              ticks={TICKS}
              tickFormatter={formatTime}
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={{ stroke: "var(--color-border)" }}
            />
            <YAxis
              label={{
                value: "Power (W)",
                angle: -90,
                position: "insideLeft",
                className: "fill-muted-foreground text-xs",
              }}
              domain={[0, 1200]}
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={{ stroke: "var(--color-border)" }}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "var(--color-muted-foreground)",
                strokeWidth: 1,
                strokeDasharray: "3 3",
              }}
            />
            <ReferenceLine
              y={CP}
              stroke="var(--color-muted-foreground)"
              strokeDasharray="3 3"
            >
              <Label
                value="CP"
                position="insideTopRight"
                fill="var(--color-muted-foreground)"
                fontSize={11}
                offset={10}
              />
            </ReferenceLine>
            <Line
              type="monotone"
              dataKey="power"
              stroke="var(--color-primary)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{
                r: 6,
                fill: "var(--color-primary)",
                stroke: "var(--color-background)",
                strokeWidth: 2,
              }}
              animationDuration={1500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
