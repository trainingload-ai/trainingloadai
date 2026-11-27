import { ImportingJobService } from './importing-job.service';
import { Inject, Injectable } from '@nestjs/common';
import {
  ImportItemJobStatus,
  type ImportSourceKind,
  Prisma,
} from '@prisma/client';

import { decodeTrackFile } from '@/importing/trackswap-file';
import type { CanonicalActivityPayload } from '@/importing/canonical-activity.types';
import {
  ImportSourceObjectType,
  importJsonValue,
} from '@/importing/import-item-job.types';
import {
  fitSegmentChecksum,
  resolveRawFileIntegrity,
  type LegacyDiscoveryIntegrityAudit,
} from './raw-file-checksum';
import {
  mapTrackSwapActivityToCanonicalPayload,
  normalizeTrackSwapLapRecords,
} from '@/importing/source-adapters/trackswap-canonical.mapper';
import {
  ACTIVITY_MATERIALIZATION_VERSION,
  datasetRepairFingerprint,
  type ActivityDatasetRepair,
} from '@/importing/activity-dataset-repair';
import { PrismaService } from '@/prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';

const ACTIVE_ITEM_STATUSES: ImportItemJobStatus[] = [
  'QUEUED',
  'NORMALIZING',
  'DEDUPING',
  'MATERIALIZING',
  'PARQUET_BUILDING',
  'ANALYZING',
  'FAILED',
];

const HEALTH_OBJECT_TYPES = [
  ImportSourceObjectType.THIRD_PARTY_HEALTH_FILE,
  ImportSourceObjectType.THIRD_PARTY_MIXED_FIT,
];

// Keep registration transactions short even when canonical payloads contain
// high-frequency records. A multi-activity source remains atomic in one batch.
const REPAIR_REGISTRATION_MAX_ITEMS = 5;
const REPAIR_REGISTRATION_MAX_BYTES = 8 * 1024 * 1024;

export const FIT_ACTIVITY_DATA_REPAIR_REASON =
  'FIT_CANONICAL_MATERIALIZATION_V2';

type StoredActivityDataset = {
  sourceUid: string;
  activityId: number;
  recordPointCount: number;
  strengthSetCount: number;
  materializationVersion?: number;
};

type RawActivityDataset = {
  sourceUid: string;
  recordCount: number;
  strengthSetCount: number;
};

type RawFitSegment = RawActivityDataset & {
  index: number;
  startTimeMs: number;
};

export type FitActivityRepairReason = {
  sourceUid: string;
  activityId: number;
  missingRecordCount: number;
  missingStrengthSetCount: number;
  reasons?: string[];
};

export type FitActivityRepairCandidate = {
  sourceObjectId: string;
  userId: string;
  sourceKind: ImportSourceKind;
  sourceUid: string;
  sourceRevision?: string | null;
  fileName: string | null;
  payloads: CanonicalActivityPayload[];
  reasons: FitActivityRepairReason[];
  repairs?: Record<string, ActivityDatasetRepair>;
};

export type FitActivityRepairScanOptions = {
  all: boolean;
  limit: number;
  afterId?: string;
  sourceObjectId?: string;
  userId?: string;
  sourceKind?: ImportSourceKind;
  failFast?: boolean;
  migrationId?: string;
};

export type RawSourceScanDisposition =
  | 'NO_RECOVERABLE_DATA'
  | 'REPAIR_REQUIRED'
  | 'UNRECOVERABLE';

export type RawSourceScanOutcome = {
  sourceObjectId: string;
  disposition: RawSourceScanDisposition;
  code?: string;
  activities?: Array<{
    activityId: number;
    sourceUid: string;
    primarySourceId: string;
    recordCount: number;
    strengthSetCount: number;
  }>;
};

export type FitActivityRepairScanResult = {
  scanned: number;
  candidates: FitActivityRepairCandidate[];
  alreadyQueued: number;
  unavailableRawFiles: number;
  invalidFitFiles: number;
  noRecoverableData: number;
  unmappedRawActivities: number;
  failedSourceObjectIds: string[];
  firstCandidateId: string | null;
  lastCandidateId: string | null;
  lastScannedId: string | null;
  failures: Array<{ sourceObjectId: string; code: string }>;
  integrityAudits?: LegacyDiscoveryIntegrityAudit[];
  sourceOutcomes: RawSourceScanOutcome[];
  hasMore: boolean;
};

type SourceObjectQuery = {
  findMany: (args: Record<string, unknown>) => Promise<any[]>;
};

/** Eligibility shared by keyset pages and the exhaustion census. */
export function repairSourceWhere(options: {
  userId?: string;
  sourceKind?: ImportSourceKind;
  sourceObjectId?: string;
  afterId?: string;
}): Record<string, unknown> {
  return {
    ...(options.userId ? { userId: options.userId } : {}),
    ...(options.sourceKind ? { sourceKind: options.sourceKind } : {}),
    ...(options.sourceObjectId
      ? { id: options.sourceObjectId }
      : options.afterId
        ? { id: { gt: options.afterId } }
        : {}),
    objectType: { notIn: HEALTH_OBJECT_TYPES },
    OR: [{ rawStorageKey: { not: null } }, { fileKey: { not: null } }],
    activitySources: {
      some: { isActive: true, isPrimary: true, activity: { state: 1 } },
    },
  };
}

/** 只比较可从原始 FIT 恢复、但当前活动数据集中缺失的数据。 */
export function compareRecoverableFitData(args: {
  raw: RawActivityDataset[];
  stored: StoredActivityDataset[];
}): { reasons: FitActivityRepairReason[]; unmapped: number } {
  const storedBySourceUid = new Map(
    args.stored.map((dataset) => [dataset.sourceUid, dataset]),
  );
  const onlyStored = args.stored.length === 1 ? args.stored[0] : undefined;
  const onlyRaw = args.raw.length === 1;
  const reasons: FitActivityRepairReason[] = [];
  let unmapped = 0;

  for (const raw of args.raw) {
    const stored =
      storedBySourceUid.get(raw.sourceUid) ??
      (onlyRaw ? onlyStored : undefined);
    if (!stored) {
      if (raw.recordCount > 0 || raw.strengthSetCount > 0) unmapped += 1;
      continue;
    }
    const missingRecordCount = Math.max(
      0,
      raw.recordCount - stored.recordPointCount,
    );
    const missingStrengthSetCount = Math.max(
      0,
      raw.strengthSetCount - stored.strengthSetCount,
    );
    const legacy =
      (stored.materializationVersion ?? 0) < ACTIVITY_MATERIALIZATION_VERSION &&
      raw.recordCount > 0;
    if (missingRecordCount === 0 && missingStrengthSetCount === 0 && !legacy)
      continue;
    reasons.push({
      sourceUid: stored.sourceUid,
      activityId: stored.activityId,
      missingRecordCount,
      missingStrengthSetCount,
      reasons: [
        ...(missingRecordCount ? ['RECORDS_MISSING_OR_TRUNCATED'] : []),
        ...(missingStrengthSetCount
          ? ['STRENGTH_SETS_MISSING_OR_TRUNCATED']
          : []),
        ...(legacy ? ['LEGACY_MATERIALIZATION_ZERO_VALUE_SEMANTICS'] : []),
      ],
    });
  }
  return { reasons, unmapped };
}

@Injectable()
export class FitActivityDataRepairService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly jobs: ImportingJobService,
  ) {}

  private async findCoveredDuplicateSegments(args: {
    userId: string;
    sourceObjectId: string;
    containerChecksum: string;
    segments: RawFitSegment[];
    stored: StoredActivityDataset[];
  }): Promise<StoredActivityDataset[]> {
    const storedUids = new Set(args.stored.map(({ sourceUid }) => sourceUid));
    const missingByChecksum = new Map(
      args.segments
        .filter(
          (segment) =>
            !storedUids.has(segment.sourceUid) &&
            (segment.recordCount > 0 || segment.strengthSetCount > 0) &&
            Number.isFinite(segment.startTimeMs),
        )
        .map((segment) => [
          fitSegmentChecksum(args.containerChecksum, segment.index),
          segment,
        ]),
    );
    if (!missingByChecksum.size) return [];

    const equivalent = await this.prisma.activitySource.findMany({
      where: {
        userId: args.userId,
        sourceChecksum: { in: [...missingByChecksum.keys()] },
        sourceObject: {
          is: { userId: args.userId, id: { not: args.sourceObjectId } },
        },
        isActive: true,
        isPrimary: true,
        activity: { state: 1, processingStatus: 'READY' },
      },
      select: {
        sourceUid: true,
        sourceChecksum: true,
        metadata: true,
        sourceObject: { select: { sourceUid: true } },
        activityId: true,
        activity: {
          select: {
            startTime: true,
            parquetFiles: {
              where: { type: 'record' },
              select: { pointCount: true },
            },
            strengthExercises: {
              select: {
                _count: { select: { sets: { where: { source: 'FIT' } } } },
              },
            },
          },
        },
      },
    });
    const covered = new Map<string, StoredActivityDataset>();
    for (const link of equivalent) {
      const segment = missingByChecksum.get(link.sourceChecksum ?? '');
      const metadata = link.metadata as {
        containerChecksum?: string;
        materializationVersion?: number;
      } | null;
      const version = metadata?.materializationVersion ?? 0;
      if (
        !segment ||
        !link.sourceObject ||
        link.sourceUid !== `${link.sourceObject.sourceUid}#${segment.index}` ||
        metadata?.containerChecksum !== args.containerChecksum ||
        version < ACTIVITY_MATERIALIZATION_VERSION ||
        link.activity.startTime?.getTime() !== segment.startTimeMs
      )
        continue;

      const records = link.activity.parquetFiles.reduce(
        (total, file) => total + file.pointCount,
        0,
      );
      const sets = link.activity.strengthExercises.reduce(
        (total, exercise) => total + exercise._count.sets,
        0,
      );
      if (records < segment.recordCount || sets < segment.strengthSetCount)
        continue;
      covered.set(segment.sourceUid, {
        sourceUid: segment.sourceUid,
        activityId: link.activityId,
        recordPointCount: records,
        strengthSetCount: sets,
        materializationVersion: version,
      });
    }
    return [...covered.values()];
  }

  async scan(
    options: FitActivityRepairScanOptions,
  ): Promise<FitActivityRepairScanResult> {
    const result: FitActivityRepairScanResult = {
      scanned: 0,
      candidates: [],
      alreadyQueued: 0,
      unavailableRawFiles: 0,
      invalidFitFiles: 0,
      noRecoverableData: 0,
      unmappedRawActivities: 0,
      failedSourceObjectIds: [],
      firstCandidateId: null,
      lastCandidateId: null,
      lastScannedId: null,
      failures: [],
      integrityAudits: [],
      sourceOutcomes: [],
      hasMore: false,
    };
    let cursorId = options.afterId;
    const pageSize = Math.min(200, options.all ? 200 : options.limit);
    const sourceObjects = this.jobs.sourceObjects() as SourceObjectQuery;
    const conclude = (outcome: RawSourceScanOutcome) => {
      result.sourceOutcomes.push(outcome);
    };

    scan: while (true) {
      // Page source ids alone. A joined activity/parquet read can truncate a
      // parent page below `take` and look like exhaustion at the 25-row boundary.
      const idRows = await sourceObjects.findMany({
        where: repairSourceWhere({
          userId: options.userId,
          sourceKind: options.sourceKind,
          sourceObjectId: options.sourceObjectId,
          afterId: cursorId,
        }),
        orderBy: { id: 'asc' },
        take: pageSize + 1,
        select: { id: true },
      });
      if (idRows.length === 0) break;
      const moreIds = idRows.length > pageSize;
      const pageIds = idRows.slice(0, pageSize).map((row) => row.id);
      if (cursorId && pageIds.some((id) => id === cursorId)) {
        throw new Error('RAW_SCAN_CURSOR_STALLED');
      }
      const loaded = await sourceObjects.findMany({
        where: { id: { in: pageIds } },
        select: {
          id: true,
          userId: true,
          sourceKind: true,
          sourceUid: true,
          provider: true,
          objectType: true,
          accountRef: true,
          externalId: true,
          fileName: true,
          fileKey: true,
          rawStorageKey: true,
          rawChecksum: true,
          importRevision: true,
          metadata: true,
          activitySources: {
            where: { isActive: true, isPrimary: true, activity: { state: 1 } },
            select: {
              id: true,
              sourceUid: true,
              sourceChecksum: true,
              canonicalSnapshotId: true,
              metadata: true,
              activityId: true,
              activity: {
                include: {
                  parquetFiles: {
                    select: {
                      type: true,
                      pointCount: true,
                      parquetPath: true,
                      checksum: true,
                    },
                  },
                  strengthExercises: {
                    select: {
                      _count: {
                        select: { sets: { where: { source: 'FIT' } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (loaded.length !== pageIds.length) {
        throw new Error('RAW_SCAN_PAGE_INCOMPLETE');
      }
      const byId = new Map(loaded.map((row) => [row.id, row]));
      const page = pageIds.map((id) => {
        const row = byId.get(id);
        if (!row) throw new Error('RAW_SCAN_PAGE_INCOMPLETE');
        return row;
      });

      for (const sourceObject of page) {
        if (!options.all && result.scanned >= options.limit) {
          result.hasMore = true;
          break scan;
        }
        result.scanned += 1;
        result.lastScannedId = sourceObject.id;
        const rawStorageKey =
          sourceObject.rawStorageKey ?? sourceObject.fileKey;
        if (!rawStorageKey) {
          result.unavailableRawFiles += 1;
          conclude({
            sourceObjectId: sourceObject.id,
            disposition: 'UNRECOVERABLE',
            code: 'RAW_FILE_UNAVAILABLE',
          });
          continue;
        }

        let phase:
          | 'RAW_FILE_UNAVAILABLE'
          | 'RAW_CHECKSUM_MISMATCH'
          | 'RAW_DECODE_FAILED'
          | 'RAW_CANONICAL_MAPPING_FAILED' = 'RAW_FILE_UNAVAILABLE';
        try {
          const buffer = await this.storage.getFileWithKey(rawStorageKey);
          if (!buffer?.length) {
            result.unavailableRawFiles += 1;
            result.failedSourceObjectIds.push(sourceObject.id);
            result.failures.push({
              sourceObjectId: sourceObject.id,
              code: 'RAW_FILE_UNAVAILABLE',
            });
            if (options.failFast) break scan;
            conclude({
              sourceObjectId: sourceObject.id,
              disposition: 'UNRECOVERABLE',
              code: 'RAW_FILE_UNAVAILABLE',
            });
            continue;
          }
          phase = 'RAW_CHECKSUM_MISMATCH';
          const integrity = resolveRawFileIntegrity(buffer, sourceObject);
          const actualChecksum = integrity.sha256;
          if (integrity.audit) result.integrityAudits!.push(integrity.audit);
          phase = 'RAW_DECODE_FAILED';
          const decoded = await decodeTrackFile(buffer, {
            filename: sourceObject.fileName ?? `${sourceObject.sourceUid}.fit`,
          });
          if (decoded.detectedFormat !== 'fit') {
            result.noRecoverableData += 1;
            conclude({
              sourceObjectId: sourceObject.id,
              disposition: 'NO_RECOVERABLE_DATA',
            });
            continue;
          }
          phase = 'RAW_CANONICAL_MAPPING_FAILED';
          const activities = decoded.activity.activities ?? [];
          const raw = activities.map(
            (activity, index): RawFitSegment => ({
              index,
              startTimeMs: activity.startTime
                ? new Date(activity.startTime).getTime()
                : Number.NaN,
              sourceUid: `${sourceObject.sourceUid}#${index}`,
              recordCount: (activity.laps ?? []).reduce(
                (count, lap) => count + (lap.records?.length ?? 0),
                0,
              ),
              strengthSetCount: Array.isArray(
                (activity as unknown as { strengthSets?: unknown[] })
                  .strengthSets,
              )
                ? (
                    activity as unknown as {
                      strengthSets: Array<{ setType?: string }>;
                    }
                  ).strengthSets.filter(
                    (set) =>
                      String(set.setType ?? '')
                        .trim()
                        .toUpperCase() === 'ACTIVE',
                  ).length
                : 0,
            }),
          );
          const stored = sourceObject.activitySources.map(
            (source): StoredActivityDataset => ({
              sourceUid: source.sourceUid,
              activityId: source.activityId,
              recordPointCount: source.activity.parquetFiles.reduce(
                (count, file) =>
                  count +
                  (file.type === 'record' ? Math.max(0, file.pointCount) : 0),
                0,
              ),
              strengthSetCount: source.activity.strengthExercises.reduce(
                (count, exercise) => count + exercise._count.sets,
                0,
              ),
              materializationVersion: Number(
                (source.metadata as Record<string, unknown> | null)
                  ?.materializationVersion ?? 0,
              ),
            }),
          );
          let comparison = compareRecoverableFitData({ raw, stored });
          if (raw.length > 1 && comparison.unmapped > 0) {
            const primaryUids = new Set(
              stored.map(({ sourceUid }) => sourceUid),
            );
            for (const segment of raw) {
              if (primaryUids.has(segment.sourceUid)) continue;
              segment.recordCount = (
                activities[segment.index]?.laps ?? []
              ).reduce(
                (count, lap) =>
                  count +
                  normalizeTrackSwapLapRecords(lap.records ?? []).length,
                0,
              );
            }
            stored.push(
              ...(await this.findCoveredDuplicateSegments({
                userId: sourceObject.userId,
                sourceObjectId: sourceObject.id,
                containerChecksum: actualChecksum,
                segments: raw,
                stored,
              })),
            );
            comparison = compareRecoverableFitData({ raw, stored });
          }
          result.unmappedRawActivities += comparison.unmapped;
          if (comparison.unmapped) {
            result.failures.push({
              sourceObjectId: sourceObject.id,
              code: 'RAW_ACTIVITY_ASSOCIATION_MISSING',
            });
            if (options.failFast) break scan;
          }
          if (comparison.reasons.length === 0) {
            result.noRecoverableData += 1;
            conclude({
              sourceObjectId: sourceObject.id,
              disposition: comparison.unmapped
                ? 'UNRECOVERABLE'
                : 'NO_RECOVERABLE_DATA',
              ...(comparison.unmapped
                ? { code: 'RAW_ACTIVITY_ASSOCIATION_MISSING' }
                : {}),
            });
            continue;
          }
          const activeItem = await this.jobs.itemJobs().findFirst({
            where: {
              sourceObjectId: sourceObject.id,
              status: { in: ACTIVE_ITEM_STATUSES },
            },
            select: { id: true },
          });
          if (activeItem) {
            result.alreadyQueued += 1;
            continue;
          }
          const repairSourceUids = new Set(
            comparison.reasons.map((reason) => reason.sourceUid),
          );
          const sourceChecksum = actualChecksum;
          const metadata =
            sourceObject.metadata &&
            typeof sourceObject.metadata === 'object' &&
            !Array.isArray(sourceObject.metadata)
              ? (sourceObject.metadata as Record<string, unknown>)
              : undefined;
          const activityCount = decoded.activity.activities?.length ?? 0;
          const payloads = (decoded.activity.activities ?? [])
            .map((activity, index) =>
              mapTrackSwapActivityToCanonicalPayload({
                kind: sourceObject.sourceKind,
                sourceUid: sourceObject.sourceUid,
                activity,
                provider: sourceObject.provider,
                accountRef: sourceObject.accountRef ?? undefined,
                externalId: sourceObject.externalId ?? undefined,
                fileName: sourceObject.fileName ?? undefined,
                fileKey: sourceObject.fileKey ?? undefined,
                rawStorageKey: rawStorageKey,
                sourceChecksum,
                metadata,
                activityIndex: index,
                activityCount,
              }),
            )
            .map((payload) => {
              if (
                activityCount === 1 &&
                sourceObject.activitySources.length === 1
              ) {
                payload.source.sourceUid =
                  sourceObject.activitySources[0].sourceUid;
                payload.identity.sourceUid = payload.source.sourceUid;
              }
              return payload;
            })
            .filter((payload) =>
              repairSourceUids.has(payload.source.sourceUid),
            );
          if (payloads.length !== comparison.reasons.length) {
            result.unmappedRawActivities += comparison.reasons.length;
            result.failures.push({
              sourceObjectId: sourceObject.id,
              code: 'RAW_ACTIVITY_ASSOCIATION_MISSING',
            });
            if (options.failFast) break scan;
            conclude({
              sourceObjectId: sourceObject.id,
              disposition: 'UNRECOVERABLE',
              code: 'RAW_ACTIVITY_ASSOCIATION_MISSING',
            });
            continue;
          }
          const payloadChecksums = new Map(
            payloads.map(({ source }) => [
              source.sourceUid,
              source.sourceChecksum,
            ]),
          );
          const candidate: FitActivityRepairCandidate = {
            sourceObjectId: sourceObject.id,
            sourceRevision: sourceObject.importRevision,
            userId: sourceObject.userId,
            sourceKind: sourceObject.sourceKind,
            sourceUid: sourceObject.sourceUid,
            fileName: sourceObject.fileName,
            payloads,
            reasons: comparison.reasons,
            repairs: Object.fromEntries(
              sourceObject.activitySources.map((source) => [
                source.sourceUid,
                {
                  migrationId: options.migrationId ?? '',
                  activityId: source.activityId,
                  primarySourceId: source.id,
                  sourceChecksum:
                    payloadChecksums.get(source.sourceUid) ?? sourceChecksum,
                  expectedFingerprint: datasetRepairFingerprint(
                    source.activity,
                    source,
                    source.activity.parquetFiles,
                  ),
                },
              ]),
            ),
          };
          result.candidates.push(candidate);
          result.firstCandidateId ??= sourceObject.id;
          result.lastCandidateId = sourceObject.id;
          conclude({
            sourceObjectId: sourceObject.id,
            disposition: 'REPAIR_REQUIRED',
            activities: comparison.reasons.map((reason) => {
              const rawActivity =
                raw.find((item) => item.sourceUid === reason.sourceUid) ??
                (raw.length === 1 ? raw[0] : undefined);
              const repair = candidate.repairs?.[reason.sourceUid];
              return {
                activityId: reason.activityId,
                sourceUid: reason.sourceUid,
                primarySourceId: repair?.primarySourceId ?? '',
                recordCount: rawActivity?.recordCount ?? 0,
                strengthSetCount: rawActivity?.strengthSetCount ?? 0,
              };
            }),
          });
          if (!options.all && result.candidates.length >= options.limit) {
            // The candidate limit can end a full page before the loop's normal
            // pagination check. Require another page, even if it proves empty.
            result.hasMore = true;
            break scan;
          }
        } catch {
          if (phase === 'RAW_FILE_UNAVAILABLE') result.unavailableRawFiles += 1;
          else if (phase !== 'RAW_CHECKSUM_MISMATCH')
            result.invalidFitFiles += 1;
          result.failedSourceObjectIds.push(sourceObject.id);
          result.failures.push({
            sourceObjectId: sourceObject.id,
            code: phase,
          });
          if (options.failFast) break scan;
          conclude({
            sourceObjectId: sourceObject.id,
            disposition: 'UNRECOVERABLE',
            code: phase,
          });
        }
      }

      const previousCursor = cursorId;
      cursorId = page.at(-1)?.id;
      if (!cursorId || cursorId === previousCursor) {
        throw new Error('RAW_SCAN_CURSOR_STALLED');
      }
      if (options.sourceObjectId) break;
      if (!moreIds) break;
      if (!options.all && result.scanned >= options.limit) {
        result.hasMore = true;
        break;
      }
    }
    return result;
  }

  /** Every eligible source id, with no page cap. Used to prove a scan did not stop early. */
  async listEligibleSourceIds(
    userId: string,
    sourceObjects: SourceObjectQuery = this.jobs.sourceObjects() as SourceObjectQuery,
  ) {
    const rows = await sourceObjects.findMany({
      where: repairSourceWhere({ userId }),
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    return rows.map((row) => row.id as string);
  }

  /**
   * 登记由当前解析器从原始 FIT 生成的新 canonical payload；现有 worker
   * 继续负责原子替换数据集和重算指标，避免再次读取旧 canonical 快照。
   */
  async enqueue(candidates: FitActivityRepairCandidate[]) {
    for (const candidate of candidates) {
      for (const payload of candidate.payloads) {
        if (!candidate.repairs?.[payload.source.sourceUid]?.migrationId) {
          throw new Error('ACTIVITY_DATASET_REPAIR_MIGRATION_REQUIRED');
        }
      }
    }
    const groups = new Map<string, FitActivityRepairCandidate[]>();
    for (const candidate of candidates) {
      const migrationIds = new Set(
        candidate.payloads.map(
          (payload) => candidate.repairs![payload.source.sourceUid].migrationId,
        ),
      );
      if (migrationIds.size !== 1)
        throw new Error('ACTIVITY_DATASET_REPAIR_MIGRATION_CONFLICT');
      const key = `${candidate.userId}\u0000${candidate.sourceKind}\u0000${[...migrationIds][0]}`;
      groups.set(key, [...(groups.get(key) ?? []), candidate]);
    }

    const batchIds: string[] = [];
    let queued = 0;
    let skippedActive = 0;
    const registrationGroups: FitActivityRepairCandidate[][] = [];
    for (const group of groups.values()) {
      let pending: FitActivityRepairCandidate[] = [];
      let itemCount = 0;
      let byteCount = 0;
      for (const candidate of group) {
        // Measure before acquiring a transaction/lock; never truncate a source
        // to fit a batch, including a single source larger than the byte budget.
        const bytes = Buffer.byteLength(JSON.stringify(candidate.payloads));
        if (
          pending.length &&
          (itemCount + candidate.payloads.length >
            REPAIR_REGISTRATION_MAX_ITEMS ||
            byteCount + bytes > REPAIR_REGISTRATION_MAX_BYTES)
        ) {
          registrationGroups.push(pending);
          pending = [];
          itemCount = 0;
          byteCount = 0;
        }
        pending.push(candidate);
        itemCount += candidate.payloads.length;
        byteCount += bytes;
      }
      if (pending.length) registrationGroups.push(pending);
    }
    for (const group of registrationGroups) {
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          const migrationId =
            group[0].repairs![group[0].payloads[0].source.sourceUid]
              .migrationId;
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'activity-data-migration'}, 0))::text`;
          const migration = await tx.activityDataMigration.findFirst({
            where: {
              id: migrationId,
              userId: group[0].userId,
              status: 'MIGRATING',
            },
            select: { id: true },
          });
          if (!migration)
            throw new Error('ACTIVITY_DATASET_REPAIR_MIGRATION_REQUIRED');
          const active = await this.jobs.itemJobs(tx).findMany({
            where: {
              sourceObjectId: {
                in: group.map((candidate) => candidate.sourceObjectId),
              },
              status: { in: ACTIVE_ITEM_STATUSES },
            },
            select: { sourceObjectId: true },
          });
          const activeIds = new Set(active.map((item) => item.sourceObjectId));
          const selected = group.filter(
            (candidate) => !activeIds.has(candidate.sourceObjectId),
          );
          if (selected.length === 0) {
            return { batchId: null, queued: 0, skipped: group.length };
          }
          const first = selected[0]!;
          const repairItems = selected.flatMap((candidate) =>
            candidate.payloads.map((payload) => ({ candidate, payload })),
          );
          const batch = await this.jobs.batchJobs(tx).create({
            data: {
              userId: first.userId,
              sourceKind: first.sourceKind,
              status: 'QUEUED',
              totalCount: repairItems.length,
              requestContext: {
                source: 'fit_activity_data_repair',
                maintenanceReason: FIT_ACTIVITY_DATA_REPAIR_REASON,
                suppressCompletionNotification: true,
                suppressAutomaticAiReview: true,
                suppressThirdPartyExport: true,
                sourceObjectIds: selected.map(
                  (candidate) => candidate.sourceObjectId,
                ),
              } satisfies Prisma.InputJsonObject,
              summary: {
                repairCandidateCount: selected.length,
                repairItemCount: repairItems.length,
                missingRecordCount: selected.reduce(
                  (sum, candidate) =>
                    sum +
                    candidate.reasons.reduce(
                      (reasonSum, reason) =>
                        reasonSum + reason.missingRecordCount,
                      0,
                    ),
                  0,
                ),
                missingStrengthSetCount: selected.reduce(
                  (sum, candidate) =>
                    sum +
                    candidate.reasons.reduce(
                      (reasonSum, reason) =>
                        reasonSum + reason.missingStrengthSetCount,
                      0,
                    ),
                  0,
                ),
              } satisfies Prisma.InputJsonObject,
            },
          });
          for (let position = 0; position < repairItems.length; position += 1) {
            const { candidate, payload } = repairItems[position]!;
            const item = await this.jobs.itemJobs(tx).create({
              data: {
                batchJobId: batch.id,
                userId: candidate.userId,
                sourceObjectId: candidate.sourceObjectId,
                sourceKind: candidate.sourceKind,
                sourceUid: payload.source.sourceUid,
                sourceRevision: candidate.sourceRevision ?? null,
                position,
                status: 'QUEUED',
                sourceRef: importJsonValue({
                  kind: 'canonical_payload',
                  payload,
                  repair: candidate.repairs![payload.source.sourceUid],
                }),
              },
            });
            await tx.importEventLog.create({
              data: {
                batchJobId: batch.id,
                itemJobId: item.id,
                userId: candidate.userId,
                stage: 'SOURCE_REGISTERED',
                level: 'INFO',
                message: '历史 FIT 活动分析数据修复已入队',
                data: {
                  maintenanceReason: FIT_ACTIVITY_DATA_REPAIR_REASON,
                  sourceObjectId: candidate.sourceObjectId,
                  sourceUid: payload.source.sourceUid,
                  reasons: candidate.reasons,
                } as Prisma.InputJsonValue,
              },
            });
          }
          // Batch creation and registration must commit together. A crash cannot
          // leave an untracked import batch outside the user's migration ledger.
          const ledger = await tx.activityDataMigration.findUniqueOrThrow({
            where: { id: migrationId },
          });
          const previousIds = Array.isArray(ledger.importBatchIds)
            ? (ledger.importBatchIds as string[])
            : [];
          await tx.activityDataMigration.update({
            where: { id: migrationId },
            data: {
              importBatchIds: [...previousIds, batch.id],
            },
          });
          return {
            batchId: batch.id,
            queued: selected.length,
            skipped: group.length - selected.length,
          };
        },
        { maxWait: 5000, timeout: 30_000 },
      );
      if (outcome.batchId) batchIds.push(outcome.batchId);
      queued += outcome.queued;
      skippedActive += outcome.skipped;
    }
    return { batchIds, queued, skippedActive };
  }
}
