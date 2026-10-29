import { Injectable } from '@nestjs/common';
import type { ThirdPartyProvider } from '@prisma/client';

type WebhookInboxListener = (provider: ThirdPartyProvider) => void;

/**
 * 进程内 webhook inbox 唤醒信号。
 *
 * 数据库 inbox 仍是唯一可靠来源；该信号只用于新事件落库后立即唤醒 worker，
 * 定时轮询负责跨进程通知丢失与服务重启后的兜底恢复。
 */
@Injectable()
export class ExternalProviderWebhookSignalService {
  private readonly listeners = new Set<WebhookInboxListener>();

  subscribe(listener: WebhookInboxListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(provider: ThirdPartyProvider) {
    for (const listener of this.listeners) listener(provider);
  }
}
