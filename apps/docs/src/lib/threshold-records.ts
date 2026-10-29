export type ThresholdRecord = {
  seconds: number;
  heartRate?: number;
  power?: number;
  distance?: number;
};

export type ThresholdFileMetric = "RACE" | "HEART_RATE" | "POWER" | "PACE";
export type ThresholdFileEstimate = {
  metric: ThresholdFileMetric;
  seconds: number;
  distanceKm?: number;
  average?: number;
  startSeconds: number;
  endSeconds: number;
};

/** Average recorded intervals by elapsed time; do not fill sensor dropouts. */
export function thresholdWindowAverage(
  records: ThresholdRecord[],
  key: "heartRate" | "power",
  start: number,
  end: number,
) {
  let covered = 0;
  let total = 0;
  for (let index = 0; index < records.length - 1; index++) {
    const point = records[index];
    const next = records[index + 1];
    const value = point[key];
    const gap = next.seconds - point.seconds;
    if (gap <= 0 || gap > 10 || value == null || !Number.isFinite(value))
      continue;
    if (value < 0 || (key === "heartRate" && value === 0)) continue;
    const duration = Math.max(
      0,
      Math.min(end, next.seconds) - Math.max(start, point.seconds),
    );
    covered += duration;
    total += value * duration;
  }
  if (end <= start || covered < (end - start) * 0.95) return null;
  return total / covered;
}

function distanceAt(records: ThresholdRecord[], seconds: number) {
  for (let index = 0; index < records.length; index++) {
    const point = records[index];
    if (point.seconds === seconds && point.distance != null)
      return point.distance;
    const next = records[index + 1];
    if (!next || point.seconds > seconds || next.seconds < seconds) continue;
    if (
      point.distance == null ||
      next.distance == null ||
      next.seconds - point.seconds > 10
    )
      return null;
    if (next.distance < point.distance) return null;
    return (
      point.distance +
      ((seconds - point.seconds) / (next.seconds - point.seconds)) *
        (next.distance - point.distance)
    );
  }
  return null;
}

export function estimateThresholdWindow(
  records: ThresholdRecord[],
  metric: ThresholdFileMetric,
  start: number,
  end: number,
): ThresholdFileEstimate | null {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    end > (records.at(-1)?.seconds ?? 0)
  )
    return null;
  const seconds = end - start;
  if (metric === "HEART_RATE" || metric === "POWER") {
    if (seconds < 1200) return null;
    // Heart-rate estimate uses the final 20 minutes of the selected segment.
    // Power always uses a complete 20-minute window and the existing 0.95 factor.
    const sampleStart = metric === "HEART_RATE" ? end - 1200 : start;
    const sampleEnd = sampleStart + 1200;
    const average = thresholdWindowAverage(
      records,
      metric === "HEART_RATE" ? "heartRate" : "power",
      sampleStart,
      sampleEnd,
    );
    if (average == null || average <= 0) return null;
    return {
      metric,
      seconds: 1200,
      average,
      startSeconds: sampleStart,
      endSeconds: sampleEnd,
    };
  }
  const first = distanceAt(records, start);
  const last = distanceAt(records, end);
  if (first == null || last == null || last <= first) return null;
  const points = records.filter(
    (point) =>
      point.seconds >= start && point.seconds <= end && point.distance != null,
  );
  if (
    points.some(
      (point, index) =>
        index > 0 && point.distance! < points[index - 1].distance!,
    )
  )
    return null;
  return {
    metric,
    seconds,
    distanceKm: (last - first) / 1000,
    startSeconds: start,
    endSeconds: end,
  };
}

/** Colon-formatted duration; mm:ss can exceed 59 minutes. */
export function parseThresholdDuration(value: string) {
  const parts = value.trim().split(":");
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((part) => !/^\d+$/.test(part))
  )
    return null;
  const values = parts.map(Number);
  const seconds = values.at(-1)!;
  const minutes = values.at(-2)!;
  if (seconds >= 60 || (parts.length === 3 && minutes >= 60)) return null;
  const total =
    (parts.length === 3 ? values[0] * 3600 : 0) + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? total : null;
}
