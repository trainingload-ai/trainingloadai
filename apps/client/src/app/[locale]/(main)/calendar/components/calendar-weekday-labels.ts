/** Labels follow the visible grid's weekday order. The anchor stays in UTC. */
export function calendarWeekdayLabels(locale: string, firstWeekday: number) {
  const format = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    calendar: "gregory",
    timeZone: "UTC",
  });
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(Date.UTC(2024, 0, 7 + ((firstWeekday + index) % 7)))),
  );
}

export function calendarMonthDayLabel(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    calendar: "gregory",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}
