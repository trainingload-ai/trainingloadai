import { ActivityMetricGrid } from "./activity-metric-grid";

export type SummaryMetric = {
  label: string;
  value: string;
  unit?: string;
};

function SummaryMetricCell({ label, unit, value }: SummaryMetric) {
  return (
    <div
      data-testid="activity-summary-metric"
      className="flex min-h-16 min-w-0 flex-col justify-center px-3 py-2 @min-[44rem]/activity-metrics:min-h-[76px] @min-[44rem]/activity-metrics:py-3 @min-[52rem]/activity-metrics:px-4"
    >
      <div className="truncate text-mobile-caption font-medium text-muted-foreground pc:text-xs">
        {label}
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1 tabular-nums">
        <span className="min-w-0 wrap-anywhere text-xl font-semibold tracking-tight text-foreground">
          {value}
        </span>
        {unit ? (
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ActivitySummaryMetrics({ metrics }: { metrics: SummaryMetric[] }) {
  return (
    <ActivityMetricGrid desktopColumns={6} variant="cards">
      {metrics.map((metric) => <SummaryMetricCell key={metric.label} {...metric} />)}
    </ActivityMetricGrid>
  );
}
