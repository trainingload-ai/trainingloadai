"use client";

import type { ActivityPeakMetric } from "@/api/activities";
import React from "react";

type ActivityAnalysisLinkValue = {
  setHoveredDistanceM: (distance: number | null) => void;
  selectedInterval: ActivityPeakMetric | null;
  setSelectedInterval: (interval: ActivityPeakMetric | null) => void;
};

const ActivityAnalysisLinkContext =
  React.createContext<ActivityAnalysisLinkValue>({
    setHoveredDistanceM: () => undefined,
    selectedInterval: null,
    setSelectedInterval: () => undefined,
  });

export function ActivityAnalysisLinkProvider({
  children,
}: React.PropsWithChildren) {
  const [selectedInterval, setSelectedInterval] =
    React.useState<ActivityPeakMetric | null>(null);
  const setHoveredDistanceM = React.useCallback((distance: number | null) => {
    window.dispatchEvent(
      new CustomEvent("activity-analysis-distance", { detail: distance }),
    );
  }, []);
  const value = React.useMemo(
    () => ({
      setHoveredDistanceM,
      selectedInterval,
      setSelectedInterval,
    }),
    [selectedInterval, setHoveredDistanceM],
  );
  return (
    <ActivityAnalysisLinkContext.Provider value={value}>
      {children}
    </ActivityAnalysisLinkContext.Provider>
  );
}

export function useActivityAnalysisLink() {
  return React.useContext(ActivityAnalysisLinkContext);
}

export function useActivityMapFocusDistance() {
  const [distance, setDistance] = React.useState<number | null>(null);
  React.useEffect(() => {
    const listener = (event: Event) => {
      const value = (event as CustomEvent<number | null>).detail;
      setDistance(
        typeof value === "number" && Number.isFinite(value) ? value : null,
      );
    };
    window.addEventListener("activity-analysis-distance", listener);
    return () =>
      window.removeEventListener("activity-analysis-distance", listener);
  }, []);
  return distance;
}

export function selectedIntervalRange(
  interval: ActivityPeakMetric | null,
  chartXaxis: string,
  metricType: ActivityPeakMetric["type"],
): [number, number] | null {
  if (!interval || interval.type !== metricType) return null;
  const range =
    chartXaxis === "distance"
      ? [interval.startDistanceM, interval.endDistanceM]
      : [interval.startElapsedSec, interval.endElapsedSec];
  if (
    typeof range[0] !== "number" ||
    !Number.isFinite(range[0]) ||
    typeof range[1] !== "number" ||
    !Number.isFinite(range[1]) ||
    range[1] <= range[0]
  ) {
    return null;
  }
  const width = range[1] - range[0];
  const padding = Math.max(width * 0.08, chartXaxis === "distance" ? 10 : 2);
  return [Math.max(0, range[0] - padding), range[1] + padding];
}
