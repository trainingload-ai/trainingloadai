/**
 * Recoverable path for multi-segment FIT files that fail historical migration
 * with RAW_ACTIVITY_ASSOCIATION_MISSING.
 *
 * Resolve segment associations explicitly and start a fresh scan after review.
 * Derived verification alone cannot clear pending associations.
 */

export const RAW_ACTIVITY_ASSOCIATION_MISSING = 'RAW_ACTIVITY_ASSOCIATION_MISSING';
export const RAW_SOURCE_REVIEW_REQUIRED =
  'ACTIVITY_MIGRATION_RAW_SOURCE_REVIEW_REQUIRED';
export const RAW_REVIEW_REQUIRES_RESTART =
  'ACTIVITY_MIGRATION_RAW_REVIEW_REQUIRES_RESTART';

const COVER_START_TOLERANCE_MS = 120_000;
const COVER_DURATION_TOLERANCE = 0.25;

const SPORT_KEYS: Record<string, string> = {
  running: 'run',
  run: 'run',
  trail_running: 'run',
  treadmill: 'run',
  virtual_run: 'run',
  cycling: 'ride',
  ride: 'ride',
  biking: 'ride',
  bike: 'ride',
  virtual_ride: 'ride',
  e_biking: 'ride',
  swimming: 'swim',
  swim: 'swim',
  lap_swimming: 'swim',
  open_water_swimming: 'swim',
};

export type RawSegment = {
  segmentIndex: number;
  sourceUid: string;
  startTimeMs: number | null;
  endTimeMs: number | null;
  sportType: string | null;
  recordCount: number;
  strengthSetCount: number;
};

export type StoredSource = {
  sourceUid: string;
  activityId: number;
  sourceId: string;
  sourceObjectId?: string | null;
  sourceKind?: string | null;
  isPrimary: boolean;
  associationRole?: 'cover' | null;
  processingStatus?: string | null;
  startTimeMs?: number | null;
  endTimeMs?: number | null;
  sportType?: string | null;
};

export type AssociationGap = {
  sourceObjectId: string;
  sourceKind: string;
  segments: RawSegment[];
};

export type ReviewedRawScope = {
  satisfied: boolean;
  sourceObjectIds: string[];
  pending: AssociationGap[];
};

export type RecoveryActivity = {
  activityId: number;
  sportType: string | null;
  startTimeMs: number | null;
  endTimeMs: number | null;
  processingStatus: string | null;
  sources: StoredSource[];
};

export type CoverLink = {
  sourceObjectId: string;
  sourceKind: string;
  segmentIndex: number;
  sourceUid: string;
  coversActivityId: number;
  splitFromPrimarySourceId: string | null;
  processingStatus: string | null;
};

export type RecoveryPlan = {
  path: 'checksum-merge' | 'segment-materialize-cover' | 'clear';
  exactChecksumDuplicateGroups: number;
  materialize: Array<RawSegment & { sourceObjectId: string; sourceKind: string }>;
  covers: CoverLink[];
  readyResets: number[];
};

export function sportKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return SPORT_KEYS[key] ?? key;
}

export function segmentHasRecoverableData(segment: RawSegment): boolean {
  return segment.recordCount > 0 || segment.strengthSetCount > 0;
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function isExplicitCover(source: StoredSource | undefined): boolean {
  return Boolean(
    source && source.isPrimary === false && source.associationRole === 'cover',
  );
}

/**
 * Segments already linked as non-primary covers are not ASSOCIATION_MISSING.
 * A single-activity container mapped onto its only primary stays on the
 * existing legacy comparison path.
 */
export function unresolvedAssociationSegments(args: {
  segments: RawSegment[];
  storedSources: StoredSource[];
  singlePrimaryLegacyMapped: boolean;
}): RawSegment[] {
  if (args.singlePrimaryLegacyMapped) return [];
  const storedByUid = new Map(
    args.storedSources.map((source) => [source.sourceUid, source]),
  );
  return args.segments.filter((segment) => {
    if (!segmentHasRecoverableData(segment)) return false;
    const stored = storedByUid.get(segment.sourceUid);
    if (isExplicitCover(stored)) return false;
    if (stored && stored.isPrimary !== false) return false;
    return true;
  });
}

export function findCoveredDuplicateSegments(args: {
  segments: RawSegment[];
  storedSources: StoredSource[];
}): { covered: StoredSource[]; missing: RawSegment[] } {
  const storedByUid = new Map(
    args.storedSources.map((source) => [source.sourceUid, source]),
  );
  const covered: StoredSource[] = [];
  const missing: RawSegment[] = [];
  for (const segment of args.segments) {
    const stored = storedByUid.get(segment.sourceUid);
    if (isExplicitCover(stored)) {
      covered.push(stored!);
      continue;
    }
    if (!stored || stored.isPrimary === false) {
      if (segmentHasRecoverableData(segment)) missing.push(segment);
    }
  }
  return { covered, missing };
}

function durationsCompatible(
  leftStart: number | null,
  leftEnd: number | null,
  rightStart: number | null,
  rightEnd: number | null,
): boolean {
  if (
    leftStart == null ||
    leftEnd == null ||
    rightStart == null ||
    rightEnd == null
  ) {
    return true;
  }
  const left = Math.max(0, leftEnd - leftStart);
  const right = Math.max(0, rightEnd - rightStart);
  if (left === 0 || right === 0) return true;
  return Math.abs(left - right) / Math.max(left, right) <= COVER_DURATION_TOLERANCE;
}

function activityMatchesSegment(
  segment: RawSegment,
  activity: RecoveryActivity,
): boolean {
  const start = finite(segment.startTimeMs);
  const activityStart = finite(activity.startTimeMs);
  if (start == null || activityStart == null) return false;
  if (Math.abs(start - activityStart) > COVER_START_TOLERANCE_MS) return false;
  const leftSport = sportKey(segment.sportType);
  const rightSport = sportKey(activity.sportType);
  if (!leftSport || !rightSport || leftSport !== rightSport) return false;
  return durationsCompatible(
    start,
    finite(segment.endTimeMs),
    activityStart,
    finite(activity.endTimeMs),
  );
}

export function planRawAssociationRecovery(args: {
  exactChecksumDuplicateGroups: number;
  gaps: AssociationGap[];
  activities: RecoveryActivity[];
  analysisBusy?: boolean;
}): RecoveryPlan {
  if (args.exactChecksumDuplicateGroups > 0) {
    return {
      path: 'checksum-merge',
      exactChecksumDuplicateGroups: args.exactChecksumDuplicateGroups,
      materialize: [],
      covers: [],
      readyResets: [],
    };
  }
  const covers: CoverLink[] = [];
  const materialize: RecoveryPlan['materialize'] = [];
  const readyResets = new Set<number>();
  const activitiesById = new Map(
    args.activities.map((activity) => [activity.activityId, activity]),
  );

  for (const gap of args.gaps) {
    const stored = args.activities.flatMap((activity) =>
      activity.sources.filter(
        (source) => source.sourceObjectId === gap.sourceObjectId,
      ),
    );
    const storedByUid = new Map(stored.map((source) => [source.sourceUid, source]));
    const claimed = new Set(
      stored
        .filter((source) => source.isPrimary !== false)
        .map((source) => source.activityId),
    );
    const primary = stored.find((source) => source.isPrimary !== false);
    const usedTwinIds = new Set<number>();

    for (const segment of [...gap.segments].sort(
      (left, right) => left.segmentIndex - right.segmentIndex,
    )) {
      const existing = storedByUid.get(segment.sourceUid);
      if (existing && existing.isPrimary !== false) continue;
      if (isExplicitCover(existing)) {
        const activity = activitiesById.get(existing!.activityId);
        if (
          !args.analysisBusy &&
          activity?.processingStatus === 'ANALYZING'
        ) {
          readyResets.add(existing!.activityId);
        }
        continue;
      }
      if (!segmentHasRecoverableData(segment)) continue;
      const twins = args.activities.filter(
        (activity) =>
          !claimed.has(activity.activityId) &&
          !usedTwinIds.has(activity.activityId) &&
          activityMatchesSegment(segment, activity),
      );
      if (twins.length !== 1) {
        materialize.push({
          ...segment,
          sourceObjectId: gap.sourceObjectId,
          sourceKind: gap.sourceKind,
        });
        continue;
      }
      const twin = twins[0]!;
      usedTwinIds.add(twin.activityId);
      covers.push({
        sourceObjectId: gap.sourceObjectId,
        sourceKind: gap.sourceKind,
        segmentIndex: segment.segmentIndex,
        sourceUid: segment.sourceUid,
        coversActivityId: twin.activityId,
        splitFromPrimarySourceId: primary?.sourceId ?? null,
        processingStatus: twin.processingStatus,
      });
      if (!args.analysisBusy && twin.processingStatus === 'ANALYZING') {
        readyResets.add(twin.activityId);
      }
    }
  }

  const pendingWork = covers.length + materialize.length;
  return {
    path: pendingWork === 0 ? 'clear' : 'segment-materialize-cover',
    exactChecksumDuplicateGroups: 0,
    materialize,
    covers,
    readyResets: [...readyResets],
  };
}

export function coverSourceMetadata(link: CoverLink): Record<string, unknown> {
  return {
    associationRole: 'cover',
    segmentIndex: link.segmentIndex,
    containerSourceObjectId: link.sourceObjectId,
    coversActivityId: link.coversActivityId,
    splitFromPrimarySourceId: link.splitFromPrimarySourceId,
  };
}

export function mergeReviewedRawScope(
  previous: ReviewedRawScope | null | undefined,
  page: { scannedSourceIds: string[]; gaps: AssociationGap[] },
): ReviewedRawScope {
  const pending = new Map(
    (previous?.pending ?? []).map((gap) => [gap.sourceObjectId, gap]),
  );
  const seen = new Set(previous?.sourceObjectIds ?? []);
  for (const id of page.scannedSourceIds) {
    seen.add(id);
    pending.delete(id);
  }
  for (const gap of page.gaps) {
    pending.set(gap.sourceObjectId, gap);
    seen.add(gap.sourceObjectId);
  }
  const pendingList = [...pending.values()];
  return {
    satisfied: pendingList.length === 0,
    sourceObjectIds: [...seen],
    pending: pendingList,
  };
}

export function reviewCounts(manifest: unknown): {
  pendingAssociationMissing: number;
  pendingRawSourceCount: number;
  reviewedRawScope?: ReviewedRawScope;
} {
  const record =
    manifest && typeof manifest === 'object'
      ? (manifest as {
          reviewedRawScope?: ReviewedRawScope;
          pendingRawSourceCount?: number;
        })
      : {};
  const pending = record.reviewedRawScope?.pending?.length ?? 0;
  const count =
    typeof record.pendingRawSourceCount === 'number'
      ? record.pendingRawSourceCount
      : pending;
  return {
    pendingAssociationMissing: pending,
    pendingRawSourceCount: count,
    reviewedRawScope: record.reviewedRawScope,
  };
}

export function assertCanMarkVerified(input: {
  pendingAssociationMissing: number;
  pendingRawSourceCount: number;
  reviewedRawScope?: ReviewedRawScope;
}): void {
  const pending = Math.max(
    input.pendingAssociationMissing,
    input.pendingRawSourceCount,
  );
  if (pending > 0) {
    throw Object.assign(new Error(RAW_SOURCE_REVIEW_REQUIRED), {
      pendingRawSourceCount: pending,
      reviewedRawScope: input.reviewedRawScope,
    });
  }
}

export function assertRetryAllowed(errorCode: string | null | undefined): void {
  if (errorCode === RAW_SOURCE_REVIEW_REQUIRED) {
    throw new Error(RAW_REVIEW_REQUIRES_RESTART);
  }
}

export function stripRawReviewLedger<T extends Record<string, unknown>>(
  manifest: T,
): Omit<T, 'reviewedRawScope' | 'pendingRawSourceCount'> {
  const { reviewedRawScope: _scope, pendingRawSourceCount: _count, ...rest } =
    manifest;
  return rest;
}

export function activeManifestAfterRestart(
  fresh: Record<string, unknown>,
  old: Record<string, unknown>,
  entry: {
    at: string;
    batchIds: string[];
    recomputeJobId: string | null;
    errorCode: string | null;
    verification: unknown;
    generation: string;
  },
) {
  const { restartHistory: history = [], ...prior } = old;
  return stripRawReviewLedger({
    ...stripRawReviewLedger(fresh),
    generation: entry.generation,
    restartHistory: [
      ...(Array.isArray(history) ? history : []),
      {
        at: entry.at,
        before: prior,
        batchIds: entry.batchIds,
        recomputeJobId: entry.recomputeJobId,
        errorCode: entry.errorCode,
        verification: entry.verification,
      },
    ],
  });
}

export function segmentsFromLedger(manifest: unknown): RawSegment[] {
  return (reviewCounts(manifest).reviewedRawScope?.pending ?? []).flatMap(
    (gap) => gap.segments ?? [],
  );
}

export function exactChecksumDuplicateGroupCount(
  sources: Array<{ activityId: number; sourceChecksum: string | null }>,
): number {
  const groups = new Map<string, Set<number>>();
  for (const source of sources) {
    if (!source.sourceChecksum) continue;
    const ids = groups.get(source.sourceChecksum) ?? new Set<number>();
    ids.add(source.activityId);
    groups.set(source.sourceChecksum, ids);
  }
  let count = 0;
  for (const ids of groups.values()) if (ids.size > 1) count += 1;
  return count;
}

export type RecoveryPersistence = {
  findSource: (key: {
    userId: string;
    sourceKind: string;
    sourceUid: string;
  }) => Promise<{ id: string; isPrimary: boolean } | null>;
  createCover: (data: {
    userId: string;
    activityId: number;
    sourceKind: string;
    sourceUid: string;
    sourceObjectId: string;
    isPrimary: false;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
  resetAnalyzing: (activityIds: number[]) => Promise<number>;
};

export async function applyRawAssociationRecovery(args: {
  userId: string;
  plan: RecoveryPlan;
  apply: boolean;
  persistence: RecoveryPersistence;
}): Promise<{
  plan: RecoveryPlan;
  wroteCovers: number;
  readyResets: number;
  skippedPrimaryConflicts: string[];
  pendingRawSourceCount: number;
}> {
  const pendingRawSourceCount =
    args.plan.covers.length + args.plan.materialize.length;
  if (!args.apply || args.plan.path !== 'segment-materialize-cover') {
    return {
      plan: args.plan,
      wroteCovers: 0,
      readyResets: 0,
      skippedPrimaryConflicts: [],
      pendingRawSourceCount:
        args.plan.path === 'clear' ? 0 : pendingRawSourceCount,
    };
  }
  let wroteCovers = 0;
  const skippedPrimaryConflicts: string[] = [];
  for (const link of args.plan.covers) {
    const existing = await args.persistence.findSource({
      userId: args.userId,
      sourceKind: link.sourceKind,
      sourceUid: link.sourceUid,
    });
    if (existing?.isPrimary) {
      skippedPrimaryConflicts.push(link.sourceUid);
      continue;
    }
    if (existing) continue;
    await args.persistence.createCover({
      userId: args.userId,
      activityId: link.coversActivityId,
      sourceKind: link.sourceKind,
      sourceUid: link.sourceUid,
      sourceObjectId: link.sourceObjectId,
      isPrimary: false,
      metadata: coverSourceMetadata(link),
    });
    wroteCovers += 1;
  }
  const readyResets = args.plan.readyResets.length
    ? await args.persistence.resetAnalyzing(args.plan.readyResets)
    : 0;
  return {
    plan: args.plan,
    wroteCovers,
    readyResets,
    skippedPrimaryConflicts,
    pendingRawSourceCount:
      args.plan.materialize.length + skippedPrimaryConflicts.length,
  };
}

type ActivityRow = {
  id: number;
  sportType: string | null;
  startTime: Date | string | null;
  endTime: Date | string | null;
  processingStatus: string | null;
  activitySources: Array<{
    id: string;
    sourceUid: string;
    sourceObjectId: string | null;
    sourceKind: string;
    isPrimary: boolean;
    metadata: unknown;
  }>;
};

function timeMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toRecoveryActivities(rows: ActivityRow[]): RecoveryActivity[] {
  return rows.map((row) => ({
    activityId: row.id,
    sportType: row.sportType,
    startTimeMs: timeMs(row.startTime),
    endTimeMs: timeMs(row.endTime),
    processingStatus: row.processingStatus,
    sources: row.activitySources.map((source) => {
      const metadata =
        source.metadata &&
        typeof source.metadata === 'object' &&
        !Array.isArray(source.metadata)
          ? (source.metadata as { associationRole?: unknown })
          : {};
      return {
        sourceUid: source.sourceUid,
        activityId: row.id,
        sourceId: source.id,
        sourceObjectId: source.sourceObjectId,
        sourceKind: source.sourceKind,
        isPrimary: source.isPrimary,
        associationRole:
          metadata.associationRole === 'cover' ? 'cover' : null,
        processingStatus: row.processingStatus,
        startTimeMs: timeMs(row.startTime),
        endTimeMs: timeMs(row.endTime),
        sportType: row.sportType,
      };
    }),
  }));
}

export function gapsFromLedger(manifest: unknown): AssociationGap[] {
  return reviewCounts(manifest).reviewedRawScope?.pending ?? [];
}
