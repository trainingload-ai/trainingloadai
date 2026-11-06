import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { UserAnalysisConfigService } from './user-analysis-config.service';
import { UserQueryModule } from './user-query.module';

@Module({
  imports: [PrismaModule, UserQueryModule],
  providers: [UserAnalysisConfigService],
  exports: [UserAnalysisConfigService],
})
export class UserAnalysisConfigModule {}
