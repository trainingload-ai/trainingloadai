import dayjs from "dayjs";
import type { Time } from "@/components/DateSelector/types";

export function timeToRange(
  time: Time
): { start?: string; end?: string } | undefined {
  if (!time) return undefined;
  switch (time.mode) {
    case "day": {
      const d = dayjs(time.day);
      return {
        start: d.startOf("day").toISOString(),
        end: d.endOf("day").toISOString(),
      };
    }
    case "range": {
      return {
        start: dayjs(time.startDate).toISOString(),
        end: dayjs(time.endDate).toISOString(),
      };
    }
    case "week": {
      const d = dayjs(time.week);
      return {
        start: d.startOf("week").toISOString(),
        end: d.endOf("week").toISOString(),
      };
    }
    case "month": {
      const d = dayjs(time.month);
      return {
        start: d.startOf("month").toISOString(),
        end: d.endOf("month").toISOString(),
      };
    }
    case "year": {
      const d = dayjs(time.year);
      return {
        start: d.startOf("year").toISOString(),
        end: d.endOf("year").toISOString(),
      };
    }
    case "all-time": {
      return {
        start: undefined,
        end: undefined,
      };
    }
    case "past-minutes": {
      const toDate = (n: number) =>
        n > 1e12 ? dayjs(n) : dayjs(0).add(n, "minute");
      const start = toDate(time.pastMinutesStart).toISOString();
      const end = toDate(time.pastMinutesEnd).toISOString();
      return { start, end };
    }
    default:
      return undefined;
  }
}

export function useModeGetStart(
  mode:
    | "day"
    | "month"
    | "year"
    | "week"
    | "range"
    | "all-time"
    | "past-minutes"
) {
  const now = dayjs();
  switch (mode) {
    case "day":
      return {
        current: now.startOf("day").toISOString(),
        prev: now.startOf("day").subtract(30, "day").toISOString(),
      };
    case "week":
      return {
        current: now.endOf("week").toISOString(),
        prev: now.endOf("week").subtract(8, "week").toISOString(),
      };
    case "month":
      return {
        current: now.endOf("month").toISOString(),
        prev: now.endOf("month").subtract(12, "month").toISOString(),
      };
    case "year":
      return {
        current: now.endOf("year").toISOString(),
        prev: undefined,
      };
    default:
      return {
        current: now.toISOString(),
        prev: undefined,
      };
  }
}
