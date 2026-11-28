import assert = require('node:assert/strict');
import { test } from '@jest/globals';
import {
  RAW_REVIEW_REQUIRES_RESTART,
  RAW_SOURCE_REVIEW_REQUIRED,
  activeManifestAfterRestart,
  applyRawAssociationRecovery,
  assertCanMarkVerified,
  assertRetryAllowed,
  exactChecksumDuplicateGroupCount,
  findCoveredDuplicateSegments,
  mergeReviewedRawScope,
  planRawAssociationRecovery,
  reviewCounts,
  unresolvedAssociationSegments,
} from '../raw-association-recovery';

const brickGap = {
  sourceObjectId: 'fit-brick',
  sourceKind: 'FILE',
  segments: [
    {
      segmentIndex: 0,
      sourceUid: 'fit-brick#0',
      startTimeMs: Date.parse('2026-06-01T00:00:00Z'),
      endTimeMs: Date.parse('2026-06-01T01:00:00Z'),
      sportType: 'CYCLING',
      recordCount: 400,
      strengthSetCount: 0,
    },
    {
      segmentIndex: 1,
      sourceUid: 'fit-brick#1',
      startTimeMs: Date.parse('2026-06-01T01:05:00Z'),
      endTimeMs: Date.parse('2026-06-01T01:35:00Z'),
      sportType: 'RUNNING',
      recordCount: 200,
      strengthSetCount: 0,
    },
  ],
};

const activities = [
  {
    activityId: 10,
    sportType: 'RIDE',
    startTimeMs: Date.parse('2026-06-01T00:00:30Z'),
    endTimeMs: Date.parse('2026-06-01T01:00:00Z'),
    processingStatus: 'READY',
    sources: [
      {
        sourceUid: 'fit-brick#0',
        activityId: 10,
        sourceId: 'primary-bike',
        sourceObjectId: 'fit-brick',
        sourceKind: 'FILE',
        isPrimary: true,
        associationRole: null,
      },
    ],
  },
  {
    activityId: 11,
    sportType: 'RUN',
    startTimeMs: Date.parse('2026-06-01T01:05:20Z'),
    endTimeMs: Date.parse('2026-06-01T01:35:00Z'),
    processingStatus: 'ANALYZING',
    sources: [
      {
        sourceUid: 'other-run',
        activityId: 11,
        sourceId: 'primary-run',
        sourceObjectId: 'other-file',
        sourceKind: 'GARMIN',
        isPrimary: true,
        associationRole: null,
      },
    ],
  },
];

test('refuses VERIFIED while ASSOCIATION_MISSING or pending raw remains', () => {
  const scope = mergeReviewedRawScope(null, {
    scannedSourceIds: ['fit-brick'],
    gaps: [brickGap],
  });
  const counts = reviewCounts({
    reviewedRawScope: scope,
    pendingRawSourceCount: 28,
  });
  assert.equal(counts.pendingAssociationMissing, 1);
  assert.equal(counts.pendingRawSourceCount, 28);
  assert.throws(
    () => assertCanMarkVerified(counts),
    (error) => {
      assert.equal(error.message, RAW_SOURCE_REVIEW_REQUIRED);
      assert.equal(error.pendingRawSourceCount, 28);
      return true;
    },
  );
});

test('retry of RAW_SOURCE_REVIEW_REQUIRED cannot skip the raw ledger', () => {
  assert.throws(
    () => assertRetryAllowed(RAW_SOURCE_REVIEW_REQUIRED),
    (error) => error.message === RAW_REVIEW_REQUIRES_RESTART,
  );
  assert.doesNotThrow(() =>
    assertRetryAllowed('ACTIVITY_MIGRATION_IMPORT_FAILED'),
  );
});

test('checksum duplicates stay on the merge path and do not write covers', async () => {
  assert.equal(
    exactChecksumDuplicateGroupCount([
      { activityId: 1, sourceChecksum: 'a' },
      { activityId: 2, sourceChecksum: 'a' },
      { activityId: 3, sourceChecksum: 'b' },
    ]),
    1,
  );
  const plan = planRawAssociationRecovery({
    exactChecksumDuplicateGroups: 1,
    gaps: [brickGap],
    activities,
  });
  assert.equal(plan.path, 'checksum-merge');
  assert.equal(plan.covers.length, 0);
  const writes = [];
  const result = await applyRawAssociationRecovery({
    userId: 'user-35',
    plan,
    apply: true,
    persistence: {
      findSource: async () => null,
      createCover: async (row) => writes.push(row),
      resetAnalyzing: async () => 1,
    },
  });
  assert.equal(writes.length, 0);
  assert.equal(result.readyResets, 0);
  assert.equal(result.pendingRawSourceCount, 0);
});

test('covers a brick twin, resets ANALYZING, then allows VERIFIED', async () => {
  const plan = planRawAssociationRecovery({
    exactChecksumDuplicateGroups: 0,
    gaps: [brickGap],
    activities,
  });
  assert.equal(plan.path, 'segment-materialize-cover');
  assert.deepEqual(
    plan.materialize.map((segment) => segment.segmentIndex),
    [],
  );
  assert.equal(plan.covers.length, 1);
  assert.equal(plan.covers[0].coversActivityId, 11);
  assert.equal(plan.covers[0].splitFromPrimarySourceId, 'primary-bike');
  assert.deepEqual(plan.readyResets, [11]);

  const writes = [];
  const resets = [];
  const applied = await applyRawAssociationRecovery({
    userId: 'user-35',
    plan,
    apply: true,
    persistence: {
      findSource: async () => null,
      createCover: async (row) => {
        assert.equal(row.metadata.associationRole, 'cover');
        assert.equal(row.isPrimary, false);
        assert.equal(row.activityId, 11);
        writes.push(row);
      },
      resetAnalyzing: async (ids) => {
        resets.push(...ids);
        return ids.length;
      },
    },
  });
  assert.equal(applied.wroteCovers, 1);
  assert.deepEqual(resets, [11]);
  assert.equal(applied.pendingRawSourceCount, 0);

  const stored = [
    ...activities[0].sources,
    {
      sourceUid: 'fit-brick#1',
      activityId: 11,
      sourceId: 'cover-run',
      sourceObjectId: 'fit-brick',
      isPrimary: false,
      associationRole: 'cover',
    },
  ];
  const unresolved = unresolvedAssociationSegments({
    segments: brickGap.segments,
    storedSources: stored,
    singlePrimaryLegacyMapped: false,
  });
  assert.equal(unresolved.length, 0);
  assert.equal(
    findCoveredDuplicateSegments({
      segments: brickGap.segments,
      storedSources: stored,
    }).covered.length,
    1,
  );

  const restarted = activeManifestAfterRestart(
    { protectedHash: 'fresh', primaryHash: 'fresh' },
    {
      protectedHash: 'old',
      reviewedRawScope: { pending: [brickGap], satisfied: false, sourceObjectIds: [] },
      pendingRawSourceCount: 28,
      restartHistory: [],
    },
    {
      at: '2026-11-08T11:37:00.000Z',
      batchIds: [],
      recomputeJobId: null,
      errorCode: RAW_SOURCE_REVIEW_REQUIRED,
      verification: { derivedVerificationOk: true },
      generation: 'next',
    },
  );
  assert.equal(restarted.reviewedRawScope, undefined);
  assert.equal(restarted.pendingRawSourceCount, undefined);
  assert.equal(restarted.protectedHash, 'fresh');
  assert.equal(restarted.restartHistory[0].before.pendingRawSourceCount, 28);
  assert.doesNotThrow(() =>
    assertCanMarkVerified({
      pendingAssociationMissing: unresolved.length,
      pendingRawSourceCount: applied.pendingRawSourceCount,
    }),
  );
});

test('a live analysis lease does not reset ANALYZING covers', () => {
  const plan = planRawAssociationRecovery({
    exactChecksumDuplicateGroups: 0,
    gaps: [brickGap],
    activities,
    analysisBusy: true,
  });
  assert.equal(plan.covers.length, 1);
  assert.deepEqual(plan.readyResets, []);
});

test('ambiguous twins are left to materialize instead of a guessed cover', () => {
  const secondRun = {
    ...activities[1],
    activityId: 12,
    sources: activities[1].sources.map((source) => ({
      ...source,
      activityId: 12,
      sourceId: 'primary-run-2',
    })),
  };
  const plan = planRawAssociationRecovery({
    exactChecksumDuplicateGroups: 0,
    gaps: [brickGap],
    activities: [...activities, secondRun],
  });
  assert.equal(plan.covers.length, 0);
  assert.deepEqual(
    plan.materialize.map((segment) => segment.segmentIndex),
    [1],
  );
});

test('an existing cover link is not an association gap', () => {
  const missing = unresolvedAssociationSegments({
    segments: brickGap.segments,
    storedSources: [
      {
        sourceUid: 'fit-brick#0',
        activityId: 10,
        sourceId: 'primary-bike',
        isPrimary: true,
      },
      {
        sourceUid: 'fit-brick#1',
        activityId: 11,
        sourceId: 'cover-run',
        isPrimary: false,
        associationRole: 'cover',
      },
    ],
    singlePrimaryLegacyMapped: false,
  });
  assert.equal(missing.length, 0);
});
