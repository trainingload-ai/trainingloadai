import { HealthFileQueryService } from '@/health-data/health-file-query.service';
import { fitnessMethod } from './fitness-methods';
import { Injectable } from '@nestjs/common';
import { Prisma, SportType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SensorDataService } from '@/sensor/sensor-data.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { selectEffectiveFitnessMetric } from '@/api/user/fitness-metric-selection';
import { UserFitnessMetricType } from '@prisma/client';
import { dateBoundary, localDay, type EvidenceRequest } from './fitness-input';
import { fingerprint } from './fitness-input';
import dayjs = require('dayjs');

@Injectable()
export class FitnessEvidenceReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sensors: SensorDataService,
    private readonly users: UserQueryService,
    private readonly health: HealthFileQueryService,
  ) {}
  async timezone(userId: string, tx?: Prisma.TransactionClient) {
    const row = await this.users.bodyMetrics(tx).findFirst({
      where: { userId, type: 'TIMEZONE' },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
    if (!row?.value) return null;
    try {
      new Intl.DateTimeFormat('en', { timeZone: row.value }).format();
      return row.value;
    } catch {
      return null;
    }
  }
  resolveWindow(request: EvidenceRequest, tz: string, now: Date) {
    const s = request.scope;
    if (s.kind === 'ACTIVITY') return { from: new Date(0), to: now };
    if (s.kind === 'DATE') {
      const w = dateBoundary(s.localDate, tz);
      return { ...w, to: new Date(Math.min(w.to.getTime(), now.getTime())) };
    }
    const asOf = s.asOf ? new Date(s.asOf) : now;
    const to = new Date(Math.min(asOf.getTime(), now.getTime()));
    const start = dayjs
      .utc(localDay(to, tz))
      .subtract((s.days ?? 90) - 1, 'day')
      .format('YYYY-MM-DD');
    return { from: dateBoundary(start, tz).from, to };
  }
  async selection(
    userId: string,
    request: EvidenceRequest,
    window: { from: Date; to: Date },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    const daily =
      fitnessMethod(request.methodId)?.recipe === 'DAILY_RESTING_HR';
    const tz = daily ? await this.timezone(userId, tx) : null;
    const healthRows =
      daily && tz && request.scope.kind !== 'ACTIVITY'
        ? await this.health.listAssessmentRestingHeartRate(
            userId,
            new Date(localDay(window.from, tz) + 'T00:00:00Z'),
            new Date(
              localDay(new Date(window.to.getTime() - 1), tz) + 'T00:00:00Z',
            ),
            tx,
          )
        : [];
    const where: Prisma.ActivityWhereInput = {
      userId,
      ...(request.sport === 'UNKNOWN' ? {} : { sportType: request.sport }),
      ...(daily ? { id: -1 } : {}),
      ...(request.scope.kind === 'ACTIVITY'
        ? { hashId: request.scope.activityHashId }
        : { startTime: { gte: window.from, lt: window.to } }),
    };
    const rows = await db.activity.findMany({
      where,
      orderBy: [{ startTime: 'desc' }, { id: 'asc' }],
      take: 501,
      include: {
        activitySources: {
          where: { isActive: true, isPrimary: true },
          orderBy: { id: 'asc' },
        },
        parquetFiles: { orderBy: { id: 'asc' } },
        activityPeakMetrics: {
          where: {
            type: { in: ['pace', 'hr'] },
            ...([
              'DISTANCE_TIME',
              'PACE_5K',
              'PERFORMANCE_VDOT',
              'OBSERVED_HR',
            ].includes(fitnessMethod(request.methodId)?.recipe ?? '')
              ? {}
              : { id: '__no_preview_peaks__' }),
          },
          orderBy: { id: 'asc' },
          take: 101,
        },
        vo2max: true,
        laps: { orderBy: [{ startTime: 'asc' }, { id: 'asc' }] },
      },
    });
    return {
      rows: rows.slice(0, 500),
      healthRows: healthRows.slice(0, 180),
      truncated:
        rows.length > 500 ||
        healthRows.length > 180 ||
        rows.some((a) => a.activityPeakMetrics.length > 100),
      hash: fingerprint({ rows, healthRows }),
    };
  }
  async baseline(
    userId: string,
    sport: SportType,
    tx?: Prisma.TransactionClient,
  ) {
    const rows = await this.users.fitnessMetrics(tx).findMany({
      where: {
        userId,
        sport: { in: [sport, 'UNKNOWN'] },
        source: { in: ['AUTO', 'MANUAL'] },
      },
      orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
    });
    const values: Partial<Record<UserFitnessMetricType, number>> = {};
    const recordedAt: Partial<Record<UserFitnessMetricType, string>> = {};
    for (const type of Object.values(UserFitnessMetricType)) {
      const selected = selectEffectiveFitnessMetric(rows, type, sport);
      if (selected) {
        values[type] = selected.value;
        recordedAt[type] = selected.recordedAt.toISOString();
      }
    }
    const zones = await (tx ?? this.prisma).userZoneSetting.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
    });
    const timezone = await this.users.bodyMetrics(tx).findFirst({
      where: { userId, type: 'TIMEZONE' },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      select: { value: true },
    });
    const profile = await this.users.profiles(tx).findUnique({
      where: { userId },
      select: { defaultVdotSource: true, vo2maxCorrectionFactor: true },
    });
    return {
      profile,
      values,
      recordedAt,
      hash: fingerprint({
        rows,
        zones,
        profile,
        timezone: timezone?.value ?? null,
      }),
      rows,
    };
  }
  async samples(activityId: number) {
    try {
      return await this.sensors.getFitnessRecordSeries(activityId);
    } catch (error) {
      if (error instanceof Error && error.message === 'FITNESS_RESOURCE_LIMIT')
        throw error;
      return this.sensors.getFitnessRecordSeries(activityId);
    }
  }
}
