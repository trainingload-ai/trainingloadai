import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThirdPartyProvider } from '@prisma/client';
import { WorkerDrainProgress } from '@/workers/worker-drain-progress';
import {
  ExternalProviderWebhookInboxService,
  type ExternalProviderWebhookInboxEvent,
} from './external-provider-webhook-inbox.service';
import { ExternalProviderWebhookSignalService } from './external-provider-webhook-signal.service';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';

export type ExternalProviderWebhookProcessResult = 'DONE' | 'IGNORED';

export type ExternalProviderWebhookHandler<Payload = Record<string, unknown>> =
  {
    provider: ThirdPartyProvider;
    label: string;
    process(
      event: ExternalProviderWebhookInboxEvent<Payload>,
    ): Promise<ExternalProviderWebhookProcessResult>;
  };

const positiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

/**
 * 所有 provider 共用的 webhook inbox 调度器。
 *
 * provider adapter 只处理单条事件；本服务统一负责主动唤醒、轮询兜底、
 * SKIP LOCKED 认领、并发保护以及 DONE / IGNORED / FAILED 状态流转。
 */
@Injectable()
export class ExternalProviderWebhookDispatcherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    ExternalProviderWebhookDispatcherService.name,
  );
  private readonly handlers = new Map<
    ThirdPartyProvider,
    ExternalProviderWebhookHandler<unknown>
  >();
  private readonly draining = new Set<ThirdPartyProvider>();
  private timer: NodeJS.Timeout | null = null;
  private unsubscribeSignal: (() => boolean) | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly inbox: ExternalProviderWebhookInboxService,
    private readonly signal: ExternalProviderWebhookSignalService,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  onModuleInit() {
    if (this.capabilities?.isEnabled('third-party-sync') === false) {
      this.logger.log('[webhook-dispatcher] capability disabled');
      return;
    }
    this.unsubscribeSignal = this.signal.subscribe((provider) =>
      this.scheduleDrain(provider),
    );
    this.timer = setInterval(() => void this.drainAll(), this.pollMs());
    void this.drainAll();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.unsubscribeSignal?.();
  }

  /** 注册 provider 的单事件处理器；同一 provider 只能有一个 adapter。 */
  register<Payload>(handler: ExternalProviderWebhookHandler<Payload>) {
    if (this.handlers.has(handler.provider)) {
      throw new Error(
        `Webhook handler already registered for ${handler.provider}`,
      );
    }
    this.handlers.set(
      handler.provider,
      handler as ExternalProviderWebhookHandler<unknown>,
    );
    if (this.capabilities?.isEnabled('third-party-sync') !== false) {
      this.scheduleDrain(handler.provider);
    }
    return () => this.handlers.delete(handler.provider);
  }

  /** 并行排空当前已注册 provider；provider 内部保持单实例不重叠。 */
  async drainAll() {
    await Promise.all(
      [...this.handlers.keys()].map((provider) => this.drain(provider)),
    );
  }

  private pollMs() {
    return positiveInt(
      this.config.get<number>('thirdPartyWebhookWorker.pollMs'),
      1000,
    );
  }

  private claimOptions() {
    return {
      batchSize: positiveInt(
        this.config.get<number>('thirdPartyWebhookWorker.batchSize'),
        10,
      ),
      maxAttempts: positiveInt(
        this.config.get<number>('thirdPartyWebhookWorker.maxAttempts'),
        8,
      ),
      staleAfterMs: positiveInt(
        this.config.get<number>('thirdPartyWebhookWorker.staleAfterMs'),
        5 * 60_000,
      ),
    };
  }

  private scheduleDrain(provider: ThirdPartyProvider) {
    queueMicrotask(() => {
      void this.drain(provider).catch((error) => {
        this.logger.error(
          `[webhook-dispatcher] provider=${provider} 调度失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    });
  }

  private async drain(provider: ThirdPartyProvider) {
    const handler = this.handlers.get(provider);
    if (!handler || this.draining.has(provider)) return;
    this.draining.add(provider);
    const options = this.claimOptions();
    try {
      const events = await this.inbox.claim<unknown>(provider, options);
      const progress = new WorkerDrainProgress(
        this.logger,
        `${handler.label} Webhook 队列`,
        async () => ({
          remaining: await this.inbox.countOutstanding(provider),
        }),
      );
      for (const [index, event] of events.entries()) {
        await progress.run({
          batchPosition: index + 1,
          batchTotal: events.length,
          details: `事件ID=${event.id} 事件类型=${event.event_type}`,
          task: () => this.process(handler, event, options.maxAttempts),
        });
      }
      if (events.length === options.batchSize) this.scheduleDrain(provider);
    } finally {
      this.draining.delete(provider);
    }
  }

  private async process(
    handler: ExternalProviderWebhookHandler<unknown>,
    event: ExternalProviderWebhookInboxEvent<unknown>,
    maxAttempts: number,
  ) {
    try {
      const result = await handler.process(event);
      if (result === 'IGNORED') {
        await this.inbox.markIgnored(event.id);
      } else {
        await this.inbox.markDone(event.id);
      }
    } catch (error) {
      await this.inbox.markFailed({
        id: event.id,
        attempts: event.attempts,
        maxAttempts,
        error,
      });
      this.logger.warn(
        `[webhook-dispatcher] provider=${handler.provider} event=${event.id} 处理失败`,
      );
    }
  }
}
