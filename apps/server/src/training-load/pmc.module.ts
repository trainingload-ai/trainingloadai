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

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    UserQueryModule,
    OAuthModule,
    LoadReadoutModule,
  ],
  controllers: [PMCController],
  providers: [PmcRepository, PMCService, PmcInvalidateListener],
  exports: [PMCService],
})
export class PMCModule {}
