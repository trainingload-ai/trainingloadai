import { describe, expect, it, jest } from '@jest/globals';
import dayjs = require('dayjs');
import { PMCService } from '../pmc.service';
import { PmcRepository } from '../persistence/pmc.repository';
import { ActivityReadService } from '../../api/activity/activity-read.service';
import { LoadReadoutService } from '../../api/activity/load-readout.service';
import { UserQueryService } from '../../api/user/user-query.service';
import { UserIdentityRepository } from '../../api/user/persistence/user-identity.repository';
import { PMC_ALGORITHM_VERSION } from '../pmc-formula';

function pmcDependencies(prisma: object) {
  const activityRead = new ActivityReadService(prisma as never);
  const users = new UserQueryService(
    new UserIdentityRepository(prisma as never),
  );
  return [
    new PmcRepository(prisma as never),
    activityRead,
    new LoadReadoutService(prisma as never, activityRead, users),
    users,
  ] as const;
}

function createPmcService(prisma: object): PMCService {
  return new PMCService(
    prisma as never,
    {} as never,
    ...pmcDependencies(prisma),
  );
}

type PmcInternals = {
  calculatePMCMetrics(
    dailyLoadData: Array<{
      date: Date;
      dailyValue: number;
      cyclingValue: number;
      runningValue: number;
      swimmingValue: number;
      otherValue: number;
      activityCount: number;
      totalDuration: number;
    }>,
    startDate: Date,
    endDate: Date,
    seed: { ctl: number; atl: number },
    constants: { ctlTimeConstant: number; atlTimeConstant: number },
  ): Array<{ ctl: number; atl: number; tsb: number }>;
  updatePMCExtremes(
    results: Array<{ ctl: number; atl: number }>,
  ): Promise<unknown>;
};

describe('PMCService.getPMCData', () => {
  function createService(args: {
    history?: unknown[];
    seedRecord?: unknown;
    hasTodayRecord?: boolean;
  }): PMCService {
    const prisma = {
      pMCData: {
        findMany: async () => args.history ?? [],
        findFirst: async (query?: { select?: Record<string, unknown> }) =>
          query?.select?.id
            ? args.hasTodayRecord === false
              ? null
              : { id: 'today-pmc', version: PMC_ALGORITHM_VERSION }
            : (args.seedRecord ?? null),
      },
    };

    return createPmcService(prisma);
  }

  it('decays the last persisted CTL/ATL for missing days instead of returning zero', async () => {
    const today = dayjs('2026-05-13').startOf('day');
    const service = createService({
      seedRecord: {
        date: today.subtract(1, 'day').toDate(),
        CTL: 20,
        ATL: 50,
        TSB: -30,
      },
    });

    const rows = await service.getPMCData(
      'user-1',
      today.toDate(),
      today.endOf('day').toDate(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dailyValue: 0,
      ctl: 19.53,
      atl: 43.34,
      tsb: -23.81,
    });
  });

  it('uses persisted rows when they exist in the requested range', async () => {
    const today = dayjs('2026-05-13').startOf('day');
    const service = createService({
      seedRecord: {
        date: today.subtract(1, 'day').toDate(),
        CTL: 20,
        ATL: 50,
        TSB: -30,
      },
      history: [
        {
          date: today.toDate(),
          updatedAt: today.add(8, 'hour').toDate(),
          dailyValue: 100,
          CTL: 25,
          ATL: 60,
          TSB: -35,
          cyclingValue: 0,
          runningValue: 100,
          swimmingValue: 0,
          otherValue: 0,
          activityCount: 1,
          totalDuration: 3600,
        },
      ],
    });

    const rows = await service.getPMCData(
      'user-1',
      today.toDate(),
      today.endOf('day').toDate(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dailyValue: 100,
      ctl: 25,
      atl: 60,
      tsb: -35,
      runningValue: 100,
      activityCount: 1,
      calculatedAt: today.add(8, 'hour').toDate(),
    });
  });

  it('calculates and persists before reading when the requested range includes today and today has no PMC row', async () => {
    const today = dayjs().startOf('day');
    const service = createService({ hasTodayRecord: false });
    const calculateSpy = jest
      .spyOn(service, 'calculatePMC')
      .mockResolvedValue([]);

    await service.getPMCData(
      'user-1',
      today.subtract(6, 'day').toDate(),
      today.endOf('day').toDate(),
    );

    expect(calculateSpy).toHaveBeenCalledTimes(1);
    expect(calculateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        recalculateAll: true,
      }),
    );
  });

  it('does not calculate or persist when a read-only caller disables current PMC materialization', async () => {
    const today = dayjs().startOf('day');
    const service = createService({ hasTodayRecord: false });
    const calculateSpy = jest
      .spyOn(service, 'calculatePMC')
      .mockResolvedValue([]);

    await service.getPMCData(
      'demo-owner',
      today.subtract(6, 'day').toDate(),
      today.endOf('day').toDate(),
      { ensureCurrent: false },
    );

    expect(calculateSpy).not.toHaveBeenCalled();
  });
});

describe('PMCService.ensureCurrentPMC', () => {
  function createService(
    hasTodayRecord: boolean,
    version = PMC_ALGORITHM_VERSION,
  ): PMCService {
    const prisma = {
      pMCData: {
        findFirst: async () =>
          hasTodayRecord ? { id: 'today-pmc', version } : null,
      },
    };

    return createPmcService(prisma);
  }

  it('calculates through today when today has no PMC row', async () => {
    const service = createService(false);
    const calculateSpy = jest
      .spyOn(service, 'calculatePMC')
      .mockResolvedValue([]);

    await service.ensureCurrentPMC('user-1');

    expect(calculateSpy).toHaveBeenCalledTimes(1);
    expect(calculateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        recalculateAll: true,
      }),
    );
  });

  it('does not recalculate when today already has a PMC row', async () => {
    const service = createService(true);
    const calculateSpy = jest
      .spyOn(service, 'calculatePMC')
      .mockResolvedValue([]);

    await service.ensureCurrentPMC('user-1');

    expect(calculateSpy).not.toHaveBeenCalled();
  });

  it('recalculates when today uses an older PMC algorithm version', async () => {
    const service = createService(true, '1.0');
    const calculateSpy = jest
      .spyOn(service, 'calculatePMC')
      .mockResolvedValue([]);

    await service.ensureCurrentPMC('user-1');

    expect(calculateSpy).toHaveBeenCalledTimes(1);
  });
});

describe('PMCService.getStoredSliceAsOf', () => {
  it('reads the latest CTL/ATL/TSB and daily values without recalculating', async () => {
    const findFirst = jest.fn(async () => ({ CTL: 40, ATL: 36, TSB: 4 }));
    const findMany = jest.fn(async () => [
      { date: new Date('2026-06-15T00:00:00.000Z'), dailyValue: 42 },
    ]);
    const calculatePMC = jest.fn();
    const service = createPmcService({ pMCData: { findFirst, findMany } });
    jest
      .spyOn(service, 'calculatePMC')
      .mockImplementation(calculatePMC as never);

    const slice = await service.getStoredSliceAsOf({
      userId: 'user-1',
      asOfDate: new Date('2026-06-15T00:00:00.000Z'),
      fromDate: new Date('2026-05-26T00:00:00.000Z'),
    });

    expect(slice.latest).toEqual({ CTL: 40, ATL: 36, TSB: 4 });
    expect(slice.daily).toHaveLength(1);
    expect(calculatePMC).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          date: { lte: new Date('2026-06-15T00:00:00.000Z') },
        },
      }),
    );
  });
});

describe('PMCService.calculatePMCMetrics', () => {
  it('continues from the persisted CTL/ATL seed before the recompute window', () => {
    const service = createPmcService({});
    const date = dayjs('2026-08-01').startOf('day').toDate();

    const rows = (service as unknown as PmcInternals).calculatePMCMetrics(
      [
        {
          date,
          dailyValue: 100,
          cyclingValue: 0,
          runningValue: 100,
          swimmingValue: 0,
          otherValue: 0,
          activityCount: 1,
          totalDuration: 3600,
        },
      ],
      date,
      date,
      { ctl: 20, atl: 50 },
      { ctlTimeConstant: 42, atlTimeConstant: 7 },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ctl: 21.88, atl: 56.66, tsb: -34.77 });
  });
});

describe('PMCService.updatePMCExtremes', () => {
  it('reads independent extreme types in parallel and only persists larger values', async () => {
    let resolveCtl!: (value: { value: number }) => void;
    const ctlResult = new Promise<{ value: number }>((resolve) => {
      resolveCtl = resolve;
    });
    const findFirst = jest.fn((query: { where: { valueType: string } }) =>
      query.where.valueType === 'CTL'
        ? ctlResult
        : Promise.resolve({ value: 20 }),
    );
    const create = jest.fn(async () => ({ id: 'extreme-1' }));
    const service = createPmcService({ pMCExtreme: { findFirst, create } });

    const updatePromise = (
      service as unknown as PmcInternals
    ).updatePMCExtremes([
      { ctl: 12, atl: 14 },
      { ctl: 11, atl: 15 },
    ]);

    await Promise.resolve();
    expect(findFirst).toHaveBeenCalledTimes(2);

    resolveCtl({ value: 10 });
    await updatePromise;

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: { valueType: 'CTL', value: 12 },
    });
  });
});

describe('PMCService query API', () => {
  it('listRange reads a date window through the repository', async () => {
    const findMany = jest.fn(async () => [
      { date: new Date('2026-08-01'), dailyValue: 40 },
    ]);
    const service = createPmcService({ pMCData: { findMany } });

    const rows = await service.listRange(
      'user-1',
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-07T00:00:00.000Z'),
      { orderBy: 'desc' },
    );

    expect(rows).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          date: {
            gte: new Date('2026-08-01T00:00:00.000Z'),
            lte: new Date('2026-08-07T00:00:00.000Z'),
          },
        },
        orderBy: { date: 'desc' },
      }),
    );
  });

  it('sumLoadBySport returns numeric sport totals', async () => {
    const aggregate = jest.fn(async () => ({
      _sum: {
        dailyValue: 100,
        runningValue: 40,
        cyclingValue: 60,
        swimmingValue: null,
      },
    }));
    const service = createPmcService({ pMCData: { aggregate } });

    await expect(
      service.sumLoadBySport(
        'user-1',
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-07T00:00:00.000Z'),
      ),
    ).resolves.toEqual({
      dailyValue: 100,
      runningValue: 40,
      cyclingValue: 60,
      swimmingValue: 0,
    });
  });
});
