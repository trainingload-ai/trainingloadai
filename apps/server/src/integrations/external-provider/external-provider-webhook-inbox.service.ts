import { Injectable, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { Prisma, ThirdPartyProvider } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ExternalProviderWebhookSignalService } from './external-provider-webhook-signal.service';

export type ExternalProviderWebhookInboxEvent<
  Payload = Record<string, unknown>,
> = {
  id: string;
  event_type: string;
  external_user_id: string | null;
  attempts: number;
  payload: Payload;
};

/**
 * 持久化、去重的 inbox，用于所有 provider webhook 适配器。
 */
@Injectable()
export class ExternalProviderWebhookInboxService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly signal?: ExternalProviderWebhookSignalService,
  ) {}

  checksum(value: Buffer | string) {
    return createHash('sha256').update(value).digest('hex');
  }

  /** 将事件持久化、去重，并主动唤醒统一 webhook dispatcher。 */
  async enqueue(args: {
    provider: ThirdPartyProvider;
    eventType: string;
    externalUserId?: string | null;
    dedupeKey: string;
    payload: Prisma.InputJsonValue;
    rawChecksum?: string;
  }) {
    // 生成原始校验和
    const rawChecksum =
      args.rawChecksum ?? this.checksum(JSON.stringify(args.payload));
    const eventId = randomUUID();
    const created = await this.prisma.externalProviderWebhookEvent.createMany({
      data: [
        {
          id: eventId,
          provider: args.provider,
          eventType: args.eventType,
          externalUserId: args.externalUserId ?? null,
          dedupeKey: args.dedupeKey,
          rawChecksum,
          payload: args.payload,
          status: 'PENDING',
        },
      ],
      skipDuplicates: true,
    });

    if (created.count === 1) {
      this.signal?.notify(args.provider);
      return { accepted: true, enqueued: true, eventId };
    }

    const existing = await this.prisma.externalProviderWebhookEvent.findUnique({
      where: {
        provider_dedupeKey: {
          provider: args.provider,
          dedupeKey: args.dedupeKey,
        },
      },
      select: { id: true },
    });
    if (!existing) {
      throw new Error(
        `Webhook 去重写入未返回记录：provider=${args.provider} dedupeKey=${args.dedupeKey}`,
      );
    }
    return {
      accepted: true,
      enqueued: false,
      eventId: existing.id,
    };
  }

  /**
   * 领取事件。
   * @param provider 提供者
   * @param options 选项
   * @returns 领取的事件列表
   */
  claim<Payload = Record<string, unknown>>(
    provider: ThirdPartyProvider,
    options: {
      batchSize?: number;
      maxAttempts?: number;
      staleAfterMs?: number;
    } = {},
  ) {
    // 设置批量大小、最大重试次数、过期时间
    const batchSize = Math.max(1, Math.min(100, options.batchSize ?? 10));
    // 设置最大重试次数
    const maxAttempts = Math.max(1, options.maxAttempts ?? 8);
    // 设置过期时间
    const staleAfterSeconds = Math.max(
      30,
      Math.ceil((options.staleAfterMs ?? 5 * 60_000) / 1000),
    );
    return this.prisma.$queryRawUnsafe<
      Array<ExternalProviderWebhookInboxEvent<Payload>>
    >(
      `WITH picked AS (
         SELECT id
         FROM t_external_provider_webhook_event
         WHERE provider = $1::text::enum_third_party_provider
           AND (
             (status IN ('PENDING', 'FAILED') AND available_at <= NOW())
             OR (
               status = 'PROCESSING'
               AND locked_at <= NOW() - ($4 * INTERVAL '1 second')
             )
           )
           AND attempts < $2
         ORDER BY received_at ASC
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       UPDATE t_external_provider_webhook_event e
       SET status = 'PROCESSING',
           locked_at = NOW(),
           attempts = e.attempts + 1,
           updated_at = NOW()
       FROM picked
       WHERE e.id = picked.id
       RETURNING e.*`,
      provider,
      maxAttempts,
      batchSize,
      staleAfterSeconds,
    );
  }

  countOutstanding(provider: ThirdPartyProvider) {
    return this.prisma.externalProviderWebhookEvent.count({
      where: {
        provider,
        status: { in: ['PENDING', 'FAILED', 'PROCESSING'] },
      },
    });
  }

  markDone(id: string) {
    return this.prisma.externalProviderWebhookEvent.update({
      where: { id },
      data: {
        status: 'DONE',
        processedAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    });
  }

  markIgnored(id: string) {
    return this.prisma.externalProviderWebhookEvent.update({
      where: { id },
      data: {
        status: 'IGNORED',
        processedAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    });
  }

  markFailed(args: {
    id: string;
    attempts: number;
    error: unknown;
    maxAttempts?: number;
  }) {
    const maxAttempts = Math.max(1, args.maxAttempts ?? 8);
    const delay = Math.min(
      60 * 60_000,
      30_000 * 2 ** Math.min(Math.max(0, args.attempts - 1), 7),
    );
    const message =
      args.error instanceof Error ? args.error.message : String(args.error);
    return this.prisma.externalProviderWebhookEvent.update({
      where: { id: args.id },
      data: {
        status: args.attempts >= maxAttempts ? 'DEAD' : 'FAILED',
        availableAt: new Date(Date.now() + delay),
        lockedAt: null,
        lastError: message.slice(0, 1000),
      },
    });
  }
}
