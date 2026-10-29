"use client";

import { useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  MAX_DASHBOARD_OVERVIEW_METRICS,
  type DashboardOverviewChartSpan,
  type DashboardOverviewLayoutItem,
  type DashboardOverviewMetricKey,
  useDashboardOverviewConfig,
} from "@/hooks/useDashboardOverviewConfig";
import { OverviewMetricChart } from "./OverviewMetricCharts";
import { OverviewMetricTabsDialog } from "./OverviewMetricTabsDialog";
import {
  getDashboardMetricChartStyle,
  getDashboardMetricTitle,
  getOverviewChartSpanClass,
} from "./overview-model";
import { SortableOverviewChartCard } from "./SortableOverviewChartCard";

const CHART_HEIGHT = "h-[260px] md:h-[290px]";

export function OverviewEditor() {
  const tDashboard = useTranslations("dashboard");
  const tFitness = useTranslations("dashboard.fitnessStatus");
  const tOverview = useTranslations("dashboard.overview");
  const { draftLayout, setDraftLayout } = useDashboardOverviewConfig();
  const [addOpen, setAddOpen] = useState(false);
  const [activeDragKey, setActiveDragKey] =
    useState<DashboardOverviewMetricKey | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );
  const activeMetrics = draftLayout.map((item) => item.key);

  const renderChart = (item: DashboardOverviewLayoutItem) => {
    const chartStyle = getDashboardMetricChartStyle(item.key);
    return (
      <OverviewMetricChart
        metricKey={item.key}
        height={CHART_HEIGHT}
        title={getDashboardMetricTitle({
          tDashboard,
          tFitness,
          metricKey: item.key,
        })}
        accentColor={chartStyle.accentColor}
        comparisonColor={chartStyle.comparisonColor}
        titleIcon={chartStyle.icon}
      />
    );
  };

  const handleAddMetric = (metricKey: DashboardOverviewMetricKey) => {
    setDraftLayout((current) => {
      if (current.some((item) => item.key === metricKey)) return current;
      if (current.length >= MAX_DASHBOARD_OVERVIEW_METRICS) return current;
      return [...current, { key: metricKey, span: 1 }];
    });
  };

  const handleRemoveMetric = (metricKey: DashboardOverviewMetricKey) => {
    setDraftLayout((current) =>
      current.filter((item) => item.key !== metricKey),
    );
  };

  const handleSpanChange = (
    metricKey: DashboardOverviewMetricKey,
    span: DashboardOverviewChartSpan,
  ) => {
    setDraftLayout((current) =>
      current.map((item) =>
        item.key === metricKey ? { ...item, span } : item,
      ),
    );
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveDragKey(active.id as DashboardOverviewMetricKey);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragKey(null);
    if (!over || active.id === over.id) return;
    setDraftLayout((current) => {
      const oldIndex = current.findIndex((item) => item.key === active.id);
      const newIndex = current.findIndex((item) => item.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  const activeDragItem = activeDragKey
    ? draftLayout.find((item) => item.key === activeDragKey)
    : null;

  return (
    <>
      <div className="mb-3 flex flex-row items-center justify-between gap-3">
        <div className="flex flex-row items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            {tOverview("title")}
          </h2>
          <p className="text-mobile-caption text-muted-foreground pc:text-xs">
            {tOverview("recent30Days")}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen(true)}
          disabled={
            draftLayout.length >= MAX_DASHBOARD_OVERVIEW_METRICS
          }
        >
          <Plus className="mr-1 h-4 w-4" />
          {tOverview("add")}
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragKey(null)}
      >
        <SortableContext items={activeMetrics} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {draftLayout.map((item) => (
              <SortableOverviewChartCard
                key={item.key}
                metricKey={item.key}
                span={item.span}
                onRemove={() => handleRemoveMetric(item.key)}
                onSpanChange={(span) => handleSpanChange(item.key, span)}
              >
                {renderChart(item)}
              </SortableOverviewChartCard>
            ))}
          </div>
        </SortableContext>
        <DragOverlay adjustScale={false}>
          {activeDragItem ? (
            <div className={getOverviewChartSpanClass(activeDragItem.span)}>
              {renderChart(activeDragItem)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <OverviewMetricTabsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        activeMetrics={activeMetrics}
        onAddMetric={handleAddMetric}
      />
    </>
  );
}
