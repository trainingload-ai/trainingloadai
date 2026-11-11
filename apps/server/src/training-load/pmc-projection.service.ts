import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import { SportType } from '@prisma/client';
import type {
  PmcProjectionPoint,
  PmcProjectionResult,
  PmcProjectionScenario,
  PmcProjectionScope,
} from '@shared/pmc-projection';
import { UserService } from '@/api/user/user.service';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { LoadReadoutService } from '@/api/activity/load-readout.service';
import { PlanProjectionReadService } from '@/api/plan/application/plan-projection-read.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { PmcRepository } from './persistence/pmc.repository';
import {
  activityLocalDate,
  localDateKeyToUtcDate,
  resolveActivityAnalysisTimezone,
} from './activity-local-date';
import {
  advancePmc,
  dayDistance,
  projectPmc,
  projectionModel,
  shiftPmcDay,
} from './pmc-projection';
import { PMC_ALGORITHM_VERSION } from './pmc-formula';

export interface PmcProjectionOptions {
  scope?: PmcProjectionScope;
  scenario?: PmcProjectionScenario;
  historyDays?: 60 | 90;
}

@Injectable()
export class PmcProjectionService {
  constructor(
    private readonly pmc: PmcRepository,
    private readonly plans: PlanProjectionReadService,
    private readonly activities: ActivityReadService,
    private readonly loads: LoadReadoutService,
    private readonly users: UserService,
  ) {}

  /** Read-only: reconstruct recent actual load from canonical activity readouts, never persist projections. */
  async get(
    userId: string,
    options: PmcProjectionOptions = {},
    now = new Date(),
  ): Promise<PmcProjectionResult> {
    const scope = options.scope ?? 'ALL';
    const scenario = options.scenario ?? 'AUTO';
    const historyDays = options.historyDays ?? 60;
    const timezoneName =
      (await this.users.getPreferredTimezone(userId)) ?? 'UTC';
    const today = dayjs(now).tz(timezoneName).format('YYYY-MM-DD');
    const loadStart = shiftPmcDay(today, -90);
    const historyStart = shiftPmcDay(today, -historyDays);
    const targetDate = shiftPmcDay(today, 28);
    const sport = scope === 'ALL' ? undefined : SportType[scope];
    const [prior, oldestPmc, rows, workouts] = await Promise.all([
      this.pmc.findMany({
        where: { userId, date: { lt: localDateKeyToUtcDate(loadStart) } },
        orderBy: { date: 'desc' },
        take: scope === 'ALL' ? 1 : 8001,
      }),
      this.pmc.findFirst({
        where: { userId, date: { lte: localDateKeyToUtcDate(today) } },
        orderBy: { date: 'asc' },
        select: { date: true },
      }),
      this.activities.findMany({
        where: readyActivityWhere({
          userId,
          ...(sport ? { sportType: sport } : {}),
          startTime: {
            gte: dayjs.utc(loadStart).subtract(1, 'day').toDate(),
            lte: now,
          },
        }),
        select: {
          id: true,
          startTime: true,
          elapsedTime: true,
          timerTime: true,
          timezone: true,
          fitnessMetricsSnapshot: { select: { pmcLocalDate: true } },
        },
        orderBy: { startTime: 'asc' },
        take: 10001,
      }),
      this.plans.list(
        userId,
        localDateKeyToUtcDate(today),
        localDateKeyToUtcDate(targetDate),
        sport,
      ),
    ]);
    if (prior.length > 8000 || rows.length > 10000 || workouts.length > 2000) {
      throw new ServiceUnavailableException('PMC_PROJECTION_EVIDENCE_LIMIT');
    }
    const completed = rows.filter(
      (row) =>
        row.startTime.getTime() +
          Math.max(0, row.elapsedTime ?? row.timerTime ?? 0) * 1000 <=
        now.getTime(),
    );
    const readouts = await this.loads.batchGetActualLoad(
      completed.map((row) => row.id),
    );
    const daily = new Map<string, number | null>();
    let firstRecorded = oldestPmc?.date.toISOString().slice(0, 10) ?? null;
    const activityDays = new Map<number, string>();
    for (const row of completed) {
      const date =
        row.fitnessMetricsSnapshot?.pmcLocalDate ??
        activityLocalDate(
          row.startTime,
          resolveActivityAnalysisTimezone({
            activityTimezone: row.timezone,
            bodyMetrics: [{ type: 'TIMEZONE', value: timezoneName }],
          }),
        );
      if (date < loadStart || date > today) continue;
      activityDays.set(row.id, date);
      if (!firstRecorded || date < firstRecorded) firstRecorded = date;
      const load = readouts.get(row.id)?.actualLoad;
      const previous = daily.get(date);
      daily.set(
        date,
        previous === null || load == null || !Number.isFinite(load) || load < 0
          ? null
          : (previous ?? 0) + load,
      );
    }
    let seed = { ctl: 0, atl: 0 };
    let priorLoadMissing = false;
    const baselineVersionMismatch =
      scope === 'ALL' &&
      !!prior[0] &&
      prior[0].version !== PMC_ALGORITHM_VERSION;
    let seedDate = shiftPmcDay(loadStart, -1);
    if (scope === 'ALL' && prior[0]) {
      seed = { ctl: prior[0].CTL, atl: prior[0].ATL };
      seedDate = prior[0].date.toISOString().slice(0, 10);
    } else if (prior.length) {
      const key =
        scope === 'RUN'
          ? 'runningValue'
          : scope === 'CYCLING'
            ? 'cyclingValue'
            : 'swimmingValue';
      for (const row of [...prior].reverse()) {
        const date = row.date.toISOString().slice(0, 10);
        if (date <= seedDate && seedDate !== shiftPmcDay(loadStart, -1))
          continue;
        if (seedDate < date) {
          const gap = dayDistance(seedDate, date) - 1;
          seed = {
            ctl: seed.ctl * Math.exp(-gap / 42),
            atl: seed.atl * Math.exp(-gap / 7),
          };
        }
        if (row[key] == null || !Number.isFinite(row[key]) || row[key] < 0)
          priorLoadMissing = true;
        seed = advancePmc(seed.ctl, seed.atl, row[key] ?? 0);
        seedDate = date;
      }
    }
    const gap = Math.max(0, dayDistance(seedDate, loadStart) - 1);
    seed = {
      ctl: seed.ctl * Math.exp(-gap / 42),
      atl: seed.atl * Math.exp(-gap / 7),
    };
    const history: PmcProjectionPoint[] = [];
    let yesterday = seed;
    let current: PmcProjectionPoint | null = null;
    let baselineMissing =
      priorLoadMissing ||
      !Number.isFinite(seed.ctl) ||
      !Number.isFinite(seed.atl);
    for (let date = loadStart; date <= today; date = shiftPmcDay(date, 1)) {
      const load = daily.has(date) ? daily.get(date)! : 0;
      if (load === null) baselineMissing = true;
      const state = advancePmc(seed.ctl, seed.atl, load ?? 0);
      const point: PmcProjectionPoint = {
        date,
        load,
        basis: 'ACTUAL',
        plannedLoad: null,
        habitLoad: null,
        ctl: baselineMissing || baselineVersionMismatch ? null : state.ctl,
        atl: baselineMissing || baselineVersionMismatch ? null : state.atl,
        tsb: baselineMissing || baselineVersionMismatch ? null : state.tsb,
      };
      if (date >= historyStart && firstRecorded && date >= firstRecorded)
        history.push(point);
      if (date === today) current = firstRecorded ? point : null;
      else yesterday = state;
      seed = state;
    }
    const dailyPlans = new Map<
      string,
      { load: number | null; approximate: boolean }
    >();
    for (const workout of workouts) {
      const date = workout.scheduledDate!.toISOString().slice(0, 10);
      const priorPlan = dailyPlans.get(date);
      const inputs = workout.estimatedLoadInputs as {
        bySteps?: { partialEstimate?: boolean }[];
      } | null;
      const linkedToday = [
        ...new Set(workout.links.map((link) => link.activityId)),
      ]
        .filter((id) => activityDays.get(id) === date)
        .reduce((total, id) => total + (readouts.get(id)?.actualLoad ?? 0), 0);
      const stored = workout.estimatedLoad;
      const load =
        stored == null || !Number.isFinite(stored) || stored < 0
          ? null
          : Math.max(0, stored - linkedToday);
      dailyPlans.set(date, {
        load:
          priorPlan?.load === null || load === null
            ? null
            : (priorPlan?.load ?? 0) + load,
        approximate:
          !!priorPlan?.approximate ||
          !workout.estimatedLoadComputedAt ||
          workout.estimatedLoadSource === 'RPE' ||
          !!inputs?.bySteps?.some((step) => step.partialEstimate),
      });
    }
    const result = {
      ...projectPmc({
        today,
        scenario,
        historyStart: firstRecorded,
        loads: daily,
        plans: dailyPlans,
        yesterday,
        baselineMissing,
        baselineVersionMismatch,
      }),
      asOf: now.toISOString(),
      timezone: timezoneName,
      today,
      targetDate,
      scope,
      scenario,
      model: projectionModel,
      current,
      history,
      baseline: {
        date: shiftPmcDay(today, -1),
        ctl: yesterday.ctl,
        atl: yesterday.atl,
        initializedFromZero: prior.length === 0,
      },
      loadSources: {
        actual: [
          ...new Set(
            [...readouts.values()]
              .map((row) => row.actualLoadSource)
              .filter((value): value is NonNullable<typeof value> => !!value),
          ),
        ].sort(),
        planned: [
          ...new Set(
            workouts
              .map((row) => row.estimatedLoadSource)
              .filter((value): value is NonNullable<typeof value> => !!value),
          ),
        ].sort(),
      },
    };
    const { asOf: _asOf, ...fingerprint } = result;
    const projectionId = createHash('sha256')
      .update(JSON.stringify(fingerprint))
      .digest('hex');
    return { projectionId, ...result };
  }
}

dayjs.extend(utc);
dayjs.extend(timezone);
