import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  Activity,
  ImportSourceKind,
  MappingType,
  Prisma,
  SyncDirection,
  ThirdPartyProvider,
} from '@prisma/client';
import { ThirdPartyActivityProcessingStatus } from '@prisma/client';
import { ActivityService } from '@/api/activity/activity.service';
import { PrismaService } from '@/prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import { readyActivityWhere } from '@/utils/activity-ready-where';

export type ThirdPartyExportActivityWithSources = Activity & {
  activitySources?: Array<{
    fileName?: string | null;
    fileKey?: string | null;
    provider?: string | null;
    sourceKind?: string | null;
    isPrimary?: boolean | null;
    sourceObject?: {
      fileName?: string | null;
      fileKey?: string | null;
      rawStorageKey?: string | null;
    } | null;
  }>;
};

export type ThirdPartyExportFileSource =
  | 'source_file'
  | 'activity_file'
  | 'generated_fit';

export type ThirdPartyExportFile<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
> = {
  buffer: Buffer;
  fileName: string;
  contentType?: string;
  source: ThirdPartyExportFileSource;
  metadata?: Metadata;
};

export type ThirdPartyAcceptedExportFile<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
> = {
  fileName?: string;
  contentType?: string;
  metadata?: Metadata;
} | null;

/** 从存储 key 末段解析文件名。 */
export function thirdPartyExportFileNameFromKey(key?: string | null) {
  if (!key) return null;
  const parts = key.split('/');
  return parts[parts.length - 1] || null;
}

/** 取文件名小写扩展名；无扩展名时返回空字符串。 */
export function thirdPartyExportExtensionOf(fileName?: string | null) {
  return fileName?.split('.').pop()?.toLowerCase() ?? '';
}

/** 去重并保留正整数活动 ID。 */
export function uniquePositiveActivityIds(activityIds: number[]) {
  return Array.from(
    new Set(
      activityIds.filter(
        (activityId) => Number.isInteger(activityId) && activityId > 0,
      ),
    ),
  );
}

/**
 * 第三方活动导出共用层：筛选可导出活动、解析上传文件、写入导出映射。
 * 各厂商 export service 通过 acceptFile 回调约束文件类型与 metadata。
 */
@Injectable()
export class ThirdPartyActivityExportService {
  private readonly logger = new Logger(ThirdPartyActivityExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly activityService: ActivityService,
  ) {}

  /**
   * 查询尚未导出到指定 provider 的本地活动。
   * 排除已有同源 source 或活跃 mapping。legacy Activity provider 字段只是
   * 兼容投影，不再参与资格判断，避免来源失活后永久阻止重新导出。
   */
  async findExportCandidates(args: {
    userId: string;
    activityIds: number[];
    provider: string;
    sourceKind: string;
  }) {
    return (await this.prisma.activity.findMany({
      where: readyActivityWhere({
        userId: args.userId,
        id: { in: args.activityIds },
        activitySources: {
          none: {
            isActive: true,
            OR: [
              { provider: args.provider as ThirdPartyProvider },
              { sourceKind: args.sourceKind as ImportSourceKind },
            ],
          },
        },
        thirdPartyMappings: {
          none: {
            isActive: true,
            thirdPartyActivity: {
              provider: args.provider as ThirdPartyProvider,
            },
          },
        },
      }),
      include: {
        activitySources: {
          where: { isActive: true },
          include: {
            sourceObject: {
              select: {
                fileName: true,
                fileKey: true,
                rawStorageKey: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
        },
      },
      orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
    })) as ThirdPartyExportActivityWithSources[];
  }

  /**
   * 按优先级解析导出文件：activitySources → activity.fileKey → 现场生成 FIT。
   * acceptFile 返回 null 时该候选文件被跳过。
   */
  async resolveExportFile<
    Metadata extends Record<string, unknown> = Record<string, unknown>,
  >(args: {
    activity: ThirdPartyExportActivityWithSources;
    userId: string;
    provider: string;
    sourceKind: string;
    acceptFile: (fileName: string) => ThirdPartyAcceptedExportFile<Metadata>;
    logPrefix: string;
  }): Promise<ThirdPartyExportFile<Metadata> | null> {
    const sourceFile = await this.resolveSourceFile(args);
    if (sourceFile) return sourceFile;

    if (args.activity.fileKey) {
      const fileName =
        args.activity.fileName ??
        thirdPartyExportFileNameFromKey(args.activity.fileKey) ??
        `${args.activity.hashId}.fit`;
      const accepted = args.acceptFile(fileName);
      if (accepted) {
        const buffer = await this.storage.getFileWithKey(args.activity.fileKey);
        if (buffer?.length) {
          return {
            buffer,
            fileName: accepted.fileName ?? fileName,
            contentType: accepted.contentType,
            source: 'activity_file',
            metadata: accepted.metadata,
          };
        }
      }
    }

    try {
      const converted = await this.activityService.convertByHashId(
        args.activity.hashId,
        'fit',
        args.userId,
      );
      let fileName = converted.filename;
      let accepted = args.acceptFile(fileName);
      if (!accepted && !fileName.toLowerCase().endsWith('.fit')) {
        fileName = `${fileName}.fit`;
        accepted = args.acceptFile(fileName);
      }
      if (!accepted) {
        return null;
      }

      return {
        buffer: converted.content,
        fileName: accepted.fileName ?? fileName,
        contentType: accepted.contentType,
        source: 'generated_fit',
        metadata: accepted.metadata,
      };
    } catch (error) {
      this.logger.warn(
        `${args.logPrefix} 生成 FIT 备用文件失败：活动=${args.activity.id}，原因：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /** 从非目标 provider 的 activitySources 中读取首个可接受文件。 */
  private async resolveSourceFile<
    Metadata extends Record<string, unknown> = Record<string, unknown>,
  >(args: {
    activity: ThirdPartyExportActivityWithSources;
    provider: string;
    sourceKind: string;
    acceptFile: (fileName: string) => ThirdPartyAcceptedExportFile<Metadata>;
  }): Promise<ThirdPartyExportFile<Metadata> | null> {
    for (const source of args.activity.activitySources ?? []) {
      if (
        source.provider === args.provider ||
        source.sourceKind === args.sourceKind
      ) {
        continue;
      }

      const fileKey =
        source.fileKey ??
        source.sourceObject?.fileKey ??
        source.sourceObject?.rawStorageKey;
      if (!fileKey) continue;

      const fileName =
        source.fileName ??
        source.sourceObject?.fileName ??
        thirdPartyExportFileNameFromKey(fileKey) ??
        `${args.activity.hashId}.fit`;
      const accepted = args.acceptFile(fileName);
      if (!accepted) continue;

      const buffer = await this.storage.getFileWithKey(fileKey);
      if (!buffer?.length) continue;

      return {
        buffer,
        fileName: accepted.fileName ?? fileName,
        contentType: accepted.contentType,
        source: 'source_file',
        metadata: accepted.metadata,
      };
    }

    return null;
  }

  /**
   * 导出成功后 upsert ThirdPartyActivity 并创建 EXPORT 方向映射。
   * 同一 thirdPartyActivity 已有映射时幂等跳过。
   */
  async recordExportMapping(args: {
    activity: Activity;
    provider: string;
    externalId: string;
    externalUserId?: string | null;
    response: unknown;
    requestedExternalId?: string | null;
    exportFile: Pick<ThirdPartyExportFile, 'fileName' | 'source' | 'metadata'>;
    exportedBy: string;
    matchingFields?: Record<string, unknown>;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const exportFile = {
        fileName: args.exportFile.fileName,
        source: args.exportFile.source,
        ...((args.exportFile.metadata ?? {}) as Record<string, unknown>),
      };
      const rawData = {
        response: args.response,
        ...(args.requestedExternalId
          ? { requestedExternalId: args.requestedExternalId }
          : {}),
        exportedFromActivityId: args.activity.id,
        exportedFromHashId: args.activity.hashId,
        ...(args.activity.sportDefinitionCode
          ? { subSportType: args.activity.sportDefinitionCode }
          : {}),
        exportFile,
      } as Prisma.InputJsonValue;

      const thirdPartyActivity = await tx.thirdPartyActivity.upsert({
        where: {
          provider_externalId: {
            provider: args.provider as ThirdPartyProvider,
            externalId: args.externalId,
          },
        },
        create: {
          userId: args.activity.userId,
          provider: args.provider as ThirdPartyProvider,
          externalId: args.externalId,
          externalUserId: args.externalUserId ?? null,
          rawData,
          activityName: args.activity.activityName,
          sportType: args.activity.sportType,
          startTime: args.activity.startTime,
          endTime: args.activity.endTime,
          timezone: args.activity.timezone,
          distance: args.activity.distance,
          elapsedTime: args.activity.elapsedTime,
          movingTime: args.activity.timerTime,
          ascent: args.activity.ascent,
          descent: args.activity.descent,
          maxSpeed: args.activity.maxSpeed,
          avgSpeed: args.activity.avgSpeed,
          avgHeartRate: args.activity.avgHeartRate,
          maxHeartRate: args.activity.maxHeartRate,
          avgPower: args.activity.avgPower,
          maxPower: args.activity.maxPower,
          avgCadence: args.activity.avgCadence,
          maxCadence: args.activity.maxCadence,
          calories: args.activity.calories,
          processingStatus: ThirdPartyActivityProcessingStatus.COMPLETED,
          state: 1,
          processedAt: new Date(),
          lastProcessingAttemptAt: new Date(),
        },
        update: {
          ...(args.externalUserId !== undefined
            ? { externalUserId: args.externalUserId }
            : {}),
          rawData,
          activityName: args.activity.activityName,
          sportType: args.activity.sportType,
          startTime: args.activity.startTime,
          endTime: args.activity.endTime,
          timezone: args.activity.timezone,
          distance: args.activity.distance,
          elapsedTime: args.activity.elapsedTime,
          movingTime: args.activity.timerTime,
          ascent: args.activity.ascent,
          descent: args.activity.descent,
          maxSpeed: args.activity.maxSpeed,
          avgSpeed: args.activity.avgSpeed,
          avgHeartRate: args.activity.avgHeartRate,
          maxHeartRate: args.activity.maxHeartRate,
          avgPower: args.activity.avgPower,
          maxPower: args.activity.maxPower,
          avgCadence: args.activity.avgCadence,
          maxCadence: args.activity.maxCadence,
          calories: args.activity.calories,
          processingStatus: ThirdPartyActivityProcessingStatus.COMPLETED,
          state: 1,
          processedAt: new Date(),
          lastProcessingAttemptAt: new Date(),
          processingErrorMessage: null,
        },
      });
      if (
        thirdPartyActivity.userId != null &&
        thirdPartyActivity.userId !== args.activity.userId
      ) {
        throw new Error(
          `Third-party export identity belongs to another user: provider=${args.provider}, externalId=${args.externalId}`,
        );
      }

      const existingMapping = await tx.activityThirdPartyMapping.findFirst({
        where: {
          thirdPartyActivityId: thirdPartyActivity.id,
        },
      });
      if (existingMapping?.id != null) {
        if (existingMapping.activityId !== args.activity.id) {
          throw new Error(
            `Third-party activity is already mapped to activity ${existingMapping.activityId}`,
          );
        }
        await tx.activityThirdPartyMapping.update({
          where: { id: existingMapping.id },
          data: {
            isActive: true,
            syncDirection:
              existingMapping.syncDirection === 'IMPORT'
                ? 'BIDIRECTIONAL'
                : existingMapping.syncDirection,
            lastSyncedAt: new Date(),
          },
        });
        return;
      }

      await tx.activityThirdPartyMapping.create({
        data: {
          activityId: args.activity.id,
          thirdPartyActivityId: thirdPartyActivity.id,
          mappingType: 'EXACT' as MappingType,
          confidence: 1,
          matchingFields: {
            exportedBy: args.exportedBy,
            ...(args.requestedExternalId
              ? { requestedExternalId: args.requestedExternalId }
              : {}),
            ...(args.matchingFields ?? {}),
          } as Prisma.InputJsonValue,
          isActive: true,
          isPrimary: false,
          syncDirection: 'EXPORT' as SyncDirection,
          lastSyncedAt: new Date(),
          createdBy: 'system',
        },
      });
    });
  }
}
