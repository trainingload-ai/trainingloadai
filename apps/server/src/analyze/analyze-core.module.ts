import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { AlgorithmService } from './algorithm.service';
import { AnalyzeContextBuilderService } from './context-builder.service';
import { AnalyzePersistenceService } from './analyze-persistence.service';
import { PaceEngineService } from './pace/pace-engine.service';
import { PowerEngineService } from './power/power-engine.service';
import { Vo2MaxEngineService } from './vo2max/vo2max-engine.service';

/**
 * 无业务编排依赖的分析内核。Activity metrics 与 Analyze workflow 共同依赖此模块，
 * 避免为了复用算法/持久化能力而互相导入完整 feature module。
 */
@Module({
  imports: [PrismaModule],
  providers: [
    AlgorithmService,
    AnalyzeContextBuilderService,
    AnalyzePersistenceService,
    PaceEngineService,
    PowerEngineService,
    Vo2MaxEngineService,
  ],
  exports: [
    AlgorithmService,
    AnalyzeContextBuilderService,
    AnalyzePersistenceService,
    PaceEngineService,
    PowerEngineService,
    Vo2MaxEngineService,
  ],
})
export class AnalyzeCoreModule {}
