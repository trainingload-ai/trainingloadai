"use client";

export type MetricKey =
  | "atl"
  | "ctl"
  | "tsb"
  | "vo2Max"
  | "paceZones"
  | "acRatio"
  | "monotony"
  | "intensity"
  | "ftp"
  | "cp"
  | "pMax"
  | "tp"
  | "cs"
  | "maxHr"
  | "restingHr"
  | "lthr"
  | "weekPressure"
  | "weekCount"
  | "weekDuration"
  | "weekDistance"
  | "weekSpeed"
  | "weekPower"
  | "weekHeartRate"
  | "weekClimb"
  | "weekCalories";

export type RangeDays = "7" | "14" | "30" | "60";

export interface HistoryItem {
  date: string;
  value?: number;
  fitness?: number;
  fatigue?: number;
  form?: number;
  acRatio?: number;
  monotony?: number;
  intensity?: number;
}

export interface ManualMetricSegment {
  start: number;
  end: number;
  value: number;
}
