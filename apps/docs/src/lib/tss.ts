export type PowerKind = "normalized" | "average";

export type TssInput = {
  durationHours: number;
  powerWatts: number;
  ftpWatts: number;
  powerKind: PowerKind;
};

export type TssResult = {
  intensityFactor: number;
  tss: number;
  durationHours: number;
  powerKind: PowerKind;
};

export const TSS_FTP_HOUR = 100;

export function parseNonNegativeNumber(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parsePositiveNumber(value: string): number | null {
  const n = parseNonNegativeNumber(value);
  if (n == null || n <= 0) return null;
  return n;
}

export function durationHoursFromParts(
  hours: number,
  minutes: number,
): number | null {
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || minutes < 0 || minutes >= 60) return null;
  const durationHours = hours + minutes / 60;
  if (durationHours <= 0) return null;
  return durationHours;
}

export function intensityFactor(powerWatts: number, ftpWatts: number): number | null {
  if (!Number.isFinite(powerWatts) || !Number.isFinite(ftpWatts)) return null;
  if (powerWatts <= 0 || ftpWatts <= 0) return null;
  return powerWatts / ftpWatts;
}

/**
 * Cycling Training Stress Score:
 * TSS = hours × (NP / FTP)² × 100
 *
 * Equivalent form used in the metric docs:
 * TSS = (t × NP × IF) / (FTP × 3600) × 100
 *
 * Average power can be substituted when NP is unavailable; variable sessions
 * are then understated because NP weights surges more than a mean wattage.
 */
export function calculateTss(input: TssInput): TssResult | null {
  const { durationHours, powerWatts, ftpWatts, powerKind } = input;
  if (!Number.isFinite(durationHours) || durationHours <= 0) return null;

  const ifactor = intensityFactor(powerWatts, ftpWatts);
  if (ifactor == null) return null;

  return {
    intensityFactor: ifactor,
    tss: durationHours * ifactor * ifactor * TSS_FTP_HOUR,
    durationHours,
    powerKind,
  };
}

export function formatTssScore(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(value >= 100 ? 0 : 1);
}

export function formatIntensityFactor(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(2);
}
