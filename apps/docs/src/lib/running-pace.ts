export const KM_PER_MILE = 1.609344;

export const RACE_DISTANCES_KM = {
  "5k": 5,
  "10k": 10,
  half: 21.0975,
  marathon: 42.195,
} as const;

export type RacePreset = keyof typeof RACE_DISTANCES_KM;
export type DistanceUnit = "km" | "mi";
export type PaceUnit = "min_per_km" | "min_per_mi";
export type SolveFor = "pace" | "time" | "distance";

export type TimeParts = {
  hours: number;
  minutes: number;
  seconds: number;
};

export type PaceParts = {
  minutes: number;
  seconds: number;
};

export type SplitRow = {
  label: string;
  distanceKm: number;
  elapsedSec: number;
  /** Seconds since the previous checkpoint. The first row starts at zero. */
  splitSec: number;
  isFinish: boolean;
};

export type PaceCalculatorState = {
  solveFor: SolveFor;
  preset: RacePreset | "custom";
  distanceUnit: DistanceUnit;
  paceUnit: PaceUnit;
  distanceText: string;
  hours: string;
  minutes: string;
  seconds: string;
  paceMinutes: string;
  paceSeconds: string;
  chart: RacePreset | "custom";
  /** True only after an explicit example request that still matches the sample. */
  example: boolean;
};

/** Open state: a common race preset, with time and pace left blank. */
export const EMPTY_PACE_CALCULATOR: PaceCalculatorState = {
  solveFor: "pace",
  preset: "5k",
  distanceUnit: "km",
  paceUnit: "min_per_km",
  distanceText: "",
  hours: "",
  minutes: "",
  seconds: "",
  paceMinutes: "",
  paceSeconds: "",
  chart: "5k",
  example: false,
};

/** Explicit sample: 5 km in 25:00 solves to 5:00 min/km. */
export const PACE_CALCULATOR_EXAMPLE: PaceCalculatorState = {
  solveFor: "pace",
  preset: "5k",
  distanceUnit: "km",
  paceUnit: "min_per_km",
  distanceText: "5",
  hours: "",
  minutes: "25",
  seconds: "00",
  paceMinutes: "5",
  paceSeconds: "00",
  chart: "5k",
  example: true,
};

const MAX_DISTANCE_KM = 500;
const MAX_TIME_SEC = 48 * 3600;
const MIN_PACE_SEC_PER_KM = 90; // 1:30 /km
const MAX_PACE_SEC_PER_KM = 20 * 60; // 20:00 /km
const MAX_SPLIT_ROWS = 80;

export function distanceToKm(value: number, unit: DistanceUnit): number {
  return unit === "mi" ? value * KM_PER_MILE : value;
}

export function kmToDistance(km: number, unit: DistanceUnit): number {
  return unit === "mi" ? km / KM_PER_MILE : km;
}

export function paceToSecPerKm(secPerUnit: number, unit: PaceUnit): number {
  return unit === "min_per_mi" ? secPerUnit / KM_PER_MILE : secPerUnit;
}

export function secPerKmToPace(secPerKm: number, unit: PaceUnit): number {
  return unit === "min_per_mi" ? secPerKm * KM_PER_MILE : secPerKm;
}

export function paceToSpeed(
  secPerKm: number,
  unit: "km/h" | "mph",
): number | null {
  if (!isValidPaceSecPerKm(secPerKm)) return null;
  const kmPerHour = 3600 / secPerKm;
  return unit === "mph" ? kmPerHour / KM_PER_MILE : kmPerHour;
}

export function timePartsToSeconds(parts: TimeParts): number | null {
  const hours = Number(parts.hours);
  const minutes = Number(parts.minutes);
  const seconds = Number(parts.seconds);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  if (hours < 0 || minutes < 0 || seconds < 0) return null;
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (minutes >= 60 || seconds >= 60) return null;
  const total = hours * 3600 + minutes * 60 + seconds;
  if (total <= 0 || total > MAX_TIME_SEC) return null;
  return total;
}

export function secondsToTimeParts(total: number): TimeParts {
  const safe = Math.max(0, Math.round(total));
  return {
    hours: Math.floor(safe / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
  };
}

export function pacePartsToSeconds(parts: PaceParts): number | null {
  const minutes = Number(parts.minutes);
  const seconds = Number(parts.seconds);
  if (![minutes, seconds].every(Number.isFinite)) return null;
  if (!Number.isInteger(minutes)) return null;
  if (minutes < 0 || seconds < 0 || seconds >= 60) return null;
  const total = minutes * 60 + seconds;
  if (total <= 0) return null;
  return total;
}

/** Unit changes retain fractional seconds; only result labels round to seconds. */
export function convertPaceParts(
  parts: PaceParts,
  from: PaceUnit,
  to: PaceUnit,
): PaceParts | null {
  const total = pacePartsToSeconds(parts);
  if (total == null) return null;
  const converted = Number(
    secPerKmToPace(paceToSecPerKm(total, from), to).toFixed(6),
  );
  return {
    minutes: Math.floor(converted / 60),
    seconds: Number((converted % 60).toFixed(6)),
  };
}

/** Display rounding. Call this once, on a value that is still in seconds. */
export function roundClockSeconds(total: number): number {
  if (!Number.isFinite(total)) return 0;
  return Math.round(total);
}

export function secondsToPaceParts(total: number): PaceParts {
  const safe = Math.max(0, Math.round(total));
  return {
    minutes: Math.floor(safe / 60),
    seconds: safe % 60,
  };
}

export function parsePositiveNumber(value: string): number | null {
  const raw = value.trim().replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function isValidDistanceKm(km: number): boolean {
  return Number.isFinite(km) && km > 0 && km <= MAX_DISTANCE_KM;
}

export function isValidPaceSecPerKm(secPerKm: number): boolean {
  return (
    Number.isFinite(secPerKm) &&
    secPerKm >= MIN_PACE_SEC_PER_KM &&
    secPerKm <= MAX_PACE_SEC_PER_KM
  );
}

export function solvePaceSecPerKm(
  distanceKm: number,
  timeSec: number,
): number | null {
  if (
    !isValidDistanceKm(distanceKm) ||
    timeSec <= 0 ||
    timeSec > MAX_TIME_SEC
  ) {
    return null;
  }
  const pace = timeSec / distanceKm;
  return isValidPaceSecPerKm(pace) ? pace : null;
}

export function solveTimeSec(
  distanceKm: number,
  paceSecPerKm: number,
): number | null {
  if (!isValidDistanceKm(distanceKm) || !isValidPaceSecPerKm(paceSecPerKm)) {
    return null;
  }
  const time = paceSecPerKm * distanceKm;
  return time > 0 && time <= MAX_TIME_SEC ? time : null;
}

export function solveDistanceKm(
  timeSec: number,
  paceSecPerKm: number,
): number | null {
  if (
    timeSec <= 0 ||
    timeSec > MAX_TIME_SEC ||
    !isValidPaceSecPerKm(paceSecPerKm)
  ) {
    return null;
  }
  const km = timeSec / paceSecPerKm;
  return isValidDistanceKm(km) ? km : null;
}

export type PaceResult = {
  kind: SolveFor;
  secPerKm: number;
  timeSec: number;
  distanceKm: number;
};

export function calculatePace(state: PaceCalculatorState): PaceResult | null {
  const distance = parsePositiveNumber(state.distanceText);
  const distanceKm =
    state.preset === "custom"
      ? distance == null
        ? null
        : distanceToKm(distance, state.distanceUnit)
      : raceDistanceKm(state.preset);
  const timeSec = timePartsToSeconds({
    hours: Number(state.hours || 0),
    minutes: Number(state.minutes || 0),
    seconds: Number(state.seconds || 0),
  });
  const rawPace = pacePartsToSeconds({
    minutes: Number(state.paceMinutes || 0),
    seconds: Number(state.paceSeconds || 0),
  });
  const secPerKm =
    rawPace == null ? null : paceToSecPerKm(rawPace, state.paceUnit);
  if (state.solveFor === "pace" && distanceKm != null && timeSec != null) {
    const pace = solvePaceSecPerKm(distanceKm, timeSec);
    return pace == null
      ? null
      : { kind: "pace", secPerKm: pace, timeSec, distanceKm };
  }
  if (state.solveFor === "time" && distanceKm != null && secPerKm != null) {
    const time = solveTimeSec(distanceKm, secPerKm);
    return time == null
      ? null
      : { kind: "time", secPerKm, timeSec: time, distanceKm };
  }
  if (state.solveFor === "distance" && timeSec != null && secPerKm != null) {
    const km = solveDistanceKm(timeSec, secPerKm);
    return km == null
      ? null
      : { kind: "distance", secPerKm, timeSec, distanceKm: km };
  }
  return null;
}

/** Switching the unknown keeps the last valid calculation as the new inputs. */
export function changePaceSolveFor(
  state: PaceCalculatorState,
  solveFor: SolveFor,
): PaceCalculatorState {
  if (solveFor === state.solveFor) return state;
  const next = {
    ...state,
    solveFor,
    example: false,
    chart: solveFor === "distance" ? ("custom" as const) : state.chart,
  };
  const result = calculatePace(state);
  if (!result) return next;
  const total = Number(result.timeSec.toFixed(6));
  const pace = convertPaceParts(
    {
      minutes: Math.floor(result.secPerKm / 60),
      seconds: result.secPerKm % 60,
    },
    "min_per_km",
    state.paceUnit,
  )!;
  return {
    ...next,
    preset: state.solveFor === "distance" ? "custom" : state.preset,
    distanceText: String(
      Number(kmToDistance(result.distanceKm, state.distanceUnit).toFixed(6)),
    ),
    hours: String(Math.floor(total / 3600)),
    minutes: String(Math.floor((total % 3600) / 60)),
    seconds: String(Number((total % 60).toFixed(6))).padStart(2, "0"),
    paceMinutes: String(pace.minutes),
    paceSeconds: `${pace.seconds < 10 ? "0" : ""}${pace.seconds}`,
  };
}

export function buildPaceComparison(secPerKm: number, unit: PaceUnit) {
  if (!isValidPaceSecPerKm(secPerKm)) return [];
  const current = secPerKmToPace(secPerKm, unit);
  return [-10, -5, 0, 5, 10].flatMap((offset) => {
    const pace = paceToSecPerKm(current + offset, unit);
    if (!isValidPaceSecPerKm(pace)) return [];
    return [
      {
        offset,
        label: formatPaceClock(current + offset),
        times: Object.fromEntries(
          Object.entries(RACE_DISTANCES_KM).map(([key, km]) => [
            key,
            solveTimeSec(km, pace)!,
          ]),
        ) as Record<RacePreset, number>,
      },
    ];
  });
}

export function formatClock(totalSeconds: number): string {
  const { hours, minutes, seconds } = secondsToTimeParts(totalSeconds);
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${minutes}:${ss}`;
}

export function formatPaceClock(totalSeconds: number): string {
  const { minutes, seconds } = secondsToPaceParts(totalSeconds);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function convertDistanceText(
  text: string,
  from: DistanceUnit,
  to: DistanceUnit,
): string | null {
  const value = parsePositiveNumber(text);
  if (value == null || from === to) return value == null ? null : String(value);
  const km = distanceToKm(value, from);
  if (!Number.isFinite(km)) return null;
  return String(Number(kmToDistance(km, to).toFixed(6)));
}

export function formatDistance(
  km: number,
  unit: DistanceUnit,
  digits = 3,
): string {
  const value = kmToDistance(km, unit);
  const rounded =
    value >= 100
      ? value.toFixed(1)
      : value
          .toFixed(Math.max(0, digits))
          .replace(/(\.\d*?)0+$/, "$1")
          .replace(/\.$/, "");
  return unit === "mi" ? `${rounded} mi` : `${rounded} km`;
}

export function raceDistanceKm(preset: RacePreset): number {
  return RACE_DISTANCES_KM[preset];
}

function splitStepKm(unit: DistanceUnit): number {
  return unit === "mi" ? KM_PER_MILE : 1;
}

export function buildSplitChart({
  distanceKm,
  paceSecPerKm,
  unit,
}: {
  distanceKm: number;
  paceSecPerKm: number;
  unit: DistanceUnit;
}): SplitRow[] | null {
  if (!isValidDistanceKm(distanceKm) || !isValidPaceSecPerKm(paceSecPerKm)) {
    return null;
  }

  const stepKm = splitStepKm(unit);
  const rows: SplitRow[] = [];
  const maxMarks = Math.min(
    Math.floor(distanceKm / stepKm + 1e-9),
    MAX_SPLIT_ROWS - 1,
  );
  let previousSec = 0;

  for (let i = 1; i <= maxMarks; i += 1) {
    const markKm = i * stepKm;
    if (markKm >= distanceKm - 1e-6) break;
    const elapsedSec = paceSecPerKm * markKm;
    rows.push({
      label: unit === "mi" ? `${i} mi` : `${i} km`,
      distanceKm: markKm,
      elapsedSec,
      splitSec: elapsedSec - previousSec,
      isFinish: false,
    });
    previousSec = elapsedSec;
  }

  const finishSec = paceSecPerKm * distanceKm;
  rows.push({
    label: formatDistance(distanceKm, unit, 4),
    distanceKm,
    elapsedSec: finishSec,
    splitSec: finishSec - previousSec,
    isFinish: true,
  });

  return rows;
}

export type DisplaySplitRow = SplitRow & {
  displaySplitSec: number;
  displayElapsedSec: number;
};

/**
 * Round each cumulative time once, then derive the segment from the difference.
 * Displayed segments add up to the once-rounded finish time.
 */
export function formatSplitTable(rows: SplitRow[]): DisplaySplitRow[] {
  let previous = 0;
  return rows.map((row) => {
    const displayElapsedSec = roundClockSeconds(row.elapsedSec);
    const displaySplitSec = displayElapsedSec - previous;
    previous = displayElapsedSec;
    return { ...row, displaySplitSec, displayElapsedSec };
  });
}

const PACE_QUERY_KEYS = [
  "solve",
  "race",
  "unit",
  "pu",
  "chart",
  "h",
  "m",
  "s",
  "pm",
  "ps",
  "d",
  "example",
] as const;

const MAX_PARAM_LENGTH = 32;
const MAX_QUERY_LENGTH = 512;

function searchParamsFrom(search: string): URLSearchParams {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw);
}

function cleanInt(value: string, maxLen: number): string {
  return value.replace(/\D/g, "").slice(0, maxLen);
}

export function cleanSeconds(value: string): string {
  const raw = value.trim().replace(",", ".");
  if (!raw) return "";
  const match = /^(\d{0,2})(\.\d{0,6})?/.exec(raw);
  if (!match) return "";
  const whole = match[1] ?? "";
  const frac = match[2] ?? "";
  if (!whole && !frac) return "";
  if (!whole) return `0${frac}`;
  return `${whole}${frac}`;
}

function samePaceInputs(
  left: PaceCalculatorState,
  right: PaceCalculatorState,
): boolean {
  return (
    left.solveFor === right.solveFor &&
    left.preset === right.preset &&
    left.distanceUnit === right.distanceUnit &&
    left.paceUnit === right.paceUnit &&
    left.distanceText === right.distanceText &&
    left.hours === right.hours &&
    left.minutes === right.minutes &&
    left.seconds === right.seconds &&
    left.paceMinutes === right.paceMinutes &&
    left.paceSeconds === right.paceSeconds &&
    left.chart === right.chart
  );
}

function isBlankPaceState(state: PaceCalculatorState): boolean {
  return !state.example && samePaceInputs(state, EMPTY_PACE_CALCULATOR);
}

function cleanDistanceText(value: string): string {
  const raw = value
    .trim()
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const [whole, ...rest] = raw.split(".");
  const head = (whole ?? "").slice(0, 6);
  if (rest.length === 0) return head;
  const frac = rest.join("").slice(0, 6);
  if (!head && !frac) return "";
  return `${head || "0"}.${frac}`;
}

function readSolveFor(value: string | null): SolveFor | null {
  if (value === "pace" || value === "time" || value === "distance")
    return value;
  return null;
}

function readPreset(
  value: string | null,
): PaceCalculatorState["preset"] | null {
  if (
    value === "5k" ||
    value === "10k" ||
    value === "half" ||
    value === "marathon" ||
    value === "custom"
  ) {
    return value;
  }
  return null;
}

function readChart(value: string | null): PaceCalculatorState["chart"] | null {
  return readPreset(value);
}

function readDistanceUnit(value: string | null): DistanceUnit | null {
  if (value === "km" || value === "mi") return value;
  return null;
}

function readPaceUnit(value: string | null): PaceUnit | null {
  if (value === "km") return "min_per_km";
  if (value === "mi") return "min_per_mi";
  return null;
}

/**
 * Restore a shared calculator link.
 * A blank URL stays empty. `example=1` restores the sample only when the
 * other fields still match it. Present keys win, including an explicit empty part.
 */
export function paceStateFromParams(
  read: (key: string) => string | null,
  totalLength = 0,
): PaceCalculatorState {
  if (totalLength > MAX_QUERY_LENGTH) return { ...EMPTY_PACE_CALCULATOR };

  const raw = (key: string) => {
    const value = read(key);
    if (value == null || value.length > MAX_PARAM_LENGTH) return null;
    return value;
  };

  const present = PACE_QUERY_KEYS.some((key) => raw(key) != null);
  if (!present) return { ...EMPTY_PACE_CALCULATOR };

  const exampleRequested = raw("example") === "1";
  const base: PaceCalculatorState = exampleRequested
    ? { ...PACE_CALCULATOR_EXAMPLE }
    : { ...EMPTY_PACE_CALCULATOR };

  const solve = readSolveFor(raw("solve"));
  const preset = readPreset(raw("race"));
  const distanceUnit = readDistanceUnit(raw("unit"));
  const paceUnit = readPaceUnit(raw("pu"));
  const chart = readChart(raw("chart"));

  const next: PaceCalculatorState = {
    ...base,
    ...(solve ? { solveFor: solve } : {}),
    ...(preset ? { preset } : {}),
    ...(distanceUnit ? { distanceUnit } : {}),
    ...(paceUnit ? { paceUnit } : {}),
    ...(chart ? { chart } : {}),
    example: false,
  };

  const distance = raw("d");
  if (distance != null) next.distanceText = cleanDistanceText(distance);
  const hours = raw("h");
  if (hours != null) next.hours = cleanInt(hours, 2);
  const minutes = raw("m");
  if (minutes != null) next.minutes = cleanInt(minutes, 2);
  const seconds = raw("s");
  if (seconds != null) next.seconds = cleanSeconds(seconds);
  const paceMinutes = raw("pm");
  if (paceMinutes != null) next.paceMinutes = cleanInt(paceMinutes, 2);
  const paceSeconds = raw("ps");
  if (paceSeconds != null) next.paceSeconds = cleanSeconds(paceSeconds);

  next.example =
    exampleRequested && samePaceInputs(next, PACE_CALCULATOR_EXAMPLE);
  return next;
}

export function parsePaceCalculatorQuery(search: string): PaceCalculatorState {
  const params = searchParamsFrom(search);
  return paceStateFromParams(
    (key) => (params.has(key) ? params.get(key) : null),
    params.toString().length,
  );
}

function paceUnitParam(unit: PaceUnit): string {
  return unit === "min_per_mi" ? "mi" : "km";
}

/**
 * Encode solve-for, inputs, units, race preset, and chart selection.
 * A blank calculator clears this page's parameters. The explicit example
 * compacts to `example=1`. Share mode writes every field.
 */
export function buildPaceCalculatorSearch(
  currentSearch: string,
  state: PaceCalculatorState,
  options?: { full?: boolean },
): string {
  const params = searchParamsFrom(currentSearch);
  for (const key of PACE_QUERY_KEYS) params.delete(key);

  if (isBlankPaceState(state)) {
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  const full = options?.full === true;
  if (
    !full &&
    state.example &&
    samePaceInputs(state, PACE_CALCULATOR_EXAMPLE)
  ) {
    params.set("example", "1");
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  const blank = EMPTY_PACE_CALCULATOR;
  const fields: Array<[string, string, string]> = [
    ["solve", state.solveFor, blank.solveFor],
    ["race", state.preset, blank.preset],
    ["unit", state.distanceUnit, blank.distanceUnit],
    ["pu", paceUnitParam(state.paceUnit), "km"],
    ["chart", state.chart, blank.chart],
    ["h", cleanInt(state.hours, 2), ""],
    ["m", cleanInt(state.minutes, 2), ""],
    ["s", cleanSeconds(state.seconds), ""],
    ["pm", cleanInt(state.paceMinutes, 2), ""],
    ["ps", cleanSeconds(state.paceSeconds), ""],
  ];

  for (const [key, value, fallback] of fields) {
    if (full || value !== fallback) params.set(key, value);
  }

  const distanceText = cleanDistanceText(state.distanceText);
  if (full || state.preset === "custom") {
    params.set("d", distanceText);
  }
  if (full && state.example) params.set("example", "1");

  const query = params.toString();
  return query ? `?${query}` : "";
}
