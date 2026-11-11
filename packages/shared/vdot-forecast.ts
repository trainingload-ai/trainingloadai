export type VdotForecastStatus =
  | "READY"
  | "INSUFFICIENT_HISTORY"
  | "STALE_HISTORY"
  | "INCOMPARABLE_HISTORY"
  | "MODEL_UNAVAILABLE";

export type VdotForecastWeek = {
  startDate: string;
  endDate: string;
  value: number | null;
  observedDays: number;
};

export type VdotForecastResult = {
  forecastId: string;
  status: VdotForecastStatus;
  asOf: string;
  cutoffDate: string;
  timezone: string;
  source: "FACTOR" | "RACE" | null;
  modelVersion: string | null;
  lastObservationAt: string | null;
  history: VdotForecastWeek[];
  estimatedCurrentLevel: number | null;
  forecasts: Array<{
    week: number;
    startDate: string;
    endDate: string;
    point: number;
    lower80: number;
    upper80: number;
  }>;
};

export type VdotForecastParameters = {
  phi: number;
  levelVariance: number;
  trendVariance: number;
  observationVariance: number;
};

export type VdotForecastArtifact = {
  schemaVersion: 1;
  modelVersion: string;
  trainedThrough: string;
  parameters: VdotForecastParameters;
  intervalScales: number[];
  validation: {
    users: number;
    counts: number[];
    mae: number[];
    baselineMae: number[];
    coverage80: number[];
    intervalScore: number[];
    baselineIntervalScore: number[];
    pairedDifferenceUpper95: number;
  };
};
