import dayjs, { Dayjs } from "dayjs";
import "dayjs/locale/zh-cn";

// 生成当前月份的周视图（左侧汇总 + 周日到周六 或 周一到周日，取决于语言）
export function generateCalendarWeeks(
  month: Dayjs,
  locale: string = "en"
): Dayjs[][] {
  // 设置 locale
  const dayjsLocale = locale.startsWith("zh") ? "zh-cn" : "en";
  dayjs.locale(dayjsLocale);

  const firstOfMonth = month.locale(dayjsLocale).startOf("month");
  const calendarStart = firstOfMonth.startOf("week"); // 根据 locale 决定起始
  const lastOfMonth = month.locale(dayjsLocale).endOf("month");
  const calendarEnd = lastOfMonth.endOf("week"); // 根据 locale 决定结束

  const days: Dayjs[] = [];
  let cursor = calendarStart;
  while (cursor.isBefore(calendarEnd) || cursor.isSame(calendarEnd, "day")) {
    days.push(cursor);
    cursor = cursor.add(1, "day");
  }
  const weeks: Dayjs[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}
