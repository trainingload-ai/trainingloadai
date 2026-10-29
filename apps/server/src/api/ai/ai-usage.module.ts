import { Module } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service';

/**
 * 独立用量模块，避免 BillingCore → AiModule → BillingCore 环。
 * Repository 不 export。
 */
@Module({
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class AiUsageModule {}
