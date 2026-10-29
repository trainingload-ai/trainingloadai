import { Module } from '@nestjs/common';
import { UserQueryModule } from '@/api/user/user-query.module';
import { AiDataConsentService } from './ai-data-consent.service';

@Module({
  imports: [UserQueryModule],
  providers: [AiDataConsentService],
  exports: [AiDataConsentService],
})
export class AiDataConsentModule {}
