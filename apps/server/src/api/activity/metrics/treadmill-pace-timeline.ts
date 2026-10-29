import type { CanonicalActivityRecord } from './context';

/**
 * Core Motion may deliver an entire screen-off interval in one cumulative update.
 * Reconstruct interval-average speed from distance/time, never from callback count.
 * This is an estimated pace timeline; it does not recover within-interval changes.
 */
export function treadmillPaceTimeline(
  records: CanonicalActivityRecord[],
  activity: {
    startTime?: Date | null;
    timerTime?: number | null;
    distance?: number | null;
  },
): { records: CanonicalActivityRecord[]; sampleSec: number } | null {
  const points = records
    .filter(
      (row) =>
        Number.isFinite(row.tMs) &&
        typeof row.distance === 'number' &&
        Number.isFinite(row.distance) &&
        row.distance >= 0,
    )
    .slice()
    .sort((a, b) => a.tMs - b.tMs);
  const start = activity.startTime?.getTime();
  const last = points.at(-1);
  if (
    start == null ||
    !Number.isFinite(start) ||
    !last ||
    last.tMs <= start! ||
    !Number.isFinite(activity.timerTime) ||
    !(activity.timerTime! > 0) ||
    !Number.isFinite(activity.distance) ||
    !(activity.distance! > 0)
  )
    return null;
  // A partial cumulative series cannot establish the full session's load.
  if (
    Math.abs(last.distance! - activity.distance!) >
    Math.max(1, activity.distance! * 0.01)
  )
    return null;
  const span = (last.tMs - start) / 1000;
  // Timer time removes pauses from the total. Their exact placement inside a
  // sparse interval is unknown, so the interval pace remains an estimate.
  const activeRatio = Math.min(1, activity.timerTime! / span);
  const sampleSec = Math.max(1, activity.timerTime! / 86400);
  const output: CanonicalActivityRecord[] = [];
  let previousTime = start;
  let previousDistance = 0;
  let activeSeconds = 0;
  let nextSecond = sampleSec;
  for (const point of points) {
    if (point.tMs <= previousTime) continue;
    if (point.distance! < previousDistance) return null;
    const duration = ((point.tMs - previousTime) / 1000) * activeRatio;
    const speed = (point.distance! - previousDistance) / duration;
    if (!Number.isFinite(speed) || speed > 12) return null;
    const end = activeSeconds + duration;
    while (nextSecond <= end + 1e-6) {
      const distance = previousDistance + speed * (nextSecond - activeSeconds);
      const tMs = start + nextSecond * 1000;
      output.push({
        time: new Date(tMs).toISOString(),
        tMs,
        distance,
        speed,
        enhancedSpeed: speed,
      });
      nextSecond += sampleSec;
    }
    activeSeconds = end;
    previousTime = point.tMs;
    previousDistance = point.distance!;
  }
  return output.length ? { records: output, sampleSec } : null;
}
