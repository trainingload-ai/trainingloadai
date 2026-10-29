import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import { SensorFileQueryService } from '@/sensor/sensor-file-query.service';
import { ActivityIngestService } from '@/api/activity/activity-ingest.service';
import { TimezoneInferenceService } from '@/timezone/timezone-inference.service';
import { generateRandomDights } from '@/utils';
import type { Activity } from '@prisma/client';
import {
  ImportSourceKind,
  ActivityProcessingStatus,
  Prisma,
  ThirdPartyProvider,
} from '@prisma/client';
import type { PrismaTx } from '@/prisma/prisma-db';
import { importJsonValue } from './import-item-job.types';
import type {
  CanonicalActivityPayload,
  CanonicalLap,
} from './canonical-activity.types';
import type { StagedActivityParquetFile } from '@/sensor/sensor-data.service';
import { SportCatalogService } from '@/sports/sport-catalog.service';
import type { SportFamily } from '@/sports/sport-catalog.types';
import { UserTimezoneInitializerService } from '@/timezone/user-timezone-initializer.service';
import { ActivityAssociationService } from './activity-association.service';
import {
  ActivityDatasetSelectorService,
  type DatasetQuality,
} from './activity-dataset-selector.service';
import { acquireActivityWriteLock } from '@/prisma/activity-write-lock';
import { sanitizeActivityRecordSpeeds } from '@/algorithm/instantaneous-speed';
import { providerFromSourceKind } from './external-provider-identity';

type ResolvedCanonicalMaxSpeeds = {
  activity: number | null | undefined;
  laps: ReadonlyMap<number, number | null>;
};

function resolveCanonicalMaxSpeeds(
  payload: CanonicalActivityPayload,
): ResolvedCanonicalMaxSpeeds {
  const records = payload.records ?? [];
  if (
    (payload.summary.sportType !== 'RUN' &&
      payload.summary.sportType !== 'CYCLING') ||
    records.length === 0
  ) {
    return { activity: payload.summary.maxSpeed, laps: new Map() };
  }

  const sanitizedRecords = sanitizeActivityRecordSpeeds(
    records,
    payload.summary.sportType,
  );
  const correctedLapIndexes = new Set<number>();
  let hasCorrection = false;
  for (let index = 0; index < records.length; index += 1) {
    if (sanitizedRecords[index] === records[index]) continue;
    hasCorrection = true;
    const lapIndex = records[index]?.lapIndex;
    if (typeof lapIndex === 'number') correctedLapIndexes.add(lapIndex);
  }
  if (!hasCorrection) {
    return { activity: payload.summary.maxSpeed, laps: new Map() };
  }

  let activityMax: number | null = null;
  const lapMaxSpeeds = new Map<number, number | null>();
  for (const record of sanitizedRecords) {
    const lapIndex = record.lapIndex;
    if (
      typeof lapIndex === 'number' &&
      correctedLapIndexes.has(lapIndex) &&
      !lapMaxSpeeds.has(lapIndex)
    ) {
      lapMaxSpeeds.set(lapIndex, null);
    }
    if (
      typeof record.speed !== 'number' ||
      !Number.isFinite(record.speed) ||
      record.speed < 0
    ) {
      continue;
    }
    activityMax = Math.max(activityMax ?? record.speed, record.speed);
    if (typeof lapIndex === 'number' && correctedLapIndexes.has(lapIndex)) {
      lapMaxSpeeds.set(
        lapIndex,
        Math.max(lapMaxSpeeds.get(lapIndex) ?? record.speed, record.speed),
      );
    }
  }
  return { activity: activityMax, laps: lapMaxSpeeds };
}

export type CanonicalDatasetCommitToken = {
  activityId: number;
  expectedPrimarySourceId: string | null;
  canonicalSnapshotId: string;
  sportDefinitionCode: string;
  provider: ThirdPartyProvider | null;
  quality: DatasetQuality;
  thirdPartyActivityId?: number;
  mappingType?: 'EXACT' | 'FUZZY' | 'MANUAL';
  confidence?: number;
  matchingFields: Record<string, unknown>;
};

type MaterializeResult = {
  activity: Activity;
  created: boolean;
  reusedReason:
    | 'mapping'
    | 'source'
    | 'checksum'
    | 'provider'
    | 'fuzzy'
    | 'dedupe'
    | null;
  shouldRebuild: boolean;
  primaryChanged: boolean;
  primaryDatasetChanged: boolean;
  outcome: 'CREATED' | 'PRIMARY_REBUILT' | 'ASSOCIATED_NO_REBUILD';
  pendingCommit: CanonicalDatasetCommitToken | null;
  selection: {
    reason:
      | 'first_source'
      | 'same_checksum'
      | 'quality_margin'
      | 'primary_dataset_changed'
      | 'recovery'
      | 'kept_current';
    previousPrimarySourceId: string | null;
    incomingSourceUid: string;
    currentQuality: DatasetQuality | null;
    incomingQuality: DatasetQuality;
    sameChecksum: boolean;
    associationReason: string;
    mappingType: 'EXACT' | 'FUZZY' | 'MANUAL' | null;
    confidence: number | null;
    matchingFields: Record<string, unknown>;
  };
};

const MATERIALIZATION_RECOVERY_STATUSES = new Set<ActivityProcessingStatus>([
  ActivityProcessingStatus.RECEIVED,
  ActivityProcessingStatus.NORMALIZED,
  ActivityProcessingStatus.DEDUPED,
  ActivityProcessingStatus.MATERIALIZED,
  ActivityProcessingStatus.PARTIAL_FAILED,
  ActivityProcessingStatus.FAILED,
]);
const STORAGE_OBJECT_GARBAGE_GRACE_MS = 60 * 60 * 1000;

function needsMaterializationRecovery(
  status?: ActivityProcessingStatus | null,
): boolean {
  return status != null && MATERIALIZATION_RECOVERY_STATUSES.has(status);
}

function normalizeActivityName(name?: string | null): string | null {
  const normalized = String(name ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function getHourInTimezone(
  date: Date,
  timezone?: string | null,
): number | null {
  if (!timezone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone,
    }).formatToParts(date);
    const hourStr = parts.find((part) => part.type === 'hour')?.value;
    const hour = Number(hourStr);
    return Number.isFinite(hour) ? hour : null;
  } catch {
    return null;
  }
}

function periodLabelByHour(hour: number): string {
  if (hour >= 5 && hour < 11) return 'Morning';
  if (hour >= 11 && hour < 14) return 'Noon';
  if (hour >= 14 && hour < 18) return 'Afternoon';
  if (hour >= 18 && hour < 22) return 'Evening';
  return 'Night';
}

function sportLabel(sportType?: string | null): string {
  switch (sportType) {
    case 'RUN':
      return 'Run';
    case 'CYCLING':
      return 'Ride';
    case 'SWIM':
      return 'Swim';
    case 'STRETCHING':
      return 'Workout';
    default:
      return 'Workout';
  }
}

function buildFallbackActivityName(summary: {
  name?: string | null;
  sportType?: string | null;
  startTime?: string | null;
  timestamp?: string | null;
  timezone?: string | null;
}): string {
  // 外部平台经常不给活动名；用本地时区下的时段 + 运动类型生成可读兜底名。
  const explicitName = normalizeActivityName(summary.name);
  if (explicitName) return explicitName;

  const sport = sportLabel(summary.sportType);
  const whenRaw = summary.startTime ?? summary.timestamp;
  if (!whenRaw) return sport;

  const when = new Date(whenRaw);
  if (Number.isNaN(when.getTime())) return sport;
  const hour = getHourInTimezone(when, summary.timezone);
  if (hour == null) return sport;
  return `${periodLabelByHour(hour)} ${sport}`;
}

@Injectable()
export class CanonicalActivityMaterializer {
  private readonly logger = new Logger(CanonicalActivityMaterializer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timezoneInference: TimezoneInferenceService,
    private readonly sportCatalog: SportCatalogService,
    private readonly timezoneInitializer: UserTimezoneInitializerService,
    private readonly association: ActivityAssociationService,
    private readonly datasetSelector: ActivityDatasetSelectorService,
    private readonly sensorFiles: SensorFileQueryService,
    private readonly ingest: ActivityIngestService,
  ) {}

  private async bindSource(args: {
    activityId: number;
    userId: string;
    batchJobId?: string | null;
    sourceObjectId?: string | null;
    canonicalSnapshotId: string;
    payload: CanonicalActivityPayload;
    provider: ThirdPartyProvider | null;
    isPrimary: boolean;
    quality?: DatasetQuality;
    client?: PrismaTx;
  }) {
    const sourceUpdatedAt = args.payload.summary.endTime
      ? new Date(args.payload.summary.endTime)
      : null;
    return this.ingest.activitySource(args.client).upsert({
      where: {
        activity_source_identity_unique: {
          userId: args.userId,
          sourceKind: args.payload.source.kind,
          sourceUid: args.payload.source.sourceUid,
        },
      },
      update: {
        activityId: args.activityId,
        batchJobId: args.batchJobId ?? null,
        sourceObjectId: args.sourceObjectId ?? null,
        canonicalSnapshotId: args.canonicalSnapshotId,
        provider: args.provider,
        accountRef: args.payload.source.accountRef,
        externalId: args.payload.source.externalId,
        fileName: args.payload.source.fileName,
        fileKey: args.payload.source.fileKey,
        dedupeKey: args.payload.identity.dedupeKey,
        sourceChecksum:
          args.payload.source.sourceChecksum ??
          args.payload.identity.datasetChecksum,
        metadata: {
          ...(args.payload.metadata ?? {}),
          checksumAlgorithm: 'sha256',
          ...(args.quality ? { datasetQuality: args.quality } : {}),
        } as Prisma.InputJsonValue,
        isPrimary: args.isPrimary,
        isActive: true,
        lastImportedAt: new Date(),
        sourceUpdatedAt,
      },
      create: {
        activityId: args.activityId,
        userId: args.userId,
        batchJobId: args.batchJobId ?? undefined,
        sourceObjectId: args.sourceObjectId ?? undefined,
        canonicalSnapshotId: args.canonicalSnapshotId,
        sourceKind: args.payload.source.kind,
        provider: args.provider ?? undefined,
        sourceUid: args.payload.source.sourceUid,
        accountRef: args.payload.source.accountRef,
        externalId: args.payload.source.externalId,
        fileName: args.payload.source.fileName,
        fileKey: args.payload.source.fileKey,
        dedupeKey: args.payload.identity.dedupeKey,
        sourceChecksum:
          args.payload.source.sourceChecksum ??
          args.payload.identity.datasetChecksum,
        metadata: {
          ...(args.payload.metadata ?? {}),
          checksumAlgorithm: 'sha256',
          ...(args.quality ? { datasetQuality: args.quality } : {}),
        } as Prisma.InputJsonValue,
        isPrimary: args.isPrimary,
        isActive: true,
        lastImportedAt: new Date(),
        sourceUpdatedAt: sourceUpdatedAt ?? undefined,
      },
    });
  }

  async resolveSportDefinitionCode(
    payload: CanonicalActivityPayload,
    provider: ThirdPartyProvider | null,
  ) {
    if (payload.summary.subSportType?.trim()) {
      const explicit = await this.sportCatalog.resolve(
        payload.summary.subSportType,
        payload.summary.sportType as SportFamily,
      );
      if (explicit) return explicit.code;
    }
    const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
    const trackswapSport = metadata.trackswapSport;
    const trackswapSubSport =
      metadata.trackswapSubSportRaw ?? metadata.trackswapSubSport;
    if (trackswapSport != null && String(trackswapSport).trim()) {
      const composite = await this.sportCatalog.fromProvider({
        provider: 'upload',
        externalCode: String(trackswapSport),
        externalSubCode:
          trackswapSubSport != null ? String(trackswapSubSport) : undefined,
      });
      if (composite) return composite.sport.code;
    }

    const rawSports = [
      metadata.providerSportType,
      metadata.activityType,
      metadata.type,
      metadata.trackswapSubSportRaw,
      metadata.trackswapSport,
    ].filter(
      (value, index, values) =>
        value != null &&
        String(value).trim() &&
        values.findIndex((candidate) => String(candidate) === String(value)) ===
          index,
    );
    for (const rawSport of rawSports) {
      const direct = provider
        ? await this.sportCatalog.fromProvider({
            provider,
            externalCode: String(rawSport),
          })
        : null;
      if (direct) return direct.sport.code;
      const generic = await this.sportCatalog.fromProvider({
        provider: 'upload',
        externalCode: String(rawSport),
      });
      if (generic) return generic.sport.code;
    }
    const fallback = await this.sportCatalog.resolve(
      null,
      payload.summary.sportType as SportFamily,
    );
    return fallback?.code ?? 'OTHER';
  }

  private mapLap(
    activityId: number,
    lap: CanonicalLap,
    resolvedMaxSpeed?: number | null,
  ) {
    return {
      activityId,
      index: lap.index ?? undefined,
      activityName: lap.activityName ?? undefined,
      sportType: lap.sportType ?? undefined,
      startTime: lap.startTime ? new Date(lap.startTime) : undefined,
      endTime: lap.endTime ? new Date(lap.endTime) : undefined,
      elapsedTime: lap.elapsedTime ?? undefined,
      timerTime: lap.timerTime ?? undefined,
      distance: lap.distance ?? undefined,
      ascent: lap.ascent ?? undefined,
      descent: lap.descent ?? undefined,
      avgHeartRate: lap.avgHeartRate ?? undefined,
      maxHeartRate: lap.maxHeartRate ?? undefined,
      avgPower: lap.avgPower ?? undefined,
      maxPower: lap.maxPower ?? undefined,
      avgSpeed: lap.avgSpeed ?? undefined,
      maxSpeed:
        resolvedMaxSpeed === undefined
          ? (lap.maxSpeed ?? undefined)
          : resolvedMaxSpeed,
      avgCadence: lap.avgCadence ?? undefined,
      maxCadence: lap.maxCadence ?? undefined,
      cycles: lap.cycles ?? undefined,
      avgGroundContactTime: lap.avgGroundContactTime ?? undefined,
      avgStrideLength: lap.avgStrideLength ?? undefined,
      avgVerticalOscillation: lap.avgVerticalOscillation ?? undefined,
      avgVerticalRatio: lap.avgVerticalRatio ?? undefined,
      calories: lap.calories ?? undefined,
    };
  }

  private async upsertCanonicalSnapshot(args: {
    itemJobId: string;
    userId: string;
    batchJobId?: string | null;
    sourceObjectId?: string | null;
    payload: CanonicalActivityPayload;
  }) {
    // 先保存 canonical snapshot，后续无论复用旧活动还是创建新活动，都能追溯本次导入原始归一化结果。
    return this.prisma.canonicalActivitySnapshot.upsert({
      where: { itemJobId: args.itemJobId },
      update: {
        batchJobId: args.batchJobId ?? null,
        sourceObjectId: args.sourceObjectId ?? null,
        schemaVersion: 'v1',
        payload: importJsonValue(args.payload),
        dedupeKey: args.payload.identity.dedupeKey,
        sportType: args.payload.summary.sportType,
        startTime: args.payload.summary.startTime
          ? new Date(args.payload.summary.startTime)
          : null,
        endTime: args.payload.summary.endTime
          ? new Date(args.payload.summary.endTime)
          : null,
        timezone: args.payload.summary.timezone ?? null,
      },
      create: {
        itemJobId: args.itemJobId,
        userId: args.userId,
        batchJobId: args.batchJobId ?? undefined,
        sourceObjectId: args.sourceObjectId ?? undefined,
        schemaVersion: 'v1',
        payload: importJsonValue(args.payload),
        dedupeKey: args.payload.identity.dedupeKey,
        sportType: args.payload.summary.sportType,
        startTime: args.payload.summary.startTime
          ? new Date(args.payload.summary.startTime)
          : undefined,
        endTime: args.payload.summary.endTime
          ? new Date(args.payload.summary.endTime)
          : undefined,
        timezone: args.payload.summary.timezone ?? undefined,
      },
    });
  }

  private sourceDerivedActivityData(
    payload: CanonicalActivityPayload,
    sportDefinitionCode: string,
    provider: ThirdPartyProvider | null,
    resolvedMaxSpeed: number | null | undefined,
  ) {
    const summary = payload.summary;
    return {
      fileKey: payload.source.fileKey ?? null,
      fileName: payload.source.fileName ?? null,
      fileType:
        payload.source.fileName?.split('.').pop()?.toLowerCase() ?? null,
      sportType: summary.sportType,
      sportDefinitionCode,
      subSport: summary.subSport ?? null,
      timestamp: summary.timestamp
        ? new Date(summary.timestamp)
        : summary.startTime
          ? new Date(summary.startTime)
          : null,
      startTime: summary.startTime ? new Date(summary.startTime) : null,
      endTime: summary.endTime ? new Date(summary.endTime) : null,
      timezone: summary.timezone ?? null,
      startLat: summary.startLat ?? null,
      startLng: summary.startLng ?? null,
      endLat: summary.endLat ?? null,
      endLng: summary.endLng ?? null,
      timerTime: summary.timerTime ?? null,
      elapsedTime: summary.elapsedTime ?? null,
      distance: summary.distance ?? null,
      ascent: summary.ascent ?? null,
      descent: summary.descent ?? null,
      enhancedAscent: summary.enhancedAscent ?? null,
      enhancedDescent: summary.enhancedDescent ?? null,
      avgHeartRate: summary.avgHeartRate ?? null,
      maxHeartRate: summary.maxHeartRate ?? null,
      avgPower: summary.avgPower ?? null,
      maxPower: summary.maxPower ?? null,
      avgSpeed: summary.avgSpeed ?? null,
      maxSpeed: resolvedMaxSpeed ?? null,
      avgCadence: summary.avgCadence ?? null,
      maxCadence: summary.maxCadence ?? null,
      calories: summary.calories ?? null,
      poolLength: summary.poolLength ?? null,
      poolLengthUnit: summary.poolLengthUnit ?? null,
      numLaps: summary.numLaps ?? null,
      numLengths: summary.numLengths ?? null,
      numActiveLengths: summary.numActiveLengths ?? null,
      thirdPartyProvider: provider,
      thirdPartyActivityId: payload.source.externalId ?? null,
      syncedAt: provider ? new Date() : null,
      state: 1,
      processingStatus: ActivityProcessingStatus.MATERIALIZED,
      processingUpdatedAt: new Date(),
    };
  }

  /** 清除只属于旧 primary 数据集、且后续由 LIGHT/HEAVY 重新生成的标量。 */
  private resetDerivedActivityData() {
    return {
      fileSize: null,
      fileLink: null,
      sampleSec: null,
      enhancedMinElevation: null,
      enhancedMaxElevation: null,
      minPower: null,
      minHeartRate: null,
      cycles: null,
      work: null,
      strokes: null,
      fatCalories: null,
      aePower: null,
      re: null,
      ei: null,
      pwHr: null,
      paHr: null,
      avgLeftRightBalance: null,
      maxHrDrop: null,
      avgAerobicEfficiency: null,
      avgGAP: null,
      effectiveDistance: null,
      NGP: null,
      xPace: null,
      xGap: null,
      viPace: null,
      viGap: null,
      eftp: null,
      ecp: null,
      ewPrime: null,
      epmax: null,
    };
  }

  private async upsertThirdPartyMapping(args: {
    activityId: number;
    thirdPartyActivityId?: number;
    mappingType?: 'EXACT' | 'FUZZY' | 'MANUAL';
    confidence?: number;
    matchingFields?: Record<string, unknown>;
    isPrimary: boolean;
    client?: PrismaTx;
  }) {
    const mappingClient = this.ingest.activityThirdPartyMapping(args.client);
    if (!args.thirdPartyActivityId) {
      // FILE 可以成为 canonical primary，但没有对应的 ThirdPartyActivity。
      // 此时 legacy mapping 层不得继续把某个第三方标成 primary。
      if (args.isPrimary) {
        await mappingClient.updateMany({
          where: {
            activityId: args.activityId,
            isActive: true,
            isPrimary: true,
          },
          data: { isPrimary: false },
        });
      }
      return;
    }
    const persist = async (tx: PrismaTx) => {
      const existing = await this.ingest
        .activityThirdPartyMapping(tx)
        .findUnique({
          where: { thirdPartyActivityId: args.thirdPartyActivityId },
        });
      if (existing && existing.activityId !== args.activityId) {
        throw new Error(
          `Third-party activity ${args.thirdPartyActivityId} is already mapped to activity ${existing.activityId}`,
        );
      }
      // projector 与来源删除可能恰好交错：只要本次 canonical item 最终成功
      // 建立 active mapping，第三方业务对象也必须恢复可见，不能留下
      // state=0 + active mapping 的矛盾状态。
      await tx.thirdPartyActivity.update({
        where: { id: args.thirdPartyActivityId },
        data: { state: 1 },
      });
      if (args.isPrimary) {
        await this.ingest.activityThirdPartyMapping(tx).updateMany({
          where: {
            activityId: args.activityId,
            thirdPartyActivityId: { not: args.thirdPartyActivityId },
            isActive: true,
            isPrimary: true,
          },
          data: { isPrimary: false },
        });
      }
      await this.ingest.activityThirdPartyMapping(tx).upsert({
        where: { thirdPartyActivityId: args.thirdPartyActivityId },
        update: {
          activityId: args.activityId,
          mappingType: args.mappingType ?? existing?.mappingType ?? 'EXACT',
          confidence: args.confidence ?? existing?.confidence ?? 1,
          matchingFields: importJsonValue(
            args.matchingFields ?? existing?.matchingFields ?? {},
          ),
          isActive: true,
          isPrimary: args.isPrimary,
          syncDirection:
            existing?.syncDirection === 'EXPORT' ||
            existing?.syncDirection === 'BIDIRECTIONAL'
              ? 'BIDIRECTIONAL'
              : 'IMPORT',
          lastSyncedAt: new Date(),
          createdBy: 'import-pipeline',
        },
        create: {
          activityId: args.activityId,
          thirdPartyActivityId: args.thirdPartyActivityId,
          mappingType: args.mappingType ?? 'EXACT',
          confidence: args.confidence ?? 1,
          matchingFields: importJsonValue(args.matchingFields ?? {}),
          isActive: true,
          isPrimary: args.isPrimary,
          syncDirection: 'IMPORT',
          lastSyncedAt: new Date(),
          createdBy: 'import-pipeline',
        },
      });
    };
    if (args.client) {
      await persist(args.client);
    } else {
      await this.prisma.$transaction(async (tx) => persist(tx));
    }
  }

  /**
   * 提交已经完整上传的 canonical 数据集。
   *
   * staging 阶段不修改任何线上指针；这里在活动级事务锁内重新确认 primary
   * 未变化，再一次性切换 source、Activity 摘要、laps、Parquet 指针和 legacy
   * mapping。并发窗口里如果已有别的 worker 先提交，当前 item 进入正常重试，
   * 重新执行质量选择，而不是覆盖新 primary。
   */
  async commitStagedDataset(args: {
    token: CanonicalDatasetCommitToken;
    userId: string;
    batchJobId?: string | null;
    sourceObjectId?: string | null;
    payload: CanonicalActivityPayload;
    stagedParquetFiles: StagedActivityParquetFile[];
  }): Promise<Activity> {
    const resolvedMaxSpeeds = resolveCanonicalMaxSpeeds(args.payload);
    return this.prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRawUnsafe === 'function') {
        await acquireActivityWriteLock(tx, args.token.activityId);
      }

      const [activity, currentPrimary] = await Promise.all([
        this.ingest.activity(tx).findFirst({
          where: { id: args.token.activityId, userId: args.userId },
        }),
        this.ingest.activitySource(tx).findFirst({
          where: {
            activityId: args.token.activityId,
            isPrimary: true,
            isActive: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
      if (!activity) {
        throw new Error(
          `Canonical activity ${args.token.activityId} no longer exists`,
        );
      }
      if ((currentPrimary?.id ?? null) !== args.token.expectedPrimarySourceId) {
        throw new Error(
          `Canonical primary changed while staging activity ${args.token.activityId}`,
        );
      }

      await this.ingest.activitySource(tx).updateMany({
        where: {
          activityId: args.token.activityId,
          isPrimary: true,
          isActive: true,
        },
        data: { isPrimary: false },
      });
      const source = await this.bindSource({
        activityId: args.token.activityId,
        userId: args.userId,
        batchJobId: args.batchJobId,
        sourceObjectId: args.sourceObjectId,
        canonicalSnapshotId: args.token.canonicalSnapshotId,
        payload: args.payload,
        provider: args.token.provider,
        isPrimary: true,
        quality: args.token.quality,
        client: tx,
      });

      const updated = await this.ingest.activity(tx).update({
        where: { id: args.token.activityId },
        data: {
          ...this.resetDerivedActivityData(),
          ...this.sourceDerivedActivityData(
            args.payload,
            args.token.sportDefinitionCode,
            args.token.provider,
            resolvedMaxSpeeds.activity,
          ),
          processingStatus: ActivityProcessingStatus.ANALYZING,
          processingUpdatedAt: new Date(),
          readyAt: null,
        },
      });

      await this.ingest.activityLap(tx).deleteMany({
        where: { activityId: args.token.activityId },
      });
      if (args.payload.laps.length > 0) {
        await this.ingest.activityLap(tx).createMany({
          data: args.payload.laps.map((lap) =>
            this.mapLap(
              args.token.activityId,
              lap,
              typeof lap.index === 'number'
                ? resolvedMaxSpeeds.laps.get(lap.index)
                : undefined,
            ),
          ),
        });
      }

      const previousMapThumb = await this.ingest
        .activityMapThumbJob(tx)
        .findUnique({
          where: { activityId: args.token.activityId },
          select: { r2Key: true, r2DarkKey: true },
        });

      // 指标任务在缺少对应传感器列时会跳过写入，因此 primary 切换必须先
      // 清空旧数据集的派生行；否则“新来源没有功率”会错误保留旧 power
      // zones/Coggan/峰值。全部删除与主数据集指针切换处于同一事务。
      await Promise.all([
        this.ingest.activityZone(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityCoggan(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityBikeScore(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activitySwimScore(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityGOVSS(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityCalculatedPower(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityTrimp(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityVO2Max(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityTrainingEffect(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityPeakMetric(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityPerformanceTT(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityFitnessMetricsSnapshot(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityPolyline(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityPolylineSegment(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityAiReview(tx).deleteMany({
          where: { activityId: args.token.activityId },
        }),
        tx.userBestMetric.deleteMany({
          where: { activityId: args.token.activityId },
        }),
        tx.userBestTT.deleteMany({
          where: { activityId: args.token.activityId },
        }),
        this.ingest.activityMapThumbJob(tx).updateMany({
          where: { activityId: args.token.activityId },
          data: {
            status: 'DEAD',
            r2Key: null,
            r2Url: null,
            r2DarkKey: null,
            r2DarkUrl: null,
            generatedAt: null,
            leaseExpiresAt: null,
            lockToken: null,
            lastError: 'Canonical activity dataset replaced',
          },
        }),
      ]);

      const previousParquetFiles = await this.sensorFiles
        .parquetFiles(tx)
        .findMany({
          where: { activityId: args.token.activityId },
          select: { parquetPath: true },
        });
      const stagedTypes = args.stagedParquetFiles.map((file) => file.type);
      if (stagedTypes.length > 0) {
        await this.sensorFiles.parquetFiles(tx).deleteMany({
          where: {
            activityId: args.token.activityId,
            type: { notIn: stagedTypes },
          },
        });
      } else {
        await this.sensorFiles.parquetFiles(tx).deleteMany({
          where: { activityId: args.token.activityId },
        });
      }
      for (const file of args.stagedParquetFiles) {
        await this.sensorFiles.parquetFiles(tx).upsert({
          where: {
            activityId_type: {
              activityId: args.token.activityId,
              type: file.type,
            },
          },
          update: {
            parquetPath: file.parquetPath,
            fileSize: file.fileSize,
            pointCount: file.pointCount,
            storageStrategy: file.storageStrategy,
            checksum: file.checksum,
          },
          create: {
            activityId: args.token.activityId,
            parquetPath: file.parquetPath,
            fileSize: file.fileSize,
            pointCount: file.pointCount,
            type: file.type,
            storageStrategy: file.storageStrategy,
            checksum: file.checksum,
          },
        });
      }
      const stagedPaths = new Set(
        args.stagedParquetFiles.map((file) => file.parquetPath),
      );
      const retiredPaths = Array.from(
        new Set(
          previousParquetFiles
            .map((file) => file.parquetPath)
            .filter((path) => path && !stagedPaths.has(path)),
        ),
      );
      const garbageAvailableAt = new Date(
        Date.now() + STORAGE_OBJECT_GARBAGE_GRACE_MS,
      );
      for (const parquetPath of retiredPaths) {
        await this.sensorFiles.garbage(tx).upsert({
          where: {
            bucket_objectKey: { bucket: 'default', objectKey: parquetPath },
          },
          create: {
            activityId: args.token.activityId,
            objectKey: parquetPath,
            bucket: 'default',
            reason: 'canonical_primary_replaced',
            availableAt: garbageAvailableAt,
          },
          update: {
            activityId: args.token.activityId,
            reason: 'canonical_primary_replaced',
            availableAt: garbageAvailableAt,
            lockedAt: null,
            lastError: null,
          },
        });
      }
      const previousMapKeys = Array.from(
        new Set(
          [previousMapThumb?.r2Key, previousMapThumb?.r2DarkKey].filter(
            (key): key is string => typeof key === 'string' && key.length > 0,
          ),
        ),
      );
      for (const objectKey of previousMapKeys) {
        await this.sensorFiles.garbage(tx).upsert({
          where: {
            bucket_objectKey: { bucket: 'public', objectKey },
          },
          create: {
            activityId: args.token.activityId,
            objectKey,
            bucket: 'public',
            reason: 'canonical_map_thumbnail_invalidated',
            availableAt: garbageAvailableAt,
          },
          update: {
            activityId: args.token.activityId,
            reason: 'canonical_map_thumbnail_invalidated',
            availableAt: garbageAvailableAt,
            lockedAt: null,
            lastError: null,
          },
        });
      }

      await this.upsertThirdPartyMapping({
        activityId: args.token.activityId,
        thirdPartyActivityId: args.token.thirdPartyActivityId,
        mappingType: args.token.mappingType,
        confidence: args.token.confidence,
        matchingFields: {
          ...args.token.matchingFields,
          activitySourceId: source.id,
        },
        isPrimary: true,
        client: tx,
      });

      return updated;
    });
  }

  async materialize(args: {
    itemJobId: string;
    userId: string;
    batchJobId?: string | null;
    sourceObjectId?: string | null;
    payload: CanonicalActivityPayload;
    thirdPartyActivityId?: number;
    conflictRecoveryAttempt?: boolean;
  }): Promise<MaterializeResult> {
    // 实体化顺序：按来源复用 -> 按 dedupeKey 复用 -> 创建新 activity，并绑定 activitySource。
    const provider =
      args.payload.source.kind === ImportSourceKind.FILE
        ? ThirdPartyProvider.upload
        : (args.payload.source.provider ??
          providerFromSourceKind(args.payload.source.kind));
    const snapshot = await this.upsertCanonicalSnapshot(args);
    const explicitActivityName = normalizeActivityName(
      args.payload.summary.name,
    );
    const titleTimezone =
      args.payload.summary.timezone ??
      (explicitActivityName
        ? null
        : (
            await this.timezoneInitializer.initializeFromAvailableSignals(
              args.userId,
            )
          ).timezone);
    const activityName = buildFallbackActivityName({
      ...args.payload.summary,
      timezone: titleTimezone,
    });
    const sportDefinitionCode = await this.resolveSportDefinitionCode(
      args.payload,
      provider,
    );
    const quality = this.datasetSelector.evaluate(args.payload);
    const resolvedMaxSpeeds = resolveCanonicalMaxSpeeds(args.payload);
    const incomingChecksum =
      args.payload.source.sourceChecksum ??
      args.payload.identity.datasetChecksum;
    const association = await this.association.resolve({
      userId: args.userId,
      payload: args.payload,
      thirdPartyActivityId: args.thirdPartyActivityId,
    });

    if (association.activity) {
      const activity = association.activity;
      const [existingSource, currentPrimary, currentParquetFiles] =
        await Promise.all([
          this.prisma.activitySource.findUnique({
            where: {
              activity_source_identity_unique: {
                userId: args.userId,
                sourceKind: args.payload.source.kind,
                sourceUid: args.payload.source.sourceUid,
              },
            },
          }),
          this.prisma.activitySource.findFirst({
            where: { activityId: activity.id, isPrimary: true, isActive: true },
            orderBy: { createdAt: 'asc' },
            include: {
              canonicalSnapshot: { select: { payload: true } },
            },
          }),
          this.sensorFiles.parquetFiles().findMany({
            where: { activityId: activity.id },
            select: { type: true, pointCount: true },
          }),
        ]);
      const storedCurrentQuality = ((
        currentPrimary?.metadata as Record<string, unknown> | null
      )?.datasetQuality ?? null) as DatasetQuality | null;
      const currentPayload = currentPrimary?.canonicalSnapshot
        ?.payload as unknown as CanonicalActivityPayload | undefined;
      const currentQuality =
        storedCurrentQuality ??
        (currentPayload
          ? this.datasetSelector.evaluate(currentPayload)
          : currentPrimary
            ? this.datasetSelector.evaluateLegacyActivity(
                activity,
                currentParquetFiles,
              )
            : null);
      if (currentPrimary && !storedCurrentQuality && currentQuality) {
        const metadata =
          currentPrimary.metadata &&
          typeof currentPrimary.metadata === 'object' &&
          !Array.isArray(currentPrimary.metadata)
            ? (currentPrimary.metadata as Record<string, unknown>)
            : {};
        await this.prisma.activitySource.update({
          where: { id: currentPrimary.id },
          data: {
            metadata: {
              ...metadata,
              datasetQuality: currentQuality,
              datasetQualityOrigin: currentPayload
                ? 'canonical_snapshot_backfill'
                : 'legacy_activity_estimate_v1',
            } as Prisma.InputJsonValue,
          },
        });
      }
      const sameChecksum = Boolean(
        incomingChecksum &&
        (currentPrimary?.sourceChecksum ??
          currentPayload?.identity.datasetChecksum) === incomingChecksum,
      );
      const promote =
        !existingSource?.isPrimary &&
        (!currentPrimary ||
          this.datasetSelector.shouldPromote({
            incoming: quality,
            current: currentQuality,
            sameChecksum,
          }));
      const primaryDatasetChanged = Boolean(
        existingSource?.isPrimary &&
        existingSource.sourceChecksum !== incomingChecksum,
      );
      const primaryChanged = promote;
      // Activity/primary source 会先于 Parquet 落库。若 Parquet 或 LIGHT
      // 分析失败，重试时 checksum 与 primary 都不会变化，必须根据活动处理
      // 状态恢复；否则会把失败重试误判为 secondary 关联并直接标记 DONE。
      const recoveringCommittedItem = Boolean(
        existingSource?.isPrimary &&
        existingSource.canonicalSnapshotId === snapshot.id &&
        (activity.processingStatus === ActivityProcessingStatus.PARQUET_READY ||
          activity.processingStatus === ActivityProcessingStatus.ANALYZING),
      );
      const recoveryRequired = Boolean(
        (needsMaterializationRecovery(activity.processingStatus) ||
          recoveringCommittedItem) &&
        (existingSource?.isPrimary || sameChecksum || !currentPrimary),
      );
      const shouldRebuild =
        primaryChanged || primaryDatasetChanged || recoveryRequired;
      const isPrimary = Boolean(existingSource?.isPrimary || promote);

      if (
        shouldRebuild &&
        !recoveringCommittedItem &&
        (activity.processingStatus === ActivityProcessingStatus.PARQUET_READY ||
          activity.processingStatus === ActivityProcessingStatus.ANALYZING)
      ) {
        throw new Error(
          `Canonical activity ${activity.id} is still analyzing another dataset`,
        );
      }

      const bindArgs = {
        activityId: activity.id,
        userId: args.userId,
        batchJobId: args.batchJobId,
        sourceObjectId: args.sourceObjectId,
        canonicalSnapshotId: snapshot.id,
        payload: args.payload,
        provider,
        isPrimary,
        quality,
      };
      if (shouldRebuild) {
        const selectionReason = primaryChanged
          ? 'quality_margin'
          : primaryDatasetChanged
            ? 'primary_dataset_changed'
            : 'recovery';
        return {
          activity,
          created: false,
          reusedReason:
            association.reason === 'new' ? null : association.reason,
          shouldRebuild: true,
          primaryChanged,
          primaryDatasetChanged,
          outcome: 'PRIMARY_REBUILT',
          selection: {
            reason: selectionReason,
            previousPrimarySourceId: currentPrimary?.id ?? null,
            incomingSourceUid: args.payload.source.sourceUid,
            currentQuality,
            incomingQuality: quality,
            sameChecksum,
            associationReason: association.reason,
            mappingType: association.mappingType ?? null,
            confidence: association.confidence ?? null,
            matchingFields: association.matchingFields ?? {},
          },
          pendingCommit: {
            activityId: activity.id,
            expectedPrimarySourceId: currentPrimary?.id ?? null,
            canonicalSnapshotId: snapshot.id,
            sportDefinitionCode,
            provider,
            quality,
            thirdPartyActivityId: args.thirdPartyActivityId,
            mappingType: association.mappingType,
            confidence: association.confidence,
            matchingFields: {
              associationReason: association.reason,
              ...(association.matchingFields ?? {}),
            },
          },
        };
      }

      const preserveInFlightPrimarySnapshot = Boolean(
        existingSource?.id === currentPrimary?.id &&
        sameChecksum &&
        existingSource?.canonicalSnapshotId !== snapshot.id &&
        (activity.processingStatus === ActivityProcessingStatus.PARQUET_READY ||
          activity.processingStatus === ActivityProcessingStatus.ANALYZING),
      );
      // 同来源重复 item 可以在当前数据集分析期间成功去重，但不能把 primary
      // source 的 snapshot 指针改到另一个 item，否则原提交 item 崩溃恢复时会
      // 失去“这是我提交的数据集”这一 fencing token。
      const boundSource = preserveInFlightPrimarySnapshot
        ? currentPrimary!
        : await this.bindSource(bindArgs);

      await this.upsertThirdPartyMapping({
        activityId: activity.id,
        thirdPartyActivityId: args.thirdPartyActivityId,
        mappingType: association.mappingType,
        confidence: association.confidence,
        matchingFields: {
          associationReason: association.reason,
          ...(association.matchingFields ?? {}),
          activitySourceId: boundSource.id,
        },
        isPrimary,
      });
      return {
        activity,
        created: false,
        reusedReason: association.reason === 'new' ? null : association.reason,
        shouldRebuild,
        primaryChanged,
        primaryDatasetChanged,
        outcome: 'ASSOCIATED_NO_REBUILD',
        pendingCommit: null,
        selection: {
          reason: sameChecksum ? 'same_checksum' : 'kept_current',
          previousPrimarySourceId: currentPrimary?.id ?? null,
          incomingSourceUid: args.payload.source.sourceUid,
          currentQuality,
          incomingQuality: quality,
          sameChecksum,
          associationReason: association.reason,
          mappingType: association.mappingType ?? null,
          confidence: association.confidence ?? null,
          matchingFields: association.matchingFields ?? {},
        },
      };
    }

    const existingBySource = await this.prisma.activitySource.findUnique({
      where: {
        activity_source_identity_unique: {
          userId: args.userId,
          sourceKind: args.payload.source.kind,
          sourceUid: args.payload.source.sourceUid,
        },
      },
      include: { activity: true },
    });
    if (existingBySource?.activity) {
      this.logger.debug(
        `[活动实体化] 来源在并发窗口内已建立，重新进入统一关联：来源UID=${args.payload.source.sourceUid}，活动ID=${existingBySource.activity.id}`,
      );
      return this.materialize({
        ...args,
        conflictRecoveryAttempt: true,
      });
    }

    let activity: Activity;
    try {
      const lockedResult = await this.prisma.$transaction(async (tx) => {
        // 两个 worker 可能在不同进程同时处理手动上传和 webhook。只在候选
        // 复查与 Activity/Source 创建期间持有用户级事务锁；解析和分析均在锁外。
        await acquireHashtextAdvisoryXactLock(tx, args.userId);
        const concurrentAssociation = await this.association.resolve({
          userId: args.userId,
          payload: args.payload,
          thirdPartyActivityId: args.thirdPartyActivityId,
          client: tx,
        });
        if (concurrentAssociation.activity) {
          return { activity: concurrentAssociation.activity, created: false };
        }

        const created = await this.ingest.activity(tx).create({
          data: {
            hashId: generateRandomDights(),
            userId: args.userId,
            createdByBatchJobId: args.batchJobId ?? undefined,
            fileKey: args.payload.source.fileKey ?? undefined,
            fileName: args.payload.source.fileName ?? undefined,
            fileType:
              args.payload.source.fileName?.split('.').pop()?.toLowerCase() ??
              undefined,
            activityName,
            description: args.payload.summary.description ?? undefined,
            sportType: args.payload.summary.sportType,
            sportDefinitionCode,
            subSport: args.payload.summary.subSport ?? null,
            timestamp: args.payload.summary.timestamp
              ? new Date(args.payload.summary.timestamp)
              : args.payload.summary.startTime
                ? new Date(args.payload.summary.startTime)
                : undefined,
            startTime: args.payload.summary.startTime
              ? new Date(args.payload.summary.startTime)
              : undefined,
            endTime: args.payload.summary.endTime
              ? new Date(args.payload.summary.endTime)
              : undefined,
            timezone: args.payload.summary.timezone ?? undefined,
            startLat: args.payload.summary.startLat ?? undefined,
            startLng: args.payload.summary.startLng ?? undefined,
            endLat: args.payload.summary.endLat ?? undefined,
            endLng: args.payload.summary.endLng ?? undefined,
            timerTime: args.payload.summary.timerTime ?? undefined,
            elapsedTime: args.payload.summary.elapsedTime ?? undefined,
            distance: args.payload.summary.distance ?? undefined,
            ascent: args.payload.summary.ascent ?? undefined,
            descent: args.payload.summary.descent ?? undefined,
            enhancedAscent: args.payload.summary.enhancedAscent ?? undefined,
            enhancedDescent: args.payload.summary.enhancedDescent ?? undefined,
            avgHeartRate: args.payload.summary.avgHeartRate ?? undefined,
            maxHeartRate: args.payload.summary.maxHeartRate ?? undefined,
            avgPower: args.payload.summary.avgPower ?? undefined,
            maxPower: args.payload.summary.maxPower ?? undefined,
            avgSpeed: args.payload.summary.avgSpeed ?? undefined,
            maxSpeed: resolvedMaxSpeeds.activity ?? undefined,
            avgCadence: args.payload.summary.avgCadence ?? undefined,
            maxCadence: args.payload.summary.maxCadence ?? undefined,
            calories: args.payload.summary.calories ?? undefined,
            poolLength: args.payload.summary.poolLength ?? undefined,
            poolLengthUnit: args.payload.summary.poolLengthUnit ?? undefined,
            numLaps: args.payload.summary.numLaps ?? undefined,
            numLengths: args.payload.summary.numLengths ?? undefined,
            numActiveLengths:
              args.payload.summary.numActiveLengths ?? undefined,
            thirdPartyProvider: provider ?? undefined,
            thirdPartyActivityId: args.payload.source.externalId ?? undefined,
            processingStatus: ActivityProcessingStatus.MATERIALIZED,
            processingUpdatedAt: new Date(),
          } satisfies Prisma.ActivityUncheckedCreateInput,
        });

        if (args.payload.laps.length > 0) {
          await this.ingest.activityLap(tx).createMany({
            data: args.payload.laps.map((lap) =>
              this.mapLap(
                created.id,
                lap,
                typeof lap.index === 'number'
                  ? resolvedMaxSpeeds.laps.get(lap.index)
                  : undefined,
              ),
            ),
          });
        }

        await this.ingest.activitySource(tx).create({
          data: {
            activityId: created.id,
            userId: args.userId,
            batchJobId: args.batchJobId ?? undefined,
            sourceObjectId: args.sourceObjectId ?? undefined,
            canonicalSnapshotId: snapshot.id,
            sourceKind: args.payload.source.kind,
            provider: provider ?? undefined,
            sourceUid: args.payload.source.sourceUid,
            accountRef: args.payload.source.accountRef,
            externalId: args.payload.source.externalId,
            fileName: args.payload.source.fileName,
            fileKey: args.payload.source.fileKey,
            dedupeKey: args.payload.identity.dedupeKey,
            sourceChecksum: incomingChecksum,
            metadata: {
              ...(args.payload.metadata ?? {}),
              checksumAlgorithm: 'sha256',
              datasetQuality: quality,
            } as Prisma.InputJsonValue,
            isPrimary: true,
            isActive: true,
            lastImportedAt: new Date(),
            sourceUpdatedAt: args.payload.summary.endTime
              ? new Date(args.payload.summary.endTime)
              : undefined,
          } satisfies Prisma.ActivitySourceUncheckedCreateInput,
        });

        return { activity: created, created: true };
      });
      if (!lockedResult.created) {
        // 锁内复查发现另一个 worker 已先创建；事务结束后重新走统一关联分支，
        // 补齐当前 source/mapping 和 primary 选举。
        return this.materialize(args);
      }
      activity = lockedResult.activity;
    } catch (error) {
      // 多个 worker 可能同时通过前置检查。唯一键冲突时，回查胜出的活动并
      // 补齐来源映射，把并发冲突收敛成一次成功复用，而不是进入失败重试。
      if (
        (error as { code?: string } | null)?.code === 'P2002' &&
        !args.conflictRecoveryAttempt
      ) {
        const concurrent = await this.association.resolve({
          userId: args.userId,
          payload: args.payload,
          thirdPartyActivityId: args.thirdPartyActivityId,
        });
        if (concurrent.activity) {
          // 重新进入统一关联分支，确保 source、mapping、primary 选举和
          // shouldRebuild 语义与普通导入完全一致。只允许恢复一次，避免
          // 非并发型唯一键错误导致无限递归。
          return this.materialize({
            ...args,
            conflictRecoveryAttempt: true,
          });
        }
      }
      throw error;
    }

    let resolvedActivity = activity;
    if (
      !activity.timezone &&
      activity.startLat != null &&
      activity.startLng != null
    ) {
      const inferred = this.timezoneInference.findIanaTimezone(
        Number(activity.startLat),
        Number(activity.startLng),
      );
      if (inferred) {
        resolvedActivity = await this.prisma.activity.update({
          where: { id: activity.id },
          data: { timezone: inferred },
        });
      }
    }

    await this.timezoneInitializer.initializeFromCoordinateActivity(
      args.userId,
      resolvedActivity,
    );

    await this.upsertThirdPartyMapping({
      activityId: resolvedActivity.id,
      thirdPartyActivityId: args.thirdPartyActivityId,
      mappingType: 'EXACT',
      confidence: 1,
      matchingFields: { associationReason: 'new' },
      isPrimary: true,
    });

    return {
      activity: resolvedActivity,
      created: true,
      reusedReason: null,
      shouldRebuild: true,
      primaryChanged: true,
      primaryDatasetChanged: true,
      outcome: 'CREATED',
      pendingCommit: null,
      selection: {
        reason: 'first_source',
        previousPrimarySourceId: null,
        incomingSourceUid: args.payload.source.sourceUid,
        currentQuality: null,
        incomingQuality: quality,
        sameChecksum: false,
        associationReason: 'new',
        mappingType: 'EXACT',
        confidence: 1,
        matchingFields: {},
      },
    };
  }
}
