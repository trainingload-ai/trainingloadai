import { formatTime } from "@/components/calendar/helpers";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalTrigger,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";
import { cn } from "@/lib/utils";

import { ReactNode } from "react";
import { IEvent } from "@/components/calendar/interfaces";
import { dayCellVariants } from "@/components/calendar/views/month-view/day-cell";
import { EventBullet } from "@/components/calendar/views/month-view/event-bullet";
import { useCalendar } from "@/components/calendar/contexts/calendar-context";
import { useLocale, useTranslations } from "next-intl";

interface EventListDialogProps {
  date: Date;
  events: IEvent[];
  maxVisibleEvents?: number;
  children?: ReactNode;
}

export function EventListDialog({
  date,
  events,
  maxVisibleEvents = 3,
  children,
}: EventListDialogProps) {
  const t = useTranslations("CalendarDialogs");
  const locale = useLocale();
  const cellEvents = events;
  const hiddenEventsCount = Math.max(cellEvents.length - maxVisibleEvents, 0);
  const { badgeVariant, use24HourFormat } = useCalendar();
  const fullDateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const defaultTrigger = (
    <span className="cursor-pointer">
      <span className="sm:hidden">+{hiddenEventsCount}</span>
      <span className="hidden sm:inline py-0.5 px-2 my-1 rounded-md border">
        {hiddenEventsCount}
        <span className="mx-1">{t("more")}</span>
      </span>
    </span>
  );

  return (
    <ResponsiveModal>
      <ResponsiveModalTrigger asChild>
        {children || defaultTrigger}
      </ResponsiveModalTrigger>
      <ResponsiveModalContent className="sm:max-w-[425px]">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle className="my-2">
            <div className="flex items-center gap-2">
              <EventBullet color={cellEvents[0]?.color} className="" />
              <p className="text-sm font-medium">
                {t("eventsOn", { date: fullDateFormatter.format(date) })}
              </p>
            </div>
          </ResponsiveModalTitle>
        </ResponsiveModalHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {cellEvents.length > 0 ? (
            cellEvents.map((event) => (
              <div
                key={event.id}
                className={cn(
                  "flex items-center gap-2 p-2 border rounded-md hover:bg-muted",
                  {
                    [dayCellVariants({ color: event.color })]:
                      badgeVariant === "colored",
                  },
                )}
              >
                <EventBullet color={event.color} className="" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p
                    className={cn("text-mobile-caption pc:text-xs", {
                      "text-muted": badgeVariant === "colored",
                      "text-muted-foreground": badgeVariant === "dot",
                    })}
                  >
                    {formatTime(event.startDate, use24HourFormat)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("noEventsForDate")}
            </p>
          )}
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
