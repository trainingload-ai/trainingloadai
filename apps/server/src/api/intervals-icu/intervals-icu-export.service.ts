import { Injectable, Logger, Optional } from '@nestjs/common';
import type { ExternalProviderConnection } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ExternalProviderConnectionService } from '@/integrations/external-provider/external-provider-connection.service';
import {
  IntervalsIcuApiError,
  IntervalsIcuClient,
  type IntervalsIcuUploadActivityResponse,
} from '@/integrations/intervals-icu/intervals-icu.client';
import {
  IntervalsIcuCredentialService,
  type IntervalsIcuApiCredential,
} from '@/integrations/intervals-icu/intervals-icu-credential.service';
import {
  intervalsIcuMetadataJson,
  intervalsIcuMetadataOf,
} from '@/integrations/intervals-icu/intervals-icu-metadata';
import {
  ThirdPartyActivityExportService,
  type ThirdPartyExportActivityWithSources,
  type ThirdPartyExportFile,
  thirdPartyExportExtensionOf,
  uniquePositiveActivityIds,
} from '@/sync/third-party-activity-export.service';

const PROVIDER = 'intervals_icu';
const SOURCE_KIND = 'INTERVALS_ICU';

/** 单条活动导出结果。 */
type IntervalsIcuExportResultItem = {
  activityId: number;
  status: 'EXPORTED' | 'SKIPPED' | 'FAILED';
  externalId?: string;
  reason?: string;
};

/** 判断连接是否可导出时用到的字段。 */
type IntervalsIcuExportConnectionGate = Pick<
  ExternalProviderConnection,
  'status' | 'exportActivities' | 'credentialCiphertext'
>;

/** 按扩展名推断上传 Content-Type。 */
function contentTypeFor(fileName: string) {
  switch (thirdPartyExportExtensionOf(fileName)) {
    case 'fit':
      return 'application/octet-stream';
    case 'gpx':
      return 'application/gpx+xml';
    case 'tcx':
      return 'application/vnd.garmin.tcx+xml';
    case 'zip':
      return 'application/zip';
    case 'gz':
      return 'application/gzip';
    default:
      return 'application/octet-stream';
  }
}

/** 导出文件选择器：接受的 contentType。 */
function acceptIntervalsIcuFile(fileName: string) {
  return {
    contentType: contentTypeFor(fileName),
  };
}

/** 上行用的 external_id：本地 activity.hashId（Intervals URL 模板会用到）。 */
function exportedExternalId(
  activity: Pick<ThirdPartyExportActivityWithSources, 'hashId'>,
) {
  // Intervals.icu 活动 URL 模板会用这个值，例如 /activities/$external_id$。
  return activity.hashId;
}

/** 从上传响应提取远端活动 id。 */
function extractUploadedActivityId(
  response: IntervalsIcuUploadActivityResponse,
) {
  const first = response.activities?.find((activity) => activity.id);
  return first?.id ?? response.id ?? null;
}

/** 连接不可导出时的跳过原因码。 */
function skippedReasonForConnection(
  connection: IntervalsIcuExportConnectionGate | null,
) {
  if (!connection) return 'connection_not_connected';
  if (connection.status !== 'ACTIVE') return 'connection_not_active';
  if (!connection.exportActivities) return 'export_disabled';
  if (!connection.credentialCiphertext) return 'credential_missing';
  return 'not_exportable';
}

/** 将本地活动文件上行到 Intervals.icu（导入后处理触发）。 */
@Injectable()
export class IntervalsIcuExportService {
  private readonly logger = new Logger(IntervalsIcuExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly thirdPartyExport: ThirdPartyActivityExportService,
    private readonly intervalsIcuClient: IntervalsIcuClient,
    private readonly intervalsIcuCredentials: IntervalsIcuCredentialService,
    private readonly providerConnections: ExternalProviderConnectionService,
  ) {}


  /**
   * 导入批次后处理入口：把非 Intervals.icu 来源活动上传回 Intervals.icu。
   * 连接未开启 export 时整批 SKIPPED。
   */
  async exportBatchActivities(args: { userId: string; activityIds: number[] }) {
    const activityIds = uniquePositiveActivityIds(args.activityIds);
    if (!activityIds.length) {
      return {
        exportedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        results: [],
      };
    }

    const connection = await this.providerConnections.model().findUnique({
      where: {
        userId_provider: {
          userId: args.userId,
          provider: PROVIDER,
        },
      },
    });

    if (
      !connection ||
      connection.status !== 'ACTIVE' ||
      !connection.exportActivities ||
      !connection.credentialCiphertext
    ) {
      const reason = skippedReasonForConnection(connection);
      return {
        exportedCount: 0,
        failedCount: 0,
        skippedCount: activityIds.length,
        results: activityIds.map((activityId) => ({
          activityId,
          status: 'SKIPPED' as const,
          reason,
        })),
      };
    }

    return this.exportConnectionActivities(connection, { activityIds });
  }

  /** 
   * 确认连接可导出后，批量导出活动。
   */
  private async exportConnectionActivities(
    connection: ExternalProviderConnection,
    options: { activityIds: number[] },
  ) {
    const activityIds = uniquePositiveActivityIds(options.activityIds);

    // 查询需要导出的活动
    const activities = await this.thirdPartyExport.findExportCandidates({
      userId: connection.userId,
      activityIds,
      provider: PROVIDER,
      sourceKind: SOURCE_KIND,
    });
    const foundIds = new Set(activities.map((activity) => activity.id));
    // 查询需要跳过的活动并标记为 SKIPPED
    const results: IntervalsIcuExportResultItem[] = activityIds
      .filter((activityId) => !foundIds.has(activityId))
      .map((activityId) => ({
        activityId,
        status: 'SKIPPED',
        reason: 'not_exportable',
      }));
    if (!activities.length) {
      return {
        exportedCount: 0,
        failedCount: 0,
        skippedCount: results.length,
        results,
      };
    }

    const apiKey =
      this.intervalsIcuCredentials.resolveConnectionCredential(connection);
    let exportedCount = 0;
    let failedCount = 0;
    let skippedCount = results.length;

    for (const activity of activities) {
      try {
        const exported = await this.exportActivity({
          apiKey,
          connection,
          activity,
        });
        if (!exported) {
          skippedCount += 1;
          results.push({
            activityId: activity.id,
            status: 'SKIPPED',
            reason: 'no_uploadable_file',
          });
          continue;
        }

        exportedCount += 1;
        results.push({
          activityId: activity.id,
          status: 'EXPORTED',
          externalId: exported.externalId,
        });
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          activityId: activity.id,
          status: 'FAILED',
          reason: message,
        });
        this.logger.warn(
          `[Intervals.icu][导出] 活动导出失败：连接=${connection.id} 用户=${connection.userId} 活动=${activity.id}，原因：${message}`,
        );
        await this.providerConnections.model().update({
          where: { id: connection.id },
          data: {
            status:
              error instanceof IntervalsIcuApiError &&
              (error.status === 401 || error.status === 403)
                ? 'INVALID'
                : connection.status,
            lastError: message,
          },
        });
      }
    }

    if (exportedCount > 0) {
      await this.providerConnections.model().update({
        where: { id: connection.id },
        data: {
          ...(failedCount === 0 ? { lastError: null } : {}),
          metadata: intervalsIcuMetadataJson({
            ...intervalsIcuMetadataOf(connection),
            lastExportedAt: new Date().toISOString(),
            lastExportedCount: exportedCount,
          }),
        },
      });
    }

    return { exportedCount, failedCount, skippedCount, results };
  }

  /** 
   * 将单条活动文件上行到 Intervals.icu，并记录 mapping。
   * @param args.apiKey Intervals.icu API 密钥
   * @param args.connection 连接
   * @param args.activity 活动
   */
  private async exportActivity(args: {
    apiKey: IntervalsIcuApiCredential;
    connection: ExternalProviderConnection;
    activity: ThirdPartyExportActivityWithSources;
  }) {
    const { activity } = args;
    const file = await this.thirdPartyExport.resolveExportFile({
      activity,
      userId: args.connection.userId,
      provider: PROVIDER,
      sourceKind: SOURCE_KIND,
      acceptFile: acceptIntervalsIcuFile,
      logPrefix: '[导入到 Intervals.icu]',
    });
    if (!file) {
      this.logger.warn(
        `[导入到 Intervals.icu] 未找到可上传的文件：活动=${activity.id}`,
      );
      return false;
    }

    // 生成外部 ID
    const externalId = exportedExternalId(activity);
    // 将文件上行到 Intervals.icu
    const response = await this.intervalsIcuClient.uploadActivityFile(
      args.apiKey,
      {
        buffer: file.buffer,
        fileName: file.fileName,
        contentType: file.contentType ?? 'application/octet-stream',
        name: activity.activityName,
        description: activity.description,
        externalId,
      },
    );

    const intervalsIcuActivityId = extractUploadedActivityId(response);
    if (!intervalsIcuActivityId) {
      throw new Error('Intervals.icu 上传未返回活动 ID');
    }

    await this.recordExportMapping({
      activity,
      externalId: String(intervalsIcuActivityId),
      response,
      exportFile: file,
      requestedExternalId: externalId,
    });

    this.logger.log(
      `[导入到 Intervals.icu] 成功：活动=${activity.id} 远端活动ID=${intervalsIcuActivityId} 文件来源=${file.source}`,
    );
    return { externalId: String(intervalsIcuActivityId) };
  }

  /** 
   * 记录/更新活动与 Intervals.icu 远端 id 的映射。
   * @param args.activity 活动
   * @param args.externalId intervalsIcu 活动 ID
   * @param args.requestedExternalId 请求的外部 ID
   * @param args.response 上传响应
   * @param args.exportFile 导出文件
   */
  private async recordExportMapping(args: {
    activity: ThirdPartyExportActivityWithSources;
    externalId: string;
    requestedExternalId: string;
    response: IntervalsIcuUploadActivityResponse;
    exportFile: ThirdPartyExportFile;
  }) {
    await this.thirdPartyExport.recordExportMapping({
      activity: args.activity,
      provider: PROVIDER,
      externalId: args.externalId,
      requestedExternalId: args.requestedExternalId,
      response: args.response,
      exportFile: args.exportFile,
      exportedBy: 'intervals_icu_export',
    });
  }
}
