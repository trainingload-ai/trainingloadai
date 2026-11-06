import type { ChartXaxis } from "@/lib/store";

type DistancePoint = {
  distance?: unknown;
};

/**
 * Keep the athlete's preferred axis when the series has a usable cumulative
 * distance. Indoor, strength, and other distance-less activities fall back to
 * elapsed time without mutating the persisted preference.
 */
export function resolveActivityChartXAxis(
  preferred: ChartXaxis,
  points: readonly DistancePoint[] | null | undefined,
): ChartXaxis {
  if (preferred === "time") return "time";

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let count = 0;

  for (const point of points ?? []) {
    const distance = Number(point.distance);
    if (!Number.isFinite(distance) || distance < 0) continue;
    min = Math.min(min, distance);
    max = Math.max(max, distance);
    count += 1;
  }

  return count >= 2 && max > min ? "distance" : "time";
}
