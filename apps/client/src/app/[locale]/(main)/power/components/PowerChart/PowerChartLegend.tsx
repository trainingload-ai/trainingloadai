import type { PowerChartRangeMeta } from "./power-chart-model";

export function PowerChartLegend({ items }: { items: PowerChartRangeMeta[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-4 whitespace-nowrap text-mobile-caption pc:text-xs">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 shrink-0 rounded-md"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
