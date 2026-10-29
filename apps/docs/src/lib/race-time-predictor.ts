import {
  VDOT_MAX,
  VDOT_MIN,
  computeVdotForDistanceTime,
  formatRaceDuration,
  isSupportedVdot,
  predictTimeForVdot,
} from "@shared/vdot";
import {
  KM_PER_MILE,
  RACE_DISTANCES_KM,
  isValidDistanceKm,
  isValidPaceSecPerKm,
  kmToDistance,
  pacePartsToSeconds,
  paceToSecPerKm,
  parsePositiveNumber,
  raceDistanceKm,
  secPerKmToPace,
  solveTimeSec,
  timePartsToSeconds,
  type DistanceUnit,
  type PaceUnit,
  type RacePreset,
} from "./running-pace";
import {
  estimateThresholdWindow,
  type ThresholdRecord,
} from "./threshold-records";

export const PREDICT_RACE_KEYS = ["5k", "10k", "half", "marathon"] as const;

export type PredictRaceKey = (typeof PREDICT_RACE_KEYS)[number];

/** Daniels' published table steps by 0.1 VDOT. Round the score once, then look up. */
export function roundVdot(value: number) {
  return Math.round(value * 10) / 10;
}

export type PredictedRaceRow = {
  key: PredictRaceKey | "custom";
  distanceKm: number;
  timeSec: number | null;
  paceSecPerKm: number | null;
  isSource: boolean;
};

export type RaceTimePrediction = {
  /** Unrounded score from `computeVdotForDistanceTime`. Display rounds once. */
  vdot: number | null;
  vdotSupported: boolean;
  sourceDistanceKm: number;
  sourceTimeSec: number;
  rows: PredictedRaceRow[];
};

function sameDistance(a: number, b: number) {
  return Math.abs(a - b) < 0.0005;
}

export function sourceTimeFromPace(
  distanceKm: number,
  paceSecPerKm: number,
): number | null {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(paceSecPerKm)) return null;
  if (!isValidPaceSecPerKm(paceSecPerKm)) return null;
  return solveTimeSec(distanceKm, paceSecPerKm);
}

export function predictRaceTimes(input: {
  distanceKm: number;
  timeSec: number;
  customDistanceKm?: number | null;
}): RaceTimePrediction | null {
  if (
    !isValidDistanceKm(input.distanceKm) ||
    !Number.isFinite(input.timeSec) ||
    input.timeSec <= 0
  ) {
    return null;
  }

  const rawVdot = computeVdotForDistanceTime(
    input.distanceKm * 1000,
    input.timeSec,
  );
  const vdot = rawVdot != null && Number.isFinite(rawVdot) ? rawVdot : null;
  const tableVdot = vdot == null ? null : roundVdot(vdot);
  const vdotSupported = tableVdot != null && isSupportedVdot(tableVdot);

  const targets: Array<{ key: PredictedRaceRow["key"]; distanceKm: number }> = [
    { key: "5k", distanceKm: RACE_DISTANCES_KM["5k"] },
    { key: "10k", distanceKm: RACE_DISTANCES_KM["10k"] },
    { key: "half", distanceKm: RACE_DISTANCES_KM.half },
    { key: "marathon", distanceKm: RACE_DISTANCES_KM.marathon },
  ];

  if (
    input.customDistanceKm != null &&
    isValidDistanceKm(input.customDistanceKm) &&
    !targets.some((row) => sameDistance(row.distanceKm, input.customDistanceKm!))
  ) {
    targets.push({ key: "custom", distanceKm: input.customDistanceKm });
  }

  const rows = targets.map((target) => {
    const predicted = vdotSupported
      ? predictTimeForVdot(target.distanceKm * 1000, tableVdot)
      : null;
    const timeSec =
      predicted != null && Number.isFinite(predicted) && predicted > 0
        ? predicted
        : null;
    return {
      key: target.key,
      distanceKm: target.distanceKm,
      timeSec,
      paceSecPerKm: timeSec != null ? timeSec / target.distanceKm : null,
      isSource: sameDistance(target.distanceKm, input.distanceKm),
    };
  });

  return {
    vdot,
    vdotSupported,
    sourceDistanceKm: input.distanceKm,
    sourceTimeSec: input.timeSec,
    rows,
  };
}

/** Source row keeps the typed time. Other rows stay float until display. */
export function displayedRaceTimeSec(
  row: PredictedRaceRow,
  sourceTimeSec: number | null,
) {
  if (row.isSource && sourceTimeSec != null && sourceTimeSec > 0) {
    return sourceTimeSec;
  }
  return row.timeSec;
}

export function displayedRacePaceSecPerKm(
  row: PredictedRaceRow,
  source: { sourceTimeSec: number; sourceDistanceKm: number } | null,
) {
  if (row.isSource && source && source.sourceDistanceKm > 0) {
    return source.sourceTimeSec / source.sourceDistanceKm;
  }
  return row.paceSecPerKm;
}

/** One rounding, at display. */
export function formatPredictedClock(totalSeconds: number) {
  return formatRaceDuration(totalSeconds);
}

export { VDOT_MAX, VDOT_MIN };

export type DistanceGap = "close" | "step" | "large";

export type RaceTimeShareState = {
  mode: "race" | "pace";
  preset: RacePreset | "custom";
  unit: DistanceUnit;
  hours: string;
  minutes: string;
  seconds: string;
  paceMinutes: string;
  paceSeconds: string;
  paceUnit: PaceUnit;
  distance: string;
  target: string;
  example: boolean;
};

export const EMPTY_RACE_TIME_SHARE: RaceTimeShareState = {
  mode: "race",
  preset: "10k",
  unit: "km",
  hours: "",
  minutes: "",
  seconds: "",
  paceMinutes: "",
  paceSeconds: "",
  paceUnit: "min_per_km",
  distance: "",
  target: "",
  example: false,
};

/** Shown only after the user clicks the example action (`example=1`). */
export const EXAMPLE_RACE_TIME_SHARE: RaceTimeShareState = {
  ...EMPTY_RACE_TIME_SHARE,
  minutes: "50",
  seconds: "00",
  example: true,
};

/** @deprecated Use EMPTY_RACE_TIME_SHARE. Kept so older imports fail closed. */
export const DEFAULT_RACE_TIME_SHARE = EMPTY_RACE_TIME_SHARE;

const SHARE_KEYS = [
  "mode",
  "race",
  "unit",
  "h",
  "m",
  "s",
  "pm",
  "ps",
  "pu",
  "d",
  "target",
  "example",
] as const;

const FIELD_MAX = 32;
const QUERY_MAX = 360;

function searchParams(search: string) {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw);
}

function clipField(value: string) {
  return value.trim().slice(0, FIELD_MAX);
}

/**
 * Ratio of the longer distance to the shorter one.
 * `>= 3` large, `>= 1.8` step, otherwise close. Non-positive inputs are close.
 */
export function distanceGap(sourceKm: number, targetKm: number): DistanceGap {
  if (!(sourceKm > 0) || !(targetKm > 0) || !Number.isFinite(sourceKm) || !Number.isFinite(targetKm)) {
    return "close";
  }
  const ratio = Math.max(sourceKm, targetKm) / Math.min(sourceKm, targetKm);
  if (ratio >= 3) return "large";
  if (ratio >= 1.8) return "step";
  return "close";
}

export function highlightedRaceKey(
  rows: PredictedRaceRow[],
): PredictedRaceRow["key"] {
  if (rows.some((row) => row.key === "custom")) return "custom";
  return "marathon";
}

export function distanceKmFromInput(text: string, unit: DistanceUnit) {
  const value = parsePositiveNumber(text);
  if (value == null) return null;
  const km = unit === "mi" ? value * KM_PER_MILE : value;
  return isValidDistanceKm(km) ? km : null;
}

export function formatDistanceInput(km: number, unit: DistanceUnit) {
  const value = kmToDistance(km, unit);
  return String(Number(value.toFixed(6)));
}

export function convertDistanceInput(
  text: string,
  from: DistanceUnit,
  to: DistanceUnit,
) {
  if (from === to) return text;
  const km = distanceKmFromInput(text, from);
  if (km == null) return text;
  return formatDistanceInput(km, to);
}

export function convertPaceInput(
  minutes: string,
  seconds: string,
  from: PaceUnit,
  to: PaceUnit,
) {
  if (from === to) return { minutes, seconds };
  const perUnit = pacePartsToSeconds({
    minutes: Number(minutes || 0),
    seconds: Number(seconds || 0),
  });
  if (perUnit == null) return { minutes, seconds };
  const perKm = paceToSecPerKm(perUnit, from);
  const next = secPerKmToPace(perKm, to);
  let wholeMinutes = Math.floor(next / 60);
  let remainder = Number((next - wholeMinutes * 60).toFixed(3));
  if (remainder >= 60) {
    wholeMinutes += 1;
    remainder = 0;
  }
  return {
    minutes: String(wholeMinutes),
    seconds: String(remainder),
  };
}

export function presetForDistanceKm(distanceKm: number): RacePreset | null {
  for (const key of PREDICT_RACE_KEYS) {
    if (sameDistance(raceDistanceKm(key), distanceKm)) return key;
  }
  return null;
}

export function sourceDistanceKm(state: RaceTimeShareState) {
  if (state.preset !== "custom") return raceDistanceKm(state.preset);
  return distanceKmFromInput(state.distance, state.unit);
}

export function predictFromShare(
  state: RaceTimeShareState,
): RaceTimePrediction | null {
  const distanceKm = sourceDistanceKm(state);
  if (distanceKm == null) return null;
  const timeSec =
    state.mode === "race"
      ? timePartsToSeconds({
          hours: Number(state.hours || 0),
          minutes: Number(state.minutes || 0),
          seconds: Number(state.seconds || 0),
        })
      : sourceTimeFromPace(
          distanceKm,
          paceToSecPerKm(
            pacePartsToSeconds({
              minutes: Number(state.paceMinutes || 0),
              seconds: Number(state.paceSeconds || 0),
            }) ?? Number.NaN,
            state.paceUnit,
          ),
        );
  if (timeSec == null) return null;
  return predictRaceTimes({
    distanceKm,
    timeSec,
    customDistanceKm: state.target.trim()
      ? distanceKmFromInput(state.target, state.unit)
      : null,
  });
}

export function clockPartsFromSeconds(total: number) {
  if (!Number.isFinite(total) || total <= 0) {
    return { hours: "", minutes: "", seconds: "" };
  }
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total - hours * 3600) / 60);
  const seconds = Number((total - hours * 3600 - minutes * 60).toFixed(3));
  return {
    hours: hours > 0 ? String(hours) : "",
    minutes: String(minutes),
    seconds: String(seconds),
  };
}

type ShareParamSource = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > FIELD_MAX) return null;
  return text;
}

function paramsRecord(search: string): ShareParamSource {
  const params = searchParams(search);
  const record: ShareParamSource = {};
  for (const key of SHARE_KEYS) {
    const value = params.get(key);
    if (value != null) record[key] = value;
  }
  return record;
}

export function readRaceTimeInputs(
  params: ShareParamSource,
): RaceTimeShareState {
  const present = SHARE_KEYS.filter((key) => firstParam(params[key]) != null);
  if (present.length === 0) return { ...EMPTY_RACE_TIME_SHARE };
  const total = present.reduce(
    (sum, key) => sum + (firstParam(params[key])?.length ?? 0),
    0,
  );
  if (total > QUERY_MAX) return { ...EMPTY_RACE_TIME_SHARE };

  const next: RaceTimeShareState = { ...EMPTY_RACE_TIME_SHARE };
  const mode = firstParam(params.mode);
  if (mode === "race" || mode === "pace") next.mode = mode;

  const race = firstParam(params.race);
  if (
    race === "5k" ||
    race === "10k" ||
    race === "half" ||
    race === "marathon" ||
    race === "custom"
  ) {
    next.preset = race;
  }

  const unit = firstParam(params.unit);
  if (unit === "km" || unit === "mi") next.unit = unit;

  const hours = firstParam(params.h);
  const minutes = firstParam(params.m);
  const seconds = firstParam(params.s);
  if (hours != null) next.hours = clipField(hours);
  if (minutes != null) next.minutes = clipField(minutes);
  if (seconds != null) next.seconds = clipField(seconds);

  const paceMinutes = firstParam(params.pm);
  const paceSeconds = firstParam(params.ps);
  if (paceMinutes != null) next.paceMinutes = clipField(paceMinutes);
  if (paceSeconds != null) next.paceSeconds = clipField(paceSeconds);

  const paceUnit = firstParam(params.pu);
  if (paceUnit === "mi" || paceUnit === "min_per_mi") next.paceUnit = "min_per_mi";
  if (paceUnit === "km" || paceUnit === "min_per_km") next.paceUnit = "min_per_km";

  const distance = firstParam(params.d);
  const target = firstParam(params.target);
  if (distance != null) next.distance = clipField(distance);
  if (target != null) next.target = clipField(target);

  if (firstParam(params.example) === "1") next.example = true;
  if (
    next.example &&
    next.hours === "" &&
    next.minutes === "" &&
    next.seconds === "" &&
    next.paceMinutes === "" &&
    next.paceSeconds === ""
  ) {
    return { ...EXAMPLE_RACE_TIME_SHARE, unit: next.unit, preset: next.preset };
  }
  return next;
}

export function parseRaceTimeQuery(search: string): RaceTimeShareState {
  return readRaceTimeInputs(paramsRecord(search));
}

export function buildRaceTimeSearch(
  currentSearch: string,
  state: RaceTimeShareState,
): string {
  const params = searchParams(currentSearch);
  for (const key of SHARE_KEYS) params.delete(key);

  const active = state.example || predictFromShare(state) != null;
  if (!active) {
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  const setOrDelete = (key: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed) params.set(key, trimmed);
    else params.delete(key);
  };

  if (state.example) params.set("example", "1");
  params.set("mode", state.mode);
  params.set("race", state.preset);
  params.set("unit", state.unit);
  setOrDelete("h", state.hours);
  setOrDelete("m", state.minutes);
  setOrDelete("s", state.seconds);
  setOrDelete("pm", state.paceMinutes);
  setOrDelete("ps", state.paceSeconds);
  if (state.mode === "pace" || state.paceMinutes.trim() || state.paceSeconds.trim()) {
    params.set("pu", state.paceUnit === "min_per_mi" ? "mi" : "km");
  }
  if (state.preset === "custom") setOrDelete("d", state.distance);
  setOrDelete("target", state.target);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export const RACE_WINDOW_TARGETS = [
  { key: "1500", meters: 1500 },
  { key: "3k", meters: 3000 },
  { key: "5k", meters: 5000 },
  { key: "10k", meters: 10000 },
  { key: "half", meters: 21097.5 },
  { key: "marathon", meters: 42195 },
] as const;

export type RaceWindowKey = (typeof RACE_WINDOW_TARGETS)[number]["key"] | "activity";

export type RaceActivityWindow = {
  key: RaceWindowKey;
  startSeconds: number;
  endSeconds: number;
  distanceKm: number;
  timeSec: number;
  vdot: number | null;
};

const MIN_RACE_METERS = 1500;
const MAX_RACE_METERS = 42195;

function distanceSamples(records: ThresholdRecord[]) {
  return records.filter(
    (record) =>
      record.distance != null &&
      Number.isFinite(record.distance) &&
      record.distance >= 0 &&
      Number.isFinite(record.seconds),
  );
}

/** A race window must stay continuous. Gaps over 10 s and distance rollbacks are not filled. */
function spansCleanDistance(
  records: ThresholdRecord[],
  startSeconds: number,
  endSeconds: number,
) {
  const samples = distanceSamples(records).filter(
    (record) =>
      record.seconds >= startSeconds - 1e-6 &&
      record.seconds <= endSeconds + 1e-6,
  );
  if (samples.length < 2 || endSeconds <= startSeconds) return false;
  let covered = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const gap = samples[index].seconds - samples[index - 1].seconds;
    const previous = samples[index - 1].distance ?? 0;
    const next = samples[index].distance ?? 0;
    if (gap <= 0) continue;
    if (gap > 10 || next + 1e-6 < previous) return false;
    covered += gap;
  }
  return covered >= (endSeconds - startSeconds) * 0.95;
}

function windowFromRange(
  records: ThresholdRecord[],
  key: RaceWindowKey,
  startSeconds: number,
  endSeconds: number,
): RaceActivityWindow | null {
  if (!spansCleanDistance(records, startSeconds, endSeconds)) return null;
  const estimate = estimateThresholdWindow(
    records,
    "RACE",
    startSeconds,
    endSeconds,
  );
  if (
    !estimate?.distanceKm ||
    estimate.distanceKm * 1000 < MIN_RACE_METERS - 1 ||
    estimate.distanceKm * 1000 > MAX_RACE_METERS + 1
  ) {
    return null;
  }
  const rawVdot = computeVdotForDistanceTime(
    estimate.distanceKm * 1000,
    estimate.seconds,
  );
  return {
    key,
    startSeconds: estimate.startSeconds,
    endSeconds: estimate.endSeconds,
    distanceKm: estimate.distanceKm,
    timeSec: estimate.seconds,
    vdot: rawVdot != null && Number.isFinite(rawVdot) ? rawVdot : null,
  };
}

/**
 * Fastest continuous window of `meters` inside the activity.
 * A gap over 10 seconds or a distance rollback rejects that window.
 * An easy effort lowers VDOT; it is still returned. There is no effort correction.
 */
export function fastestRaceWindow(
  records: ThresholdRecord[],
  meters: number,
  key: RaceWindowKey,
): RaceActivityWindow | null {
  if (!(meters >= MIN_RACE_METERS) || meters > MAX_RACE_METERS) return null;
  const samples = distanceSamples(records);
  let best: RaceActivityWindow | null = null;
  let end = 1;
  for (let start = 0; start < samples.length - 1; start += 1) {
    const origin = samples[start];
    if (!origin || origin.distance == null) continue;
    if (end <= start) end = start + 1;
    let blockedAt = -1;
    while (end < samples.length) {
      const previous = samples[end - 1];
      const next = samples[end];
      if (!previous || !next || previous.distance == null || next.distance == null) {
        blockedAt = end;
        break;
      }
      const gap = next.seconds - previous.seconds;
      if (gap > 10 || next.distance + 1e-6 < previous.distance) {
        blockedAt = end;
        break;
      }
      if (next.distance - origin.distance >= meters) break;
      end += 1;
    }
    if (blockedAt >= 0) {
      start = blockedAt - 1;
      end = blockedAt + 1;
      continue;
    }
    if (end >= samples.length) break;
    const previous = samples[end - 1];
    const next = samples[end];
    if (!previous || !next || previous.distance == null || next.distance == null) break;
    const span = next.distance - previous.distance;
    const ratio =
      span === 0 ? 1 : (origin.distance + meters - previous.distance) / span;
    const endSeconds = previous.seconds + ratio * (next.seconds - previous.seconds);
    const duration = endSeconds - origin.seconds;
    if (!(duration > 0) || (best && duration >= best.timeSec - 1e-6)) continue;
    const window = windowFromRange(records, key, origin.seconds, endSeconds);
    if (window && (!best || window.timeSec < best.timeSec)) best = window;
  }
  return best;
}

function wholeActivityWindow(records: ThresholdRecord[]) {
  const samples = distanceSamples(records);
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last) return null;
  return windowFromRange(records, "activity", first.seconds, last.seconds);
}

/** Standard distances that fit, plus the whole activity when it is 1500 m–marathon. */
export function listRaceWindows(records: ThresholdRecord[]): RaceActivityWindow[] {
  const windows = RACE_WINDOW_TARGETS.flatMap((target) => {
    const window = fastestRaceWindow(records, target.meters, target.key);
    return window ? [window] : [];
  });
  const activity = wholeActivityWindow(records);
  if (
    activity &&
    !windows.some(
      (window) =>
        Math.abs(window.startSeconds - activity.startSeconds) < 1 &&
        Math.abs(window.endSeconds - activity.endSeconds) < 1,
    )
  ) {
    windows.push(activity);
  }
  return windows;
}

/** Manual window. Same 1500 m–marathon and gap rules as the automatic search. */
export function raceWindowBetween(
  records: ThresholdRecord[],
  startSeconds: number,
  endSeconds: number,
) {
  return windowFromRange(records, "activity", startSeconds, endSeconds);
}

/** Highest VDOT among the windows. Ties keep the earlier list entry. */
export function bestRaceWindow(records: ThresholdRecord[]) {
  let best: RaceActivityWindow | null = null;
  for (const window of listRaceWindows(records)) {
    if (window.vdot == null) continue;
    const score = best?.vdot;
    if (score == null || window.vdot > score) best = window;
  }
  return best;
}
