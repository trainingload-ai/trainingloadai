import { Injectable } from '@nestjs/common';
import type { ThirdPartyActivity, ThirdPartyProvider } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import type { CanonicalActivityPayload } from './canonical-activity.types';
import { providerFromSourceKind } from './external-provider-identity';
import { resolveExternalActivityId } from './external-activity-identity-extension.port';

function childSuffix(sourceUid: string) {
  return sourceUid.match(/(#\d+)$/)?.[1] ?? '';
}

/**
 * ThirdPartyActivity 是外部业务对象投影；文件字节和分析主数据仍由
 * ImportSourceObject / ActivitySource 承担。
 */
@Injectable()
export class ThirdPartyActivityProjectorService {
  constructor(private readonly prisma: PrismaService) {}

  resolveProvider(payload: CanonicalActivityPayload) {
    if (payload.source.kind === 'FILE') return null;
    return (
      payload.source.provider ??
      providerFromSourceKind(payload.source.kind)
    );
  }

  resolveExternalId(args: {
    userId: string;
    payload: CanonicalActivityPayload;
    provider: ThirdPartyProvider;
  }) {
    const raw = String(
      args.payload.source.externalId ?? args.payload.source.sourceUid,
    ).trim();
    const suffix = childSuffix(args.payload.source.sourceUid);
    const withChild = suffix && !raw.endsWith(suffix) ? `${raw}${suffix}` : raw;

    return resolveExternalActivityId({
      provider: args.provider,
      userId: args.userId,
      sourceUid: args.payload.source.sourceUid,
      externalId: withChild,
      metadata: args.payload.metadata,
    });
  }

  async project(args: {
    userId: string;
    sourceObjectId: string;
    batchJobId: string;
    payload: CanonicalActivityPayload;
    preferredThirdPartyActivityId?: number;
  }): Promise<ThirdPartyActivity | null> {
    const provider = this.resolveProvider(args.payload);
    if (!provider) return null;

    const externalId = this.resolveExternalId({
      userId: args.userId,
      payload: args.payload,
      provider,
    });
    const preferred = args.preferredThirdPartyActivityId
      ? await this.prisma.thirdPartyActivity.findUnique({
          where: { id: args.preferredThirdPartyActivityId },
        })
      : null;
    if (
      preferred &&
      (preferred.userId !== args.userId || preferred.provider !== provider)
    ) {
      throw new Error(
        `Third-party activity projection identity mismatch: id=${preferred.id}`,
      );
    }

    const summary = args.payload.summary;
    const common = {
      externalUserId: args.payload.source.accountRef ?? null,
      activityName: summary.name ?? null,
      description: summary.description ?? null,
      activityType: summary.sportType,
      sportType: summary.sportType,
      startTime: summary.startTime ? new Date(summary.startTime) : null,
      endTime: summary.endTime ? new Date(summary.endTime) : null,
      timezone: summary.timezone ?? null,
      startLatitude: summary.startLat ?? null,
      startLongitude: summary.startLng ?? null,
      endLatitude: summary.endLat ?? null,
      endLongitude: summary.endLng ?? null,
      distance: summary.distance ?? null,
      elapsedTime: summary.elapsedTime ?? null,
      movingTime: summary.timerTime ?? null,
      ascent: summary.ascent ?? null,
      descent: summary.descent ?? null,
      maxSpeed: summary.maxSpeed ?? null,
      avgSpeed: summary.avgSpeed ?? null,
      avgHeartRate: summary.avgHeartRate ?? null,
      maxHeartRate: summary.maxHeartRate ?? null,
      avgPower: summary.avgPower ?? null,
      maxPower: summary.maxPower ?? null,
      avgCadence: summary.avgCadence ?? null,
      maxCadence: summary.maxCadence ?? null,
      calories: summary.calories ?? null,
      dataChecksum:
        args.payload.source.sourceChecksum ??
        args.payload.identity.datasetChecksum,
      processingStatus: 'SYNCING' as const,
      state: 1,
      lastProcessingAttemptAt: new Date(),
      processingErrorMessage: null,
    };
    const rawData = {
      importProjection: {
        sourceKind: args.payload.source.kind,
        sourceUid: args.payload.source.sourceUid,
        sourceObjectId: args.sourceObjectId,
        batchJobId: args.batchJobId,
        canonicalDatasetChecksum: args.payload.identity.datasetChecksum,
      },
    };

    return this.prisma.$transaction(async (tx) => {
      // provider + externalId 是全局唯一键。锁住该业务身份后再校验用户，
      // 避免两个用户并发首次投影时，后到者更新先到者的标准字段。
      await acquireHashtextAdvisoryXactLock(
        tx,
        `${provider}:${externalId}`,
      );
      const existing = await tx.thirdPartyActivity.findUnique({
        where: { provider_externalId: { provider, externalId } },
      });
      if (existing && existing.userId !== args.userId) {
        throw new Error(
          `Third-party external identity belongs to another user: provider=${provider}, externalId=${externalId}`,
        );
      }

      if (preferred) {
        if (existing && existing.id !== preferred.id) {
          await tx.activityThirdPartyMapping.updateMany({
            where: { thirdPartyActivityId: preferred.id },
            data: { isActive: false, isPrimary: false },
          });
          await tx.thirdPartyActivity.update({
            where: { id: preferred.id },
            data: { state: 0 },
          });
          return tx.thirdPartyActivity.update({
            where: { id: existing.id },
            data: { ...common, rawData },
          });
        }
        return tx.thirdPartyActivity.update({
          where: { id: preferred.id },
          data: { ...common, externalId, rawData },
        });
      }

      const projected = await tx.thirdPartyActivity.upsert({
        where: { provider_externalId: { provider, externalId } },
        create: {
          userId: args.userId,
          provider,
          externalId,
          rawData,
          ...common,
        },
        update: { ...common, rawData },
      });
      if (projected.userId !== args.userId) {
        throw new Error(
          `Third-party projection race detected: provider=${provider}, externalId=${externalId}`,
        );
      }
      return projected;
    });
  }
}
