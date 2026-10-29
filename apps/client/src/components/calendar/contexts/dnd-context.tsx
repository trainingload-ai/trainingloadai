"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useEffect,
} from "react";
import { IEvent } from "@/components/calendar/interfaces";
import { toast } from "sonner";
import { useCalendar } from "@/components/calendar/contexts/calendar-context";

interface DragDropContextType {
  draggedEvent: IEvent | null;
  isDragging: boolean;
  startDrag: (event: IEvent) => void;
  endDrag: () => void;
  handleEventDrop: (date: Date, hour?: number, minute?: number) => void;
  onEventDropped?: (
    event: IEvent,
    newStartDate: Date,
    newEndDate: Date
  ) => void;
  setOnEventDropped: (
    callback: (event: IEvent, newStartDate: Date, newEndDate: Date) => void
  ) => void;
}

const DragDropContext = createContext<DragDropContextType | undefined>(
  undefined
);

export function DndProvider({ children }: { children: ReactNode }) {
  const { updateEvent } = useCalendar();
  const [draggedEvent, setDraggedEvent] = useState<IEvent | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [onEventDropped, setOnEventDroppedCallback] = useState<
    ((event: IEvent, newStartDate: Date, newEndDate: Date) => void) | undefined
  >(undefined);

  const startDrag = (event: IEvent) => {
    setDraggedEvent(event);
    setIsDragging(true);
  };

  const endDrag = () => {
    setDraggedEvent(null);
    setIsDragging(false);
  };

  const handleEventDrop = (
    targetDate: Date,
    hour?: number,
    minute?: number
  ) => {
    if (!draggedEvent || !onEventDropped) return;

    const originalStart = new Date(draggedEvent.startDate);
    const originalEnd = new Date(draggedEvent.endDate);
    const duration = originalEnd.getTime() - originalStart.getTime();

    const newStart = new Date(targetDate);
    if (hour !== undefined) {
      newStart.setHours(hour);
      newStart.setMinutes(minute || 0);
    } else {
      newStart.setHours(originalStart.getHours());
      newStart.setMinutes(originalStart.getMinutes());
    }

    // Create new end date based on the same duration
    const newEnd = new Date(newStart.getTime() + duration);

    // Check if the event is being dropped in the same position
    const isSamePosition =
      originalStart.getFullYear() === newStart.getFullYear() &&
      originalStart.getMonth() === newStart.getMonth() &&
      originalStart.getDate() === newStart.getDate() &&
      originalStart.getHours() === newStart.getHours() &&
      originalStart.getMinutes() === newStart.getMinutes();

    if (!isSamePosition) {
      onEventDropped(draggedEvent, newStart, newEnd);
    }

    endDrag();
  };

  const setOnEventDropped = useCallback(
    (
      callback: (event: IEvent, newStartDate: Date, newEndDate: Date) => void
    ) => {
      setOnEventDroppedCallback(() => callback);
    },
    []
  );

  const handleEventUpdate = useCallback(
    (event: IEvent, newStartDate: Date, newEndDate: Date) => {
      try {
        const updatedEvent = {
          ...event,
          startDate: newStartDate.toISOString(),
          endDate: newEndDate.toISOString(),
        };

        updateEvent(updatedEvent);
        toast.success("Event updated successfully");
      } catch {
        toast.error("Failed to update event");
      }
    },
    [updateEvent]
  );

  useEffect(() => {
    setOnEventDropped(handleEventUpdate);
  }, [setOnEventDropped, handleEventUpdate]);

  return (
    <DragDropContext.Provider
      value={{
        draggedEvent,
        isDragging,
        startDrag,
        endDrag,
        handleEventDrop,
        onEventDropped,
        setOnEventDropped,
      }}
    >
      {children}
    </DragDropContext.Provider>
  );
}

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (context === undefined) {
    throw new Error("useDragDrop must be used within a DragDropProvider");
  }
  return context;
}
