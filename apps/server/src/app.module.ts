import { Module, NestModule, MiddlewareConsumer, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/config';

import { AppController } from './app.controller';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { ActivityModule } from './api/activity/activity.module';
import { LoggerMiddleware } from './middleware/logger.middleware';
import { RegionMiddleware } from './middleware/region.middleware';
import { getAuthConfig } from './auth';
import { UsersModule } from './api/user/user.module';
import { SensorDataModule } from './sensor/sensor-data.module';
import { ChartsModule } from './api/charts/charts.module';
import { ElevationModule } from './elevation/elevation.module';
import { PowerModule } from './power/power.module';
import { PMCModule } from './training-load/pmc.module';
import { HeartRateModule } from './heart-rate/heart-rate.module';
import { AiModule } from './api/ai/ai.module';
import { SyncModule } from './sync/sync.module';
import { WorkoutModule } from './api/workout/workout.module';
import { PlanModule } from './api/plan/plan.module';
import { AnalyzeModule } from './analyze/analyze.module';
import { PaceModule } from './api/pace/pace.module';
import { PublicModule } from './api/public/public.module';
import { CalendarModule } from './api/calendar/calendar.module';
import * as path from 'path';
import { existsSync } from 'fs';
import { APP_GUARD } from '@nestjs/core';
import { ResponseInterceptor } from './response.interceptor';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiThrottlerGuard } from './guard/api-throttler.guard';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ReviewModule } from './review/review.module';
import { NotificationModule } from './api/notification/notification.module';
import { ReviewApiModule } from './api/review/review.module';
import { ImportingModule } from './importing';
import { IntervalsIcuModule } from './api/intervals-icu/intervals-icu.module';
import { SportCatalogModule } from './sports/sport-catalog.module';
import { OAuthModule } from './oauth/oauth.module';
import { OAuthHybridAuthGuard } from './oauth/oauth-hybrid-auth.guard';
import { CompetitionModule } from './api/competition/competition.module';
import { HealthDataModule } from './health-data/health-data.module';
import { UserDataExportModule } from './user-data-export/user-data-export.module';
import { PlanTemplateModule } from './api/plan-template/plan-template.module';
import { RuntimeCapabilityModule } from './runtime-capabilities/runtime-capability.module';
import { RuntimeCapabilityGuard } from './runtime-capabilities/runtime-capability.guard';
import { HealthModule } from './health/health.module';
import { FeatureAccessModule } from './access/feature-access.module';

import {
  AcceptLanguageResolver,
  I18nJsonLoader,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';

function readNumberEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const envFilePath = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.join(__dirname, '../../../.env'),
  path.join(__dirname, '../../../../../../.env'),
];

@Module({
  imports: [
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loader: I18nJsonLoader,
      loaderOptions: (() => {
        const explicitCatalog = process.env.SERVER_MESSAGE_CATALOG_PATH?.trim();
        if (explicitCatalog && !existsSync(path.resolve(explicitCatalog))) {
          throw new Error('Configured server message catalog does not exist');
        }
        if (process.env.DEPLOYMENT_MODE === 'cloud' && !explicitCatalog) {
          throw new Error('Cloud requires an explicit composed server message catalog');
        }
        const candidates = [
          ...(process.env.SERVER_MESSAGE_CATALOG_PATH?.trim()
            ? [path.resolve(process.env.SERVER_MESSAGE_CATALOG_PATH)] : []),
          // apps/server is the normal workspace and container working directory.
          path.resolve(process.cwd(), '../../packages/messages/server'),
          // Repository-root commands remain supported for maintenance tooling.
          path.resolve(process.cwd(), 'packages/messages/server'),
          // ts-node development resolves from apps/server/src.
          path.join(__dirname, '../../../packages/messages/server'),
          // Compiled output resolves from apps/server/dist/apps/server/src.
          path.join(__dirname, '../../../../../../packages/messages/server'),
        ];
        const resolvedPath =
          candidates.find((p) => existsSync(p)) || candidates[0];
        new Logger('I18nLoader').log(
          `[i18n] using loader path -> ${resolvedPath}`,
        );
        return {
          path: resolvedPath,
          watch: true,
        };
      })(),
      resolvers: [
        // Prioritize explicit headers: if both Accept-Language and x-lang exist, x-lang prevails
        new HeaderResolver(['x-lang']),
        { use: QueryResolver, options: ['lang'] },
        // Finally fallback to Accept-Language (could be locale codes like zh-CN)
        AcceptLanguageResolver,
      ],
    }),
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath,
    }),
    RuntimeCapabilityModule,
    FeatureAccessModule,
    HealthModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: readNumberEnv('PUBLIC_THROTTLE_DEFAULT_TTL_MS', 60_000),
        limit: readNumberEnv('PUBLIC_THROTTLE_DEFAULT_LIMIT', 10),
      },
      {
        name: 'ai',
        ttl: readNumberEnv('AI_THROTTLE_TTL_MS', 60_000),
        limit: readNumberEnv('AI_THROTTLE_LIMIT', 20),
      },
      {
        name: 'aiCoachRead',
        ttl: readNumberEnv('AI_COACH_READ_THROTTLE_TTL_MS', 60_000),
        limit: readNumberEnv('AI_COACH_READ_THROTTLE_LIMIT', 120),
      },
    ]),
    PrismaModule,
    HealthDataModule,
    StorageModule,
    ActivityModule,
    UsersModule,
    SensorDataModule,
    ChartsModule,
    ElevationModule,
    PowerModule,
    PMCModule,
    HeartRateModule,
    AuthModule.forRoot(getAuthConfig(), {
      disableTrustedOriginsCors: false,
      disableGlobalAuthGuard: true,
      // Nest 的全局 body parser 为 Better Auth 关闭后，请求体由该模块重新解析。
      // 签名验证的外部 webhook 需要精确的原始字节，因此必须同时保留 rawBody。
      bodyParser: {
        rawBody: true,
      },
    }),
    AiModule,
    IntervalsIcuModule,
    SportCatalogModule,
    SyncModule,
    WorkoutModule,
    PlanModule,
    AnalyzeModule,
    PaceModule,
    PublicModule,
    CalendarModule,
    CompetitionModule,
    ReviewModule,
    NotificationModule,
    ReviewApiModule,
    ImportingModule,
    OAuthModule,
    UserDataExportModule,
    PlanTemplateModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ResponseInterceptor,
    {
      provide: APP_GUARD,
      useExisting: OAuthHybridAuthGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: RuntimeCapabilityGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RegionMiddleware)
      .forRoutes('*')
      .apply(LoggerMiddleware)
      .forRoutes('*');
  }
}
