import { AthleteStateFitnessFacts } from '@/athlete-state/updates/athlete-state-fitness-facts.service';
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
import { UserAnalysisConfigService } from '../user-analysis-config.service';
import { UserService } from '../user.service';

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

async function createServiceWithStoredMetric(
  type: UserFitnessMetricType,
  value: number,
  sport: SportType = SportType.CYCLING,
) {
  const createdRows: Array<Record<string, unknown>> = [];
  const fitnessMetrics = {
    findMany: jest.fn<AsyncFn>(async () => [
      {
        id: 'stored-reference',
        userId: 'user-1',
        type,
        sport,
        value,
        value2: null,
        source: MetricSource.MANUAL,
        recordedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]),
    findFirst: jest.fn<AsyncFn>(async () => null),
    create: jest.fn<AsyncFn>(async ({ data }: { data: object }) => {
      const row = {
        id: 'created-metric',
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
        provide: AthleteStateFitnessFacts,
        useValue: {
          observe: async (
            _userId: unknown,
            _tx: unknown,
            write: () => Promise<unknown>,
          ) => write(),
        },
      },
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
      { provide: UserAnalysisConfigService, useValue: {} },
    ],
  }).compile();
  const service = moduleRef.get(UserService);
  return { createdRows, fitnessMetrics, service };
}

describe('UserService imported fitness metrics', () => {
  it('accepts an imported FTP without comparing it to a stored CP', async () => {
    const { createdRows, fitnessMetrics, service } =
      await createServiceWithStoredMetric(UserFitnessMetricType.CP, 150);

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
    const { createdRows, service } = await createServiceWithStoredMetric(
      UserFitnessMetricType.CP,
      150,
    );

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
      await createServiceWithStoredMetric(UserFitnessMetricType.CP, 150);

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

  describe.each(['manual', 'imported'] as const)(
    '%s pace updates',
    (source) => {
      it.each([
        {
          type: UserFitnessMetricType.TP,
          value: 3.3,
          reference: UserFitnessMetricType.CS,
          referenceValue: 3,
        },
        {
          type: UserFitnessMetricType.CS,
          value: 3.123456,
          reference: UserFitnessMetricType.TP,
          referenceValue: 4,
        },
      ])(
        'saves only the requested $type and leaves $reference unchanged',
        async ({ type, value, reference, referenceValue }) => {
          const { service, fitnessMetrics, createdRows } =
            await createServiceWithStoredMetric(
              reference,
              referenceValue,
              SportType.RUN,
            );
          const input = {
            userId: 'user-1',
            type,
            value,
            sportType: SportType.RUN,
          };
          const saved =
            source === 'manual'
              ? await service.setFitnessMetric(input)
              : await service.upsertImportedFitnessMetric({
                  ...input,
                  provider: ThirdPartyProvider.intervals_icu,
                });

          expect(saved).toMatchObject({
            type,
            value,
            source: MetricSource.MANUAL,
          });
          expect(createdRows.map((row) => [row.type, row.value])).toEqual([
            [type, value],
          ]);
          expect(fitnessMetrics.update).not.toHaveBeenCalled();
        },
      );

      const write = (
        service: UserService,
        type: UserFitnessMetricType,
        value: number,
      ) => {
        const input = {
          userId: 'user-1',
          type,
          value,
          sportType: SportType.RUN,
        };
        return source === 'manual'
          ? service.setFitnessMetric(input)
          : service.upsertImportedFitnessMetric({
              ...input,
              provider: ThirdPartyProvider.intervals_icu,
            });
      };

      it.each([UserFitnessMetricType.TP, UserFitnessMetricType.CS])(
        'keeps a valid sub-unit %s above its intrinsic minimum',
        async (type) => {
          const { service } = await createServiceWithStoredMetric(
            UserFitnessMetricType.MAX_HR,
            180,
            SportType.RUN,
          );
          const saved = await write(service, type, 0.49);
          expect(saved).toMatchObject({
            type,
            value: 0.49,
          });
          expect(Number.isNaN(saved?.value2)).toBe(false);
        },
      );

      it.each([UserFitnessMetricType.TP, UserFitnessMetricType.CS])(
        'preserves fractional %s when updating an existing row on the same day',
        async (type) => {
          const { service, fitnessMetrics, createdRows } =
            await createServiceWithStoredMetric(
              UserFitnessMetricType.MAX_HR,
              180,
              SportType.RUN,
            );
          const existing = await write(service, type, 3.123456);
          fitnessMetrics.findFirst.mockResolvedValue(existing);
          fitnessMetrics.update.mockImplementation(
            async ({ data }: { data: object }) => ({ ...existing, ...data }),
          );

          await expect(write(service, type, 3.456789)).resolves.toMatchObject({
            type,
            value: 3.456789,
          });
          expect(createdRows).toHaveLength(1);
          expect(fitnessMetrics.update).toHaveBeenCalledTimes(1);
        },
      );

      it.each([UserFitnessMetricType.TP, UserFitnessMetricType.CS])(
        'saves a %s correction smaller than 0.001 m/s',
        async (type) => {
          const { service, fitnessMetrics } =
            await createServiceWithStoredMetric(
              UserFitnessMetricType.MAX_HR,
              180,
              SportType.RUN,
            );
          const existing = await write(service, type, 3.123456);
          fitnessMetrics.findFirst.mockResolvedValue(existing);
          fitnessMetrics.update.mockImplementation(
            async ({ data }: { data: object }) => ({ ...existing, ...data }),
          );

          await expect(write(service, type, 3.123457)).resolves.toMatchObject({
            type,
            value: 3.123457,
          });
          expect(fitnessMetrics.update).toHaveBeenCalledTimes(1);
        },
      );
    },
  );

  it.each([UserFitnessMetricType.TP, UserFitnessMetricType.CS])(
    'preserves the optional fractional secondary value of an imported %s',
    async (type) => {
      const { service } = await createServiceWithStoredMetric(
        UserFitnessMetricType.MAX_HR,
        180,
        SportType.RUN,
      );
      await expect(
        service.upsertImportedFitnessMetric({
          userId: 'user-1',
          provider: ThirdPartyProvider.intervals_icu,
          type,
          sportType: SportType.RUN,
          value: 3.123456,
          value2: 123.456789,
        }),
      ).resolves.toMatchObject({ value: 3.123456, value2: 123.456789 });
    },
  );

  it('keeps integer normalization for a manual heart-rate threshold', async () => {
    const { service } = await createServiceWithStoredMetric(
      UserFitnessMetricType.MAX_HR,
      180,
      SportType.RUN,
    );
    await expect(
      service.setFitnessMetric({
        userId: 'user-1',
        type: UserFitnessMetricType.LTHR,
        value: 170.6,
        sportType: SportType.RUN,
      }),
    ).resolves.toMatchObject({ value: 171 });
  });
});
