import { describe, expect, it, jest } from '@jest/globals';
import { MetricSource, SportType, UserFitnessMetricType } from '@prisma/client';
import {
  ChronologicalActivityReplayService,
  selectCausallyClosedActivityPage,
} from '../chronological-activity-replay.service';

function activity(id: number, start: string, end: string) {
  return {
    id,
    startTime: new Date(start),
    endTime: new Date(end),
    timerTime: null,
    elapsedTime: null,
  };
}

describe('selectCausallyClosedActivityPage', () => {
  it('extends a page through all overlapping and equal-time activities', () => {
    const rows = [
      activity(1, '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'),
      activity(2, '2026-01-01T10:30:00Z', '2026-01-01T12:00:00Z'),
      activity(3, '2026-01-01T12:00:00Z', '2026-01-01T12:30:00Z'),
      activity(4, '2026-01-01T13:00:00Z', '2026-01-01T14:00:00Z'),
    ];

    const page = selectCausallyClosedActivityPage(
      rows,
      1,
      new Date('2026-01-02T00:00:00Z'),
    );

    expect(page.activities.map((row) => row.id)).toEqual([1, 2, 3]);
    expect(page.replayTo).toEqual(new Date('2026-01-01T12:30:00Z'));
    expect(page.nextCheckpoint).toEqual({
      schemaVersion: 1,
      nextEffectiveFrom: '2026-01-01T13:00:00.000Z',
      lastActivityId: 3,
    });
  });

  it('is pagination invariant for non-overlapping activities', () => {
    const rows = [
      activity(1, '2026-01-01T10:00:00Z', '2026-01-01T10:30:00Z'),
      activity(2, '2026-01-01T11:00:00Z', '2026-01-01T11:30:00Z'),
      activity(3, '2026-01-01T12:00:00Z', '2026-01-01T12:30:00Z'),
    ];
    const first = selectCausallyClosedActivityPage(
      rows,
      2,
      new Date('2026-01-02T00:00:00Z'),
    );
    const second = selectCausallyClosedActivityPage(
      rows.slice(2),
      2,
      new Date('2026-01-02T00:00:00Z'),
    );
    expect([
      ...first.activities.map((row) => row.id),
      ...second.activities.map((row) => row.id),
    ]).toEqual(rows.map((row) => row.id));
  });
});

function replayHarness(args?: {
  activities?: ReturnType<typeof replayActivity>[];
  snapshotFingerprint?: string | null;
  resolvedFingerprint?: string;
  provenanceFingerprint?: string;
  zeroDuration?: boolean;
}) {
  const activities = args?.activities ?? [
    replayActivity(
      42,
      '2026-01-01T10:00:00.000Z',
      args?.zeroDuration
        ? '2026-01-01T10:00:00.000Z'
        : '2026-01-01T11:00:00.000Z',
    ),
  ];
  const revision = { value: BigInt(1) };
  const replayCheckpoint = { value: null as unknown };
  const sourceJob = {
    findFirst: jest.fn(async () => ({ id: 'job-1' })),
    findUnique: jest.fn(async () => ({
      replayCheckpoint: replayCheckpoint.value,
    })),
    updateMany: jest.fn(
      async ({ data }: { data: { replayCheckpoint: unknown } }) => {
        replayCheckpoint.value = data.replayCheckpoint;
        return { count: 1 };
      },
    ),
  };
  const tx = {
    $queryRaw: jest.fn(async () => []),
    fitnessEvidenceRevision: {
      findUnique: jest.fn(async () => ({ revision: revision.value })),
      findUniqueOrThrow: jest.fn(async () => ({ revision: revision.value })),
    },
    activityAnalysisLease: {
      findUnique: jest.fn(async () => ({
        ownerToken: 'owner-1',
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })),
    },
    activityRecomputeJob: sourceJob,
    userPostProcessJob: sourceJob,
    activity: {
      update: jest.fn(async () => ({})),
      findUnique: jest.fn(async () => ({
        id: 42,
        coggan: null,
        trimp: null,
        bikeScore: null,
        govss: null,
        swimScore: null,
        activitySources: [],
      })),
    },
    activityFitnessMetricsSnapshot: {
      update: jest.fn(async () => ({})),
      findUniqueOrThrow: jest.fn(async () => ({
        pmcLocalDate: '2026-01-01',
        sport: SportType.RUN,
      })),
    },
  };
  const activityFindMany = jest.fn(
    async (query: { select?: Record<string, unknown> }) =>
      query.select ? [] : activities,
  );
  const prisma = {
    fitnessEvidenceRevision: {
      upsert: jest.fn(async () => ({ revision: revision.value })),
    },
    activity: {
      findMany: activityFindMany,
      findUnique: jest.fn(async () => ({
        id: 42,
        coggan: null,
        trimp: null,
        bikeScore: null,
        govss: null,
        swimScore: null,
        activitySources: [],
      })),
    },
    activityFitnessMetricsSnapshot: {
      findUnique: jest.fn(async () => ({
        calculationFingerprint: args?.snapshotFingerprint ?? 'calculation-1',
        provenanceFingerprint: args?.provenanceFingerprint ?? 'provenance-1',
        provenance: {},
        ftpValue: null,
        cpValue: null,
        cpValue2: null,
        maxHrValue: null,
        lthrValue: null,
        restHrValue: null,
        csValue: null,
        csValue2: null,
      })),
    },
    activityRecomputeJob: sourceJob,
    userPostProcessJob: sourceJob,
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const users = {
    listTimelineFitnessMetrics: jest.fn(async () => []),
    getComposedUserProfile: jest.fn(async () => ({})),
    checkAutoUpdatePermission: jest.fn(async () => true),
    applyTimelineProjectionBatch: jest.fn(async () => ({})),
    saveTimelineEstimatesBatch: jest.fn(async () => ({})),
  };
  const metrics = {
    computeHeavy: jest.fn(async ({ activity }: { activity: unknown }) => ({
      context: { inputs: { activity } },
      tasks: [],
    })),
    commitComputedHeavy: jest.fn(async () => ({})),
    commitResolvedSnapshot: jest.fn(async () => ({})),
  };
  const observations = {
    prepare: jest.fn(async () => ({ prepared: true })),
    refreshPreparedVo2Rows: jest.fn(async () => undefined),
    calculate: jest.fn(async (_input: { eligibleActivityIds: number[] }) => []),
  };
  const resolved = {
    calculationFingerprint: args?.resolvedFingerprint ?? 'calculation-1',
    provenanceFingerprint: args?.provenanceFingerprint ?? 'provenance-1',
    resolutionVersion: 3,
    activityId: 42,
    activityStart: activities[0].startTime,
    activityEnd: activities[0].endTime,
    sport: SportType.RUN,
    profile: {},
    analysisConfig: {
      fingerprint: 'config-1',
      loadSources: [],
    },
    inputFingerprints: {
      overall: 'input-1',
      dimensions: {
        HEART_RATE: 'hr',
        POWER: 'power',
        PACE: 'pace',
        PROFILE: 'profile',
        LOAD: 'load',
      },
    },
    metrics: {},
    zones: [],
    bodyMetrics: [],
  };
  const contexts = { resolve: jest.fn(async () => resolved) };
  const lease = {
    userId: 'user-1',
    sourceJobType: 'ACTIVITY_RECOMPUTE' as const,
    sourceJobId: 'job-1',
    priority: 100,
    dataRepair: false,
    ownerToken: 'owner-1',
    leaseExpiresAt: new Date(Date.now() + 60_000),
  };
  const leases = {
    acquire: jest.fn(async () => lease),
    heartbeat: jest.fn(async () => true),
    assertOwned: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
  };
  const impacts = {
    dimensionsForContextChange: jest.fn(() => ['FULL']),
    shouldRecomputePmc: jest.fn(() => false),
  };
  const loadReadout = {
    getUserLoadSources: jest.fn(async () => []),
    loadValueForActivity: jest.fn(() => null),
    loadReadoutForActivity: jest.fn(() => ({
      actualLoad: null,
      actualLoadSource: null,
    })),
  };
  const events = { emitAsync: jest.fn(async () => []) };
  const importJobs = {
    postProcessJobs: jest.fn(() => sourceJob),
  };
  const service = new ChronologicalActivityReplayService(
    prisma as never,
    users as never,
    metrics as never,
    observations as never,
    contexts as never,
    leases as never,
    impacts as never,
    loadReadout as never,
    {
      listAutoUpdateVersions: jest.fn(async () => []),
    } as never,
    importJobs as never,
    events as never,
  );
  return {
    service,
    prisma,
    tx,
    users,
    metrics,
    observations,
    contexts,
    leases,
    impacts,
    loadReadout,
    events,
    revision,
    replayCheckpoint,
  };
}

function replayActivity(id: number, start: string, end: string) {
  return {
    id,
    userId: 'user-1',
    startTime: new Date(start),
    endTime: new Date(end),
    timerTime: (Date.parse(end) - Date.parse(start)) / 1000,
    elapsedTime: (Date.parse(end) - Date.parse(start)) / 1000,
    sportType: SportType.RUN,
    processingStatus: 'READY',
    eftp: null,
    ecp: null,
    ewPrime: null,
    epmax: null,
  };
}

describe('ChronologicalActivityReplayService', () => {
  const request = {
    userId: 'user-1',
    sourceJobType: 'ACTIVITY_RECOMPUTE' as const,
    sourceJobId: 'job-1',
    sourceLockToken: 'lock-1',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: new Date('2026-01-02T00:00:00.000Z'),
  };

  it('reads and commits evidence through the end of an admitted future activity', async () => {
    const start = new Date('2026-01-02T00:00:00.000Z');
    const end = new Date('2026-01-02T01:00:00.000Z');
    const pending = replayActivity(42, start.toISOString(), end.toISOString());
    pending.processingStatus = 'ANALYZING';
    const harness = replayHarness({ activities: [pending] });

    const result = await harness.service.replay({
      ...request,
      effectiveFrom: start,
      effectiveTo: start,
      includeActivityEnds: true,
      includeActivityIds: [42],
    });

    expect(result).toMatchObject({ completed: true, processedActivities: 1 });
    expect(harness.users.listTimelineFitnessMetrics).toHaveBeenCalledWith(
      'user-1',
      end,
    );
    expect(harness.users.applyTimelineProjectionBatch).toHaveBeenCalledWith(
      expect.objectContaining({ replaceFrom: start, replaceTo: end }),
      expect.anything(),
    );
    expect(harness.observations.calculate).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveAt: end, eligibleActivityIds: [42] }),
    );
  });

  it('does not read high-frequency records when every calculation fingerprint hits', async () => {
    const harness = replayHarness();

    const result = await harness.service.replay(request);

    expect(result).toEqual(
      expect.objectContaining({
        processedActivities: 1,
        fingerprintHits: 1,
        highFrequencyReads: 0,
      }),
    );
    expect(harness.metrics.computeHeavy).not.toHaveBeenCalled();
    expect(harness.metrics.commitComputedHeavy).not.toHaveBeenCalled();
    expect(harness.users.applyTimelineProjectionBatch).toHaveBeenCalledTimes(1);
    expect(harness.users.saveTimelineEstimatesBatch).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: expect.any(Array) }),
      harness.tx,
    );
    expect(harness.leases.release).toHaveBeenCalledTimes(1);
  });

  it('adds a fingerprint-hit ANALYZING activity to PMC when it first becomes READY', async () => {
    const pending = replayActivity(
      42,
      '2026-01-01T10:00:00.000Z',
      '2026-01-01T11:00:00.000Z',
    );
    pending.processingStatus = 'ANALYZING';
    const harness = replayHarness({ activities: [pending] });

    const result = await harness.service.replay(request);

    expect(result).toEqual(
      expect.objectContaining({
        fingerprintHits: 1,
        pmcRecomputeFrom: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    expect(harness.metrics.computeHeavy).not.toHaveBeenCalled();
    expect(harness.metrics.commitResolvedSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.tx.activity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        data: expect.objectContaining({ processingStatus: 'READY' }),
      }),
    );
    expect(harness.events.emitAsync).toHaveBeenCalledTimes(1);
  });

  it('adds a newly READY HEAVY activity to PMC even when its load value is unchanged', async () => {
    const pending = replayActivity(
      42,
      '2026-01-01T10:00:00.000Z',
      '2026-01-01T11:00:00.000Z',
    );
    pending.processingStatus = 'ANALYZING';
    const harness = replayHarness({
      activities: [pending],
      snapshotFingerprint: 'old-calculation',
      resolvedFingerprint: 'new-calculation',
    });
    harness.impacts.shouldRecomputePmc.mockReturnValue(false);
    harness.loadReadout.loadReadoutForActivity.mockReturnValue({
      actualLoad: 42,
      actualLoadSource: 'POWER',
    });

    const result = await harness.service.replay(request);

    expect(result).toEqual(
      expect.objectContaining({
        pmcRecomputeFrom: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    expect(harness.metrics.commitComputedHeavy).toHaveBeenCalledTimes(1);
    expect(harness.events.emitAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps a zero-duration activity bootstrap invisible to its own calculation', async () => {
    const harness = replayHarness({ zeroDuration: true });

    await harness.service.replay(request);

    expect(harness.observations.calculate).toHaveBeenCalledTimes(2);
    expect(harness.observations.calculate.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ eligibleActivityIds: [] }),
    );
    expect(harness.observations.calculate.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ eligibleActivityIds: [42] }),
    );
  });

  it('stops the user replay immediately when one activity HEAVY calculation fails', async () => {
    const activities = [
      replayActivity(
        42,
        '2026-01-01T10:00:00.000Z',
        '2026-01-01T11:00:00.000Z',
      ),
      replayActivity(
        43,
        '2026-01-01T12:00:00.000Z',
        '2026-01-01T13:00:00.000Z',
      ),
    ];
    const harness = replayHarness({
      activities,
      snapshotFingerprint: 'old',
      resolvedFingerprint: 'new',
    });
    harness.metrics.computeHeavy.mockRejectedValueOnce(new Error('broken'));

    await expect(harness.service.replay(request)).rejects.toThrow('broken');

    expect(harness.contexts.resolve).toHaveBeenCalledTimes(1);
    expect(harness.metrics.commitComputedHeavy).not.toHaveBeenCalled();
    expect(harness.users.applyTimelineProjectionBatch).not.toHaveBeenCalled();
    expect(harness.leases.release).toHaveBeenCalledTimes(1);
  });

  it('rejects a HEAVY commit after the source job token is fenced', async () => {
    const harness = replayHarness({
      snapshotFingerprint: 'old-calculation',
      resolvedFingerprint: 'new-calculation',
    });
    harness.tx.activityRecomputeJob.findFirst.mockResolvedValueOnce(null);

    await expect(harness.service.replay(request)).rejects.toThrow(
      'ACTIVITY_REPLAY_SOURCE_JOB_FENCED',
    );

    expect(harness.metrics.computeHeavy).toHaveBeenCalledTimes(1);
    expect(harness.metrics.commitComputedHeavy).not.toHaveBeenCalled();
    expect(harness.tx.activity.update).not.toHaveBeenCalled();
    expect(harness.users.applyTimelineProjectionBatch).not.toHaveBeenCalled();
  });

  it('restarts at most three times when fitness evidence changes during calculation', async () => {
    const harness = replayHarness();
    let revision = BigInt(0);
    harness.prisma.fitnessEvidenceRevision.upsert.mockImplementation(
      async () => ({ revision: (revision += BigInt(1)) }),
    );

    await expect(harness.service.replay(request)).rejects.toThrow(
      'FITNESS_EVIDENCE_REVISION_DRIFT',
    );

    expect(harness.prisma.activity.findMany).toHaveBeenCalledTimes(6);
    expect(harness.metrics.computeHeavy).not.toHaveBeenCalled();
    expect(harness.leases.release).toHaveBeenCalledTimes(1);
  });

  it('persists pending PMC work before emitting and recovers it after an event failure', async () => {
    const harness = replayHarness({
      snapshotFingerprint: 'old-calculation',
      resolvedFingerprint: 'new-calculation',
    });
    harness.impacts.shouldRecomputePmc.mockReturnValue(true);
    harness.loadReadout.loadReadoutForActivity
      .mockReturnValueOnce({ actualLoad: 10, actualLoadSource: 'POWER' })
      .mockReturnValueOnce({ actualLoad: 20, actualLoadSource: 'POWER' });
    harness.events.emitAsync.mockRejectedValueOnce(
      new Error('pmc unavailable'),
    );

    await expect(harness.service.replay(request)).rejects.toThrow(
      'pmc unavailable',
    );

    expect(harness.replayCheckpoint.value).toEqual(
      expect.objectContaining({
        pendingPmcRecomputeFrom: '2026-01-01T00:00:00.000Z',
        pendingPmcRecomputeTo: '2026-01-02T00:00:00.000Z',
      }),
    );

    harness.prisma.activityFitnessMetricsSnapshot.findUnique.mockResolvedValue({
      calculationFingerprint: 'new-calculation',
      provenanceFingerprint: 'provenance-1',
      provenance: {},
      ftpValue: null,
      cpValue: null,
      cpValue2: null,
      maxHrValue: null,
      lthrValue: null,
      restHrValue: null,
      csValue: null,
      csValue2: null,
    });
    harness.impacts.shouldRecomputePmc.mockReturnValue(false);

    await expect(harness.service.replay(request)).resolves.toEqual(
      expect.objectContaining({ fingerprintHits: 1 }),
    );
    expect(harness.events.emitAsync).toHaveBeenCalledTimes(2);
    expect(harness.replayCheckpoint.value).not.toEqual(
      expect.objectContaining({
        pendingPmcRecomputeFrom: expect.anything(),
      }),
    );
  });

  it('persists pending PMC work in the same transaction as each changed activity load', async () => {
    const activities = [
      replayActivity(
        42,
        '2026-01-01T10:00:00.000Z',
        '2026-01-01T11:00:00.000Z',
      ),
      replayActivity(
        43,
        '2026-01-01T12:00:00.000Z',
        '2026-01-01T13:00:00.000Z',
      ),
    ];
    const harness = replayHarness({
      activities,
      snapshotFingerprint: 'old-calculation',
      resolvedFingerprint: 'new-calculation',
    });
    harness.impacts.shouldRecomputePmc.mockReturnValue(true);
    harness.loadReadout.loadReadoutForActivity
      .mockReturnValueOnce({ actualLoad: 10, actualLoadSource: 'POWER' })
      .mockReturnValueOnce({ actualLoad: 20, actualLoadSource: 'POWER' });
    harness.metrics.computeHeavy
      .mockImplementationOnce(async ({ activity }: { activity: unknown }) => ({
        context: { inputs: { activity } },
        tasks: [],
      }))
      .mockRejectedValueOnce(new Error('second activity failed'));

    await expect(harness.service.replay(request)).rejects.toThrow(
      'second activity failed',
    );

    expect(harness.events.emitAsync).not.toHaveBeenCalled();
    expect(harness.replayCheckpoint.value).toEqual(
      expect.objectContaining({
        pendingPmcRecomputeFrom: '2026-01-01T00:00:00.000Z',
        pendingPmcRecomputeTo: '2026-01-02T00:00:00.000Z',
      }),
    );
  });

  it('persists ESTIMATED estimates even when auto-update is enabled and promotes AUTO simultaneously', async () => {
    const harness = replayHarness();
    const effectiveAt = new Date('2026-01-01T11:00:00.000Z');
    harness.observations.calculate.mockResolvedValueOnce([
      {
        metric: 'FTP',
        sport: 'CYCLING',
        value: 280,
        evidenceFingerprint: 'ev-ftp-280',
        sourceActivityIds: [42],
      } as never,
    ]);

    const result = await harness.service.replay(request);

    expect(result.projectionChanges).toBe(1);
    expect(result.estimatedOnlyChanges).toBe(1);
    expect(harness.users.applyTimelineProjectionBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        projections: [
          expect.objectContaining({
            type: 'FTP',
            sport: 'CYCLING',
            value: 280,
            effectiveAt,
          }),
        ],
      }),
      harness.tx,
    );
    expect(harness.users.saveTimelineEstimatesBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        replacementReason: 'CHRONOLOGICAL_REPLAY',
        projections: [
          expect.objectContaining({
            type: 'FTP',
            sport: 'CYCLING',
            value: 280,
            effectiveAt,
          }),
        ],
      }),
      harness.tx,
    );
  });

  it('ignores a 28/32/34-style midnight AUTO LTHR batch during DATA_REPAIR', async () => {
    const activityStart = new Date('2026-07-16T01:10:00.000Z');
    const activity = replayActivity(
      28,
      activityStart.toISOString(),
      '2026-07-16T02:05:11.000Z',
    );
    const harness = replayHarness({ activities: [activity] });
    const midnightBatch = ['2026-06-01', '2026-07-01', '2026-07-16'].flatMap(
      (day) =>
        (['RUN', 'CYCLING'] as const).map((sport) => ({
          id: `auto-${sport}-${day}`,
          type: UserFitnessMetricType.LTHR,
          sport: sport === 'RUN' ? SportType.RUN : SportType.CYCLING,
          value: sport === 'RUN' ? 168 : 162,
          value2: null,
          source: MetricSource.AUTO,
          recordedAt: new Date(`${day}T00:00:00.000Z`),
          originPayload: null,
          projectionFingerprint: null,
          originChecksum: null,
        })),
    );
    const activityTimed = {
      id: 'auto-activity-end',
      type: UserFitnessMetricType.LTHR,
      sport: SportType.RUN,
      value: 171,
      value2: null,
      source: MetricSource.AUTO,
      recordedAt: new Date('2026-07-15T11:05:33.000Z'),
      originPayload: { sourceActivityIds: [8801] },
      projectionFingerprint: 'activity-end',
      originChecksum: null,
    };
    const manual = {
      id: 'manual-lthr',
      type: UserFitnessMetricType.LTHR,
      sport: SportType.RUN,
      value: 164,
      value2: null,
      source: MetricSource.MANUAL,
      recordedAt: new Date('2026-07-15T12:00:00.000Z'),
      originPayload: null,
      projectionFingerprint: null,
      originChecksum: null,
    };
    harness.users.listTimelineFitnessMetrics.mockResolvedValue([
      ...midnightBatch,
      activityTimed,
      manual,
    ]);
    let resolvedValue:
      | { origin?: string; value?: number | null; effectiveAt?: Date }
      | undefined;
    harness.contexts.resolve.mockImplementation(
      async (args: {
        activity: { id: number; startTime: Date; endTime: Date };
        projector: {
          resolve: (input: {
            metric: string;
            sport: string;
            at: Date;
          }) => {
            origin?: string;
            value?: number | null;
            effectiveAt?: Date;
          };
        };
      }) => {
        resolvedValue = args.projector.resolve({
          metric: 'LTHR',
          sport: 'RUN',
          at: args.activity.startTime,
        });
        return {
          calculationFingerprint: 'calculation-1',
          provenanceFingerprint: 'provenance-1',
          activityId: args.activity.id,
          activityStart: args.activity.startTime,
          activityEnd: args.activity.endTime,
          sport: SportType.RUN,
          metrics: {},
        };
      },
    );
    const warn = jest.spyOn(
      (harness.service as unknown as { logger: { warn: (message: string) => void } })
        .logger,
      'warn',
    );

    await harness.service.replay({
      userId: 'legacy-athlete',
      sourceJobType: 'ACTIVITY_RECOMPUTE',
      sourceJobId: 'legacy-replay',
      effectiveFrom: activityStart,
      effectiveTo: new Date('2026-07-17T00:00:00.000Z'),
      dataRepair: true,
    });

    expect(resolvedValue).toEqual(
      expect.objectContaining({
        origin: 'MANUAL',
        value: 164,
        effectiveAt: manual.recordedAt,
      }),
    );
    expect(
      warn.mock.calls.filter((call) =>
        String(call[0]).includes('忽略非因果 AUTO 日历日零点投影'),
      ),
    ).toHaveLength(midnightBatch.length);
    expect(harness.users.applyTimelineProjectionBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'legacy-athlete',
        replacementReason: 'DATA_REPAIR_REPLAY',
      }),
      harness.tx,
    );
  });
});


describe('short replay transaction conflicts',()=>{
  it('retries a rolled-back serialization failure without invoking HEAVY again',async()=>{
    const transaction=jest.fn<(...args:unknown[])=>Promise<number>>().mockRejectedValueOnce({code:'P2034'}).mockResolvedValueOnce(42);
    const service=Object.create(ChronologicalActivityReplayService.prototype);service.prisma={$transaction:transaction};
    const work=jest.fn();
    await expect(service.withReplayTransaction(work)).resolves.toBe(42);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenLastCalledWith(work,expect.objectContaining({isolationLevel:'ReadCommitted'}));
  });
  it('does not retry a constraint violation',async()=>{
    const error={code:'P2002'};const transaction=jest.fn<(...args:unknown[])=>Promise<number>>().mockRejectedValue(error);
    const service=Object.create(ChronologicalActivityReplayService.prototype);service.prisma={$transaction:transaction};
    await expect(service.withReplayTransaction(jest.fn())).rejects.toBe(error);expect(transaction).toHaveBeenCalledTimes(1);
  });
});
