import { readWorkoutSportDefinitions } from '@/sports/persistence/sport-catalog.repository';
import {
  defaultSportDefinitionCode,
  normalizeSportDefinitionCode,
} from '@/sports/sport-catalog.types';
import { PLAN_SPORT_TYPES } from '../plan.constants';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { PlanDb } from '../persistence/plan-db';
import { addCalendarDays } from '@shared/plan-calendar';
import {
  calendarMonthEnd,
  isoWeekStart,
  parseRollingStartSettings,
  type RollingStartSettings,
} from '@shared/rolling-plan';

const date = (value: string) => new Date(`${value}T00:00:00Z`);

type RollingWorkoutSport = {
  sportType?: string;
  sportDefinitionCode?: string | null;
  structureKind?: string;
  definition?: { kind?: string };
};

/** Owns versioned policy/month/week publication. Model output never authorizes execution. */
@Injectable()
export class RollingPlanService {
  constructor(
    private readonly plans: PlanRepository,
    private readonly workouts: PlanWorkoutRepository,
  ) {}
  async areSportsAuthorized(
    sports: string[],
    workouts: RollingWorkoutSport[],
    tx: PlanDb,
  ) {
    if (!workouts.length) return true;
    const identities = workouts.map((workout) => {
      const family = PLAN_SPORT_TYPES.find(
        (value) => value === workout.sportType,
      );
      const kind = workout.definition?.kind ?? workout.structureKind;
      if (
        !family ||
        !kind ||
        (workout.definition?.kind &&
          workout.structureKind &&
          workout.definition.kind !== workout.structureKind)
      )
        return null;
      return {
        family,
        kind,
        code: normalizeSportDefinitionCode(family, workout.sportDefinitionCode),
      };
    });
    if (identities.some((identity) => !identity)) return false;
    const definitions = new Map(
      (
        await readWorkoutSportDefinitions(tx, [
          ...new Set(identities.map((identity) => identity!.code)),
        ])
      ).map((sport) => [sport.code, sport]),
    );
    return identities.every((identity) => {
      const { family, kind, code } = identity!;
      const catalog = definitions.get(code);
      if (!catalog || catalog.family !== family) return false;
      const catalogStrength =
        catalog.defaultWorkoutStructureKind === 'STRENGTH';
      if (kind === 'STRENGTH') {
        // OTHER is the existing neutral fallback for older strength prescriptions.
        return (
          family === 'UNKNOWN' &&
          (catalogStrength || code === defaultSportDefinitionCode('UNKNOWN')) &&
          sports.includes('STRENGTH')
        );
      }
      if (catalogStrength) return false;
      return family === 'UNKNOWN'
        ? sports.includes('UNKNOWN') || sports.includes('OTHER')
        : sports.includes(family);
    });
  }

  async validateStart(
    value: unknown,
    startDate: string,
    workouts: Array<
      {
        weekIndex: number;
        dayIndex: number;
        sportType?: string;
      } & RollingWorkoutSport
    >,
    tx: PlanDb,
  ) {
    let settings: RollingStartSettings;
    try {
      settings = parseRollingStartSettings(value, startDate);
    } catch (error) {
      throw new UnprocessableEntityException({
        code: 'ROLLING_SETTINGS_REQUIRED',
        message: (error as Error).message,
      });
    }
    const authorized = await this.areSportsAuthorized(
      settings.policy.sportTypes,
      workouts,
      tx,
    );
    const through = addCalendarDays(isoWeekStart(startDate), 6);
    const starterWindowEnd = addCalendarDays(startDate, 6);
    const allowedThrough = starterWindowEnd > through ? starterWindowEnd : through;
    for (const workout of workouts) {
      const scheduled = addCalendarDays(
        startDate,
        (workout.weekIndex - 1) * 7 + workout.dayIndex - 1,
      );
      if (scheduled < startDate || scheduled > allowedThrough || !authorized)
        throw new UnprocessableEntityException(
          'First rolling week must contain only the starter window and authorized sports',
        );
    }
    return { ...settings, generatedFrom: startDate, generatedThrough: through };
  }

  async publishStart(
    input: {
      userId: string;
      planId: string;
      decisionId: string;
      startDate: string;
      settings: RollingStartSettings;
      evidenceRevision: string;
      receipt: unknown;
    },
    tx: PlanDb,
  ) {
    const { userId, planId, startDate } = input;
    const settings = await this.validateStart(
      input.settings,
      startDate,
      [],
      tx,
    );
    const policy = await tx.planAutomationPolicy.create({
      data: {
        userId,
        planId,
        revision: 1,
        settings: settings.policy,
        confirmedDecisionId: input.decisionId,
        effectiveFrom: date(startDate),
      },
    });
    const months = [];
    for (const strategy of settings.monthStrategies)
      months.push(
        await tx.rollingMonthStrategy.create({
          data: {
            planId,
            policyId: policy.id,
            monthStart: date(strategy.monthStart),
            monthEnd: date(calendarMonthEnd(strategy.monthStart)),
            effectiveFrom: date(
              strategy.monthStart < startDate ? startDate : strategy.monthStart,
            ),
            revision: 1,
            strategy: JSON.parse(JSON.stringify(strategy)),
            evidenceRevision: input.evidenceRevision,
            appliedAt: new Date(),
          },
        }),
      );
    const generation = await tx.rollingWeekGeneration.create({
      data: {
        planId,
        policyId: policy.id,
        weekStart: date(isoWeekStart(startDate)),
        weekEnd: date(settings.generatedThrough),
        generatedFrom: date(startDate),
        generatedThrough: date(settings.generatedThrough),
        revision: 1,
        evidenceRevision: input.evidenceRevision,
        receipt: JSON.parse(JSON.stringify(input.receipt)),
        appliedAt: new Date(),
        monthStrategies: {
          create: months.map((month) => ({ strategyId: month.id })),
        },
      },
    });
    await this.workouts.updateMany(
      {
        where: {
          planId,
          userId,
          scheduledDate: {
            gte: date(startDate),
            lte: date(settings.generatedThrough),
          },
        },
        data: { generationId: generation.id },
      },
      tx,
    );
    // Preserve saved starter-draft workouts that carry over into the next ISO week
    // so subsequent weekly automation keeps their original IDs without duplicating or overwriting them.
    await this.workouts.updateMany(
      {
        where: {
          planId,
          userId,
          scheduledDate: {
            gt: date(settings.generatedThrough),
          },
        },
        data: { automationProtected: true },
      },
      tx,
    );
    await this.plans.update(
      {
        where: { id: planId },
        data: {
          generatedThrough: date(settings.generatedThrough),
          goal: settings.policy.goal,
        },
      },
      tx,
    );
    await this.assertPublication(
      planId,
      generation.id,
      policy.id,
      months.map((m) => m.id),
      startDate,
      settings.generatedThrough,
      tx,
    );
    return {
      policyRevision: policy.revision,
      policyId: policy.id,
      generationId: generation.id,
      monthStrategyIds: months.map((m) => m.id),
      generatedFrom: startDate,
      generatedThrough: settings.generatedThrough,
    };
  }
  async weekDependencies(
    planId: string,
    weekStart: string,
    tx: PlanDb,
    from = weekStart,
  ) {
    if (isoWeekStart(weekStart) !== weekStart)
      throw new UnprocessableEntityException(
        'A rolling week starts on ISO Monday',
      );
    const end = addCalendarDays(weekStart, 6);
    if (from < weekStart || from > end)
      throw new UnprocessableEntityException('Invalid remaining week window');
    const months = [...new Set([from.slice(0, 7), end.slice(0, 7)])];
    const strategies = await tx.rollingMonthStrategy.findMany({
      where: {
        planId,
        monthStart: { in: months.map((m) => date(`${m}-01`)) },
        appliedAt: { not: null },
        supersededAt: null,
      },
      orderBy: { monthStart: 'asc' },
    });
    if (strategies.length !== months.length)
      throw new UnprocessableEntityException(
        'Every calendar month of this week needs a current applied strategy',
      );
    return strategies.map((m) => m.id);
  }

  async publishWeek(
    input: {
      planId: string;
      policyId: string;
      weekStart: string;
      from: string;
      evidenceRevision: string;
      strategyIds: string[];
      receipt: unknown;
    },
    tx: PlanDb,
  ) {
    const currentIds = await this.weekDependencies(
      input.planId,
      input.weekStart,
      tx,
      input.from,
    );
    if (JSON.stringify(currentIds) !== JSON.stringify(input.strategyIds))
      throw new UnprocessableEntityException(
        'Month strategy changed after weekly assessment',
      );
    const previous = await tx.rollingWeekGeneration.findFirst({
      where: {
        planId: input.planId,
        weekStart: date(input.weekStart),
        supersededAt: null,
        appliedAt: { not: null },
      },
    });
    if (previous)
      await tx.rollingWeekGeneration.update({
        where: { id: previous.id },
        data: { supersededAt: new Date() },
      });
    const latest = await tx.rollingWeekGeneration.aggregate({
      where: { planId: input.planId, weekStart: date(input.weekStart) },
      _max: { revision: true },
    });
    const through = addCalendarDays(input.weekStart, 6);
    const coverageFrom =
      previous && previous.generatedFrom < date(input.from)
        ? previous.generatedFrom.toISOString().slice(0, 10)
        : input.from;
    const generation = await tx.rollingWeekGeneration.create({
      data: {
        planId: input.planId,
        policyId: input.policyId,
        weekStart: date(input.weekStart),
        weekEnd: date(through),
        generatedFrom: date(coverageFrom),
        generatedThrough: date(through),
        revision: (latest._max.revision ?? 0) + 1,
        evidenceRevision: input.evidenceRevision,
        receipt: JSON.parse(JSON.stringify(input.receipt)),
        appliedAt: new Date(),
        monthStrategies: {
          create: currentIds.map((strategyId) => ({ strategyId })),
        },
      },
    });
    await this.workouts.updateMany(
      {
        where: {
          planId: input.planId,
          scheduledDate: { gte: date(input.from), lte: date(through) },
        },
        data: { generationId: generation.id },
      },
      tx,
    );
    const plan = await this.plans.findUnique(
      {
        where: { id: input.planId },
      },
      tx,
    );
    if (!plan) throw new UnprocessableEntityException('Plan no longer exists');
    if (!plan.generatedThrough || plan.generatedThrough < date(through))
      await this.plans.update(
        {
          where: { id: input.planId },
          data: { generatedThrough: date(through) },
        },
        tx,
      );
    await this.assertPublication(
      input.planId,
      generation.id,
      input.policyId,
      currentIds,
      coverageFrom,
      through,
      tx,
    );
    return {
      generationId: generation.id,
      generatedFrom: coverageFrom,
      generatedThrough: through,
      monthStrategyIds: currentIds,
    };
  }
  private async assertPublication(
    planId: string,
    generationId: string,
    policyId: string,
    strategyIds: string[],
    from: string,
    through: string,
    tx: PlanDb,
  ) {
    const [plan, policy, generation] = await Promise.all([
      this.plans.findUnique({ where: { id: planId } }, tx),
      tx.planAutomationPolicy.findUnique({ where: { id: policyId } }),
      tx.rollingWeekGeneration.findUnique({
        where: { id: generationId },
        include: { monthStrategies: true },
      }),
    ]);
    if (
      !plan ||
      plan.planningMode !== 'ROLLING' ||
      plan.status !== 'ACTIVE' ||
      plan.periodWeeks !== null ||
      plan.endDate !== null ||
      !plan.generatedThrough ||
      plan.generatedThrough < date(through) ||
      !policy ||
      policy.revokedAt ||
      policy.planId !== planId ||
      policy.userId !== plan.userId ||
      !generation ||
      generation.planId !== planId ||
      generation.policyId !== policyId ||
      !generation.appliedAt ||
      generation.supersededAt ||
      generation.generatedFrom.getTime() !== date(from).getTime() ||
      generation.generatedThrough.getTime() !== date(through).getTime() ||
      generation.monthStrategies.length !== strategyIds.length ||
      generation.monthStrategies.some(
        (m) => !strategyIds.includes(m.strategyId),
      )
    )
      throw new UnprocessableEntityException(
        'Rolling publication readback failed',
      );
  }
}
