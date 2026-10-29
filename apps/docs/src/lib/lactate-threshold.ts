import {
  computeVdotForDistanceTime,
  isSupportedVdot,
  resolveVdotPaceRange,
  solveSpeedForVo2Demand,
} from "@shared/vdot";
import { RACE_DISTANCES_KM, type RacePreset } from "@/lib/running-pace";

/**
 * Field heuristics for an LT1 band as a fraction of the LT2 estimate.
 * These are coaching ranges, not lab lactate turnpoints.
 *
 * Heart rate matches Friel zone 2 (81% inclusive, 90% exclusive), the same
 * aerobic band the zone-2 and heart-rate zone tools already use from LTHR.
 * Power uses a 70–80% heuristic; pace uses 82–90% of threshold speed.
 * These fixed ratios do not identify an individual's physiological LT1.
 */
export const LT1_HEART_RATE_PERCENT = { min: 81, max: 89 } as const;
export const LT1_POWER_PERCENT = { min: 70, max: 80 } as const;
export const LT1_PACE_SPEED_PERCENT = { min: 82, max: 90 } as const;

/** Midpoint of the Daniels threshold band (83–88% of VO2max) in packages/shared/vdot.ts. */
export const RACE_LT2_VO2_FRACTION = 0.855;

export const RACE_PRESET_KEYS = [
  "5k",
  "10k",
  "half",
  "marathon",
  "custom",
] as const;
export type RacePresetKey = (typeof RACE_PRESET_KEYS)[number];
export type StandardRacePreset = RacePreset;
export type PowerProtocol = "20MIN" | "8MIN" | "60MIN";

export type RaceThresholdEstimate = {
  secPerKm: number;
  vdot: number;
  /** False when the race falls outside the VDOT model range (20–85). */
  vdotSupported: boolean;
};

export type InclusiveRange = {
  min: number;
  max: number;
};

export type PaceBand = {
  fastSecPerKm: number;
  slowSecPerKm: number;
};

export function standardRaceDistanceKm(preset: StandardRacePreset) {
  return RACE_DISTANCES_KM[preset];
}

export function estimateFtpFromProtocol(
  avgPower: number,
  protocol: PowerProtocol,
) {
  if (!Number.isFinite(avgPower) || avgPower <= 0) return null;
  if (protocol === "60MIN") return Math.round(avgPower);
  if (protocol === "8MIN") return Math.round(avgPower * 0.9);
  return Math.round(avgPower * 0.95);
}

/**
 * LT2-style pace from a recent race.
 * Inside the supported VDOT range this is the midpoint of the same T band
 * (83–88% of race-derived VO2max) the VDOT calculator already shows.
 * Outside that range it falls back to the same midpoint fraction directly.
 */
export function estimateLt2PaceFromRace(
  distanceKm: number,
  timeSeconds: number,
): RaceThresholdEstimate | null {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) return null;

  const vdot = computeVdotForDistanceTime(distanceKm * 1000, timeSeconds);
  if (vdot == null) return null;

  if (isSupportedVdot(vdot)) {
    const range = resolveVdotPaceRange(vdot, "T");
    const secPerKm = Math.round((range.fastSecPerKm + range.slowSecPerKm) / 2);
    if (secPerKm <= 0) return null;
    return { secPerKm, vdot, vdotSupported: true };
  }

  const speedMetersPerMinute = solveSpeedForVo2Demand(
    vdot * RACE_LT2_VO2_FRACTION,
  );
  if (!speedMetersPerMinute) return null;
  const secPerKm = Math.round((1000 / speedMetersPerMinute) * 60);
  if (secPerKm <= 0) return null;
  return { secPerKm, vdot, vdotSupported: false };
}

export function lt1HeartRateBand(lthr: number): InclusiveRange | null {
  if (!Number.isFinite(lthr) || lthr <= 0) return null;
  const anchor = Math.round(lthr);
  const min = Math.round((LT1_HEART_RATE_PERCENT.min / 100) * anchor);
  const max = Math.round(((LT1_HEART_RATE_PERCENT.max + 1) / 100) * anchor) - 1;
  if (min <= 0 || max < min) return null;
  return { min, max: Math.min(max, anchor - 1) };
}

export function lt1PowerBand(thresholdWatts: number): InclusiveRange | null {
  if (!Number.isFinite(thresholdWatts) || thresholdWatts <= 0) return null;
  const anchor = Math.round(thresholdWatts);
  const min = Math.round((LT1_POWER_PERCENT.min / 100) * anchor);
  const max = Math.round((LT1_POWER_PERCENT.max / 100) * anchor);
  if (min <= 0 || max < min) return null;
  return { min, max: Math.min(max, Math.max(min, anchor - 1)) };
}

export function lt1PaceBand(lt2SecPerKm: number): PaceBand | null {
  if (!Number.isFinite(lt2SecPerKm) || lt2SecPerKm <= 0) return null;
  const lt2 = Math.round(lt2SecPerKm);
  const fast = Math.max(
    lt2 + 1,
    Math.round(lt2 / (LT1_PACE_SPEED_PERCENT.max / 100)),
  );
  const slow = Math.max(
    fast + 1,
    Math.round(lt2 / (LT1_PACE_SPEED_PERCENT.min / 100)),
  );
  return { fastSecPerKm: fast, slowSecPerKm: slow };
}

/** Representative recent-race times for the crawlable threshold-pace chart. */
export const THRESHOLD_PACE_CHART_SEEDS = [
  { preset: "5k", timeSeconds: 18 * 60 },
  { preset: "5k", timeSeconds: 20 * 60 },
  { preset: "5k", timeSeconds: 22 * 60 },
  { preset: "5k", timeSeconds: 25 * 60 },
  { preset: "10k", timeSeconds: 38 * 60 },
  { preset: "10k", timeSeconds: 42 * 60 },
  { preset: "10k", timeSeconds: 45 * 60 },
  { preset: "10k", timeSeconds: 50 * 60 },
  { preset: "half", timeSeconds: 85 * 60 },
  { preset: "half", timeSeconds: 95 * 60 },
  { preset: "half", timeSeconds: 105 * 60 },
  { preset: "half", timeSeconds: 120 * 60 },
  { preset: "marathon", timeSeconds: 3 * 3600 },
  { preset: "marathon", timeSeconds: 3.5 * 3600 },
  { preset: "marathon", timeSeconds: 4 * 3600 },
  { preset: "marathon", timeSeconds: 4.5 * 3600 },
] as const satisfies readonly {
  preset: StandardRacePreset;
  timeSeconds: number;
}[];

export type ThresholdPaceChartRow = {
  preset: StandardRacePreset;
  timeSeconds: number;
  secPerKm: number;
  split400Seconds: number;
  split1600Seconds: number;
};

/** Split time at LT2 pace. 400 m and 1600 m are the chart columns. */
export function paceSplitSeconds(secPerKm: number, meters: number) {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return null;
  if (!Number.isFinite(meters) || meters <= 0) return null;
  const seconds = Math.round((secPerKm * meters) / 1000);
  if (seconds <= 0) return null;
  return seconds;
}

export function buildThresholdPaceChart(
  seeds: readonly {
    preset: StandardRacePreset;
    timeSeconds: number;
  }[] = THRESHOLD_PACE_CHART_SEEDS,
): ThresholdPaceChartRow[] {
  const rows: ThresholdPaceChartRow[] = [];
  for (const seed of seeds) {
    const estimate = estimateLt2PaceFromRace(
      standardRaceDistanceKm(seed.preset),
      seed.timeSeconds,
    );
    if (!estimate) continue;
    const split400Seconds = paceSplitSeconds(estimate.secPerKm, 400);
    const split1600Seconds = paceSplitSeconds(estimate.secPerKm, 1600);
    if (split400Seconds == null || split1600Seconds == null) continue;
    rows.push({
      preset: seed.preset,
      timeSeconds: seed.timeSeconds,
      secPerKm: estimate.secPerKm,
      split400Seconds,
      split1600Seconds,
    });
  }
  return rows;
}
