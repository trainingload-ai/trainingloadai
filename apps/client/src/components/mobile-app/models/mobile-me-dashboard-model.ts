import { palette as tokenPalette } from '@trainingloadai/design-tokens/colors';
import type { MobileMeMetric, MobileMeRange } from "./mobile-me-model";

export type MobileMeSport =
  | "ALL"
  | "RUN"
  | "CYCLING"
  | "SWIM"
  | "FITNESS";

export const MOBILE_ME_RANGES: readonly MobileMeRange[] = [4, 8, 12];

export const MOBILE_ME_SPORTS: readonly MobileMeSport[] = [
  "ALL",
  "RUN",
  "CYCLING",
  "SWIM",
  "FITNESS",
];

export const MOBILE_ME_FITNESS_DEFINITIONS = new Set([
  "STRENGTH_TRAINING",
  "STRETCHING",
  "HIIT",
  "YOGA",
  "ROWING",
  "ELLIPTICAL",
]);

export const MOBILE_ME_METRIC_COLORS: Record<MobileMeMetric, string> = {
  count: tokenPalette["emerald-500"],
  distance: tokenPalette["sky-500"],
  duration: tokenPalette["violet-500"],
  load: tokenPalette["amber-500"],
  ascent: tokenPalette["green-500"],
  calories: tokenPalette["orange-500"],
  avgSpeed: tokenPalette["cyan-500"],
  avgHeartRate: tokenPalette["red-500"],
  avgPower: tokenPalette["indigo-500"],
  avgCadence: tokenPalette["purple-500"],
};
