export const ACTIVITY_WEATHER_CONDITION_CODES = [
  "CLEAR",
  "PARTLY_CLOUDY",
  "CLOUDY",
  "FOG",
  "DRIZZLE",
  "RAIN",
  "HEAVY_RAIN",
  "SLEET",
  "SNOW",
  "HAIL",
  "THUNDERSTORM",
  "WINDY",
  "OTHER",
] as const;

export type ActivityWeatherConditionCode =
  (typeof ACTIVITY_WEATHER_CONDITION_CODES)[number];

export type ActivityWeatherAttribution = {
  serviceName: string;
  modified: true;
  legalPageUrl: string;
};

export type ActivityWeatherSnapshot =
  | { status: "PENDING" }
  | { status: "NOT_APPLICABLE" | "UNAVAILABLE" }
  | {
      status: "AVAILABLE";
      sampleBasis: "MIDPOINT_TRACK_RECORD";
      queryRecordedAt: string;
      sampledAt: string;
      conditionCode: ActivityWeatherConditionCode | null;
      temperatureC: number | null;
      apparentTemperatureC: number | null;
      dewPointC: number | null;
      windChillC: number | null;
      heatIndexC: number | null;
      windSpeedKph: number | null;
      windGustKph: number | null;
      windDirectionDeg: number | null;
      humidityPct: number | null;
      cloudCoverPct: number | null;
      pressureHpa: number | null;
      source: "APPLE_WEATHERKIT";
      attribution: ActivityWeatherAttribution;
    };
