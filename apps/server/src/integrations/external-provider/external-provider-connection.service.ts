import { Injectable } from '@nestjs/common';
import type { Prisma, ThirdPartyProvider } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { PrismaClientSlice } from '@/prisma/prisma-db';
import { ExternalProviderConnectionRepository } from './persistence/external-provider-connection.repository';
import {
  canonicalSettingsUpdateData,
  legacySettingsPatch,
} from './external-provider-contract';
import type { ThirdPartyProviderId } from '@shared/third-party-integration';

/**
 * ExternalProviderConnection 读写封装：查询连接、同步状态审计、开关与撤销。
 */
@Injectable()
export class ExternalProviderConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ExternalProviderConnectionRepository,
  ) {}

  model(tx?: PrismaClientSlice<'externalProviderConnection'>) {
    return this.repo.connections(tx);
  }

  /** 该 user+provider 的任意连接行（不限状态）。 */
  find(userId: string, provider: ThirdPartyProvider) {
    return this.model().findUnique({
      where: { userId_provider: { userId, provider } },
    });
  }

  /** 该 user+provider 的 ACTIVE 连接（取首条）。 */
  findActive(userId: string, provider: ThirdPartyProvider) {
    return this.model().findFirst({
      where: { userId, provider, status: 'ACTIVE' },
    });
  }

  /** 按 id 校验归属后返回 ACTIVE 连接。 */
  findActiveById(id: string, userId: string, provider: ThirdPartyProvider) {
    return this.model().findFirst({
      where: { id, userId, provider, status: 'ACTIVE' },
    });
  }

  /** 按远端运动员/用户 id 解析入站 webhook。 */
  findActiveByExternalUserId(
    provider: ThirdPartyProvider,
    externalAthleteId: string,
  ) {
    return this.model().findFirst({
      where: { provider, externalAthleteId, status: 'ACTIVE' },
    });
  }

  /** 标记同步开始并清空 lastError。 */
  markSyncStarted(id: string) {
    return this.model().update({
      where: { id },
      data: { lastSyncStartedAt: new Date(), lastError: null },
    });
  }

  /** 标记同步成功并更新 lastSyncedActivityAt。 */
  markSyncSucceeded(id: string, lastSyncedActivityAt = new Date()) {
    return this.model().update({
      where: { id },
      data: {
        lastSyncCompletedAt: new Date(),
        lastSyncedActivityAt,
        lastError: null,
      },
    });
  }

  /** 软失败：保持 ACTIVE，写入截断后的错误供 UI 展示。 */
  markSyncFailed(id: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return this.model().update({
      where: { id },
      data: { lastError: message.slice(0, 1000) },
    });
  }

  /** 硬失败：标为 INVALID（如 token 吊销 / 永久鉴权错误）。 */
  markInvalid(id: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return this.model().update({
      where: { id },
      data: { status: 'INVALID', lastError: message.slice(0, 1000) },
    });
  }

  /** 更新同步/导出开关，以及可选的厂商专属 metadata JSON。 */
  async updateActivitySyncSettings(
    id: string,
    settings: {
      syncScheduledActivities?: boolean;
      syncWellness?: boolean;
      exportActivities?: boolean;
      syncSportSettings?: boolean;
      exportSportSettings?: boolean;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    const current = await this.model().findUnique({
      where: { id },
    });
    if (!current) {
      return this.model().update({
        where: { id },
        data: {},
      });
    }
    const connection = {
      ...current,
      metadata: settings.metadata ?? current.metadata,
    };
    const canonical = canonicalSettingsUpdateData({
      provider: current.provider as ThirdPartyProviderId,
      connection,
      patch: legacySettingsPatch(settings as Record<string, unknown>),
    });
    return this.model().update({
      where: { id },
      data: {
        ...canonical.data,
        metadata: canonical.data.metadata as Prisma.InputJsonValue,
      },
    });
  }

  /** 撤销连接并清空凭证字段（ciphertext 置为空字符串）。 */
  disconnect(userId: string, provider: ThirdPartyProvider) {
    return this.model().updateMany({
      where: { userId, provider },
      data: {
        status: 'REVOKED',
        credentialCiphertext: '',
        credentialLast4: null,
        credentialFingerprint: null,
      },
    });
  }
}
