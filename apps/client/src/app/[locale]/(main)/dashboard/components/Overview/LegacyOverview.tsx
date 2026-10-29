"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
import { useDashboardEditMode } from "@/hooks/useDashboardEditMode";
import {
  useDashboardOverviewConfig,
  type DashboardOverviewMetricKey,
} from "@/hooks/useDashboardOverviewConfig";
import { useStore } from "@/lib/store";
import { OverviewMetricChart } from "./OverviewMetricCharts";
import { OverviewMetricTabsDialog } from "./OverviewMetricTabsDialog";
import { OverviewFitnessStat, OverviewSummaryStat } from "./OverviewStatTiles";
import { SortableOverviewStat } from "./SortableOverviewStat";
import {
  getDashboardMetricIcon,
  getDashboardMetricTitle,
  isOverviewSummaryKey,
  type OverviewSummaryKey,
} from "./overview-model";

const Overview = React.memo(() => {
  const { dashboardFilters, selectedStat, setSelectedStat } = useStore();
  const tDashboard = useTranslations("dashboard");
  const tFitness = useTranslations("dashboard.fitnessStatus");
  const tOverview = useTranslations("dashboard.overview");
  const { isEditing } = useDashboardEditMode();
  const { metrics, draftMetrics, setDraftMetrics } =
    useDashboardOverviewConfig();
  const activeMetrics = isEditing ? draftMetrics : metrics;

  const [addOpen, setAddOpen] = useState(false);
  const [activeDragKey, setActiveDragKey] =
    useState<DashboardOverviewMetricKey | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  useEffect(() => {
    if (!activeMetrics || activeMetrics.length === 0) return;
    if (
      selectedStat?.id &&
      activeMetrics.includes(selectedStat.id as DashboardOverviewMetricKey)
    ) {
      return;
    }
    setSelectedStat(activeMetrics[0], "");
  }, [activeMetrics, selectedStat?.id, setSelectedStat]);

  const handleAddMetric = (metricKey: DashboardOverviewMetricKey) => {
    if (!isEditing) return;
    setDraftMetrics((prev) => {
      const next = prev.length > 0 ? prev : metrics;
      if (next.includes(metricKey)) return next;
      if (next.length >= 6) return next;
      return [...next, metricKey];
    });
  };

  const handleRemoveMetric = (metricKey: DashboardOverviewMetricKey) => {
    if (!isEditing) return;
    setDraftMetrics((prev) => prev.filter((key) => key !== metricKey));
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveDragKey(active.id as DashboardOverviewMetricKey);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragKey(null);
    if (!over) return;
    if (active.id === over.id) return;
    setDraftMetrics((prev) => {
      const oldIndex = prev.indexOf(active.id as DashboardOverviewMetricKey);
      const newIndex = prev.indexOf(over.id as DashboardOverviewMetricKey);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const renderMetric = (metricKey: DashboardOverviewMetricKey) => {
    if (isOverviewSummaryKey(metricKey)) {
      return <OverviewSummaryStat key={metricKey} metricKey={metricKey} />;
    }

    return (
      <OverviewFitnessStat
        key={metricKey}
        metricKey={
          metricKey as Exclude<DashboardOverviewMetricKey, OverviewSummaryKey>
        }
      />
    );
  };

  const selectedMetricKey = selectedStat?.id as DashboardOverviewMetricKey;

  return (
    <>
      <div className="flex justify-end mb-2">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddOpen(true)}
              disabled={activeMetrics.length >= 6}
            >
              <Plus className="h-4 w-4 mr-1" />
              {tOverview("add")}
            </Button>
          ) : null}
          <span className="text-sm text-muted-foreground text-right">
            {tOverview("recent30Days")}
          </span>
        </div>
      </div>
      <Card className="border-0 sm:border">
        <CardContent className="p-0 md:p-0 w-full">
          {isEditing ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={activeMetrics}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-2 md:grid-cols-3 md:grid-cols-6 gap-0 items-center">
                  {activeMetrics.map((metricKey) => (
                    <SortableOverviewStat
                      key={metricKey}
                      metricKey={metricKey}
                      onRemove={() => handleRemoveMetric(metricKey)}
                    >
                      {renderMetric(metricKey)}
                    </SortableOverviewStat>
                  ))}
                </div>
              </SortableContext>
              <DragOverlay adjustScale={false}>
                {activeDragKey ? (
                  <div className="w-[220px]">{renderMetric(activeDragKey)}</div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <>
              <div className="md:hidden p-2">
                <div className="flex items-center gap-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-muted/45 p-1">
                  {activeMetrics.map((metricKey) => {
                    const isActive = metricKey === selectedMetricKey;
                    const title = getDashboardMetricTitle({
                      tDashboard,
                      tFitness,
                      metricKey,
                    });
                    return (
                      <button
                        key={metricKey}
                        type="button"
                        className={cn(
                          "h-9 rounded-md transition-all duration-200 ease-out flex items-center overflow-hidden whitespace-nowrap",
                          isActive
                            ? "flex-1 min-w-0 justify-center gap-2 px-3 bg-background text-foreground"
                            : "w-9 justify-center bg-transparent text-muted-foreground hover:bg-neutral-200 dark:hover:bg-muted",
                        )}
                        onClick={() => setSelectedStat(metricKey, "")}
                        aria-pressed={isActive}
                        aria-label={title}
                      >
                        <span
                          className={cn(
                            "transition-colors",
                            isActive
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {getDashboardMetricIcon(metricKey)}
                        </span>
                        {isActive ? (
                          <span className="text-mobile-caption pc:text-xs font-medium truncate">
                            {title}
                          </span>
                        ) : (
                          <span className="sr-only">{title}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="hidden md:grid grid-cols-6 gap-0 items-center">
                {activeMetrics.map((metricKey) => renderMetric(metricKey))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <div className="mt-4">
        <OverviewMetricChart
          metricKey={
            (selectedStat?.id as DashboardOverviewMetricKey) || activeMetrics[0]
          }
        />
      </div>
      <OverviewMetricTabsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        activeMetrics={activeMetrics}
        onAddMetric={handleAddMetric}
      />
    </>
  );
});

Overview.displayName = "Overview";

export default Overview;
