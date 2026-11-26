import type { Dayjs } from "dayjs";
import "dayjs/locale/zh-cn";

export function calendarScrollFetchRange(month: Dayjs) {
  return {
    start: month.startOf("month").subtract(9, "week"),
    end: month.endOf("month").add(9, "week"),
  };
}

export function startOfCalendarWeek(date: Dayjs, weekStartsOn: 0 | 1) {
  return date.startOf("day").subtract((date.day() - weekStartsOn + 7) % 7, "day");
}

export function generateCalendarWeeks(
  month: Dayjs,
  locale = "en",
  weekStartsOn: 0 | 1 = 1,
): Dayjs[][] {
  const dayjsLocale = locale.startsWith("zh") ? "zh-cn" : "en";
  const localized = month.locale(dayjsLocale);
  const first = startOfCalendarWeek(localized.startOf("month"), weekStartsOn);
  const last = startOfCalendarWeek(localized.endOf("month"), weekStartsOn);
  const weeks: Dayjs[][] = [];
  for (let week = first; !week.isAfter(last); week = week.add(1, "week")) {
    weeks.push(Array.from({ length: 7 }, (_, index) => week.add(index, "day")));
  }
  return weeks;
}
