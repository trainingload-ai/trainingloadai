import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RangeDays } from "./metric-history-chart-types";

export function MetricHistoryRangeTabs({
  allowedRangeDays = ["7", "14", "30", "60"],
  disabled,
  onValueChange,
  rangeDays,
  rangeLabel,
}: {
  allowedRangeDays?: readonly RangeDays[];
  disabled: boolean;
  onValueChange: (rangeDays: RangeDays) => void;
  rangeDays: RangeDays;
  rangeLabel: (rangeDays: RangeDays) => string;
}) {
  return (
    <div className="shrink-0">
      <Tabs
        value={rangeDays}
        onValueChange={(value) => onValueChange(value as RangeDays)}
      >
        <TabsList className="h-8">
          {allowedRangeDays.map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className="px-2 py-0.5 text-mobile-caption pc:text-xs"
              disabled={disabled}
            >
              {rangeLabel(value)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
