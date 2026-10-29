import { Injectable } from '@nestjs/common';
import { BodyMetricType, SportType } from '@prisma/client';
import dayjs = require('dayjs');
import isoWeek = require('dayjs/plugin/isoWeek');
import timezonePlugin = require('dayjs/plugin/timezone');
import utcPlugin = require('dayjs/plugin/utc');
import { ActivityQueryService } from '@/api/activity/activity-query.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { PMCService } from '@/training-load/pmc.service';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import { normalizeIanaTimezone } from '@/timezone/user-timezone-initializer.service';

dayjs.extend(isoWeek['default'] || isoWeek);
dayjs.extend(utcPlugin['default'] || utcPlugin);
dayjs.extend(timezonePlugin['default'] || timezonePlugin);

type PmcLoadField =
  | 'runningValue'
  | 'cyclingValue'
  | 'swimmingValue'
  | 'dailyValue';

@Injectable()
export class TrainingInsightQueryService {
  constructor(
    private readonly pmc: PMCService,
    private readonly activities: ActivityQueryService,
    private readonly plans: PlanQueryService,
    private readonly users: UserQueryService,
  ) {}

  async getSnapshot(args: {
    userId: string;
    asOf?: string;
    sportType?: string;
  }) {
    const timezone = await this.timezone(args.userId);
    const asOf = args.asOf
      ? dayjs.tz(args.asOf, timezone).startOf('day')
      : dayjs().tz(timezone).startOf('day');
    if (!asOf.isValid()) throw new Error('Invalid asOf date');
    const sportType = this.sportType(args.sportType);
    const loadField = this.loadField(sportType);
    const records = (
      await this.pmc.listRange(
        args.userId,
        asOf.subtract(55, 'day').startOf('day').toDate(),
        asOf.endOf('day').toDate(),
        { orderBy: 'asc' },
      )
    ).map((row) => ({
      date: this.calendarDate(row.date, timezone),
      load: Number(row[loadField] ?? 0),
      atl: row.ATL,
      ctl: row.CTL,
      tsb: row.TSB,
    }));

    const window = (days: number, offsetDays = 0) => {
      const end = asOf.subtract(offsetDays, 'day').startOf('day');
      const start = end.subtract(days - 1, 'day');
      const selected = records.filter(
        (row) => !row.date.isBefore(start) && !row.date.isAfter(end),
      );
      const totalLoad = selected.reduce(
        (sum, row) => sum + (Number.isFinite(row.load) ? row.load : 0),
        0,
      );
      return {
        totalLoad: this.round(totalLoad, 1),
        avgDailyLoad: this.round(totalLoad / days, 1),
        activeDays: selected.filter((row) => row.load >= 10).length,
      };
    };

    const latest = records.at(-1);
    const currentWeekStart = asOf.startOf('isoWeek');
    const currentWeekLoad = this.sum(
      records.filter(
        (row) =>
          !row.date.isBefore(currentWeekStart) && !row.date.isAfter(asOf),
      ),
    );
    const previousWeekLoad = this.sum(
      records.filter(
        (row) =>
          !row.date.isBefore(currentWeekStart.subtract(1, 'week')) &&
          row.date.isBefore(currentWeekStart),
      ),
    );
    const [recent, plannedWorkouts] = await Promise.all([
      this.activities.getRecentActivitiesForAi({
        userId: args.userId,
        limit: 3,
        sportType,
      }),
      this.plans.listWorkoutsForMcp({
        userId: args.userId,
        from: asOf.toDate(),
        to: asOf.add(7, 'day').endOf('day').toDate(),
        offset: 0,
        limit: 3,
      }),
    ]);

    return {
      asOf: asOf.format('YYYY-MM-DD'),
      timezone,
      sportType,
      loadField,
      latestAvailableDate: latest?.date.format('YYYY-MM-DD'),
      current: {
        ATL: this.optionalFinite(latest?.atl),
        CTL: this.optionalFinite(latest?.ctl),
        TSB: this.optionalFinite(latest?.tsb),
        AC_ratio:
          this.finite(latest?.atl) != null &&
          this.finite(latest?.ctl) != null &&
          Number(latest?.ctl) > 0
            ? this.round(Number(latest?.atl) / Number(latest?.ctl), 2)
            : undefined,
      },
      windows: { last7: window(7), last14: window(14), last28: window(28) },
      deltas: {
        load7VsPrev7: this.round(
          window(7).totalLoad - window(7, 7).totalLoad,
          1,
        ),
        load14VsPrev14: this.round(
          window(14).totalLoad - window(14, 14).totalLoad,
          1,
        ),
        load28VsPrev28: this.round(
          window(28).totalLoad - window(28, 28).totalLoad,
          1,
        ),
      },
      week: {
        currentLoad: currentWeekLoad,
        previousLoad: previousWeekLoad,
        delta: this.round(currentWeekLoad - previousWeekLoad, 1),
        deltaPct:
          previousWeekLoad > 0
            ? this.round(
                ((currentWeekLoad - previousWeekLoad) / previousWeekLoad) * 100,
                1,
              )
            : undefined,
      },
      recentActivities: recent.map((activity) => ({
        hashId: activity.hashId,
        sportType: String(activity.sportType),
        startTime: activity.startTime?.toISOString(),
        durationMin:
          typeof activity.timerTime === 'number'
            ? this.round(activity.timerTime / 60, 1)
            : typeof activity.elapsedTime === 'number'
              ? this.round(activity.elapsedTime / 60, 1)
              : undefined,
        distanceKm:
          typeof activity.distance === 'number'
            ? this.round(activity.distance / 1000, 2)
            : undefined,
        avgHr:
          typeof activity.avgHeartRate === 'number'
            ? Math.round(activity.avgHeartRate)
            : undefined,
        avgPower:
          typeof activity.avgPower === 'number'
            ? Math.round(activity.avgPower)
            : undefined,
        load:
          typeof activity.aiLoad === 'number'
            ? this.round(activity.aiLoad, 1)
            : undefined,
      })),
      plannedWorkouts: plannedWorkouts.slice(0, 3).map((workout) => ({
        id: workout.id,
        scheduledDate:
          workout.scheduledDate?.toISOString().slice(0, 10) ?? null,
        sportType: String(workout.sportType),
        name: workout.name ?? null,
        status: String(workout.status),
        plannedDurationMin:
          workout.plannedDurationSeconds == null
            ? null
            : this.round(workout.plannedDurationSeconds / 60, 1),
        estimatedLoad: workout.estimatedLoad ?? null,
      })),
    };
  }

  async getTrainingLoad(args: {
    userId: string;
    from: string;
    to: string;
    sportType?: string;
  }) {
    const timezone = await this.timezone(args.userId);
    const from = dayjs.tz(args.from, timezone).startOf('day');
    const to = dayjs.tz(args.to, timezone).endOf('day');
    if (!from.isValid() || !to.isValid() || to.isBefore(from)) {
      throw new Error('Invalid training load range');
    }
    if (to.startOf('day').diff(from, 'day') > 179) {
      throw new Error('Training load range cannot exceed 180 days');
    }
    const sportType = this.sportType(args.sportType);
    const loadField = this.loadField(sportType);
    const rows = await this.pmc.listRange(
      args.userId,
      from.toDate(),
      to.toDate(),
      { orderBy: 'asc' },
    );
    const series = rows.map((row) => ({
      date: this.calendarDate(row.date, timezone).format('YYYY-MM-DD'),
      load: this.round(Number(row[loadField] ?? 0), 1),
      atl: this.finite(row.ATL),
      ctl: this.finite(row.CTL),
      tsb: this.finite(row.TSB),
    }));
    return {
      range: { from: args.from, to: args.to },
      timezone,
      sportType: sportType ?? null,
      totalLoad: this.round(
        series.reduce((sum, row) => sum + row.load, 0),
        1,
      ),
      series,
    };
  }

  async comparePeriods(args: {
    userId: string;
    periodA: { from: string; to: string };
    periodB: { from: string; to: string };
    sportType?: string;
  }) {
    const [periodA, periodB] = await Promise.all([
      this.getTrainingLoad({
        userId: args.userId,
        ...args.periodA,
        sportType: args.sportType,
      }),
      this.getTrainingLoad({
        userId: args.userId,
        ...args.periodB,
        sportType: args.sportType,
      }),
    ]);
    const summarize = (period: typeof periodA) => {
      const days =
        dayjs(period.range.to).diff(dayjs(period.range.from), 'day') + 1;
      return {
        ...period.range,
        days,
        totalLoad: period.totalLoad,
        averageDailyLoad: this.round(period.totalLoad / days, 1),
        activeDays: period.series.filter((point) => point.load >= 10).length,
      };
    };
    const a = summarize(periodA);
    const b = summarize(periodB);
    return {
      timezone: periodA.timezone,
      sportType: periodA.sportType,
      periodA: a,
      periodB: b,
      delta: {
        totalLoad: this.round(a.totalLoad - b.totalLoad, 1),
        averageDailyLoad: this.round(
          a.averageDailyLoad - b.averageDailyLoad,
          1,
        ),
        activeDays: a.activeDays - b.activeDays,
        totalLoadPercent:
          b.totalLoad > 0
            ? this.round(((a.totalLoad - b.totalLoad) / b.totalLoad) * 100, 1)
            : null,
      },
    };
  }

  async getBreakdown(args: { userId: string; from: string; to: string }) {
    const timezone = await this.timezone(args.userId);
    const from = dayjs.tz(args.from, timezone).startOf('day');
    const to = dayjs.tz(args.to, timezone).endOf('day');
    if (!from.isValid() || !to.isValid() || to.isBefore(from)) {
      throw new Error('Invalid training breakdown range');
    }
    if (to.startOf('day').diff(from, 'day') > 179) {
      throw new Error('Training breakdown range cannot exceed 180 days');
    }
    const rows = await this.pmc.listRange(
      args.userId,
      from.toDate(),
      to.toDate(),
      { orderBy: 'asc' },
    );
    const totalLoad = this.round(
      rows
        .map((row) => Number(row.dailyValue ?? 0))
        .reduce((sum, value) => sum + value, 0),
      1,
    );
    const definitions = [
      ['RUN', 'runningValue'],
      ['CYCLING', 'cyclingValue'],
      ['SWIM', 'swimmingValue'],
    ] as const;
    const items = definitions.map(([sportType, field]) => {
      const load = this.round(
        rows
          .map((row) => Number(row[field] ?? 0))
          .reduce((sum, value) => sum + value, 0),
        1,
      );
      return {
        sportType,
        load,
        sharePercent:
          totalLoad > 0 ? this.round((load / totalLoad) * 100, 1) : 0,
        activeDays: rows.filter((row) => Number(row[field] ?? 0) >= 10).length,
      };
    });
    const attributedLoad = items.reduce((sum, item) => sum + item.load, 0);
    const otherLoad = this.round(Math.max(0, totalLoad - attributedLoad), 1);
    return {
      range: { from: args.from, to: args.to },
      timezone,
      totalLoad,
      activeDays: rows.filter((row) => Number(row.dailyValue ?? 0) >= 10)
        .length,
      items,
      other: {
        load: otherLoad,
        sharePercent:
          totalLoad > 0 ? this.round((otherLoad / totalLoad) * 100, 1) : 0,
      },
    };
  }

  async getReadiness(args: {
    userId: string;
    asOf?: string;
    sportType?: string;
  }) {
    const snapshot = await this.getSnapshot(args);
    const latest = snapshot.latestAvailableDate
      ? dayjs(snapshot.latestAvailableDate)
      : null;
    const freshnessDays = latest
      ? Math.max(0, dayjs(snapshot.asOf).diff(latest, 'day'))
      : null;
    const ratio = snapshot.current.AC_ratio ?? null;
    const tsb = snapshot.current.TSB ?? null;
    const ratioBand: 'UNKNOWN' | 'LOW' | 'BALANCED' | 'HIGH' =
      ratio == null
        ? 'UNKNOWN'
        : ratio < 0.8
          ? 'LOW'
          : ratio <= 1.3
            ? 'BALANCED'
            : 'HIGH';
    const formBand:
      | 'UNKNOWN'
      | 'VERY_NEGATIVE'
      | 'NEGATIVE'
      | 'NEUTRAL'
      | 'POSITIVE' =
      tsb == null
        ? 'UNKNOWN'
        : tsb <= -20
          ? 'VERY_NEGATIVE'
          : tsb < -10
            ? 'NEGATIVE'
            : tsb < 10
              ? 'NEUTRAL'
              : 'POSITIVE';
    const dataStatus: 'NO_DATA' | 'CURRENT' | 'STALE' =
      freshnessDays == null
        ? 'NO_DATA'
        : freshnessDays <= 2
          ? 'CURRENT'
          : 'STALE';
    return {
      asOf: snapshot.asOf,
      timezone: snapshot.timezone,
      sportType: snapshot.sportType ?? null,
      latestAvailableDate: snapshot.latestAvailableDate ?? null,
      dataStatus,
      freshnessDays,
      signals: {
        atl: snapshot.current.ATL ?? null,
        ctl: snapshot.current.CTL ?? null,
        tsb,
        acuteChronicRatio: ratio,
        ratioBand,
        formBand,
        last7Load: snapshot.windows.last7.totalLoad,
        previous7Load: this.round(
          snapshot.windows.last7.totalLoad - snapshot.deltas.load7VsPrev7,
          1,
        ),
        activeDaysLast7: snapshot.windows.last7.activeDays,
      },
      advisory:
        'These are observational training-load signals, not a medical assessment or a directive to train.',
    };
  }

  async getActivityStatistics(args: {
    userId: string;
    from: string;
    to: string;
    sportType?: string;
  }) {
    const timezone = await this.timezone(args.userId);
    const from = dayjs.tz(args.from, timezone).startOf('day');
    const to = dayjs.tz(args.to, timezone).endOf('day');
    if (!from.isValid() || !to.isValid() || to.isBefore(from)) {
      throw new Error('Invalid activity statistics range');
    }
    if (to.startOf('day').diff(from, 'day') > 365) {
      throw new Error('Activity statistics range cannot exceed 366 days');
    }
    const sportType = this.sportType(args.sportType);
    const limit = 1_000;
    const rows = await this.activities.getStatisticsRowsForMcp({
      userId: args.userId,
      from: from.toDate(),
      to: to.toDate(),
      sportType,
      limit,
    });
    const selected = rows.slice(0, limit);
    const summarize = (items: typeof selected) => {
      const durations = items.flatMap((item) => {
        const seconds = item.timerTime ?? item.elapsedTime;
        return typeof seconds === 'number' && Number.isFinite(seconds)
          ? [seconds]
          : [];
      });
      const distances = items.flatMap((item) =>
        typeof item.distance === 'number' && Number.isFinite(item.distance)
          ? [item.distance]
          : [],
      );
      const loads = items.flatMap((item) =>
        typeof item.actualLoad === 'number' && Number.isFinite(item.actualLoad)
          ? [item.actualLoad]
          : [],
      );
      const percentage = (covered: number) =>
        items.length > 0 ? this.round((covered / items.length) * 100, 1) : 0;
      return {
        activityCount: items.length,
        activeDays: new Set(
          items.flatMap((item) =>
            item.startTime
              ? [dayjs(item.startTime).tz(timezone).format('YYYY-MM-DD')]
              : [],
          ),
        ).size,
        durationMinutes:
          durations.length > 0
            ? this.round(
                durations.reduce((sum, value) => sum + value, 0) / 60,
                1,
              )
            : null,
        distanceKm:
          distances.length > 0
            ? this.round(
                distances.reduce((sum, value) => sum + value, 0) / 1_000,
                2,
              )
            : null,
        trainingLoad:
          loads.length > 0
            ? this.round(
                loads.reduce((sum, value) => sum + value, 0),
                1,
              )
            : null,
        coverage: {
          durationPercent: percentage(durations.length),
          distancePercent: percentage(distances.length),
          trainingLoadPercent: percentage(loads.length),
        },
      };
    };
    const buckets = new Map<string, typeof selected>();
    for (const row of selected) {
      const key = row.sportType ? String(row.sportType) : 'UNKNOWN';
      buckets.set(key, [...(buckets.get(key) ?? []), row]);
    }
    return {
      range: { from: args.from, to: args.to },
      timezone,
      sportType: sportType ?? null,
      totals: summarize(selected),
      bySport: [...buckets]
        .map(([type, items]) => ({ sportType: type, ...summarize(items) }))
        .sort((left, right) => right.activityCount - left.activityCount),
      truncated: rows.length > limit,
      countingRule:
        'Statistics use up to the 1,000 most recent ready activities in the requested range. Coverage reports how many included activities stored each metric.',
    };
  }

  async getConsistency(args: {
    userId: string;
    days: number;
    asOf?: string;
    sportType?: string;
  }) {
    const timezone = await this.timezone(args.userId);
    const asOf = args.asOf
      ? dayjs.tz(args.asOf, timezone).startOf('day')
      : dayjs().tz(timezone).startOf('day');
    if (!asOf.isValid()) throw new Error('Invalid consistency date');
    const from = asOf.subtract(args.days - 1, 'day').startOf('day');
    const sportType = this.sportType(args.sportType);
    const loadField = this.loadField(sportType);
    const rows = await this.pmc.listRange(
      args.userId,
      from.toDate(),
      asOf.endOf('day').toDate(),
      { orderBy: 'asc' },
    );
    const series = rows.map((row) => ({
      date: this.calendarDate(row.date, timezone).format('YYYY-MM-DD'),
      load: this.round(Number(row[loadField] ?? 0), 1),
    }));
    const loads = series.map((row) => row.load);
    const mean =
      loads.length > 0
        ? loads.reduce((sum, value) => sum + value, 0) / loads.length
        : 0;
    const variance =
      loads.length > 0
        ? loads.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          loads.length
        : 0;
    const standardDeviation = Math.sqrt(variance);
    let longestActiveDayStreak = 0;
    let currentStreak = 0;
    let previousDate: dayjs.Dayjs | null = null;
    for (const point of series) {
      const pointDate = dayjs(point.date);
      const consecutive =
        previousDate != null && pointDate.diff(previousDate, 'day') === 1;
      currentStreak =
        point.load >= 10 ? (consecutive ? currentStreak + 1 : 1) : 0;
      longestActiveDayStreak = Math.max(longestActiveDayStreak, currentStreak);
      previousDate = pointDate;
    }
    const currentActiveDayStreak =
      series.at(-1)?.date === asOf.format('YYYY-MM-DD') ? currentStreak : 0;
    const weeks = new Map<
      string,
      {
        weekStart: string;
        load: number;
        activeDays: number;
        storedDays: number;
      }
    >();
    for (const point of series) {
      const weekStart = dayjs(point.date)
        .startOf('isoWeek')
        .format('YYYY-MM-DD');
      const bucket = weeks.get(weekStart) ?? {
        weekStart,
        load: 0,
        activeDays: 0,
        storedDays: 0,
      };
      bucket.load += point.load;
      bucket.activeDays += point.load >= 10 ? 1 : 0;
      bucket.storedDays += 1;
      weeks.set(weekStart, bucket);
    }
    const weekly = [...weeks.values()].map((week) => ({
      ...week,
      load: this.round(week.load, 1),
    }));
    return {
      range: {
        from: from.format('YYYY-MM-DD'),
        to: asOf.format('YYYY-MM-DD'),
        days: args.days,
      },
      timezone,
      sportType: sportType ?? null,
      storedDays: series.length,
      coveragePercent: this.round((series.length / args.days) * 100, 1),
      activeDays: series.filter((point) => point.load >= 10).length,
      longestActiveDayStreak,
      currentActiveDayStreak,
      dailyLoadMean: this.round(mean, 1),
      dailyLoadStandardDeviation: this.round(standardDeviation, 1),
      loadVariabilityCoefficient:
        mean > 0 ? this.round(standardDeviation / mean, 2) : null,
      weekly,
      countingRule:
        'An active day has stored load of at least 10. Missing PMC dates are not converted to zero and break streaks; coverage shows the stored-day share.',
    };
  }

  private sportType(value?: string): 'RUN' | 'CYCLING' | 'SWIM' | undefined {
    const normalized = String(value ?? '').toUpperCase();
    return [SportType.RUN, SportType.CYCLING, SportType.SWIM].includes(
      normalized as 'RUN' | 'CYCLING' | 'SWIM',
    )
      ? (normalized as 'RUN' | 'CYCLING' | 'SWIM')
      : undefined;
  }

  private loadField(sportType?: SportType): PmcLoadField {
    if (sportType === SportType.RUN) return 'runningValue';
    if (sportType === SportType.CYCLING) return 'cyclingValue';
    if (sportType === SportType.SWIM) return 'swimmingValue';
    return 'dailyValue';
  }

  private async timezone(userId: string) {
    const metric = await this.users.bodyMetrics().findFirst({
      where: { userId, type: BodyMetricType.TIMEZONE },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      select: { value: true },
    });
    return normalizeIanaTimezone(metric?.value) ?? 'UTC';
  }

  private calendarDate(value: Date, timezone: string) {
    return dayjs.tz(dayjs.utc(value).format('YYYY-MM-DD'), timezone);
  }

  private sum(rows: Array<{ load: number }>) {
    return this.round(
      rows.reduce((sum, row) => sum + row.load, 0),
      1,
    );
  }

  private finite(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value)
      ? this.round(value, 1)
      : null;
  }

  private optionalFinite(value: unknown) {
    return this.finite(value) ?? undefined;
  }

  private round(value: number, digits: number) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}
