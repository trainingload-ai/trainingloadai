export type TimelineTrackPoint = [
  epochMs: number,
  longitude: number,
  latitude: number,
];

export type TimelineTrackResponse =
  | { status: "available"; segments: TimelineTrackPoint[][] }
  | { status: "unavailable"; reason: "NO_TRACK" | "TOO_FRAGMENTED" };
