/**
 * Typed cycling FTP field tests.
 * Ride-file estimation stays on the existing 30-minute, 3/9-minute, and 10K
 * protocols. Ramp and 2×8 are manual multipliers: the file endpoint does not
 * apply ×0.75 or ×0.90.
 *
 * Factors in common use:
 * - 20-minute average × 0.95 (Allen & Coggan)
 * - ramp, last completed minute × 0.75
 * - mean of two 8-minute efforts × 0.90
 * - 60-minute average = FTP
 */

export const FTP_FIELD_PROTOCOLS = ["20MIN", "RAMP", "2X8", "60MIN"] as const;

export type FtpFieldProtocol = (typeof FTP_FIELD_PROTOCOLS)[number];

export const FTP_TEST_POWER_MAX_W = 2000;
export const FTP_BODY_WEIGHT_MIN_KG = 30;
export const FTP_BODY_WEIGHT_MAX_KG = 200;
/** International avoirdupois pound. Power stays in watts either way. */
export const LB_PER_KG = 2.2046226218;

export type FtpUnitSystem = "metric" | "imperial";

export const FTP_PROTOCOL_FACTOR: Record<FtpFieldProtocol, number> = {
  "20MIN": 0.95,
  RAMP: 0.75,
  "2X8": 0.9,
  "60MIN": 1,
};

export const FTP_PROTOCOL_FACTOR_LABEL: Record<FtpFieldProtocol, string> = {
  "20MIN": "0.95",
  RAMP: "0.75",
  "2X8": "0.90",
  "60MIN": "1",
};

export type FtpWkgBand =
  | "recreational"
  | "club"
  | "strong_club"
  | "competitive";

export type CogganZoneId = "z1" | "z2" | "z3" | "z4" | "z5" | "z6" | "z7";

export type CogganZoneWatts = {
  id: CogganZoneId;
  /** Percent of FTP, e.g. "<55", "56–75", ">150". */
  percentLabel: string;
  /** Null when the zone is open at the bottom (below a percent). */
  minWatts: number | null;
  /** Null when the zone is open at the top (above a percent). */
  maxWatts: number | null;
};

export function estimateFieldFtp(
  testPowerWatts: number,
  protocol: FtpFieldProtocol,
): number | null {
  if (!Number.isFinite(testPowerWatts) || testPowerWatts <= 0) return null;
  if (testPowerWatts > FTP_TEST_POWER_MAX_W) return null;
  const average = Math.round(testPowerWatts);
  if (average <= 0) return null;
  return Math.round(average * FTP_PROTOCOL_FACTOR[protocol]);
}

export function ftpWattsPerKg(
  ftpWatts: number,
  weightKg: number,
): number | null {
  if (!Number.isFinite(ftpWatts) || ftpWatts <= 0) return null;
  if (
    !Number.isFinite(weightKg) ||
    weightKg < FTP_BODY_WEIGHT_MIN_KG ||
    weightKg > FTP_BODY_WEIGHT_MAX_KG
  ) {
    return null;
  }
  return ftpWatts / weightKg;
}

/**
 * Four approximate cycling bands. Cut points are round W/kg numbers so the
 * line is easy to explain. This is not a race category and not a sex-specific
 * ranking table.
 */
export function ftpWkgBand(wattsPerKg: number): FtpWkgBand | null {
  if (!Number.isFinite(wattsPerKg) || wattsPerKg <= 0) return null;
  if (wattsPerKg < 2.5) return "recreational";
  if (wattsPerKg < 3.5) return "club";
  if (wattsPerKg < 4.5) return "strong_club";
  return "competitive";
}

/**
 * Coggan 7-zone percents of FTP (Allen & Coggan, Training and Racing with a
 * Power Meter). Zone 1 is below 55%. Zone 7 is above 150%. Watts are rounded
 * from those percents, so a 1 W gap can appear between zones.
 */
export type FtpFieldQuery = {
  protocol: FtpFieldProtocol | null;
  power: string | null;
  /** Always kilograms, even when the field is showing pounds. */
  weight: string | null;
  units: FtpUnitSystem;
};

export function kilogramsToPounds(kg: number): number {
  return kg * LB_PER_KG;
}

export function poundsToKilograms(lb: number): number {
  return lb / LB_PER_KG;
}

export function bodyMassToKilograms(
  value: number,
  units: FtpUnitSystem,
): number {
  return units === "imperial" ? poundsToKilograms(value) : value;
}

/** One decimal for the field. Whole numbers drop the trailing zero. */
export function formatDisplayMass(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 10) / 10;
  return String(rounded);
}

/** Two decimals in the shared URL so a typed kilogram survives a reload. */
export function formatCanonicalMass(kg: number): string {
  if (!Number.isFinite(kg)) return "";
  const rounded = Math.round(kg * 100) / 100;
  return String(rounded);
}

/**
 * Inclusive limits in the unit the field is showing.
 * Pound bounds are the 1-decimal values that still fall inside 30–200 kg.
 */
export function bodyMassLimits(units: FtpUnitSystem): { min: number; max: number } {
  if (units === "metric") {
    return { min: FTP_BODY_WEIGHT_MIN_KG, max: FTP_BODY_WEIGHT_MAX_KG };
  }
  return {
    min: Math.ceil(kilogramsToPounds(FTP_BODY_WEIGHT_MIN_KG) * 10) / 10,
    max: Math.floor(kilogramsToPounds(FTP_BODY_WEIGHT_MAX_KG) * 10) / 10,
  };
}

function searchParamsFrom(search: string) {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw);
}

/** Keep a short decimal the user typed. Reject anything that is not a number. */
function readTypedDecimal(raw: string | null) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 8 || trimmed === ".") return null;
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;
  return trimmed;
}

export function parseFtpFieldQuery(search: string): FtpFieldQuery {
  const params = searchParamsFrom(search);
  const protocolRaw = params.get("protocol")?.trim().toUpperCase() ?? "";
  const protocol = (FTP_FIELD_PROTOCOLS as readonly string[]).includes(
    protocolRaw,
  )
    ? (protocolRaw as FtpFieldProtocol)
    : null;
  const units = params.get("units")?.trim().toLowerCase() === "imperial"
    ? "imperial"
    : "metric";
  return {
    protocol,
    power: readTypedDecimal(params.get("power")),
    weight: readTypedDecimal(params.get("weight")),
    units,
  };
}

/**
 * Merge the typed field test into the current query.
 * Default 20-minute protocol is omitted so a blank calculator stays a clean URL.
 */
export function buildFtpFieldSearch(
  currentSearch: string,
  state: {
    protocol: FtpFieldProtocol;
    power: string;
    weight: string;
    units?: FtpUnitSystem;
  },
) {
  const params = searchParamsFrom(currentSearch);
  params.delete("protocol");
  params.delete("power");
  params.delete("weight");
  params.delete("units");
  const power = state.power.trim();
  const weight = state.weight.trim();
  if (state.protocol !== "20MIN") params.set("protocol", state.protocol);
  if (power) params.set("power", power);
  if (weight) params.set("weight", weight);
  if (state.units === "imperial") params.set("units", "imperial");
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Allen & Coggan FTP categories from Untrained through Superior, in the
 * grouping published with Training and Racing with a Power Meter and shown
 * as a population table (men, women, and example watts at 65/70/75 kg).
 * Watt columns apply the men's W/kg cuts. This is not an age-by-sex median.
 */
export const ALLEN_COGGAN_FTP_CATEGORIES = [
  {
    id: "untrained",
    men: "< 2.23",
    women: "< 1.90",
    w65: "< 145 W",
    w70: "< 156 W",
    w75: "< 167 W",
  },
  {
    id: "fair",
    men: "2.23–2.78",
    women: "1.90–2.35",
    w65: "145–181 W",
    w70: "156–195 W",
    w75: "167–209 W",
  },
  {
    id: "good",
    men: "2.79–3.92",
    women: "2.36–3.32",
    w65: "181–255 W",
    w70: "195–274 W",
    w75: "209–294 W",
  },
  {
    id: "excellent",
    men: "3.93–5.04",
    women: "3.33–4.29",
    w65: "255–328 W",
    w70: "275–353 W",
    w75: "295–378 W",
  },
  {
    id: "superior",
    men: "≥ 5.05",
    women: "≥ 4.30",
    w65: "328+ W",
    w70: "354+ W",
    w75: "379+ W",
  },
] as const;

export type AllenCogganFtpCategoryId =
  (typeof ALLEN_COGGAN_FTP_CATEGORIES)[number]["id"];

const ALLEN_CATEGORY_ORDER: AllenCogganFtpCategoryId[] = [
  "untrained",
  "fair",
  "good",
  "excellent",
  "superior",
];

/** Inclusive lower bounds. The next cut is exclusive, matching the published gaps. */
const ALLEN_CATEGORY_CUTS = {
  men: [2.23, 2.79, 3.93, 5.05],
  women: [1.9, 2.36, 3.33, 4.3],
} as const;

export function allenCogganCategoryForWkg(
  wattsPerKg: number,
  sex: "men" | "women",
): AllenCogganFtpCategoryId | null {
  if (!Number.isFinite(wattsPerKg) || wattsPerKg <= 0) return null;
  const cuts = ALLEN_CATEGORY_CUTS[sex];
  if (wattsPerKg < cuts[0]) return ALLEN_CATEGORY_ORDER[0];
  if (wattsPerKg < cuts[1]) return ALLEN_CATEGORY_ORDER[1];
  if (wattsPerKg < cuts[2]) return ALLEN_CATEGORY_ORDER[2];
  if (wattsPerKg < cuts[3]) return ALLEN_CATEGORY_ORDER[3];
  return ALLEN_CATEGORY_ORDER[4];
}

export function cogganZones(ftpWatts: number): CogganZoneWatts[] | null {
  if (!Number.isFinite(ftpWatts) || ftpWatts <= 0) return null;
  const ftp = Math.round(ftpWatts);
  if (ftp <= 0) return null;
  const at = (percent: number) => Math.round((ftp * percent) / 100);

  return [
    { id: "z1", percentLabel: "<55", minWatts: null, maxWatts: at(55) },
    { id: "z2", percentLabel: "56–75", minWatts: at(56), maxWatts: at(75) },
    { id: "z3", percentLabel: "76–90", minWatts: at(76), maxWatts: at(90) },
    { id: "z4", percentLabel: "91–105", minWatts: at(91), maxWatts: at(105) },
    { id: "z5", percentLabel: "106–120", minWatts: at(106), maxWatts: at(120) },
    { id: "z6", percentLabel: "121–150", minWatts: at(121), maxWatts: at(150) },
    { id: "z7", percentLabel: ">150", minWatts: at(150), maxWatts: null },
  ];
}
