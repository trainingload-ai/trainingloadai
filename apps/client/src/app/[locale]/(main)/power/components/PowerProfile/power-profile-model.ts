import { type DurationKey, type ProfileType } from "./utils";

export const POWER_PROFILE_DURATION_ORDER = ["5s", "1m", "5m", "FTP"] as const;

export const MALE_POWER_PROFILE_GRID: Array<Record<DurationKey, number>> = [
  { "5s": 22.75, "1m": 10.56, "5m": 6.86, FTP: 5.93 },
  { "5s": 20.94, "1m": 9.85, "5m": 6.12, FTP: 5.26 },
  { "5s": 19.12, "1m": 9.15, "5m": 5.48, FTP: 4.69 },
  { "5s": 17.31, "1m": 8.44, "5m": 4.85, FTP: 4.12 },
  { "5s": 15.49, "1m": 7.74, "5m": 4.21, FTP: 3.55 },
  { "5s": 13.68, "1m": 7.03, "5m": 3.58, FTP: 2.98 },
  { "5s": 11.86, "1m": 6.33, "5m": 2.95, FTP: 2.41 },
  { "5s": 10.04, "1m": 5.63, "5m": 2.31, FTP: 1.83 },
  { "5s": 8.23, "1m": 4.92, "5m": 1.68, FTP: 1.26 },
];

export const FEMALE_POWER_PROFILE_GRID: Array<Record<DurationKey, number>> = [
  { "5s": 17.65, "1m": 8.54, "5m": 5.96, FTP: 5.0 },
  { "5s": 16.33, "1m": 7.99, "5m": 5.37, FTP: 4.51 },
  { "5s": 15.01, "1m": 7.43, "5m": 4.79, FTP: 4.01 },
  { "5s": 13.69, "1m": 6.88, "5m": 4.2, FTP: 3.5 },
  { "5s": 12.37, "1m": 6.32, "5m": 3.62, FTP: 3.0 },
  { "5s": 11.05, "1m": 5.77, "5m": 3.03, FTP: 2.5 },
  { "5s": 9.73, "1m": 5.21, "5m": 2.45, FTP: 1.99 },
  { "5s": 8.4, "1m": 4.65, "5m": 1.87, FTP: 1.49 },
  { "5s": 7.0, "1m": 4.1, "5m": 1.28, FTP: 0.99 },
];

export const MALE_POWER_PROFILE_DEMO: Record<DurationKey, number> = {
  "5s": 12.0,
  "1m": 6.0,
  "5m": 3.8,
  FTP: 3.2,
};

export const FEMALE_POWER_PROFILE_DEMO: Record<DurationKey, number> = {
  "5s": 9.0,
  "1m": 5.0,
  "5m": 3.0,
  FTP: 2.5,
};

export function findPowerProfileCellPositionAndRatio(
  grid: Array<Record<DurationKey, number>>,
  value: number,
  key: DurationKey,
): { rowIndex: number | null; ratio: number } {
  if (!Number.isFinite(value)) return { rowIndex: null, ratio: 0 };
  const size = grid.length;
  if (size === 0) return { rowIndex: null, ratio: 0 };

  if (value >= grid[0][key]) return { rowIndex: 0, ratio: 1 };
  for (let i = 0; i < size - 1; i++) {
    const upper = grid[i][key];
    const lower = grid[i + 1][key];
    if (value <= upper && value > lower) {
      const span = Math.max(upper - lower, 1e-6);
      const ratio = (value - lower) / span;
      return { rowIndex: i, ratio: Math.max(0, Math.min(1, ratio)) };
    }
  }

  return {
    rowIndex: size - 1,
    ratio: Math.max(0, Math.min(1, value / grid[size - 1][key])),
  };
}

function scorePowerProfileValue(
  grid: Array<Record<DurationKey, number>>,
  key: DurationKey,
  value: number,
) {
  const position = findPowerProfileCellPositionAndRatio(grid, value, key);
  if (position.rowIndex == null) return null;
  return position.rowIndex + (1 - position.ratio);
}

export function classifyPowerProfile(args: {
  grid: Array<Record<DurationKey, number>>;
  values: Record<DurationKey, number>;
}) {
  const s5 = scorePowerProfileValue(args.grid, "5s", args.values["5s"]);
  const s1 = scorePowerProfileValue(args.grid, "1m", args.values["1m"]);
  const s5m = scorePowerProfileValue(args.grid, "5m", args.values["5m"]);
  const sftp = scorePowerProfileValue(args.grid, "FTP", args.values["FTP"]);

  if (s5 == null || s1 == null || s5m == null || sftp == null) {
    return { type: null as null | ProfileType };
  }

  const allScores = [s5, s1, s5m, sftp];
  const scoreSpan = Math.max(...allScores) - Math.min(...allScores);
  const shortDurationScore = (s5 + s1) / 2;
  const longDurationScore = (s5m + sftp) / 2;

  let type: ProfileType = "All Rounder";
  if (scoreSpan <= 1.2) {
    type = "All Rounder";
  } else if (shortDurationScore + 0.8 < longDurationScore) {
    type = "Sprinter";
  } else if (longDurationScore + 0.8 < shortDurationScore) {
    type = "Time Trialist";
  } else if (
    s1 <= s5 - 0.5 &&
    s1 <= sftp - 0.5 &&
    s5m <= s5 - 0.5 &&
    s5m <= sftp - 0.5
  ) {
    type = "Pursuiter";
  }

  return { type };
}
