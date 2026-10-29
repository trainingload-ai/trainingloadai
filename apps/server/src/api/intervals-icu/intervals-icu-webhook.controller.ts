import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  IntervalsIcuWebhookService,
  type IntervalsIcuWebhookPayload,
} from './intervals-icu-webhook.service';
import { RequiresRuntimeCapability } from '@/runtime-capabilities/requires-runtime-capability.decorator';

/**
 * Intervals.icu 入站 webhook。
 * 校验 body.secret 后写入 durable inbox，再立即返回。
 */
@Controller('intervals-icu/webhook')
@RequiresRuntimeCapability('third-party-sync')
export class IntervalsIcuWebhookController {
  private readonly logger = new Logger(IntervalsIcuWebhookController.name);

  constructor(
    private readonly intervalsIcuWebhookService: IntervalsIcuWebhookService,
  ) {}

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  @AllowAnonymous()
  async handleWebhookCallback(@Body() body: IntervalsIcuWebhookPayload) {
    return this.acceptWebhook(body);
  }

  /** 验签并持久化后快速返回；实际业务由 worker 幂等处理。 */
  private async acceptWebhook(body: IntervalsIcuWebhookPayload) {
    const eventCount = Array.isArray(body?.events) ? body.events.length : 0;
    this.logger.log(
      `[acceptWebhook] 收到 Intervals.icu  webhook events=${eventCount}`,
    );

    const result = await this.intervalsIcuWebhookService.enqueue(body);
    return {
      ok: true,
      receivedCount: result.receivedCount,
      acceptedCount: result.acceptedCount,
      duplicateCount: result.duplicateCount,
    };
  }
}
