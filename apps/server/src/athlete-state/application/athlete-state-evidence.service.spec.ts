import { describe, expect, it, jest } from '@jest/globals';
import { AthleteStateEvidenceService } from './athlete-state-evidence.service';

function days(provider = 'GARMIN') {
  const baseline = Array.from({ length: 14 }, (_, index) => ({
    date: `2026-09-${String(index + 26).padStart(2, '0')}`,
    timezone: 'Asia/Shanghai',
    metrics: [
      {
        type: 'HRV_RMSSD_MS',
        value: 50 + (index % 3),
        unit: 'ms',
        provider,
      },
    ],
  }));
  // September only has 30 days; use a valid contiguous baseline ending Oct 9.
  return [
    ...baseline.slice(0, 5),
    ...Array.from({ length: 9 }, (_, index) => ({
      date: `2026-10-${String(index + 1).padStart(2, '0')}`,
      timezone: 'Asia/Shanghai',
      metrics: [
        {
          type: 'HRV_RMSSD_MS',
          value: 50 + (index % 3),
          unit: 'ms',
          provider,
        },
      ],
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      date: `2026-10-${String(index + 10).padStart(2, '0')}`,
      timezone: 'Asia/Shanghai',
      metrics: [
        {
          type: 'HRV_RMSSD_MS',
          value: 44 + index,
          unit: 'ms',
          provider,
        },
      ],
    })),
  ];
}

describe('AthleteStateEvidenceService', () => {
  const health = { getOverview: jest.fn(async () => ({ days: days() })) };
  const pmc = { listRange: jest.fn(async () => []) };
  const activities = { findMany: jest.fn(async () => []) };
  const loadReadout = {
    batchGetActualLoad: jest.fn(async () => new Map()),
  };
  const memory = {
    search: jest.fn(async () => ({
      items: [
        {
          id: 'memory-1',
          version: 1,
          category: 'fatigue',
          claim: 'raw private claim must not be copied',
          eventStart: '2026-10-11T00:00:00.000Z',
          eventEnd: '2026-10-11T12:00:00.000Z',
          assertedAt: '2026-10-11T13:00:00.000Z',
          validFrom: '2026-10-01T00:00:00.000Z',
          validUntil: '2026-10-20T00:00:00.000Z',
          epistemicStatus: 'USER_ASSERTED',
          lifecycle: 'CURRENT',
          directImpact: 0.8,
        },
      ],
    })),
  };
  const service = new AthleteStateEvidenceService(
    health as never,
    activities as never,
    loadReadout as never,
    pmc as never,
    memory as never,
  );

  it('uses athlete-local dates, stable hashes, event time and explicit nulls', async () => {
    const input = {
      userId: 'athlete',
      asOf: new Date('2026-10-12T01:00:00.000Z'),
      timezone: 'Asia/Shanghai',
      scopedAnswers: [
        {
          evidenceKind: 'RECENT_SLEEP',
          eventStart: '2026-10-11T12:00:00.000Z',
          eventEnd: '2026-10-12T00:00:00.000Z',
          answer: { sleep: 'worse' },
        },
      ],
    };
    const first = await service.build(input);
    const second = await service.build(input);

    expect(first.evidenceHash).toBe(second.evidenceHash);
    expect(first.snapshot.localDate).toBe('2026-10-12');
    expect(first.snapshot.recordedFacts.scopedAnswers[0]).toMatchObject({
      eventStart: '2026-10-11T12:00:00.000Z',
      eventEnd: '2026-10-12T00:00:00.000Z',
    });
    expect(first.snapshot.recordedFacts.subjective[0]).not.toHaveProperty(
      'claim',
    );
    expect(first.snapshot.recordedFacts.subjective[0]).toMatchObject({
      memoryFactId: 'memory-1',
      memoryFactVersion: 1,
      claimHash: expect.any(String),
    });
    expect(first.modelSnapshot.recordedFacts.subjective[0]).toMatchObject({
      claim: 'raw private claim must not be copied',
    });
    expect(first.snapshot.deterministicFeatures.trainingLoad).toMatchObject({
      recent7DayLoad: null,
      previous28DayLoad: null,
      previousWeeklyAverage: null,
      recentToPriorWeeklyRatio: null,
    });
    expect(first.snapshot.missingEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'TRAINING_LOAD' }),
      ]),
    );
  });

  it('marks stale sources instead of treating them as current or normal', async () => {
    health.getOverview.mockResolvedValueOnce({
      days: [
        {
          date: '2026-10-08',
          timezone: 'Asia/Shanghai',
          metrics: [
            {
              type: 'HRV_RMSSD_MS',
              value: 51,
              unit: 'ms',
              provider: 'GARMIN',
            },
          ],
        },
      ],
    });
    memory.search.mockResolvedValueOnce({ items: [] });
    const built = await service.build({
      userId: 'athlete',
      asOf: new Date('2026-10-12T12:00:00.000Z'),
      timezone: 'Asia/Shanghai',
    });
    expect(built.snapshot.missingEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'STALE_HEALTH_DATA' }),
      ]),
    );
  });

  it('preserves source failures as explicit unknown evidence', async () => {
    health.getOverview.mockRejectedValueOnce(new Error('health unavailable'));
    pmc.listRange.mockRejectedValueOnce(new Error('pmc unavailable'));
    activities.findMany.mockRejectedValueOnce(
      new Error('activities unavailable'),
    );
    memory.search.mockRejectedValueOnce(new Error('memory unavailable'));
    loadReadout.batchGetActualLoad.mockRejectedValueOnce(
      new Error('load unavailable'),
    );

    const built = await service.build({
      userId: 'athlete',
      asOf: new Date('2026-10-12T01:00:00.000Z'),
      timezone: 'Asia/Shanghai',
    });

    expect(built.snapshot.missingEvidence.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        'HEALTH_DATA_SOURCE',
        'TRAINING_LOAD_SOURCE',
        'ACTIVITY_SOURCE',
        'ATHLETE_MEMORY_SOURCE',
        'ACTIVITY_LOAD_SOURCE',
      ]),
    );
    expect(built.snapshot.recordedFacts.training.activities).toEqual([]);
    expect(built.snapshot.recordedFacts.physiology).toEqual({});
  });

  it('keeps valid recovery facts beyond 14 days but bounds pain signals to 7 days', async () => {
    memory.search.mockResolvedValueOnce({
      items: [
        {
          id: 'persistent-fatigue',
          version: 1,
          category: 'fatigue',
          claim: 'Fatigue remains relevant during the current block.',
          eventStart: '2026-09-20T00:00:00.000Z',
          eventEnd: '2026-09-20T12:00:00.000Z',
          assertedAt: '2026-09-20T13:00:00.000Z',
          validFrom: '2026-09-20T00:00:00.000Z',
          validUntil: '2026-10-20T00:00:00.000Z',
          epistemicStatus: 'USER_ASSERTED',
          lifecycle: 'CURRENT',
          directImpact: 0.8,
        },
        {
          id: 'old-pain',
          version: 1,
          category: 'pain',
          claim: 'Old pain signal.',
          eventStart: '2026-09-20T00:00:00.000Z',
          eventEnd: '2026-09-20T12:00:00.000Z',
          assertedAt: '2026-09-20T13:00:00.000Z',
          validFrom: '2026-09-20T00:00:00.000Z',
          validUntil: '2026-10-20T00:00:00.000Z',
          epistemicStatus: 'USER_ASSERTED',
          lifecycle: 'CURRENT',
          directImpact: 0.8,
        },
      ],
    });
    const built = await service.build({
      userId: 'athlete',
      asOf: new Date('2026-10-12T01:00:00.000Z'),
      timezone: 'Asia/Shanghai',
    });
    expect(
      built.snapshot.recordedFacts.subjective.map((item) => item.memoryFactId),
    ).toEqual(['persistent-fatigue']);
    expect(memory.search).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ eventFrom: expect.anything() }),
    );
  });
});
