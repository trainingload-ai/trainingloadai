import { Injectable, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Prisma, type ThirdPartyProvider } from '@prisma/client';
import type { PrismaTx } from '@/prisma/prisma-db';
import { PrismaService } from '@/prisma/prisma.service';
import { ExternalProviderWebhookSignalService } from './external-provider-webhook-signal.service';

export type ExternalProviderWebhookInboxEvent<
  Payload = Record<string, unknown>,
> = {
  id: string;
  event_type: string;
  external_user_id: string | null;
  attempts: number;
  locked_at?: Date;
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

  /** Existing waiting tasks are the durable cooldown record. No synthetic job or quota table. */
  async rateLimitUntil(
    provider: ThirdPartyProvider,
    scopeKeys: string[],
    tx?: PrismaTx,
  ): Promise<Date | null> {
    if (
      !scopeKeys.length ||
      scopeKeys.length > 10 ||
      scopeKeys.some((key) => !/^[a-z0-9:_-]{1,200}$/.test(key))
    )
      throw new Error('PROVIDER_RETRY_SCOPE_INVALID');
    const row = await (
      tx ?? this.prisma
    ).externalProviderWebhookEvent.findFirst({
      where: {
        provider,
        status: { in: ['PENDING', 'FAILED', 'PROCESSING'] },
        lastError: 'PROVIDER_RATE_LIMITED',
        availableAt: { gt: new Date() },
        OR: scopeKeys.map((key) => ({
          payload: { path: ['__rateLimit', 'scopeKey'], equals: key },
        })),
      },
      orderBy: { availableAt: 'desc' },
      select: { availableAt: true },
    });
    return row?.availableAt ?? null;
  }

  /** Postpone existing eligible work; in-flight owners must still recheck before outbound I/O. */
  async pausePending(
    args: {
      provider: ThirdPartyProvider;
      until: Date;
      scopeKey: string;
      eventTypes: string[];
      externalUserId?: string;
    },
    tx?: PrismaTx,
  ) {
    if (
      !Number.isFinite(args.until.getTime()) ||
      !/^[a-z0-9:_-]{1,200}$/.test(args.scopeKey) ||
      !args.eventTypes.length ||
      args.eventTypes.length > 100
    )
      throw new Error('PROVIDER_DEFER_INVALID');
    const marker = JSON.stringify({
      scopeKey: args.scopeKey,
      until: args.until.toISOString(),
    });
    return (tx ?? this.prisma).$executeRaw(
      Prisma.sql`UPDATE t_external_provider_webhook_event SET status='PENDING',available_at=GREATEST(available_at,${args.until}),last_error='PROVIDER_RATE_LIMITED',payload=jsonb_set(payload,'{__rateLimit}',COALESCE(payload->'__rateLimit','{}'::jsonb)||${marker}::jsonb),updated_at=NOW() WHERE provider=${args.provider}::text::enum_third_party_provider AND status IN ('PENDING','FAILED') AND event_type IN (${Prisma.join(args.eventTypes)}) ${args.externalUserId ? Prisma.sql`AND external_user_id=${args.externalUserId}` : Prisma.empty}`,
    );
  }

  /** Atomically release only this claim and preserve the processing-failure retry budget. */
  async defer(args: {
    id: string;
    attempts: number;
    lockedAt: Date;
    until: Date;
    scopeKey: string;
  }) {
    if (
      !Number.isFinite(args.until.getTime()) ||
      !Number.isFinite(args.lockedAt?.getTime()) ||
      !Number.isSafeInteger(args.attempts) ||
      args.attempts < 1 ||
      !/^[a-z0-9:_-]{1,200}$/.test(args.scopeKey)
    )
      throw new Error('PROVIDER_DEFER_INVALID');
    const marker = JSON.stringify({
      scopeKey: args.scopeKey,
      until: args.until.toISOString(),
    });
    return this.prisma.$executeRaw(
      Prisma.sql`UPDATE t_external_provider_webhook_event SET status='PENDING',available_at=GREATEST(available_at,${args.until}),attempts=GREATEST(attempts-1,0),locked_at=NULL,processed_at=NULL,last_error='PROVIDER_RATE_LIMITED',payload=jsonb_set(payload,'{__rateLimit}',${marker}::jsonb || jsonb_build_object('count',LEAST(1000,COALESCE((payload->'__rateLimit'->>'count')::int,0)+1))),updated_at=NOW() WHERE id=${args.id} AND status='PROCESSING' AND attempts=${args.attempts} AND locked_at=${args.lockedAt}`,
    );
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
