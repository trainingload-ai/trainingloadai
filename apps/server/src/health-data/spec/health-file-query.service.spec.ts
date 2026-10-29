import { describe, expect, it, jest } from '@jest/globals';
import { HealthFileQueryService } from '../health-file-query.service';
import { HealthDataRepository } from '../persistence/health-data.repository';

describe('HealthFileQueryService', () => {
  it('looks up series files by parquet path for garbage collection', async () => {
    const prisma = {
      healthSeriesFile: {
        findFirst: jest.fn(async () => ({ id: 'file-1' })),
      },
    };
    const service = new HealthFileQueryService(
      new HealthDataRepository(prisma as never),
    );

    await expect(
      service.existsByParquetPath('health/a.parquet'),
    ).resolves.toEqual({ id: 'file-1' });
    expect(prisma.healthSeriesFile.findFirst).toHaveBeenCalledWith({
      where: { parquetPath: 'health/a.parquet' },
      select: { id: true },
    });
  });

  it('lists export cutoffs for daily metrics, sessions, and series files', async () => {
    const cutoff = new Date('2026-08-01T00:00:00.000Z');
    const prisma = {
      userDailyHealthMetric: { findMany: jest.fn(async () => []) },
      canonicalHealthSession: { findMany: jest.fn(async () => []) },
      healthSeriesFile: { findMany: jest.fn(async () => []) },
    };
    const service = new HealthFileQueryService(
      new HealthDataRepository(prisma as never),
    );

    await service.listExportDailyMetrics('user-1', cutoff);
    await service.listExportSessions('user-1', cutoff);
    await service.listExportSeriesFiles('user-1', cutoff);

    expect(prisma.userDailyHealthMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', createdAt: { lte: cutoff } },
      }),
    );
    expect(prisma.canonicalHealthSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
    expect(prisma.healthSeriesFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', createdAt: { lte: cutoff } },
      }),
    );
  });
});
