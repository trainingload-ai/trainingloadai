import { Test } from '@nestjs/testing';
import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { I18nService } from 'nestjs-i18n';
import { ChangeSource, MetricSource } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ActivitySourceLifecycleService } from '@/sync/activity-source-lifecycle.service';
import { UserQueryService } from '../user-query.service';
import { UserService } from '../user.service';
import { UserIdentityRepository } from '../persistence/user-identity.repository';

type AsyncFn = (...args: any[]) => Promise<any>;

async function createFixture(
  existing: {
    id: string;
    value: string;
    effectiveDate: Date;
  } | null = null,
) {
  const bodyMetrics = {
    findFirst: jest.fn<AsyncFn>(async () => existing),
    create: jest.fn<AsyncFn>(async ({ data }: { data: object }) => ({
      id: 'weight-created',
      ...data,
    })),
    update: jest.fn<AsyncFn>(async () => ({ id: existing?.id })),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      UserService,
      { provide: PrismaService, useValue: {} },
      { provide: I18nService, useValue: {} },
      { provide: ConfigService, useValue: { get: jest.fn() } },
      { provide: ActivitySourceLifecycleService, useValue: {} },
      { provide: EventEmitter2, useValue: { emitAsync: jest.fn() } },
      {
        provide: UserQueryService,
        useValue: { bodyMetrics: () => bodyMetrics },
      },
    ],
  }).compile();
  const tx = { $queryRaw: jest.fn(async () => []) };
  return {
    service: moduleRef.get(UserService),
    bodyMetrics,
    tx,
  };
}

const localDay = {
  dayStart: new Date('2026-10-12T16:00:00.000Z'),
  dayEnd: new Date('2026-10-13T16:00:00.000Z'),
};

describe('UserService manual body weight', () => {
  it('creates an owned manual record with the athlete-local event time', async () => {
    const fixture = await createFixture();
    await expect(
      fixture.service.recordManualWeight({
        userId: 'athlete-1',
        weightKg: 72.4567,
        effectiveAt: localDay.dayStart,
        ...localDay,
        tx: fixture.tx as never,
      }),
    ).resolves.toMatchObject({
      id: 'weight-created',
      operation: 'create',
      changed: true,
      weightKg: 72.457,
    });

    expect(fixture.bodyMetrics.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'athlete-1',
        type: 'WEIGHT',
        changeSource: ChangeSource.USER_MANUAL,
        originProvider: null,
        effectiveDate: {
          gte: localDay.dayStart,
          lt: localDay.dayEnd,
        },
      }),
      orderBy: [{ createdAt: 'desc' }],
      select: { id: true, value: true, effectiveDate: true },
    });
    expect(fixture.bodyMetrics.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'athlete-1',
        type: 'WEIGHT',
        value: '72.457',
        effectiveDate: localDay.dayStart,
        changeSource: ChangeSource.USER_MANUAL,
        originProvider: null,
        originExternalId: null,
      }),
      select: { id: true },
    });
  });

  it('updates rather than duplicates a manual record on the same local day', async () => {
    const existing = {
      id: 'weight-existing',
      value: '72.4',
      effectiveDate: localDay.dayStart,
    };
    const fixture = await createFixture(existing);
    await expect(
      fixture.service.recordManualWeight({
        userId: 'athlete-1',
        weightKg: 71.9,
        effectiveAt: localDay.dayStart,
        ...localDay,
        tx: fixture.tx as never,
      }),
    ).resolves.toMatchObject({
      id: existing.id,
      operation: 'update',
      changed: true,
      previousValue: '72.4',
      weightKg: 71.9,
    });
    expect(fixture.bodyMetrics.create).not.toHaveBeenCalled();
    expect(fixture.bodyMetrics.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: expect.objectContaining({
        value: '71.9',
        effectiveDate: localDay.dayStart,
        changeSource: ChangeSource.USER_MANUAL,
      }),
    });
  });

  it('keeps a duplicate same-day value as a domain no-op', async () => {
    const fixture = await createFixture({
      id: 'weight-existing',
      value: '72.4',
      effectiveDate: localDay.dayStart,
    });
    await expect(
      fixture.service.recordManualWeight({
        userId: 'athlete-1',
        weightKg: 72.4,
        effectiveAt: localDay.dayStart,
        ...localDay,
        tx: fixture.tx as never,
      }),
    ).resolves.toMatchObject({ operation: 'update', changed: false });
    expect(fixture.bodyMetrics.create).not.toHaveBeenCalled();
    expect(fixture.bodyMetrics.update).not.toHaveBeenCalled();
  });

  it.each([19.9, 400.1, Number.NaN])(
    'rejects an invalid manual weight (%s) before any write',
    async (weightKg) => {
      const fixture = await createFixture();
      await expect(
        fixture.service.recordManualWeight({
          userId: 'athlete-1',
          weightKg,
          effectiveAt: localDay.dayStart,
          ...localDay,
          tx: fixture.tx as never,
        }),
      ).rejects.toThrow('体重校验');
      expect(fixture.tx.$queryRaw).not.toHaveBeenCalled();
      expect(fixture.bodyMetrics.create).not.toHaveBeenCalled();
    },
  );
});

describe('UserService Coach fitness metric history', () => {
  function fitnessFixture() {
    const oldRow = {
      id: 'ftp-old',
      userId: 'athlete-1',
      type: 'FTP',
      sport: 'CYCLING',
      source: 'MANUAL',
      value: 260,
      value2: null,
      recordedAt: new Date('2026-09-01T00:00:00.000Z'),
    };
    const delegate = {
      findMany: jest.fn<AsyncFn>(async () => [oldRow]),
      deleteMany: jest.fn<AsyncFn>(async () => ({ count: 0 })),
      upsert: jest.fn<AsyncFn>(async () => ({})),
    };
    const prisma = { userFitnessMetric: delegate };
    const users = new UserQueryService(
      new UserIdentityRepository(prisma as never),
    );
    const service = new UserService(
      prisma as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      { emitAsync: jest.fn(async () => []) } as never,
      users,
    );
    const tx = {
      userFitnessMetric: delegate,
      $queryRaw: jest.fn(async () => []),
    };
    return { service, delegate, tx };
  }

  it('preserves earlier manual FTP dates for a Coach single-day update', async () => {
    const fixture = fitnessFixture();
    await fixture.service.replaceManualFitnessMetricsForDialog({
      userId: 'athlete-1',
      type: 'FTP' as never,
      sportType: 'CYCLING' as never,
      metrics: [{ effectiveDate: '2026-10-13', value: '280' }],
      preserveOtherDates: true,
      tx: fixture.tx as never,
    });
    expect(fixture.delegate.deleteMany).not.toHaveBeenCalled();
    expect(fixture.delegate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_type_source_sport_recordedAt: expect.objectContaining({
            userId: 'athlete-1',
            type: 'FTP',
            sport: 'CYCLING',
            recordedAt: new Date('2026-10-13T00:00:00.000Z'),
          }),
        },
      }),
    );
  });
});
