"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import {
  type FitnessStatusMetricKey,
  useFitnessStatusConfig,
} from "@/hooks/useFitnessStatusConfig";
import { FitnessStatusAddMetricDialog } from "./components/FitnessStatusAddMetricDialog";
import { FitnessStatusStatCard } from "./components/FitnessStatusStatCard";
import {
  SortableFitnessStatCard,
  type FitnessStatCard,
} from "./components/SortableFitnessStatCard";
import { FITNESS_STATUS_METRIC_KEYS } from "./fitness-status-model";
import { clampSpan, getSpanClass } from "./fitness-status-layout";

export function FitnessStatusEditor({
  statsByKey,
  renderSubContent,
}: {
  statsByKey: Map<FitnessStatusMetricKey, FitnessStatCard>;
  renderSubContent: (stat: FitnessStatCard) => ReactNode;
}) {
  const {
    draftLayout,
    setDraftLayout,
    addDialogOpen,
    setAddDialogOpen,
  } = useFitnessStatusConfig();
  const [activeDragKey, setActiveDragKey] =
    useState<FitnessStatusMetricKey | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const selectedMetricKeys = useMemo(
    () => new Set(draftLayout.map((item) => item.key)),
    [draftLayout],
  );
  const activeDragItem = activeDragKey
    ? draftLayout.find((item) => item.key === activeDragKey)
    : null;
  const activeDragStat = activeDragItem
    ? statsByKey.get(activeDragItem.key)
    : null;

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragKey(null);
    if (!over || active.id === over.id) return;
    const oldIndex = draftLayout.findIndex((item) => item.key === active.id);
    const newIndex = draftLayout.findIndex((item) => item.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setDraftLayout(arrayMove(draftLayout, oldIndex, newIndex));
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveDragKey(active.id as FitnessStatusMetricKey);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragKey(null)}
    >
      <SortableContext
        items={draftLayout.map((item) => item.key)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {draftLayout.map((item) => {
            const stat = statsByKey.get(item.key);
            if (!stat) return null;
            return (
              <SortableFitnessStatCard
                key={item.key}
                stat={stat}
                span={item.span}
                subContent={renderSubContent(stat)}
                onRemove={() =>
                  setDraftLayout(
                    draftLayout.filter((current) => current.key !== item.key),
                  )
                }
                onSpanChange={(span) =>
                  setDraftLayout(
                    draftLayout.map((current) =>
                      current.key === item.key
                        ? { ...current, span }
                        : current,
                    ),
                  )
                }
              />
            );
          })}

          <FitnessStatusAddMetricDialog
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
            metricKeys={FITNESS_STATUS_METRIC_KEYS}
            statsByKey={statsByKey}
            selectedMetricKeys={selectedMetricKeys}
            onAddMetric={(key) =>
              setDraftLayout([...draftLayout, { key, span: 1 }])
            }
            renderSubContent={renderSubContent}
          />
        </div>
      </SortableContext>
      <DragOverlay adjustScale={false}>
        {activeDragItem && activeDragStat ? (
          <div
            className={getSpanClass(clampSpan(activeDragItem.span, 4))}
          >
            <FitnessStatusStatCard
              stat={activeDragStat}
              subContent={renderSubContent(activeDragStat)}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
