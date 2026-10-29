"use client";

import { useMemo } from "react";
import { isSunday, isToday, startOfDay } from "date-fns";
import { motion } from "framer-motion";

import { EventBullet } from "@/components/calendar/views/month-view/event-bullet";
import { MonthEventBadge } from "@/components/calendar/views/month-view/month-event-badge";

import { getMonthCellEvents } from "@/components/calendar/helpers";
import { staggerContainer } from "@/components/calendar/animations";

import type { ICalendarCell, IEvent } from "@/components/calendar/interfaces";
import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";
import { DroppableArea } from "@/components/calendar/dnd/droppable-area";
import { EventListDialog } from "@/components/calendar/dialogs/events-list-dialog";
import { useMediaQuery } from "@/components/calendar/hooks";
import { MOBILE_BREAKPOINT } from "@/hooks/use-mobile";

interface IProps {
  cell: ICalendarCell;
  events: IEvent[];
  eventPositions: Record<string, number>;
}

export const dayCellVariants = cva("text-white", {
  variants: {
    color: {
      blue: "bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-400 ",
      green:
        "bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-400",
      red: "bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-400",
      yellow:
        "bg-yellow-600 dark:bg-yellow-500 hover:bg-yellow-700 dark:hover:bg-yellow-400",
      purple:
        "bg-purple-600 dark:bg-purple-500 hover:bg-purple-700 dark:hover:bg-purple-400",
      orange:
        "bg-orange-600 dark:bg-orange-500 hover:bg-orange-700 dark:hover:bg-orange-400",
      gray: "bg-gray-600 dark:bg-gray-500 hover:bg-gray-700 dark:hover:bg-gray-400",
    },
  },
  defaultVariants: {
    color: "blue",
  },
});

export function DayCell({ cell, events, eventPositions }: IProps) {
  const { day, currentMonth, date } = cell;
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

  const cellEvents = useMemo(
    () => getMonthCellEvents(date, events, eventPositions),
    [date, events, eventPositions]
  );
  const MAX_VISIBLE_EVENTS = isMobile ? 6 : 3;

  const cellContent = (
    <motion.div
      className={cn(
        "flex flex-col gap-1 border-l border-t md:min-h-[180px]",
        isSunday(date) && "border-l-0"
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 10 }}
    >
      <DroppableArea date={date} className="w-full h-full py-2">
        <motion.span
          className={cn(
            "h-6 w-6 px-1 flex translate-x-1 items-center justify-center rounded-full text-mobile-caption pc:text-xs font-semibold md:px-2 mb-1",
            !currentMonth && "text-muted-foreground",
            isToday(date) && "bg-primary text-primary-foreground"
          )}
          whileHover={{ scale: 1.1 }}
          transition={{ type: "spring", stiffness: 100, damping: 10 }}
        >
          {day}
        </motion.span>

        <motion.div
          className={cn(
            "flex h-6 gap-1 px-2 md:min-h-[94px] md:flex-col md:gap-2 md:px-0",
            !currentMonth && "opacity-50"
          )}
          variants={staggerContainer}
        >
          {[0, 1, 2].map((position) => {
            const event = cellEvents.find((e) => e.position === position);
            const eventKey = event
              ? `event-${event.id}-${position}`
              : `empty-${position}`;

            return (
              <motion.div
                key={eventKey}
                className="md:flex-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: position * 0.1,
                  type: "spring",
                  stiffness: 100,
                  damping: 10,
                }}
              >
                {event && (
                  <>
                    <EventBullet className="md:hidden" color={event.color} />
                    <MonthEventBadge
                      className="hidden md:flex"
                      event={event}
                      cellDate={startOfDay(date)}
                    />
                  </>
                )}
              </motion.div>
            );
          })}
        </motion.div>

        {!isMobile && cellEvents.length > MAX_VISIBLE_EVENTS && (
          <motion.div
            className={cn(
              "h-4.5 px-1.5 my-2 text-end text-mobile-caption pc:text-xs font-semibold text-muted-foreground",
              !currentMonth && "opacity-50"
            )}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.3,
              type: "spring",
              stiffness: 100,
              damping: 10,
            }}
          >
            <EventListDialog date={date} events={cellEvents} />
          </motion.div>
        )}
      </DroppableArea>
    </motion.div>
  );

  if (isMobile) {
    return (
      <EventListDialog date={date} events={cellEvents}>
        {cellContent}
      </EventListDialog>
    );
  }

  return cellContent;
}
