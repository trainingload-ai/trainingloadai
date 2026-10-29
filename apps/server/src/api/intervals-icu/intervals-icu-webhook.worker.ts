import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ExternalProviderWebhookDispatcherService,
  type ExternalProviderWebhookProcessResult,
} from '@/integrations/external-provider/external-provider-webhook-dispatcher.service';
import type { ExternalProviderWebhookInboxEvent } from '@/integrations/external-provider/external-provider-webhook-inbox.service';
import {
  IntervalsIcuWebhookService,
  type IntervalsIcuWebhookEvent,
} from './intervals-icu-webhook.service';

/** Intervals.icu webhook adapter：只负责单条事件的 provider 业务。 */
@Injectable()
export class IntervalsIcuWebhookWorker
  implements OnModuleInit, OnModuleDestroy
{
  private unregister: (() => boolean) | null = null;

  constructor(
    private readonly dispatcher: ExternalProviderWebhookDispatcherService,
    private readonly webhooks: IntervalsIcuWebhookService,
  ) {}

  onModuleInit() {
    this.unregister = this.dispatcher.register<IntervalsIcuWebhookEvent>({
      provider: 'intervals_icu',
      label: 'Intervals.icu',
      process: (event) => this.process(event),
    });
  }

  onModuleDestroy() {
    this.unregister?.();
  }

  /** 将单条 inbox 事件交给 Intervals.icu 类型分发器。 */
  private process(
    event: ExternalProviderWebhookInboxEvent<IntervalsIcuWebhookEvent>,
  ): Promise<ExternalProviderWebhookProcessResult> {
    return this.webhooks.processEvent(event.payload);
  }
}
