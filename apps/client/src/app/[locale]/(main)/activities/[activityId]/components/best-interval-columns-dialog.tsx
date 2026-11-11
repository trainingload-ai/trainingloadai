"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BEST_INTERVAL_COLUMNS,
  type BestIntervalColumn,
} from "@/lib/activity-best-interval-columns";

function SortableColumn({
  column,
  index,
  name,
  disabled,
  onRemove,
}: {
  column: BestIntervalColumn;
  index: number;
  name: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  const t = useTranslations("ActivityDetail.bestIntervals");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column });
  return (
    <div
      ref={setNodeRef}
      data-column-id={column}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 1 : 0,
      }}
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-control border border-border/35 px-2",
        index % 2 ? "bg-muted/30" : "bg-muted/55",
        isDragging && "border-foreground/25 bg-popover shadow-md",
      )}
    >
      <button
        type="button"
        className="grid size-7 shrink-0 touch-none cursor-grab place-items-center rounded-control text-muted-foreground/50 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={t("dragColumn", { column: name })}
      >
        <GripVertical className="size-3.5" />
      </button>
      <span className="flex-1 py-2 text-xs font-medium">{name}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-muted-foreground/60 hover:bg-destructive/5 hover:text-destructive [&_svg]:size-3.5"
        disabled={disabled}
        aria-label={t("removeColumn", { column: name })}
        title={t("removeColumn", { column: name })}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

export function BestIntervalColumnsDialog({
  columns,
  defaults,
  label,
  onSave,
  onClose,
}: {
  columns: BestIntervalColumn[];
  defaults: BestIntervalColumn[];
  label: (column: BestIntervalColumn) => string;
  onSave: (columns: BestIntervalColumn[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations("ActivityDetail.bestIntervals");
  const id = useId();
  const [draft, setDraft] = useState(columns);
  const available = BEST_INTERVAL_COLUMNS.filter(
    (column) => !draft.includes(column),
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const reorder = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraft((current) => {
      const from = current.indexOf(active.id as BestIntervalColumn),
        to = current.indexOf(over.id as BestIntervalColumn);
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden p-0 pc:max-w-2xl pc:p-0"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle id={`${id}-title`}>{t("editColumns")}</DialogTitle>
          <DialogDescription
            id={`${id}-description`}
            className="text-xs leading-5"
          >
            {t("columnsDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[55dvh] gap-5 overflow-y-auto p-5 sm:grid-cols-2">
          <section aria-label={t("visibleColumns")}>
            <div className="mb-3 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <h3>{t("visibleColumns")}</h3>
              <span className="tabular-nums">{draft.length}</span>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={reorder}
              accessibility={{
                screenReaderInstructions: {
                  draggable: t("dragColumnInstructions"),
                },
              }}
            >
              <SortableContext
                items={draft}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1.5">
                  {draft.map((column, index) => (
                    <SortableColumn
                      key={column}
                      column={column}
                      index={index}
                      name={label(column)}
                      disabled={draft.length === 1}
                      onRemove={() =>
                        setDraft(draft.filter((value) => value !== column))
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </section>
          <section
            aria-label={t("availableColumns")}
            className="border-t border-border/45 pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"
          >
            <div className="mb-3 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <h3>{t("availableColumns")}</h3>
              <span className="tabular-nums">{available.length}</span>
            </div>
            <div className="space-y-1">
              {available.map((column) => (
                <button
                  type="button"
                  key={column}
                  className="flex min-h-9 w-full items-center justify-between gap-2.5 rounded-control px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={t("addColumn", { column: label(column) })}
                  onClick={() => setDraft([...draft, column])}
                >
                  {label(column)}
                  <Plus
                    className="size-3.5 shrink-0 text-muted-foreground/60"
                    aria-hidden
                  />
                </button>
              ))}
            </div>
          </section>
        </div>
        <DialogFooter className="flex-row items-center border-t border-border/60 px-5 py-3">
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => setDraft([...defaults])}
          >
            {t("restoreColumns")}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t("cancelColumns")}
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            {t("saveColumns")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
