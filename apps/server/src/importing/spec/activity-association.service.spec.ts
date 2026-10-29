import { ActivityAssociationService } from '../activity-association.service';
import { describe, expect, it, jest } from '@jest/globals';

function payload(kind: string, checksum = 'a'.repeat(64)) {
  return {
    source: { kind, sourceUid: `${kind}:1`, sourceChecksum: checksum },
    identity: { dedupeKey: 'dedupe', datasetChecksum: checksum },
    summary: {
      sportType: 'RUN',
      startTime: '2026-08-05T10:00:00.000Z',
      elapsedTime: 3600,
      distance: 10000,
    },
    laps: [],
    records: [],
    lengths: [],
  } as never;
}

function setup() {
  const activity = {
    id: 1,
    userId: 'user-1',
    sportType: 'RUN',
    startTime: new Date('2026-08-05T10:00:20.000Z'),
    elapsedTime: 3590,
    distance: 9950,
  };
  const prisma = {
    activityThirdPartyMapping: { findUnique: jest.fn(async () => null) },
    activitySource: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    activity: {
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
  };
  return {
    activity,
    prisma,
    service: new ActivityAssociationService(prisma as never),
  };
}

describe('ActivityAssociationService', () => {
  it('associates identical SHA-256 across manual and third-party sources', async () => {
    const { activity, prisma, service } = setup();
    prisma.activitySource.findFirst.mockResolvedValue({ activity } as never);

    await expect(
      service.resolve({ userId: 'user-1', payload: payload('INTERVALS_ICU') }),
    ).resolves.toMatchObject({
      activity: { id: 1 },
      reason: 'checksum',
      mappingType: 'EXACT',
      confidence: 1,
    });
  });

  it('auto-fuzzy-matches a unique cross-source candidate', async () => {
    const { activity, prisma, service } = setup();
    prisma.activity.findMany.mockResolvedValue([activity] as never);

    await expect(
      service.resolve({
        userId: 'user-1',
        payload: payload('FILE', 'b'.repeat(64)),
      }),
    ).resolves.toMatchObject({
      activity: { id: 1 },
      reason: 'fuzzy',
      mappingType: 'FUZZY',
    });

    prisma.activity.findMany.mockResolvedValue([activity] as never);
    await expect(
      service.resolve({
        userId: 'user-1',
        payload: payload('INTERVALS_ICU', 'c'.repeat(64)),
      }),
    ).resolves.toMatchObject({
      activity: { id: 1 },
      reason: 'fuzzy',
      mappingType: 'FUZZY',
    });
  });

  it('associates one source-independent canonical dedupe candidate', async () => {
    const { activity, prisma, service } = setup();
    prisma.activitySource.findMany.mockResolvedValue([
      { activityId: activity.id, activity },
    ] as never);

    await expect(
      service.resolve({
        userId: 'user-1',
        payload: payload('INTERVALS_ICU', 'e'.repeat(64)),
      }),
    ).resolves.toMatchObject({
      activity: { id: 1 },
      reason: 'dedupe',
      mappingType: 'FUZZY',
      confidence: 0.98,
    });
  });

  it('does not use an ambiguous canonical dedupe key', async () => {
    const { activity, prisma, service } = setup();
    prisma.activitySource.findMany.mockResolvedValue([
      { activityId: 1, activity },
      { activityId: 2, activity: { ...activity, id: 2 } },
    ] as never);
    prisma.activity.findMany.mockResolvedValue([] as never);

    await expect(
      service.resolve({
        userId: 'user-1',
        payload: payload('INTERVALS_ICU', 'f'.repeat(64)),
      }),
    ).resolves.toMatchObject({ activity: null, reason: 'new' });
  });

  it('does not auto-merge when two fuzzy candidates are equally plausible', async () => {
    const { activity, prisma, service } = setup();
    prisma.activity.findMany.mockResolvedValue([
      activity,
      { ...activity, id: 2 },
    ] as never);

    await expect(
      service.resolve({
        userId: 'user-1',
        payload: payload('FILE', 'd'.repeat(64)),
      }),
    ).resolves.toMatchObject({ activity: null, reason: 'new' });
  });
});
