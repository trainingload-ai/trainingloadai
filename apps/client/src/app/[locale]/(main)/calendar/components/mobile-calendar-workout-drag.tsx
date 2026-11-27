"use client";

import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PlanWorkout } from "@/api/plans";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { calendarToday } from "./calendar-move-model";
import { calendarDropAppearance, calendarDropDayClass, canDropCalendarWorkout } from "./calendar-workout-drop";

export function MobileCalendarWorkoutDrag({
  onMove,
  children,
}: {
  onMove?: (workout: PlanWorkout, date: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [workout, setWorkout] = useState<PlanWorkout | null>(null);
  const t = useTranslations("CalendarExperience");
  if (!onMove) return children;
  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => setWorkout(active.data.current?.workout ?? null)}
      onDragCancel={() => setWorkout(null)}
      onDragEnd={({ active, over }) => {
        setWorkout(null);
        const source: PlanWorkout | undefined = active.data.current?.workout;
        const date = over?.data.current?.date;
        if (source && typeof date === "string" && canDropCalendarWorkout(source, date))
          onMove(source, date);
      }}
    >
      {children}
      {workout ? createPortal(
        <DragOverlay dropAnimation={null}>
          <div className="pointer-events-none w-fit max-w-48 truncate rounded-md bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
            {workout.name || t("plannedTraining")}
          </div>
        </DragOverlay>,
        document.body,
      ) : null}
    </DndContext>
  );
}

export function MobileCalendarDateGrid({ children }: { children: ReactNode }) {
  const { active } = useDndContext();
  return (
    <div
      data-calendar-date-grid
      data-calendar-dragging={active ? "" : undefined}
      className="relative grid grid-cols-7 gap-px border-t border-border/70 pt-2"
    >
      {children}
    </div>
  );
}

export function MobileCalendarDateDropTarget({ date, children }: { date: string; children: ReactNode }) {
  const { active } = useDndContext();
  const source: PlanWorkout | undefined = active?.data.current?.workout;
  const { isOver, setNodeRef } = useDroppable({
    id: date,
    data: { date },
    disabled: date < calendarToday() || (Boolean(source) && !canDropCalendarWorkout(source, date)),
  });
  const appearance = calendarDropAppearance(source, date, isOver);
  return (
    <div
      ref={setNodeRef}
      data-workout-drop={appearance}
      className={cn("min-w-0 rounded-compact transition-colors *:w-full", appearance && calendarDropDayClass[appearance])}
    >
      {children}
    </div>
  );
}

export function MobileCalendarDraggableWorkout({
  cardId,
  workout,
  onRequestMove,
  children,
}: {
  cardId: string;
  workout: PlanWorkout;
  onRequestMove?: (workout: PlanWorkout, trigger: HTMLElement) => void;
  children: ReactNode;
}) {
  const t = useTranslations("CalendarMove");
  const { listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: cardId,
    data: { workout },
  });
  return (
    <div
      ref={setNodeRef}
      data-calendar-draggable-workout={cardId}
      className={cn("relative min-w-0", isDragging && "opacity-50")}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") listeners?.onPointerDown?.(event);
      }}
    >
      {children}
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("moveWorkout")}
        data-tap-feedback="false"
        style={{ touchAction: "none" }}
        className="absolute end-1 top-1 z-20 size-7 select-none cursor-grab text-muted-foreground active:cursor-grabbing"
        onPointerDown={(event) => {
          event.stopPropagation();
          listeners?.onPointerDown?.(event);
        }}
        onClick={(event) => onRequestMove?.(workout, event.currentTarget)}
      >
        <GripVertical aria-hidden />
      </Button>
    </div>
  );
}
