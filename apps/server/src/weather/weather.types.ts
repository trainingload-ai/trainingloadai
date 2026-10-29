export type WeatherImpactLevel = 'LOW' | 'MODERATE' | 'HIGH';
export type ThermalImpactLevel = WeatherImpactLevel | 'EXTREME';

export type TodayWeatherImpact =
  | { status: 'unavailable' }
  | {
      status: 'available';
      windowBasis: 'REMAINING_DAY_UP_TO_8H';
      conditionFamily: 'CLEAR' | 'CLOUDY' | 'RAIN' | 'SNOW' | 'STORM' | 'OTHER';
      thermalDirection: 'COLD' | 'NEUTRAL' | 'HEAT';
      thermalImpact: ThermalImpactLevel;
      precipitationRisk: WeatherImpactLevel;
      windImpact: WeatherImpactLevel;
      uvRisk: WeatherImpactLevel;
      overallImpact: ThermalImpactLevel;
      confidence: 'LOW' | 'MEDIUM' | 'HIGH';
      algorithmVersion: 'today-weather-impact-v1';
    };

export type TodayWeatherLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

export type WeatherAttribution = {
  serviceName: string;
  modified: true;
  legalPageUrl?: string;
};

export type RawWeatherSample = {
  forecastStart: string | null;
  conditionCode: string | null;
  precipitationChance: number | null;
  precipitationType: string | null;
  temperatureC: number | null;
  temperatureApparentC: number | null;
  dewPointC: number | null;
  humidityRatio: number | null;
  cloudCoverRatio: number | null;
  pressureHpa: number | null;
  uvIndex: number | null;
  daylight: boolean | null;
  windSpeedKph: number | null;
  windGustKph: number | null;
  windDirectionDeg: number | null;
};

export type RawWeatherWindow = {
  current: RawWeatherSample | null;
  hours: RawWeatherSample[];
  expiresAt: string | null;
  attribution?: WeatherAttribution | null;
};

export type WeatherProviderQuery = {
  latitude: number;
  longitude: number;
  timezone: string;
  locale: string;
  start: Date;
  end: Date;
};

export type TodayWeatherContextResult = {
  impact: TodayWeatherImpact;
  attribution: WeatherAttribution | null;
};

export type ActivityWeatherProviderQuery = {
  latitude: number;
  longitude: number;
  timezone: string;
  at: Date;
};

export type RawActivityWeatherResult = {
  sample: RawWeatherSample | null;
  attribution: WeatherAttribution | null;
};
