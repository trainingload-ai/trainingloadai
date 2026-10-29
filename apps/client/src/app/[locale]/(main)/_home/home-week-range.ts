import dayjs, { type Dayjs } from "dayjs";

export type HomeWeekRange = {
  startDate: string;
  endDate: string;
  dateKeys: string[];
};

/**
 * 返回锚点日期所在的自然周，固定以周一开始、周日结束。
 */
export function getHomeWeekRange(anchor: Dayjs = dayjs()): HomeWeekRange {
  const daysSinceMonday = (anchor.day() + 6) % 7;
  const monday = anchor.startOf("day").subtract(daysSinceMonday, "day");
  const dateKeys = Array.from({ length: 7 }, (_, index) =>
    monday.add(index, "day").format("YYYY-MM-DD"),
  );

  return {
    startDate: dateKeys[0],
    endDate: dateKeys[6],
    dateKeys,
  };
}
