import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import {
  ChangeSource,
  MetricSource,
  SportType,
  ThirdPartyProvider,
  UserFitnessMetricType,
} from '@prisma/client';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { PrismaService } from '@/prisma/prisma.service';
import { ActivitySourceLifecycleService } from '@/sync/activity-source-lifecycle.service';
import { UserQueryService } from '../user-query.service';
import { UserService } from '../user.service';

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

async function createServiceWithStoredCp(cp: number) {
  const createdRows: Array<Record<string, unknown>> = [];
  const fitnessMetrics = {
    findMany: jest.fn<AsyncFn>(async () => [
      {
        id: 'stored-cp',
        userId: 'user-1',
        type: UserFitnessMetricType.CP,
        sport: SportType.CYCLING,
        value: cp,
        value2: null,
        source: MetricSource.MANUAL,
        recordedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]),
    findFirst: jest.fn<AsyncFn>(async () => null),
    create: jest.fn<AsyncFn>(async ({ data }: { data: object }) => {
      const row = {
        id: 'created-ftp',
        createdAt: new Date('2026-09-04T00:00:00.000Z'),
        ...data,
      };
      createdRows.push(row);
      return row;
    }),
    update: jest.fn<AsyncFn>(),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      UserService,
      {
        provide: PrismaService,
        useValue: {
          $queryRaw: jest.fn(async () => []),
          $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({ $queryRaw: jest.fn(async () => []) }),
        },
      },
      { provide: I18nService, useValue: {} },
      { provide: ConfigService, useValue: { get: jest.fn() } },
      { provide: ActivitySourceLifecycleService, useValue: {} },
      {
        provide: EventEmitter2,
        useValue: { emitAsync: jest.fn(async () => []) },
      },
      {
        provide: UserQueryService,
        useValue: { fitnessMetrics: () => fitnessMetrics },
      },
    ],
  }).compile();
  const service = moduleRef.get(UserService);
  return { createdRows, fitnessMetrics, service };
}

describe('UserService imported fitness metrics', () => {
  it('accepts an imported FTP without comparing it to a stored CP', async () => {
    const { createdRows, fitnessMetrics, service } =
      await createServiceWithStoredCp(150);

    await expect(
      service.upsertImportedFitnessMetric({
        userId: 'user-1',
        provider: ThirdPartyProvider.intervals_icu,
        type: UserFitnessMetricType.FTP,
        value: 229,
        sportType: SportType.CYCLING,
        recordedAt: new Date('2026-09-04T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      type: UserFitnessMetricType.FTP,
      value: 229,
      changeSource: ChangeSource.SYSTEM_IMPORTED,
      originProvider: ThirdPartyProvider.intervals_icu,
    });

    expect(fitnessMetrics.findMany).not.toHaveBeenCalled();
    expect(createdRows).toHaveLength(1);
  });

  it('still rejects an imported FTP outside its intrinsic bounds', async () => {
    const { createdRows, service } = await createServiceWithStoredCp(150);

    await expect(
      service.upsertImportedFitnessMetric({
        userId: 'user-1',
        provider: ThirdPartyProvider.intervals_icu,
        type: UserFitnessMetricType.FTP,
        value: 9,
        sportType: SportType.CYCLING,
      }),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(createdRows).toHaveLength(0);
  });

  it('keeps stored CP consistency validation for manual FTP updates', async () => {
    const { createdRows, fitnessMetrics, service } =
      await createServiceWithStoredCp(150);

    await expect(
      service.setFitnessMetric({
        userId: 'user-1',
        type: UserFitnessMetricType.FTP,
        value: 229,
        sportType: SportType.CYCLING,
      }),
    ).rejects.toThrow('ftp_not_consistent_with_cp');

    expect(fitnessMetrics.findMany).toHaveBeenCalledTimes(1);
    expect(createdRows).toHaveLength(0);
  });
});
