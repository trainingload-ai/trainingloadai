import { Global, Module } from '@nestjs/common';

import { AI_OPERATION_LEDGER } from '@/api/ai/ai-operation-ledger.port';
import { AI_USAGE_RECORDER } from '@/api/ai/ai-usage-recorder.port';
import { PrismaModule } from '@/prisma/prisma.module';
import { LocalAiOperationPersistenceService } from './local-ai-operation-persistence.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    LocalAiOperationPersistenceService,
    {
      provide: AI_OPERATION_LEDGER,
      useExisting: LocalAiOperationPersistenceService,
    },
    {
      provide: AI_USAGE_RECORDER,
      useExisting: LocalAiOperationPersistenceService,
    },
  ],
  exports: [AI_OPERATION_LEDGER, AI_USAGE_RECORDER],
})
export class SelfHostAiOperationPersistenceModule {}
