import { FC } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import {
  formatTime,
  getBgColor,
  getColorClass,
  getFirstLetters,
  toCapitalize,
  useGetEventsByMode,
} from "@/components/calendar/helpers";
import { EventDetailsDialog } from "@/components/calendar/dialogs/event-details-dialog";
import { useCalendar } from "@/components/calendar/contexts/calendar-context";
import { EventBullet } from "@/components/calendar/views/month-view/event-bullet";
import { useLocale, useTranslations } from "next-intl";

export const AgendaEvents: FC = () => {
  const t = useTranslations("AgendaEvents");
  const locale = useLocale();
  const { events, use24HourFormat, badgeVariant, agendaModeGroupBy } =
    useCalendar();
  const fullDateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const shortDateFormatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const eventsByMode = Object.groupBy(useGetEventsByMode(events), (event) => {
    return agendaModeGroupBy === "date"
      ? format(parseISO(event.startDate), "yyyy-MM-dd")
      : event.color;
  });

  const groupedAndSortedEvents = Object.entries(eventsByMode).sort(
    (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
  );

  return (
    <Command className="py-4 h-[80vh] bg-transparent">
      <div className="mb-4 mx-4">
        <CommandInput placeholder={t("searchPlaceholder")} />
      </div>
      <CommandList className="max-h-max px-3 border-t">
        {groupedAndSortedEvents.map(([date, groupedEvents]) => (
          <CommandGroup
            key={date}
            heading={
              agendaModeGroupBy === "date"
                ? fullDateFormatter.format(parseISO(date))
                : toCapitalize(groupedEvents![0].color)
            }
          >
            {groupedEvents!.map((event) => (
              <CommandItem
                key={event.id}
                className={cn(
                  "mb-2 p-4 border rounded-md data-[selected=true]:bg-bg transition-all data-[selected=true]:text-none hover:cursor-pointer",
                  {
                    [getColorClass(event.color)]: badgeVariant === "colored",
                    "hover:bg-zinc-200 dark:hover:bg-gray-900":
                      badgeVariant === "dot",
                    "hover:opacity-60": badgeVariant === "colored",
                  }
                )}
              >
                <EventDetailsDialog event={event}>
                  <div className="w-full flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      {badgeVariant === "dot" ? (
                        <EventBullet color={event.color} />
                      ) : (
                        <Avatar>
                          <AvatarImage src="" alt="@shadcn" />
                          <AvatarFallback className={getBgColor(event.color)}>
                            {getFirstLetters(event.title)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className="flex flex-col">
                        <p
                          className={cn({
                            "font-medium": badgeVariant === "dot",
                            "text-foreground": badgeVariant === "dot",
                          })}
                        >
                          {event.title}
                        </p>
                        <p className="text-muted-foreground text-sm line-clamp-1 text-ellipsis md:text-clip w-1/3">
                          {event.description}
                        </p>
                      </div>
                    </div>
                    <div className="w-40 flex justify-center items-center gap-1">
                      {agendaModeGroupBy === "date" ? (
                        <>
                          <p className="text-sm">
                            {formatTime(event.startDate, use24HourFormat)}
                          </p>
                          <span className="text-muted-foreground">-</span>
                          <p className="text-sm">
                            {formatTime(event.endDate, use24HourFormat)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm">
                            {shortDateFormatter.format(new Date(event.startDate))}
                          </p>
                          <span className="text-sm">{t("at")}</span>
                          <p className="text-sm">
                            {formatTime(event.startDate, use24HourFormat)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </EventDetailsDialog>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandEmpty>{t("noResults")}</CommandEmpty>
      </CommandList>
    </Command>
  );
};
