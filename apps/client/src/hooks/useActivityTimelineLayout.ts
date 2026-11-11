"use client";

import { useEffect, useState } from "react";
import { getBrowserLocalStorage } from "@/lib/browser-storage";

export const TIMELINE_METRICS = [
  "elevation",
  "pace",
  "speed",
  "heartRate",
  "power",
  "cadence",
  "pedaling",
  "stride",
  "stanceTime",
  "temperature",
] as const;
export type TimelineMetricId = (typeof TIMELINE_METRICS)[number];
export type TimelineRowConfig = {
  id: string;
  metric: TimelineMetricId;
  height: number;
  smoothing: number;
  color?: string;
};
export type TimelineLayout = {
  axis: "time" | "distance";
  rows: TimelineRowConfig[];
};

export function defaultTimelineLayout(running: boolean): TimelineLayout {
  const metrics: TimelineMetricId[] = running
    ? ["elevation", "pace", "heartRate", "cadence"]
    : ["elevation", "speed", "power", "heartRate", "pedaling"];
  return {
    axis: "time",
    rows: metrics.map((metric) => ({
      id: metric,
      metric,
      height: 86,
      smoothing: 0,
    })),
  };
}

export function normalizeTimelineLayout(
  value: unknown,
  running: boolean,
): TimelineLayout {
  const fallback = defaultTimelineLayout(running);
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<TimelineLayout>;
  const ids = new Set<string>();
  const rows = Array.isArray(source.rows)
    ? source.rows.flatMap((row) => {
        if (
          !row ||
          typeof row.id !== "string" ||
          ids.has(row.id) ||
          !TIMELINE_METRICS.includes(row.metric)
        )
          return [];
        ids.add(row.id);
        return [
          {
            id: row.id,
            metric: row.metric,
            height: [64, 86, 128, 180].includes(row.height) ? row.height : 86,
            smoothing: [0, 5, 10, 30, 60].includes(row.smoothing)
              ? row.smoothing
              : 0,
            ...(typeof row.color === "string" &&
            /^#[0-9a-f]{6}$/i.test(row.color)
              ? { color: row.color }
              : {}),
          },
        ];
      })
    : fallback.rows;
  return {
    axis: source.axis === "distance" ? "distance" : "time",
    rows,
  };
}

export function useActivityTimelineLayout(running: boolean) {
  const key = `activity-timeline-layout-v1:${running ? "RUN" : "CYCLING"}`;
  const [layout, setLayout] = useState(() => defaultTimelineLayout(running));
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    let loaded = defaultTimelineLayout(running);
    try {
      const stored = getBrowserLocalStorage().getItem(key);
      if (stored) loaded = normalizeTimelineLayout(JSON.parse(stored), running);
    } catch {
      /* Browsing restrictions leave layout choices usable in memory. */
    }
    setLayout(loaded);
    setLoadedKey(key);
  }, [key, running]);
  useEffect(() => {
    if (loadedKey !== key) return;
    try {
      getBrowserLocalStorage().setItem(key, JSON.stringify(layout));
    } catch {
      /* Preserve the in-memory layout. */
    }
  }, [layout, key, loadedKey]);
  return { layout, setLayout };
}
