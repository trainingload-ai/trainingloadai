export type WorkoutExpressionSportType =
  | 'RUN'
  | 'CYCLING'
  | 'SWIM'
  | string
  | null
  | undefined;

export type WorkoutExpressionSpeedUnit = 'sec/km' | 'sec/100m' | 'km/h';

const roundTo = (value: number, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const isSwimExpressionSport = (sportType: WorkoutExpressionSportType) =>
  `${sportType ?? ''}`.toUpperCase() === 'SWIM';

export const getExpressionSpeedUnitForSport = (
  sportType: WorkoutExpressionSportType,
): Extract<WorkoutExpressionSpeedUnit, 'sec/km' | 'sec/100m'> =>
  isSwimExpressionSport(sportType) ? 'sec/100m' : 'sec/km';

export const normalizeExpressionSpeedUnit = (
  unit: string | null | undefined,
  sportType: WorkoutExpressionSportType,
): Extract<WorkoutExpressionSpeedUnit, 'sec/km' | 'sec/100m'> => {
  if (unit === 'sec/100m' || unit === 's/100m') return 'sec/100m';
  if (unit === 'sec/km' || unit === 's/km') return 'sec/km';
  return getExpressionSpeedUnitForSport(sportType);
};

export const expressionSpeedUnitToToken = (
  unit: WorkoutExpressionSpeedUnit | null | undefined,
) => {
  if (unit === 'sec/100m') return 's/100m';
  if (unit === 'sec/km') return 's/km';
  return 'km/h';
};

export const convertExpressionSpeedToKmh = (
  value: number,
  unit: WorkoutExpressionSpeedUnit,
) => {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (unit === 'km/h') return value;
  return unit === 'sec/100m' ? 360 / value : 3600 / value;
};

export const averageExpressionSpeedAsKmh = (
  low: number | undefined,
  high: number | undefined,
  unit: WorkoutExpressionSpeedUnit,
) => {
  const values = [low, high]
    .filter((value): value is number => Number.isFinite(value as number))
    .map((value) => convertExpressionSpeedToKmh(value, unit))
    .filter((value): value is number => Number.isFinite(value as number));

  if (!values.length) return undefined;
  return roundTo(values.reduce((sum, item) => sum + item, 0) / values.length);
};

export const parseTargetValueWithUnit = (
  valueToken: string,
  unitToken?: string,
): {
  low: number;
  high?: number;
  unit?: string;
  consumedUnitToken: boolean;
} | null => {
  const normalizedValue = valueToken.trim();
  const normalizedUnit = unitToken?.trim();
  const inline = normalizedValue.match(
    /^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?(%|W|rpm|bpm|km\/h|s\/km|sec\/km|s\/100m|sec\/100m|°)$/i,
  );

  if (inline) {
    return {
      low: Number(inline[1]),
      high:
        inline[2] != null && inline[2] !== '' ? Number(inline[2]) : undefined,
      unit: inline[3],
      consumedUnitToken: false,
    };
  }

  const explicitUnitMatch = normalizedUnit?.match(
    /^(%|W|rpm|bpm|km\/h|s\/km|sec\/km|s\/100m|sec\/100m|°)$/i,
  );
  const ranged = normalizedValue.match(
    /^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?$/,
  );
  if (!ranged) return null;

  return {
    low: Number(ranged[1]),
    high: ranged[2] != null && ranged[2] !== '' ? Number(ranged[2]) : undefined,
    unit: explicitUnitMatch?.[1],
    consumedUnitToken: Boolean(explicitUnitMatch),
  };
};
