import { describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import {
  HealthSessionAssociationService,
  healthSessionMatchScore,
} from '../health-session-association.service';
import { HealthDataRepository } from '../persistence/health-data.repository';

function createService(prisma: unknown) {
  return new HealthSessionAssociationService(
    prisma as never,
    new HealthDataRepository(prisma as never),
  );
}

describe('healthSessionMatchScore', () => {
  it('associates two provider records for the same sleep', () => {
    const score = healthSessionMatchScore(
      {
        sessionType: 'SLEEP',
        startTime: new Date('2026-07-17T22:00:00.000Z'),
        endTime: new Date('2026-07-18T06:00:00.000Z'),
      },
      {
        startTime: new Date('2026-07-17T22:20:00.000Z'),
        endTime: new Date('2026-07-18T05:50:00.000Z'),
      },
    );

    expect(score).not.toBeNull();
  });

  it('does not associate separate sleep sessions on the same day', () => {
    const score = healthSessionMatchScore(
      {
        sessionType: 'SLEEP',
        startTime: new Date('2026-07-17T22:00:00.000Z'),
        endTime: new Date('2026-07-18T06:00:00.000Z'),
      },
      {
        startTime: new Date('2026-07-18T13:00:00.000Z'),
        endTime: new Date('2026-07-18T14:00:00.000Z'),
      },
    );

    expect(score).toBeNull();
  });

  it('uses a tight time window for health snapshots', () => {
    const source = {
      sessionType: 'HEALTH_SNAPSHOT' as const,
      startTime: new Date('2026-07-18T10:00:00.000Z'),
      endTime: new Date('2026-07-18T10:02:00.000Z'),
    };
    expect(
      healthSessionMatchScore(source, {
        startTime: new Date('2026-07-18T10:04:00.000Z'),
        endTime: new Date('2026-07-18T10:06:00.000Z'),
      }),
    ).not.toBeNull();
    expect(
      healthSessionMatchScore(source, {
        startTime: new Date('2026-07-18T10:06:00.000Z'),
        endTime: new Date('2026-07-18T10:08:00.000Z'),
      }),
    ).toBeNull();
  });

  it('rejects zero-length sessions before opening a transaction', async () => {
    const transaction = jest.fn();
    const service = createService({
      $transaction: transaction,
    });

    await expect(
      service.upsertSession({
        userId: 'user-1',
        candidate: {
          provider: 'INTERVALS_ICU',
          sourceNamespace: 'garmin:test',
          sessionType: 'SLEEP',
          externalId: 'sleep-1',
          startTime: new Date('2026-07-17T22:00:00.000Z'),
          endTime: new Date('2026-07-17T22:00:00.000Z'),
        },
      }),
    ).rejects.toThrow('Invalid external health session time range');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('clears nullable source fields and clips segments on authoritative update', async () => {
    const session = {
      id: 'source-session-1',
      userId: 'user-1',
      provider: 'INTERVALS_ICU',
      sourceNamespace: 'suunto:sleep',
      sessionType: 'SLEEP',
      externalId: 'sleep-1',
      startTime: new Date('2026-07-17T22:00:00.000Z'),
      endTime: new Date('2026-07-18T06:00:00.000Z'),
      durationSeconds: 28_800,
      calendarDate: new Date('2026-07-18T00:00:00.000Z'),
      timezone: null,
      score: null,
      summary: null,
      metadata: null,
      sourceUpdatedAt: null,
      updatedAt: new Date('2026-07-18T07:00:00.000Z'),
      deletedAt: null,
      canonicalSessionId: 'canonical-1',
    };
    const externalUpdate = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session);
    const tx = {
      externalHealthSession: {
        findFirst: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue({
            id: session.id,
            canonicalSessionId: session.canonicalSessionId,
            sourceUpdatedAt: null,
          }),
        update: externalUpdate,
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue([session]),
      },
      externalHealthSessionSegment: {
        deleteMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue({ count: 1 }),
        createMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue({ count: 1 }),
      },
      canonicalHealthSession: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue([
            {
              id: 'canonical-1',
              startTime: session.startTime,
              endTime: session.endTime,
            },
          ]),
        update: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue({}),
      },
      userDailyHealthMetric: {
        findFirst: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue({ selectedProvider: 'INTERVALS_ICU' }),
      },
    };
    const service = createService({
      $transaction: jest.fn(async (callback: (client: never) => unknown) =>
        callback(tx as never),
      ),
    });

    await service.upsertSession({
      userId: 'user-1',
      candidate: {
        provider: 'INTERVALS_ICU',
        connectionId: null,
        sourceNamespace: 'suunto:sleep',
        sessionType: 'SLEEP',
        externalId: 'sleep-1',
        startTime: session.startTime,
        endTime: session.endTime,
        calendarDate: session.calendarDate,
        score: null,
        summary: null,
        metadata: null,
        segments: [
          {
            segmentType: 'core',
            startTime: new Date('2026-07-17T21:00:00.000Z'),
            endTime: new Date('2026-07-17T23:00:00.000Z'),
          },
        ],
      },
    });

    expect(externalUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          connectionId: null,
          score: null,
          summary: Prisma.DbNull,
          metadata: Prisma.DbNull,
        }),
      }),
    );
    expect(tx.externalHealthSessionSegment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          startTime: session.startTime,
          endTime: new Date('2026-07-17T23:00:00.000Z'),
          durationSeconds: 3600,
        }),
      ],
    });
  });

  it('tombstones an authoritative session scope within one connection', async () => {
    const tx = {
      $executeRawUnsafe: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue(1),
      externalHealthSession: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue([]),
      },
    };
    const service = createService({
      $transaction: jest.fn(async (callback: (client: never) => unknown) =>
        callback(tx as never),
      ),
    });

    await expect(
      service.tombstoneProviderSessionScope({
        userId: 'user-1',
        provider: 'MANUAL',
        connectionId: 'connection-1',
        sourceNamespace: 'polar:accesslink:sleep',
        sessionType: 'SLEEP',
        calendarDate: new Date('2026-07-18T00:00:00.000Z'),
        retainedExternalIds: ['polar:sleep:1'],
      }),
    ).resolves.toEqual({ deletedCount: 0 });

    expect(tx.externalHealthSession.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        provider: 'MANUAL',
        connectionId: 'connection-1',
        sourceNamespace: 'polar:accesslink:sleep',
        sessionType: 'SLEEP',
        calendarDate: new Date('2026-07-18T00:00:00.000Z'),
        deletedAt: null,
        externalId: { notIn: ['polar:sleep:1'] },
      },
      select: { id: true, canonicalSessionId: true },
    });
  });

  it('merges every matching historical canonical into the best match', async () => {
    const source = {
      id: 'source-session-1',
      userId: 'user-1',
      provider: 'INTERVALS_ICU',
      sourceNamespace: 'garmin:test',
      sessionType: 'HEALTH_SNAPSHOT',
      externalId: 'snapshot-1',
      startTime: new Date('2026-07-18T10:00:00.000Z'),
      endTime: new Date('2026-07-18T10:02:00.000Z'),
      durationSeconds: 120,
      calendarDate: new Date('2026-07-18T00:00:00.000Z'),
      timezone: null,
      score: null,
      summary: null,
      metadata: null,
      sourceUpdatedAt: null,
      updatedAt: new Date('2026-07-18T10:03:00.000Z'),
      deletedAt: null,
      canonicalSessionId: null,
    };
    const tx = {
      externalHealthSession: {
        findFirst: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue(null),
        create: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue(source),
        update: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue(source),
        updateMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue({ count: 1 }),
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue([source]),
      },
      externalHealthSessionSegment: {
        deleteMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue({ count: 0 }),
      },
      canonicalHealthSession: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue([
            {
              id: 'canonical-best',
              startTime: new Date('2026-07-18T10:00:00.000Z'),
              endTime: new Date('2026-07-18T10:02:00.000Z'),
            },
            {
              id: 'canonical-duplicate',
              startTime: new Date('2026-07-18T10:01:00.000Z'),
              endTime: new Date('2026-07-18T10:03:00.000Z'),
            },
          ]),
        create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        updateMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue({ count: 1 }),
        update: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue({}),
      },
    };
    const service = createService({
      $transaction: jest.fn(async (callback: (client: never) => unknown) =>
        callback(tx as never),
      ),
    });

    await expect(
      service.upsertSession({
        userId: 'user-1',
        candidate: {
          provider: 'INTERVALS_ICU',
          sourceNamespace: 'garmin:test',
          sessionType: 'HEALTH_SNAPSHOT',
          externalId: 'snapshot-1',
          startTime: source.startTime,
          endTime: source.endTime,
          calendarDate: source.calendarDate,
        },
      }),
    ).resolves.toMatchObject({ canonicalSessionId: 'canonical-best' });

    expect(tx.canonicalHealthSession.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['canonical-duplicate'] } },
      data: expect.objectContaining({
        selectedProvider: null,
        selectedSourceId: null,
        deletedAt: expect.any(Date),
      }),
    });
    expect(tx.externalHealthSession.updateMany).toHaveBeenCalledWith({
      where: {
        canonicalSessionId: { in: ['canonical-duplicate'] },
      },
      data: { canonicalSessionId: 'canonical-best' },
    });
  });

  it('keeps the previous canonical while its only new source is still WRITING', async () => {
    const tx = {
      externalHealthSession: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue([]),
        findFirst: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValue({ id: 'pending-garmin-source' }),
      },
      canonicalHealthSession: {
        update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
    };
    const service = createService({});

    await (
      service as unknown as {
        rebuildCanonicalWith: (...args: unknown[]) => unknown;
      }
    ).rebuildCanonicalWith(tx, 'canonical-1');

    expect(tx.externalHealthSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { snapshotId: null },
            {
              snapshot: {
                manifest: { path: ['status'], equals: 'READY' },
              },
            },
          ],
        }),
      }),
    );
    expect(tx.canonicalHealthSession.update).not.toHaveBeenCalled();
  });
});
