import { describe, expect, it, jest } from '@jest/globals';
import {
  ChangeSource,
  MetricSource,
  SportType,
  UserFitnessMetricType,
} from '@prisma/client';

import { validateFitnessMetricCandidate } from '../fitness-metric-validator';
import {
  isSystemCalculatedManualMirror,
  rejectSystemCalculatedManualWrite,
  withoutSystemCalculatedManualMirrors,
} from '../fitness-metric-adoption';
import { UserService } from '../user.service';
import { UserQueryService } from '../user-query.service';
import { UserIdentityRepository } from '../persistence/user-identity.repository';

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

function createService() {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn<AsyncFn>(async (callback) =>
      (callback as (tx: unknown) => Promise<unknown>)(prisma),
    ),
    userAutoUpdateConfig: {
      findUnique: jest.fn<AsyncFn>(async () => ({ enabled: true })),
    },
    userFitnessMetric: {
      findMany: jest.fn<AsyncFn>(async () => []),
      findFirst: jest.fn<AsyncFn>(async () => null),
      create: jest.fn<AsyncFn>(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: `created-${created.length}`, ...data };
      }),
      update: jest.fn<AsyncFn>(async ({ data }: { data: Record<string, unknown> }) => data),
      upsert: jest.fn<AsyncFn>(async ({ create }: { create: Record<string, unknown> }) => {
        created.push(create);
        return create;
      }),
    },
  };
  const users = new UserQueryService(new UserIdentityRepository(prisma as never));
  const service = new UserService(
    prisma as never,
    {} as never,
    { get: jest.fn() } as never,
    {} as never,
    { emitAsync: jest.fn(async () => []) } as never,
    users,
    {} as never,
    {
      observe: async (
        _userId: string,
        _tx: unknown,
        write: () => Promise<unknown>,
      ) => write(),
    } as never,
  );
  return { service, prisma, created };
}

const recordedAt = new Date('2026-08-01T12:00:00.000Z');

describe('fitness metric adoption', () => {
  it('treats only MANUAL + SYSTEM_CALCULATED as the removed auto mirror', () => {
    expect(
      isSystemCalculatedManualMirror({
        source: 'MANUAL',
        changeSource: 'SYSTEM_CALCULATED',
      }),
    ).toBe(true);
    expect(() =>
      rejectSystemCalculatedManualWrite({
        source: 'MANUAL',
        changeSource: 'SYSTEM_CALCULATED',
      }),
    ).toThrow('SYSTEM_CALCULATED_MANUAL_FORBIDDEN');
    for (const row of [
      { source: 'AUTO', changeSource: 'SYSTEM_CALCULATED' },
      { source: 'ESTIMATED', changeSource: 'SYSTEM_CALCULATED' },
      { source: 'MANUAL', changeSource: 'USER_MANUAL' },
      { source: 'MANUAL', changeSource: 'SYSTEM_IMPORTED' },
      { source: 'MANUAL', changeSource: null },
    ]) {
      expect(isSystemCalculatedManualMirror(row)).toBe(false);
      expect(() => rejectSystemCalculatedManualWrite(row)).not.toThrow();
    }
    expect(
      withoutSystemCalculatedManualMirrors([
        { source: 'AUTO', changeSource: 'SYSTEM_CALCULATED', value: 280 },
        { source: 'MANUAL', changeSource: 'SYSTEM_CALCULATED', value: 4236 },
        { source: 'MANUAL', changeSource: 'USER_MANUAL', value: 260 },
      ]).map((row) => row.value),
    ).toEqual([280, 260]);
  });

  it('still refuses the production out-of-range AUTO values with the pinned validator', () => {
    expect(
      validateFitnessMetricCandidate({
        type: UserFitnessMetricType.CP,
        value: 4236,
        sport: SportType.CYCLING,
        source: MetricSource.AUTO,
      }).valid,
    ).toBe(false);
    expect(
      validateFitnessMetricCandidate({
        type: UserFitnessMetricType.FTP,
        value: 4024,
        sport: SportType.CYCLING,
        source: MetricSource.AUTO,
      }).valid,
    ).toBe(false);
    expect(
      validateFitnessMetricCandidate({
        type: UserFitnessMetricType.P_MAX,
        value: 160862,
        sport: SportType.CYCLING,
        source: MetricSource.AUTO,
      }).valid,
    ).toBe(false);
    expect(
      validateFitnessMetricCandidate({
        type: UserFitnessMetricType.FTP,
        value: 280,
        sport: SportType.CYCLING,
        source: MetricSource.AUTO,
      }),
    ).toEqual({ valid: true });
  });

  it('keeps an in-range AUTO projection on AUTO and ESTIMATED, never MANUAL', async () => {
    const { service, created } = createService();
    await service.upsertFitnessMetric(
      'user-1',
      UserFitnessMetricType.FTP,
      280,
      SportType.CYCLING,
      undefined,
      MetricSource.AUTO,
      recordedAt,
      {
        originPayload: {
          peaks: [{ seconds: 1200, watts: 280, activityId: 9 }],
        },
      },
    );
    expect(created.map((row) => row.source)).toEqual([
      MetricSource.ESTIMATED,
      MetricSource.AUTO,
    ]);
    expect(created.map((row) => row.changeSource)).toEqual([
      ChangeSource.SYSTEM_CALCULATED,
      ChangeSource.SYSTEM_CALCULATED,
    ]);
  });

  it('does not persist out-of-range AUTO values', async () => {
    const { service, created } = createService();
    await expect(
      service.upsertFitnessMetric(
        'user-1',
        UserFitnessMetricType.CP,
        4236,
        SportType.CYCLING,
        undefined,
        MetricSource.AUTO,
        recordedAt,
      ),
    ).resolves.toBeNull();
    await expect(
      service.upsertFitnessMetric(
        'user-1',
        UserFitnessMetricType.FTP,
        4024,
        SportType.CYCLING,
        undefined,
        MetricSource.AUTO,
        recordedAt,
      ),
    ).resolves.toBeNull();
    await expect(
      service.upsertFitnessMetric(
        'user-1',
        UserFitnessMetricType.P_MAX,
        160862,
        SportType.CYCLING,
        undefined,
        MetricSource.AUTO,
        recordedAt,
      ),
    ).resolves.toBeNull();
    expect(created).toEqual([]);
  });

  it('writes a real user adopt as MANUAL + USER_MANUAL', async () => {
    const { service, created } = createService();
    await service.upsertFitnessMetric(
      'user-1',
      UserFitnessMetricType.FTP,
      280,
      SportType.CYCLING,
      undefined,
      MetricSource.MANUAL,
      recordedAt,
      { changeSource: ChangeSource.USER_MANUAL },
    );
    expect(created).toEqual([
      expect.objectContaining({
        source: MetricSource.MANUAL,
        changeSource: ChangeSource.USER_MANUAL,
        value: 280,
      }),
    ]);
  });

  it('refuses to persist MANUAL + SYSTEM_CALCULATED', async () => {
    const { service, created } = createService();
    await expect(
      service.upsertFitnessMetric(
        'user-1',
        UserFitnessMetricType.FTP,
        280,
        SportType.CYCLING,
        undefined,
        MetricSource.MANUAL,
        recordedAt,
        { changeSource: ChangeSource.SYSTEM_CALCULATED },
      ),
    ).rejects.toThrow('SYSTEM_CALCULATED_MANUAL_FORBIDDEN');
    expect(created).toEqual([]);
  });

  it('adopts a confirmed estimate as MANUAL + USER_MANUAL inside the caller transaction', async () => {
    const { service } = createService();
    const tx = {
      $queryRaw: jest.fn(async () => []),
      userFitnessMetric: {
        findMany: jest.fn<AsyncFn>(async () => []),
        upsert: jest.fn<AsyncFn>(async ({ create }: { create: Record<string, unknown> }) => create),
      },
    };
    await service.applyFitnessEstimateBatch({
      userId: 'user-1',
      sport: SportType.CYCLING,
      effectiveDate: '2026-08-01',
      changes: [{ metric: UserFitnessMetricType.FTP, value: 280 }],
      calculationId: 'calc-1',
      provenance: { adoption: 'user' },
      tx: tx as never,
    });
    expect(tx.userFitnessMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          source: 'MANUAL',
          changeSource: ChangeSource.USER_MANUAL,
          value: 280,
        }),
      }),
    );
  });

  it('drops a SYSTEM_CALCULATED MANUAL mirror before effective selection', async () => {
    const at = new Date('2026-08-04T12:00:00.000Z');
    const rows = [
      {
        id: 'mirror',
        userId: 'user-1',
        type: UserFitnessMetricType.FTP,
        sport: SportType.CYCLING,
        source: MetricSource.MANUAL,
        changeSource: ChangeSource.SYSTEM_CALCULATED,
        recordedAt: at,
        value: 280,
        value2: null,
      },
      {
        id: 'auto',
        userId: 'user-1',
        type: UserFitnessMetricType.FTP,
        sport: SportType.CYCLING,
        source: MetricSource.AUTO,
        changeSource: ChangeSource.SYSTEM_CALCULATED,
        recordedAt: at,
        value: 270,
        value2: null,
      },
      {
        id: 'user',
        userId: 'user-1',
        type: UserFitnessMetricType.FTP,
        sport: SportType.CYCLING,
        source: MetricSource.MANUAL,
        changeSource: ChangeSource.USER_MANUAL,
        recordedAt: new Date('2026-07-01T00:00:00.000Z'),
        value: 250,
        value2: null,
      },
    ];
    const prisma = {
      userFitnessMetric: {
        findMany: jest.fn<AsyncFn>(async () => rows),
      },
    };
    const users = new UserQueryService(new UserIdentityRepository(prisma as never));
    const service = new UserService(
      prisma as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      { emitAsync: jest.fn(async () => []) } as never,
      users,
      {} as never,
      {
        observe: async (
          _userId: string,
          _tx: unknown,
          write: () => Promise<unknown>,
        ) => write(),
      } as never,
    );
    const selected = await service.getEffectiveUserFitnessMetric(
      'user-1',
      UserFitnessMetricType.FTP,
      at,
      SportType.CYCLING,
    );
    expect(selected?.id).toBe('auto');
    expect(prisma.userFitnessMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: {
            source: MetricSource.MANUAL,
            changeSource: ChangeSource.SYSTEM_CALCULATED,
          },
        }),
      }),
    );
  });

  it('asks timeline reads to leave SYSTEM_CALCULATED MANUAL rows out of the causal set', async () => {
    const { service, prisma } = createService();
    await service.listTimelineFitnessMetrics('user-1', recordedAt);
    expect(prisma.userFitnessMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: {
            source: 'MANUAL',
            changeSource: 'SYSTEM_CALCULATED',
          },
        }),
      }),
    );
  });
});
