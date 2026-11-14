import { AthleteStateUpdatesModule } from '@/athlete-state/updates/athlete-state-updates.module';
import { PmcProjectionService } from './pmc-projection.service';
import { PlanProjectionReadModule } from '@/api/plan/application/plan-projection-read.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../api/user/user.module';
import { PMCService } from './pmc.service';
import { PMCController } from './pmc.controller';
import { OAuthModule } from '@/oauth/oauth.module';
import { LoadReadoutModule } from '@/api/activity/load-readout.module';
import { PmcRepository } from './persistence/pmc.repository';
import { PmcInvalidateListener } from './events/pmc-invalidate.listener';
import { UserQueryModule } from '@/api/user/user-query.module';
import { VdotForecastService } from './vdot-forecast.service';

@Module({
  imports: [
    AthleteStateUpdatesModule,
    PrismaModule,
    PlanProjectionReadModule,
    UsersModule,
    UserQueryModule,
    OAuthModule,
    LoadReadoutModule,
  ],
  controllers: [PMCController],
  providers: [
    PmcRepository,
    PMCService,
    PmcInvalidateListener,
    VdotForecastService,
    PmcProjectionService,
  ],
  exports: [
    PMCService,
    PmcRepository,
    VdotForecastService,
    PmcProjectionService,
  ],
})
export class PMCModule {}
