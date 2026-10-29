import dayjs from "dayjs";

export type SummaryPoint = { time: string; value: number };
export type ComparisonPoint = { time: number; cur?: number; prev?: number };

export function buildComparisonSeries(
  current: SummaryPoint[] = [],
  previous: SummaryPoint[] = []
): ComparisonPoint[] {
  const toMs = (t: string): number => {
    const v = dayjs(t).valueOf();
    return Number.isFinite(v) ? v : NaN;
  };

  const curMap: Record<number, ComparisonPoint> = {};
  for (const p of current) {
    const tm = toMs(p.time);
    if (!Number.isFinite(tm) || !Number.isFinite(p.value)) continue;
    if (!curMap[tm]) curMap[tm] = { time: tm };
    curMap[tm].cur = p.value;
  }

  const prevMap: Record<number, ComparisonPoint> = {};
  for (const p of previous) {
    const tm = toMs(p.time);
    if (!Number.isFinite(tm) || !Number.isFinite(p.value)) continue;
    if (!prevMap[tm]) prevMap[tm] = { time: tm };
    prevMap[tm].prev = p.value;
  }

  const keys = Array.from(
    new Set(
      [...Object.keys(curMap), ...Object.keys(prevMap)].map((k) => Number(k))
    )
  ).sort((a, b) => a - b);

  return keys.map((k) => ({
    time: k,
    cur: curMap[k]?.cur,
    prev: prevMap[k]?.prev,
  }));
}

export function makeTimeTickFormatter(
  mode:
    | "day"
    | "range"
    | "week"
    | "month"
    | "year"
    | "all-time"
    | "past-minutes",
  data: ComparisonPoint[]
): (value: number) => string {
  return (value: number) => {
    const d = dayjs(value);
    switch (mode) {
      case "day":
        return d.format("HH:mm");
      case "week":
        return d.format("YYYY-[W]WW");
      case "month":
        return d.format("YYYY-MM");
      case "year":
        return d.format("YYYY");
      case "range":
      case "all-time":
      case "past-minutes":
      default: {
        const span = (data.at(-1)?.time || 0) - (data[0]?.time || 0);
        return span <= 36 * 3600 * 1000
          ? d.format("MM-DD HH:mm")
          : d.format("MM-DD");
      }
    }
  };
}
