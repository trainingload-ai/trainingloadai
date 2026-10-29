"use client";

import React from "react";
import { useCalendar } from "@/components/calendar/contexts/calendar-context";
import { motion } from "framer-motion";
import { fadeIn } from "@/components/calendar/animations";
import { AgendaEvents } from "@/components/calendar/views/agenda-view/agenda-events";
import { CalendarMonthView } from "@/components/calendar/views/month-view/calendar-month-view";
import { CalendarWeekView } from "@/components/calendar/views/week-and-day-view/calendar-week-view";
import { CalendarDayView } from "@/components/calendar/views/week-and-day-view/calendar-day-view";
import { CalendarYearView } from "@/components/calendar/views/year-view/calendar-year-view";
import { isSameDay, parseISO } from "date-fns";

export function CalendarBody() {
  const { view, events } = useCalendar();

  const singleDayEvents = events.filter((event) => {
    const startDate = parseISO(event.startDate);
    const endDate = parseISO(event.endDate);
    return isSameDay(startDate, endDate);
  });

  const multiDayEvents = events.filter((event) => {
    const startDate = parseISO(event.startDate);
    const endDate = parseISO(event.endDate);
    return !isSameDay(startDate, endDate);
  });

  return (
    <div className="w-full h-full overflow-scroll relative">
      <motion.div
        key={view}
        initial="initial"
        animate="animate"
        exit="exit"
        className="h-full"
        variants={fadeIn}
        transition={{ type: "spring", stiffness: 100, damping: 10 }}
      >
        {view === "month" && (
          <CalendarMonthView
            singleDayEvents={singleDayEvents}
            multiDayEvents={multiDayEvents}
          />
        )}
        {view === "week" && (
          <CalendarWeekView
            singleDayEvents={singleDayEvents}
            multiDayEvents={multiDayEvents}
          />
        )}
        {view === "day" && (
          <CalendarDayView
            singleDayEvents={singleDayEvents}
            multiDayEvents={multiDayEvents}
          />
        )}
        {view === "year" && (
          <CalendarYearView
            singleDayEvents={singleDayEvents}
            multiDayEvents={multiDayEvents}
          />
        )}
        {view === "agenda" && (
          <motion.div
            key="agenda"
            initial="initial"
            animate="animate"
            exit="exit"
            variants={fadeIn}
            transition={{ type: "spring", stiffness: 100, damping: 10 }}
          >
            <AgendaEvents />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
