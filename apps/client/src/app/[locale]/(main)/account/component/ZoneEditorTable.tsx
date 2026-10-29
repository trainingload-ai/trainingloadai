"use client";

import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  type SensorDescriptor,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ZoneEditorSortableRow } from "./ZoneEditorSortableRow";

type ZoneRow = {
  color?: string;
  id?: string;
  max: number;
  min: number;
  name: string;
};

export function ZoneEditorTable({
  duplicateByName,
  getAbs,
  isCustom,
  onDragEnd,
  removeZone,
  sensors,
  t,
  updateZone,
  zoneUnit,
  zones,
}: {
  duplicateByName: (zoneName: string) => boolean;
  getAbs: (pct: number) => string | number | null;
  isCustom: boolean;
  onDragEnd: (event: DragEndEvent) => void;
  removeZone: (index: number) => void;
  sensors: SensorDescriptor<any>[];
  t: (key: string, values?: Record<string, string | number>) => string;
  updateZone: (
    index: number,
    field: "name" | "min" | "max" | "color",
    value: string | number,
  ) => void;
  zoneUnit: string;
  zones: ZoneRow[];
}) {
  return (
    <div className="overflow-x-auto rounded-md border bg-background">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-12 gap-2 sm:gap-4 items-center border-b bg-background px-2 sm:px-4 py-3 text-mobile-caption pc:text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
          <div className="col-span-1 text-center">{t("columns.order")}</div>
          <div className={isCustom ? "col-span-3" : "col-span-2"}>
            {t("columns.name")}
          </div>
          <div className="col-span-3">
            {isCustom
              ? t("columns.minAbsolute", { unit: zoneUnit })
              : t("columns.minPercent")}
          </div>
          <div className="col-span-3">
            {isCustom
              ? t("columns.maxAbsolute", { unit: zoneUnit })
              : t("columns.maxPercent")}
          </div>
          {!isCustom && (
            <div className="col-span-2 whitespace-nowrap">{t("columns.ref")}</div>
          )}
          <div className={isCustom ? "col-span-2" : "col-span-1"}></div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={zones.map((zone) => zone.id!)}
            strategy={verticalListSortingStrategy}
          >
            <div className="divide-y">
              {zones.map((zone, index) => (
                <ZoneEditorSortableRow
                  key={zone.id}
                  id={zone.id!}
                  index={index}
                  zone={zone}
                  isCustom={isCustom}
                  isDuplicate={duplicateByName(zone.name)}
                  updateZone={updateZone}
                  removeZone={removeZone}
                  getAbs={getAbs}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
