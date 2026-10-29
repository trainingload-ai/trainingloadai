import type { ConfigService } from '@nestjs/config';
import type {
  ActivityWeatherProviderQuery,
  RawActivityWeatherResult,
  RawWeatherWindow,
  WeatherAttribution,
  WeatherProviderQuery,
} from '../weather.types';

export const WEATHER_PROVIDER = Symbol('WEATHER_PROVIDER');

export interface WeatherProvider {
  isConfigured(): boolean;
  getRemainingDayWeather(
    query: WeatherProviderQuery,
  ): Promise<RawWeatherWindow>;
  getAttribution(locale: string): Promise<WeatherAttribution>;
  getHourAt(
    query: ActivityWeatherProviderQuery,
  ): Promise<RawActivityWeatherResult>;
}

let deploymentFactory: ((config: ConfigService) => WeatherProvider) | null = null;
export function registerWeatherProviderFactory(factory: (config: ConfigService) => WeatherProvider) {
  if (deploymentFactory) throw new Error('Weather provider factory already registered');
  deploymentFactory = factory;
}
export function createDeploymentWeatherProvider(config: ConfigService): WeatherProvider {
  return deploymentFactory?.(config) ?? {
    isConfigured: () => false,
    getRemainingDayWeather: async () => ({ current: null, hours: [], expiresAt: null }),
    getAttribution: async () => ({ serviceName: '', modified: true }),
    getHourAt: async () => ({ sample: null, attribution: null }),
  };
}
