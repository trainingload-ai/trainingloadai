import { Inject, NotFoundException, Param, Controller, Get } from '@nestjs/common';

import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';
import {
  AI_OPERATION_LEDGER,
  type AiOperationLedger,
  toAiOperationResult,
} from './ai-operation-ledger.port';

/**
 * Runtime-neutral status endpoint used to resume idempotent AI operations.
 * Billing and entitlement details deliberately stay outside this Core contract.
 */
@Controller('ai/operations')
export class AiOperationsController {
  constructor(
    @Inject(AI_OPERATION_LEDGER)
    private readonly operations: AiOperationLedger,
  ) {}

  @Get(':operationId')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.AI_PASSIVE_GENERATION)
  async operation(
    @CurrentUserId() userId: string,
    @Param('operationId') operationId: string,
  ) {
    const operation = await this.operations.get(userId, operationId);
    if (!operation) {
      throw new NotFoundException({
        code: 'AI_OPERATION_NOT_FOUND',
        message: 'AI_OPERATION_NOT_FOUND',
      });
    }
    return toAiOperationResult(operation, false);
  }
}
