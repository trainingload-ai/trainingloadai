/**
 * Two-parameter critical power.
 * Work (J) = CP (W) × time (s) + W′ (J),
 * which is the same line as P(t) = CP + W′ / t.
 * Two efforts solve the line. Three efforts use least squares.
 */

import {
  bodyMassLimits,
  bodyMassToKilograms,
  formatCanonicalMass,
  formatDisplayMass,
  ftpWattsPerKg,
  kilogramsToPounds,
  type FtpUnitSystem,
} from "@/lib/ftp-field";
import type { PowerZoneModel } from "@/lib/power-zones";

export type CpUnitSystem = FtpUnitSystem;

export const CP_PRESET_SECONDS = [
  180, 240, 300, 360, 480, 540, 600, 720, 900, 1200,
] as const;

export const CP_POWER_MAX_W = 2000;
export const CP_DURATION_MIN_S = 120;
export const CP_DURATION_MAX_S = 1800;
export const CP_DURATION_IDEAL_MIN_S = 180;
export const CP_DURATION_IDEAL_MAX_S = 1200;

export type CpEffort = {
  seconds: number;
  watts: number;
};

export type CpPointFit = {
  seconds: number;
  watts: number;
  predictedWatts: number;
  residualWatts: number;
};

export type CpModelFit = {
  cpWatts: number;
  wPrimeJoules: number;
  /** Null for a two-point line. R² is only meaningful once a third effort can miss. */
  rSquared: number | null;
  points: CpPointFit[];
  maxAbsResidualWatts: number;
};

export function fitCriticalPower(efforts: CpEffort[]): CpModelFit | null {
  if (efforts.length < 2 || efforts.length > 3) return null;
  const seconds = efforts.map((effort) => effort.seconds);
  if (new Set(seconds).size !== efforts.length) return null;

  const xs = seconds;
  const ys = efforts.map((effort) => effort.watts * effort.seconds);
  if (xs.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  if (ys.some((value) => !Number.isFinite(value) || value <= 0)) return null;

  const n = xs.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = xs[index]! - meanX;
    numerator += dx * (ys[index]! - meanY);
    denominator += dx * dx;
  }
  if (denominator === 0) return null;

  const cpWatts = numerator / denominator;
  const wPrimeJoules = meanY - cpWatts * meanX;
  if (!Number.isFinite(cpWatts) || !Number.isFinite(wPrimeJoules)) return null;

  let ssTot = 0;
  let ssRes = 0;
  const points = efforts.map((effort, index) => {
    const predictedWork = cpWatts * effort.seconds + wPrimeJoules;
    const predictedWatts = cpWatts + wPrimeJoules / effort.seconds;
    ssTot += (ys[index]! - meanY) ** 2;
    ssRes += (ys[index]! - predictedWork) ** 2;
    return {
      seconds: effort.seconds,
      watts: effort.watts,
      predictedWatts,
      residualWatts: effort.watts - predictedWatts,
    };
  });

  const maxAbsResidualWatts = points.reduce(
    (max, point) => Math.max(max, Math.abs(point.residualWatts)),
    0,
  );

  return {
    cpWatts,
    wPrimeJoules,
    rSquared: efforts.length >= 3 && ssTot > 0 ? 1 - ssRes / ssTot : null,
    points,
    maxAbsResidualWatts,
  };
}

export function predictPowerWatts(
  cpWatts: number,
  wPrimeJoules: number,
  seconds: number,
) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const watts = cpWatts + wPrimeJoules / seconds;
  return Number.isFinite(watts) ? watts : null;
}

export function timeToExhaustionSeconds(
  cpWatts: number,
  wPrimeJoules: number,
  targetWatts: number,
) {
  if (!(targetWatts > cpWatts) || !(wPrimeJoules > 0)) return null;
  const seconds = wPrimeJoules / (targetWatts - cpWatts);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function roundCpWatts(cpWatts: number) {
  return Math.round(cpWatts);
}

export function formatWPrimeKj(joules: number) {
  return (Math.max(0, joules) / 1000).toFixed(1);
}

export function formatRSquared(rSquared: number) {
  return rSquared.toFixed(3);
}

export function formatClock(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const remain = whole % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

export function cpWattsPerKg(roundedCpWatts: number, weightKg: number) {
  return ftpWattsPerKg(roundedCpWatts, weightKg);
}

export function cpZonesSearch(
  cpWatts: number,
  model: PowerZoneModel = "FRIEL",
) {
  return new URLSearchParams({
    model: model.toLowerCase(),
    baseType: "cp",
    base: String(Math.round(cpWatts)),
  }).toString();
}

export function cpZonesHref(
  prefix: string,
  cpWatts: number,
  model: PowerZoneModel = "FRIEL",
) {
  return `${prefix}/power-zones-calculator?${cpZonesSearch(cpWatts, model)}`;
}

export type CpEffortDraft = {
  preset: string;
  minutes: string;
  watts: string;
};

export type CpQueryState = {
  efforts: [CpEffortDraft, CpEffortDraft, CpEffortDraft];
  weightKg: string;
  units: CpUnitSystem;
};

const DEFAULT_EFFORTS: CpQueryState["efforts"] = [
  { preset: "180", minutes: "", watts: "" },
  { preset: "720", minutes: "", watts: "" },
  { preset: "unset", minutes: "", watts: "" },
];

function searchParamsFrom(search: string) {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw);
}

function readTypedDecimal(raw: string | null) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 8 || trimmed === ".") return null;
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;
  return trimmed;
}

export function secondsFromDraft(draft: CpEffortDraft) {
  if (draft.preset === "custom") {
    const minutes = Number(draft.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return Math.round(minutes * 60);
  }
  if (!/^\d+$/.test(draft.preset)) return null;
  const seconds = Number(draft.preset);
  return seconds > 0 ? seconds : null;
}

export function presetFromSeconds(
  seconds: number,
): Pick<CpEffortDraft, "preset" | "minutes"> {
  if ((CP_PRESET_SECONDS as readonly number[]).includes(seconds)) {
    return { preset: String(seconds), minutes: "" };
  }
  const minutes = seconds / 60;
  const shown = Number.isInteger(minutes)
    ? String(minutes)
    : String(Math.round(minutes * 10) / 10);
  return { preset: "custom", minutes: shown };
}

export function parseCpQuery(search: string): CpQueryState {
  const params = searchParamsFrom(search);
  const units =
    params.get("units")?.trim().toLowerCase() === "imperial"
      ? "imperial"
      : "metric";
  const efforts = DEFAULT_EFFORTS.map((draft, index) => {
    const slot = index + 1;
    const secondsRaw = readTypedDecimal(params.get(`t${slot}`));
    const watts = readTypedDecimal(params.get(`p${slot}`)) ?? "";
    if (!secondsRaw && !watts) return { ...draft, watts };
    const seconds = secondsRaw ? Number(secondsRaw) : null;
    if (seconds == null || !Number.isFinite(seconds)) {
      return { preset: "unset", minutes: "", watts };
    }
    return { ...presetFromSeconds(Math.round(seconds)), watts };
  }) as CpQueryState["efforts"];

  return {
    efforts,
    weightKg: readTypedDecimal(params.get("w")) ?? "",
    units,
  };
}

function effortIsDefault(draft: CpEffortDraft, fallback: CpEffortDraft) {
  return (
    draft.preset === fallback.preset &&
    draft.minutes.trim() === fallback.minutes &&
    draft.watts.trim() === ""
  );
}

export function buildCpSearch(currentSearch: string, state: CpQueryState) {
  const params = searchParamsFrom(currentSearch);
  for (const key of ["t1", "p1", "t2", "p2", "t3", "p3", "w", "units"]) {
    params.delete(key);
  }

  state.efforts.forEach((draft, index) => {
    const fallback = DEFAULT_EFFORTS[index]!;
    if (effortIsDefault(draft, fallback)) return;
    const seconds = secondsFromDraft(draft);
    const slot = index + 1;
    if (seconds != null) params.set(`t${slot}`, String(seconds));
    if (draft.watts.trim()) params.set(`p${slot}`, draft.watts.trim());
  });

  if (state.weightKg.trim()) params.set("w", state.weightKg.trim());
  if (state.units === "imperial") params.set("units", "imperial");

  const search = params.toString();
  return search ? `?${search}` : "";
}

export function displayMassFromKg(kgText: string, units: CpUnitSystem) {
  const kg = Number(kgText);
  if (!kgText.trim() || !Number.isFinite(kg) || kg <= 0) return "";
  return formatDisplayMass(units === "imperial" ? kilogramsToPounds(kg) : kg);
}

export function canonicalKgFromDisplay(value: string, units: CpUnitSystem) {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed) || parsed <= 0) return "";
  return formatCanonicalMass(bodyMassToKilograms(parsed, units));
}

export { bodyMassLimits };
