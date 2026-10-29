import { Module } from '@nestjs/common';
import { WeatherImpactDeriver } from './weather-impact.deriver';
import { WeatherContextService } from './weather-context.service';
import { WEATHER_PROVIDER, createDeploymentWeatherProvider } from './providers/weather-provider';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '@/prisma/prisma.module';
import { SensorDataModule } from '@/sensor/sensor-data.module';
import { ActivityWeatherService } from './activity-weather.service';

@Module({
  imports: [PrismaModule, SensorDataModule],
  providers: [
    WeatherImpactDeriver,
    WeatherContextService,
    ActivityWeatherService,
    { provide: WEATHER_PROVIDER, useFactory: createDeploymentWeatherProvider, inject: [ConfigService] },
  ],
  exports: [WeatherContextService, ActivityWeatherService],
})
export class WeatherModule {}
