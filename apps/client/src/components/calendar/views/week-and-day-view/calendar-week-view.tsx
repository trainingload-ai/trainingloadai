import { startOfWeek, addDays, format, parseISO, isSameDay } from "date-fns";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";

import { useCalendar } from "@/components/calendar/contexts/calendar-context";
import { fadeIn, staggerContainer } from "@/components/calendar/animations";

import { WeekViewMultiDayEventsRow } from "@/components/calendar/views/week-and-day-view/week-view-multi-day-events-row";
import { groupEvents } from "@/components/calendar/helpers";
import type { IEvent } from "@/components/calendar/interfaces";
import { RenderGroupedEvents } from "@/components/calendar/views/week-and-day-view/render-grouped-events";

interface IProps {
  singleDayEvents: IEvent[];
  multiDayEvents: IEvent[];
}

export function CalendarWeekView({ singleDayEvents, multiDayEvents }: IProps) {
  const t = useTranslations("CalendarViews");
  const locale = useLocale();
  const { selectedDate } = useCalendar();

  const weekStart = startOfWeek(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short" });

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-full"
      variants={fadeIn}
      transition={{ type: "spring", stiffness: 100, damping: 10 }}
    >
      <motion.div
        className="flex flex-col items-center justify-center border-b py-4 text-sm text-t-quaternary sm:hidden"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 10 }}
      >
        <p>{t("weekUnavailable")}</p>
        <p>{t("switchToDayOrMonth")}</p>
      </motion.div>

      <motion.div
        className="h-full hidden flex-col sm:flex"
        variants={staggerContainer}
      >
        <div>
          <WeekViewMultiDayEventsRow
            selectedDate={selectedDate}
            multiDayEvents={multiDayEvents}
          />

          {/* Week header */}
          <motion.div
            className="relative z-20 flex border-b"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 10 }}
          >
            <div className="grid flex-1 grid-cols-7  border-l">
              {weekDays.map((day, index) => (
                <motion.span
                  key={index}
                  className="py-2 text-center text-mobile-caption pc:text-xs font-medium text-t-quaternary"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: index * 0.05,
                    type: "spring",
                    stiffness: 100,
                    damping: 10,
                  }}
                >
                  {weekdayFormatter.format(day)}{" "}
                  <span className="ml-1 font-semibold text-t-secondary">
                    {format(day, "d")}
                  </span>
                </motion.span>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="h-full">
          <div className="h-full">
            {/* Week grid */}
            <motion.div
              className="relative h-full flex-1 border-l"
              variants={staggerContainer}
            >
              <div className="h-full grid grid-cols-7 divide-x">
                {weekDays.map((day, dayIndex) => {
                  const dayEvents = singleDayEvents.filter(
                    (event) =>
                      isSameDay(parseISO(event.startDate), day) ||
                      isSameDay(parseISO(event.endDate), day)
                  );
                  const groupedEvents = groupEvents(dayEvents);

                  return (
                    <motion.div
                      key={dayIndex}
                      className="relative p-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        delay: dayIndex * 0.1,
                        type: "spring",
                        stiffness: 100,
                        damping: 10,
                      }}
                    >
                      <RenderGroupedEvents
                        groupedEvents={groupedEvents}
                        day={day}
                      />
                    </motion.div>
                  );
                })}
              </div>

              {/* <CalendarTimeline /> */}
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
