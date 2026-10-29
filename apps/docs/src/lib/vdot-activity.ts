import { computeVdotForDistanceTime } from "@shared/vdot";
import {
  estimateThresholdWindow,
  type ThresholdRecord,
} from "./threshold-records";
import { displayVdot } from "./vdot-calculator";

/** Standard race windows from 1500 m through the marathon. */
export const VDOT_RACE_DISTANCES_M = [
  1500, 1609.344, 3000, 5000, 10000, 15000, 21097.5, 42195,
] as const;

export const VDOT_MIN_RACE_M = 1500;
export const VDOT_MAX_RACE_M = 42195;

export type VdotWindowMode = "whole" | "best";

export type VdotActivityEstimate = {
  mode: VdotWindowMode;
  distanceM: number;
  timeSec: number;
  startSeconds: number;
  endSeconds: number;
  /** Display VDOT, rounded once. A non-maximal effort stays low; nothing is added back. */
  vdot: number;
};

/**
 * Score a run the user already has.
 *
 * The activity is the evidence. `whole` uses the full recording when its
 * distance sits between 1500 m and the marathon. `best` scans the standard
 * race distances inside that recording and keeps the highest VDOT window.
 * A gap over 10 s, a distance regression, or coverage that `estimateThresholdWindow`
 * rejects means that particular window cannot be scored. It does not mean the
 * activity is useless, and it is not a request to go run another test.
 * Not racing the effort lowers the VDOT. There is no correction for how much
 * was left in reserve.
 */
export function estimateVdotFromActivity(
  records: ThresholdRecord[],
  mode: VdotWindowMode,
): VdotActivityEstimate | null {
  if (records.length < 2) return null;
  if (mode === "whole") return scoreWholeActivity(records);

  let best: VdotActivityEstimate | null = null;
  for (const distanceM of VDOT_RACE_DISTANCES_M) {
    const candidate = bestWindowForDistance(records, distanceM);
    if (candidate && (best == null || candidate.vdot > best.vdot)) {
      best = candidate;
    }
  }
  return best;
}

function hasUnusableGap(
  records: ThresholdRecord[],
  startSeconds: number,
  endSeconds: number,
) {
  const inside = records.filter(
    (point) => point.seconds >= startSeconds && point.seconds <= endSeconds,
  );
  for (let index = 1; index < inside.length; index += 1) {
    if (inside[index].seconds - inside[index - 1].seconds > 10) return true;
  }
  return false;
}

function scoreWholeActivity(
  records: ThresholdRecord[],
): VdotActivityEstimate | null {
  const startSeconds = records[0].seconds;
  const endSeconds = records[records.length - 1].seconds;
  if (hasUnusableGap(records, startSeconds, endSeconds)) return null;
  const window = estimateThresholdWindow(records, "RACE", startSeconds, endSeconds);
  if (!window?.distanceKm) return null;
  const distanceM = window.distanceKm * 1000;
  if (distanceM < VDOT_MIN_RACE_M || distanceM > VDOT_MAX_RACE_M) return null;
  const vdot = displayVdot(computeVdotForDistanceTime(distanceM, window.seconds));
  if (vdot == null) return null;
  return {
    mode: "whole",
    distanceM,
    timeSec: window.seconds,
    startSeconds: window.startSeconds,
    endSeconds: window.endSeconds,
    vdot,
  };
}

function bestWindowForDistance(
  records: ThresholdRecord[],
  targetM: number,
): VdotActivityEstimate | null {
  let best: VdotActivityEstimate | null = null;
  let endIndex = 1;

  for (let startIndex = 0; startIndex < records.length; startIndex += 1) {
    const start = records[startIndex];
    if (start.distance == null) continue;
    const goal = start.distance + targetM;

    while (endIndex < records.length) {
      const point = records[endIndex];
      if (!point || point.distance == null || point.distance < goal) {
        endIndex += 1;
        continue;
      }
      break;
    }
    if (endIndex >= records.length) break;

    const next = records[endIndex];
    const prev = records[endIndex - 1];
    if (!next || !prev) continue;
    if (
      next.distance == null ||
      prev?.distance == null ||
      next.distance < prev.distance ||
      next.seconds - prev.seconds <= 0 ||
      next.seconds - prev.seconds > 10
    ) {
      continue;
    }

    const span = next.distance - prev.distance;
    const ratio = span === 0 ? 0 : (goal - prev.distance) / span;
    const endSeconds = prev.seconds + ratio * (next.seconds - prev.seconds);
    if (hasUnusableGap(records, start.seconds, endSeconds)) continue;
    const window = estimateThresholdWindow(
      records,
      "RACE",
      start.seconds,
      endSeconds,
    );
    if (!window?.distanceKm) continue;
    const distanceM = window.distanceKm * 1000;
    const vdot = displayVdot(
      computeVdotForDistanceTime(distanceM, window.seconds),
    );
    if (vdot == null) continue;
    if (best == null || vdot > best.vdot) {
      best = {
        mode: "best",
        distanceM,
        timeSec: window.seconds,
        startSeconds: window.startSeconds,
        endSeconds: window.endSeconds,
        vdot,
      };
    }
  }

  return best;
}
