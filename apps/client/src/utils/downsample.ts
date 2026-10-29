import dayjs from "dayjs";

/**
 * Downsample an array to at most `maxPoints` items by even spacing.
 * - Keeps order
 * - Deterministic (no randomness)
 * - Defaults to 3000 points
 */
export function downsampleEvenly<T>(
  arr: T[] | undefined | null,
  maxPoints = 3000
): T[] {
  const source = arr ?? [];
  if (source.length <= maxPoints) return source;
  const step = Math.ceil(source.length / maxPoints);
  const result: T[] = [];
  for (let i = 0; i < source.length; i += step) {
    result.push(source[i]);
  }
  return result;
}

export function formatTimeToElapsed<T extends { time?: string }>(
  arr: T[] | undefined | null
): T[] {
  const normalizedArr = arr?.filter((item) => item.time !== undefined) || [];
  if (normalizedArr.length === 0) return [];
  const startTime = dayjs(normalizedArr?.[0].time).toDate();
  return (
    normalizedArr?.map((item) => ({
      ...item,
      time: dayjs(item?.time).diff(dayjs(startTime), "second").toString(),
    })) || []
  );
}
