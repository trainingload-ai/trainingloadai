import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { LoadReadoutService } from './load-readout.service';
import { ActivityReadService } from './activity-read.service';

/**
 * 独立小模块封装活动「实际负荷」读取，避免 PlanModule ↔ ActivityModule 的循环依赖。
 * Plan 侧只需消费 LoadReadoutService / ActivityReadService 即可。
 */
@Module({
  imports: [PrismaModule, UserQueryModule],
  providers: [LoadReadoutService, ActivityReadService],
  exports: [LoadReadoutService, ActivityReadService],
})
export class LoadReadoutModule {}
