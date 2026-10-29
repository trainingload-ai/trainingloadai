import { motion } from "framer-motion";
import { getYear, isSameDay, isSameMonth } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { useCalendar } from "@/components/calendar/contexts/calendar-context";
import { staggerContainer } from "@/components/calendar/animations";
import { getCalendarCells } from "@/components/calendar/helpers";
import { cn } from "@/lib/utils";
import { IEvent } from "@/components/calendar/interfaces";
import { EventBullet } from "@/components/calendar/views/month-view/event-bullet";
import { EventListDialog } from "@/components/calendar/dialogs/events-list-dialog";

interface IProps {
  singleDayEvents: IEvent[];
  multiDayEvents: IEvent[];
}

export function CalendarYearView({ singleDayEvents, multiDayEvents }: IProps) {
  const t = useTranslations("CalendarViews");
  const locale = useLocale();
  const { selectedDate, setSelectedDate } = useCalendar();
  const currentYear = getYear(selectedDate);
  const allEvents = [...multiDayEvents, ...singleDayEvents];
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: "long" });
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    weekdayFormatter.format(new Date(2024, 0, index + 7)),
  );

  return (
    <div className="flex flex-col h-full sm:min-h-[80vh] overflow-hidden sm:p-5">
      <motion.div
        className="flex flex-col items-center justify-center py-4 text-sm text-t-quaternary sm:hidden"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 10 }}
      >
        <p>{t("yearUnavailable")}</p>
        <p>{t("switchToDayOrMonth")}</p>
      </motion.div>
      <motion.div
        initial="initial"
        animate="animate"
        variants={staggerContainer}
        className="hidden sm:grid grid-cols-3 gap-4 grow overflow-hidden auto-rows-fr md:grid-cols-4 "
      >
        {Array.from({ length: 12 }, (_, monthIndex) => {
          const monthDate = new Date(currentYear, monthIndex, 1);
          const cells = getCalendarCells(monthDate);
          const monthLabel = monthFormatter.format(monthDate);

          return (
            <motion.div
              key={monthLabel}
              className="flex flex-col border rounded-md overflow-hidden h-full"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: monthIndex * 0.05,
                type: "spring",
                stiffness: 100,
                damping: 10,
              }}
            >
              <div
                className="bg-primary/5 px-1 py-1 text-center font-medium cursor-pointer hover:bg-primary/10 transition-colors text-mobile-caption pc:text-xs sm:text-sm"
                onClick={() =>
                  setSelectedDate(new Date(currentYear, monthIndex, 1))
                }
              >
                {monthLabel}
              </div>

              <div className="grid grid-cols-7 text-center text-mobile-caption pc:text-xs py-1">
                {weekdays.map((day) => (
                  <div key={day} className="text-muted-foreground">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0 p-0.5 grow">
                {cells.map((cell) => {
                  const isCurrentMonth = isSameMonth(cell.date, monthDate);
                  const isToday = isSameDay(cell.date, new Date());
                  const dayEvents = allEvents.filter((event) =>
                    isSameDay(new Date(event.startDate), cell.date)
                  );
                  const hasEvents = dayEvents.length > 0;

                  return (
                    <div
                      key={cell.date.toISOString()}
                      className={cn(
                        "flex flex-col items-center justify-center text-mobile-caption pc:text-xs relative",
                        !isCurrentMonth && "text-muted-foreground/50",
                        isToday && "font-bold",
                        !hasEvents && "cursor-default"
                      )}
                    >
                      {hasEvents ? (
                        <EventListDialog date={cell.date} events={dayEvents}>
                          <div className="cursor-pointer w-full h-full flex flex-col items-center justify-center">
                            <span
                              className={cn(
                                "size-4 sm:size-5 flex items-center justify-center",
                                isToday &&
                                  "rounded-full bg-primary text-primary-foreground"
                              )}
                            >
                              {cell.day}
                            </span>
                            <div className="flex justify-center items-center gap-0.5">
                              {dayEvents.length <= 2 ? (
                                dayEvents
                                  .slice(0, 2)
                                  .map((event) => (
                                    <EventBullet
                                      key={event.id}
                                      color={event.color}
                                      className="size-1"
                                    />
                                  ))
                              ) : (
                                <>
                                  <EventBullet
                                    color={dayEvents[0].color}
                                    className="size-1"
                                  />
                                  <span className="text-[.7rem] text-muted-foreground">
                                    +{dayEvents.length - 1}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </EventListDialog>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center">
                          <span
                            className={cn(
                              "size-4 sm:size-5 flex items-center justify-center",
                              isToday &&
                                "rounded-full bg-primary text-primary-foreground"
                            )}
                          >
                            {cell.day}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
