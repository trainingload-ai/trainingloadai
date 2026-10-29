import { Module } from '@nestjs/common';
import { PlanAccountDeletionService } from './application/plan-account-deletion.service';
import { PlanAccountDeletionRepository } from './persistence/plan-account-deletion.repository';

/** 账户删除专用窄模块，避免 UsersModule 反向依赖完整 PlanModule。 */
@Module({
  providers: [PlanAccountDeletionRepository, PlanAccountDeletionService],
  exports: [PlanAccountDeletionService],
})
export class PlanAccountDeletionModule {}
