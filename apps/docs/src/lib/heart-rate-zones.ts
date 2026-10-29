/**
 * Heart-rate training zones.
 *
 * Bounds stay in floating point until the bpm edge is rounded once with
 * `roundBpm`. Do not round the anchor and then multiply by a percent: a .5
 * input must not become the neighboring integer before the percent is applied.
 *
 * Integer zones do not overlap and do not leave a gap. The rounded upper
 * percent belongs to the next zone, so the next minimum is the previous
 * maximum + 1. The top Friel zone stays open. Max-HR and Karvonen top zones
 * are capped at the rounded HRmax.
 *
 * Friel bands here are the cycling / general LTHR table (Z1 <81%, Z2 81–89%,
 * Z3 90–93%, Z4 94–99%, Z5a 100–102%, Z5b 103–106%, Z5c ≥107%). Friel's
 * running table uses a higher Z1 ceiling (<85% LTHR). This page keeps the
 * cycling table so Zone 2 matches the zone-2 calculator. Karvonen uses the
 * heart-rate reserve formula (rest + reserve × intensity) from Karvonen,
 * Kentala, and Mustala 1957, split into the common five training bands.
 * Max-HR zones are those same five bands applied to HRmax.
 */

export type HeartRateZoneModel = "KARVONEN" | "FRIEL" | "MHR";

export type HeartRateZone = {
  order: number;
  code: string;
  percentLabel: string;
  bpmMin: number;
  bpmMax: number | null;
};

type ZoneStep = {
  order: number;
  code: string;
  minPct: number;
  nextPct: number | null;
};

const FRIEL_STEPS: readonly ZoneStep[] = [
  { order: 1, code: "Z1", minPct: 0, nextPct: 81 },
  { order: 2, code: "Z2", minPct: 81, nextPct: 90 },
  { order: 3, code: "Z3", minPct: 90, nextPct: 94 },
  { order: 4, code: "Z4", minPct: 94, nextPct: 100 },
  { order: 5, code: "Z5a", minPct: 100, nextPct: 103 },
  { order: 6, code: "Z5b", minPct: 103, nextPct: 107 },
  { order: 7, code: "Z5c", minPct: 107, nextPct: null },
];

const FIVE_ZONE_STEPS: readonly ZoneStep[] = [
  { order: 1, code: "Z1", minPct: 50, nextPct: 60 },
  { order: 2, code: "Z2", minPct: 60, nextPct: 70 },
  { order: 3, code: "Z3", minPct: 70, nextPct: 80 },
  { order: 4, code: "Z4", minPct: 80, nextPct: 90 },
  { order: 5, code: "Z5", minPct: 90, nextPct: null },
];

export function roundBpm(value: number) {
  return Math.round(value);
}

export function parseHeartRateBpm(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function usableBpm(value: number) {
  return Number.isFinite(value) && value > 0;
}

function percentLabel(step: ZoneStep, closedUpper: boolean) {
  if (step.minPct === 0 && step.nextPct != null) return `< ${step.nextPct}%`;
  if (step.nextPct == null) {
    return closedUpper ? `${step.minPct}%–100%` : `≥ ${step.minPct}%`;
  }
  const upper = closedUpper
    ? step.nextPct
    : Math.max(step.minPct, step.nextPct - 1);
  return `${step.minPct}%–${upper}%`;
}

function zonesFromMins(
  steps: readonly ZoneStep[],
  mins: number[],
  cap: number | null,
  closedUpperLabel: boolean,
): HeartRateZone[] {
  const bpmMins = mins.slice();
  for (let index = 1; index < bpmMins.length; index++) {
    if (bpmMins[index] <= bpmMins[index - 1]) {
      bpmMins[index] = bpmMins[index - 1] + 1;
    }
  }
  return steps.map((step, index) => {
    const bpmMin = bpmMins[index];
    const bpmMax =
      index === steps.length - 1
        ? cap == null
          ? null
          : Math.max(bpmMin, cap)
        : bpmMins[index + 1] - 1;
    return {
      order: step.order,
      code: step.code,
      percentLabel: percentLabel(step, closedUpperLabel),
      bpmMin,
      bpmMax,
    };
  });
}

export function buildFrielZones(lthr: number): HeartRateZone[] | null {
  if (!usableBpm(lthr)) return null;
  const mins = FRIEL_STEPS.map((step) =>
    step.minPct === 0 ? 0 : roundBpm((step.minPct / 100) * lthr),
  );
  return zonesFromMins(FRIEL_STEPS, mins, null, false);
}

export function buildMhrZones(maxHr: number): HeartRateZone[] | null {
  if (!usableBpm(maxHr)) return null;
  const mins = FIVE_ZONE_STEPS.map((step) =>
    roundBpm((step.minPct / 100) * maxHr),
  );
  return zonesFromMins(FIVE_ZONE_STEPS, mins, roundBpm(maxHr), true);
}

export function buildKarvonenZones(
  maxHr: number,
  restHr: number,
): HeartRateZone[] | null {
  if (!usableBpm(maxHr) || !usableBpm(restHr) || restHr >= maxHr) return null;
  const reserve = maxHr - restHr;
  const mins = FIVE_ZONE_STEPS.map((step) =>
    roundBpm(restHr + reserve * (step.minPct / 100)),
  );
  return zonesFromMins(FIVE_ZONE_STEPS, mins, roundBpm(maxHr), true);
}

export function formatZoneBpm(min: number, max: number | null) {
  if (max == null) return `≥ ${min}`;
  if (min <= 0) return `< ${max + 1}`;
  return `${min}–${max}`;
}

export function heartRateZoneByOrder(
  zones: HeartRateZone[],
  order: number,
) {
  return zones.find((zone) => zone.order === order) ?? null;
}
