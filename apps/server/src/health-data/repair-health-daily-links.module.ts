import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { HealthDataIngestService } from './health-data-ingest.service';
import { HealthDataRepository } from './persistence/health-data.repository';

/**
 * 历史每日指标关联修复所需的最小领域装配。
 *
 * 该维护任务只修复 PostgreSQL 中的来源事实与每日投影，不读取对象存储。
 * 不得导入完整 HealthDataModule，否则会无谓启动 StorageModule，并让数据库
 * 维护命令错误依赖当前部署版本的对象存储适配器。
 */
@Module({
  imports: [PrismaModule],
  providers: [HealthDataRepository, HealthDataIngestService],
  exports: [HealthDataRepository, HealthDataIngestService],
})
export class RepairHealthDailyLinksModule {}
