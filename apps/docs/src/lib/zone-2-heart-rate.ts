import {
  buildFrielZones,
  buildKarvonenZones,
  buildMhrZones,
  heartRateZoneByOrder,
} from "./heart-rate-zones";

export type Zone2Method = "maxHr" | "hrr" | "lthr" | "age";

export type AgeFormulaKey = "tanaka" | "fox";

export type Zone2Range = {
  bpmMin: number;
  bpmMax: number;
  percentMin: number;
  percentMax: number;
  /** Unrounded anchor. Display code rounds this separately from the zone edges. */
  anchorBpm: number;
  restingBpm?: number;
  method: Zone2Method;
  ageFormula?: AgeFormulaKey;
};

/**
 * Zone 2 heart-rate bands for a general audience.
 *
 * A positive finite anchor is enough to calculate. A lab max test or a
 * 30-minute LTHR protocol makes the number more representative; neither is a
 * gate, and this module does not invent an effort-correction factor. The
 * caller shows the estimate next to the anchor the user already had. Whether
 * to adopt it is the user's decision.
 *
 * Max HR Zone 2 is the 60–70% band, taken directly from the heart-rate zones
 * max-HR model (lib/heart-rate-zones.ts) so both pages show the same integer
 * bounds. The shared 70% edge belongs to Zone 3, so the Zone 2 ceiling is
 * round(70%) − 1: 190 bpm is 114–132.
 *
 * Karvonen Zone 2 uses the same 60–70% five-zone bands applied to heart-rate
 * reserve, then adds resting HR. It delegates to buildKarvonenZones so this
 * page and the complete heart-rate-zones calculator keep identical integer
 * boundaries: HRmax 190 and resting HR 50 is 134–147 bpm.
 *
 * Friel LTHR Zone 2 is 81% through just under 90% (170 bpm is 138–152), the
 * same integer bounds as the heart-rate zones Friel row (also taken from
 * lib/heart-rate-zones.ts). That 81–89% band is
 * Friel's cycling table. His older running table starts Zone 2 at 85%.
 *
 * Percentages are applied to the raw anchor. bpm edges are rounded once.
 * Do not round the anchor and then multiply.
 */
const MAX_HR_ZONE2 = { minPct: 60, nextPct: 70 } as const;
const FRIEL_ZONE2 = { minPct: 81, nextPct: 90 } as const;

export function parsePositiveNumber(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function roundBpm(n: number) {
  return Math.round(n);
}

export function formatAnchorBpm(n: number) {
  if (!Number.isFinite(n)) return "";
  const tenths = Math.round(n * 10) / 10;
  return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
}

function usableAnchor(n: number) {
  return Number.isFinite(n) && n > 0;
}

export function estimateMaxHrFromAge(age: number, formula: AgeFormulaKey) {
  if (!usableAnchor(age)) return null;
  if (formula === "fox") return 220 - age;
  return 208 - 0.7 * age;
}

export function calculateZone2FromMaxHr(maxHr: number): Zone2Range | null {
  if (!usableAnchor(maxHr)) return null;
  const zone = heartRateZoneByOrder(buildMhrZones(maxHr) ?? [], 2);
  if (!zone || zone.bpmMax == null || zone.bpmMax < zone.bpmMin) return null;
  return {
    bpmMin: zone.bpmMin,
    bpmMax: zone.bpmMax,
    percentMin: MAX_HR_ZONE2.minPct,
    percentMax: MAX_HR_ZONE2.nextPct,
    anchorBpm: maxHr,
    method: "maxHr",
  };
}

export function calculateZone2FromHrr(
  maxHr: number,
  restingHr: number,
): Zone2Range | null {
  if (!usableAnchor(maxHr) || !usableAnchor(restingHr) || restingHr >= maxHr) {
    return null;
  }
  const zone = heartRateZoneByOrder(
    buildKarvonenZones(maxHr, restingHr) ?? [],
    2,
  );
  if (!zone || zone.bpmMax == null || zone.bpmMax < zone.bpmMin) return null;
  return {
    bpmMin: zone.bpmMin,
    bpmMax: zone.bpmMax,
    percentMin: MAX_HR_ZONE2.minPct,
    percentMax: MAX_HR_ZONE2.nextPct,
    anchorBpm: maxHr,
    restingBpm: restingHr,
    method: "hrr",
  };
}

export function calculateZone2FromLthr(lthr: number): Zone2Range | null {
  if (!usableAnchor(lthr)) return null;
  const zone = heartRateZoneByOrder(buildFrielZones(lthr) ?? [], 2);
  if (!zone || zone.bpmMax == null || zone.bpmMax < zone.bpmMin) return null;
  return {
    bpmMin: zone.bpmMin,
    bpmMax: zone.bpmMax,
    percentMin: FRIEL_ZONE2.minPct,
    percentMax: FRIEL_ZONE2.nextPct - 1,
    anchorBpm: lthr,
    method: "lthr",
  };
}

export function calculateZone2FromAge(
  age: number,
  formula: AgeFormulaKey = "tanaka",
): Zone2Range | null {
  const estimatedMaxHr = estimateMaxHrFromAge(age, formula);
  if (estimatedMaxHr == null) return null;
  const range = calculateZone2FromMaxHr(estimatedMaxHr);
  if (!range) return null;
  return {
    ...range,
    method: "age",
    ageFormula: formula,
  };
}

export function formatZone2Bpm(range: Zone2Range) {
  return `${range.bpmMin}–${range.bpmMax} bpm`;
}

export function formatZone2Percent(range: Zone2Range) {
  return `${range.percentMin}%–${range.percentMax}%`;
}
