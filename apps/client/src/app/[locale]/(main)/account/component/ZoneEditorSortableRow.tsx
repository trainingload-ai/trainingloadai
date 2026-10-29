"use client";

import { useTranslations } from "next-intl";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/ui/colorPicker";
import { DEFAULT_ZONE_COLORS } from "./zone-editor-model";

type ZoneRow = {
  color?: string;
  max: number;
  min: number;
  name: string;
};

export function ZoneEditorSortableRow({
  getAbs,
  id,
  index,
  isCustom,
  isDuplicate,
  removeZone,
  updateZone,
  zone,
}: {
  getAbs: (pct: number) => string | number | null;
  id: string;
  index: number;
  isCustom: boolean;
  isDuplicate?: boolean;
  removeZone: (index: number) => void;
  updateZone: (
    index: number,
    field: "name" | "min" | "max" | "color",
    value: string | number,
  ) => void;
  zone: ZoneRow;
}) {
  const t = useTranslations("ZoneSettings.editor");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
  };

  const currentColor = zone.color || DEFAULT_ZONE_COLORS[index] || "#64748b";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group grid grid-cols-12 gap-2 sm:gap-4 items-center px-2 sm:px-4 py-2 border-b last:border-0 hover:bg-neutral-200 dark:hover:bg-muted transition-all"
    >
      <div
        className="col-span-1 flex justify-center cursor-grab active:cursor-grabbing touch-none text-muted-foreground/30 group-hover:text-muted-foreground transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <div
        className={
          isCustom
            ? "col-span-3 flex items-center gap-2"
            : "col-span-2 flex items-center gap-2"
        }
      >
        <ColorPicker
          value={currentColor}
          onChange={(color) => updateZone(index, "color", color)}
          className="shrink-0"
        />
        <Input
          value={zone.name}
          onChange={(event) => updateZone(index, "name", event.target.value)}
          placeholder={t("placeholders.name")}
          className={cn(
            "h-8 border-transparent bg-transparent font-medium shadow-none transition-[background-color,border-color] hover:border-input/70 hover:bg-background focus:border-input focus:bg-background",
            isDuplicate &&
              "border-destructive text-destructive focus:border-destructive",
          )}
        />
      </div>
      <div className="col-span-3">
        <Input
          type="number"
          value={zone.min}
          onChange={(event) =>
            updateZone(index, "min", parseFloat(event.target.value))
          }
          placeholder={
            isCustom ? t("placeholders.min") : t("placeholders.minPercent")
          }
          className="h-8 border-transparent bg-transparent tabular-nums shadow-none transition-[background-color,border-color] hover:border-input/70 hover:bg-background focus:border-input focus:bg-background"
        />
      </div>
      <div className="col-span-3">
        <Input
          type="number"
          value={zone.max}
          onChange={(event) =>
            updateZone(index, "max", parseFloat(event.target.value))
          }
          placeholder={
            isCustom ? t("placeholders.max") : t("placeholders.maxPercent")
          }
          className="h-8 border-transparent bg-transparent tabular-nums shadow-none transition-[background-color,border-color] hover:border-input/70 hover:bg-background focus:border-input focus:bg-background"
        />
      </div>
      {!isCustom && (
        <div className="col-span-2 whitespace-nowrap text-sm tabular-nums text-muted-foreground font-medium">
          {getAbs(zone.min)} - {getAbs(zone.max)}
        </div>
      )}
      <div
        className={
          isCustom
            ? "col-span-2 flex justify-end"
            : "col-span-1 flex justify-end"
        }
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground/70 hover:text-destructive opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-all"
          onClick={() => removeZone(index)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
