import type { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { HealthDataRepository } from './persistence/health-data.repository';

/**
 * 给 Sensor GC / 账号删除 / 导出用的健康文件与导出查询口。
 * 不依赖 SeriesStorage，避免 HealthData ↔ Sensor 环。
 */
@Injectable()
export class HealthFileQueryService {
  constructor(private readonly health: HealthDataRepository) {}

  /** Narrow canonical daily fact query; no provider selection or health writes here. */
  listAssessmentRestingHeartRate(
    userId: string,
    from: Date,
    to: Date,
    tx?: Prisma.TransactionClient,
  ) {
    return this.health.dailyMetrics(tx).findMany({
      where: {
        userId,
        metricType: 'RESTING_HEART_RATE_BPM',
        date: { gte: from, lte: to },
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: 181,
    });
  }

  existsByParquetPath(parquetPath: string) {
    return this.health.seriesFiles().findFirst({
      where: { parquetPath },
      select: { id: true },
    });
  }

  listParquetPathsForUser(userId: string) {
    return this.health.seriesFiles().findMany({
      where: { userId },
      select: { parquetPath: true },
    });
  }

  listExportDailyMetrics(userId: string, cutoff: Date) {
    return this.health.dailyMetrics().findMany({
      where: { userId, createdAt: { lte: cutoff } },
      orderBy: [{ date: 'asc' }, { metricType: 'asc' }],
    });
  }

  listExportSessions(userId: string, cutoff: Date) {
    return this.health.sessions().findMany({
      where: { userId, createdAt: { lte: cutoff }, deletedAt: null },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });
  }

  listExportSeriesFiles(userId: string, cutoff: Date) {
    return this.health.seriesFiles().findMany({
      where: { userId, createdAt: { lte: cutoff } },
      orderBy: [{ metricCode: 'asc' }, { localDate: 'asc' }, { part: 'asc' }],
    });
  }
}
