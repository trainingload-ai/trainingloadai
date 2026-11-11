export type TimelineTrackPoint = [
  epochMs: number,
  longitude: number,
  latitude: number,
];

export type TimelineTrackResponse =
  | { status: "available"; segments: TimelineTrackPoint[][] }
  | { status: "unavailable"; reason: "NO_TRACK" | "TOO_FRAGMENTED" };

/** User analysis boundaries in elapsed seconds; imported laps stay unchanged. */
export type TimelineSegment = {
  id: string;
  name: string;
  start: number;
  end: number;
};

export type TimelineSegmentsResponse = {
  revision: number;
  segments: TimelineSegment[] | null;
};

export function validTimelineSegments(
  value: unknown,
  duration: number,
): value is TimelineSegment[] {
  if (
    !Array.isArray(value) ||
    value.length > 512 ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    return false;
  const ids = new Set<string>();
  let previousEnd = 0;
  for (const segment of value) {
    if (
      !segment ||
      typeof segment !== "object" ||
      typeof segment.id !== "string" ||
      !/^[\w:-]{1,80}$/.test(segment.id) ||
      ids.has(segment.id) ||
      typeof segment.name !== "string" ||
      segment.name.length > 80 ||
      !Number.isFinite(segment.start) ||
      !Number.isFinite(segment.end) ||
      segment.start < previousEnd ||
      segment.end <= segment.start ||
      segment.end > duration + 0.001
    )
      return false;
    ids.add(segment.id);
    previousEnd = segment.end;
  }
  return true;
}
