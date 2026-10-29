import { dayjs } from "@/lib/dayjs-tz";
import type { TimeFormat } from "@/lib/store";

export function uses12HourClock(timeFormat: TimeFormat | string | undefined) {
  return timeFormat === "12h";
}

export function clockIntlOptions(
  timeFormat: TimeFormat | string | undefined,
): Pick<Intl.DateTimeFormatOptions, "hour12" | "hourCycle"> {
  return uses12HourClock(timeFormat)
    ? { hour12: true }
    : { hourCycle: "h23" };
}

export function clockFormat(timeFormat: TimeFormat | string | undefined) {
  return uses12HourClock(timeFormat) ? "h:mm A" : "HH:mm";
}

export function monthDayClockFormat(
  timeFormat: TimeFormat | string | undefined,
) {
  return uses12HourClock(timeFormat) ? "MM-DD h:mm A" : "MM-DD HH:mm";
}

export function formatLocalMonthDayClock(
  value: string | Date,
  timeFormat: TimeFormat | string | undefined,
) {
  return dayjs(value).format(monthDayClockFormat(timeFormat));
}
