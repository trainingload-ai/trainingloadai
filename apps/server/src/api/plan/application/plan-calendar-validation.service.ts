import { PlanCalendarRepository } from '../persistence/plan-calendar.repository';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  addCalendarDays,
  assessPlanSchedule,
  parseScheduleConstraints,
  scheduleDateConflict,
  type ScheduleConstraints,
  type ScheduledPlanWorkout,
} from '@shared/plan-calendar';
import {
  parsePlanQualityContract,
  type PlanQualityContract,
} from '@shared/plan-quality';
import type { PlanDb } from '../persistence/plan-db';

type Candidate = {
  userId: string;
  planId: string;
  startDate: string;
  periodWeeks: number;
  workouts: ScheduledPlanWorkout[];
  changedWorkoutIds: string[];
  constraints?: ScheduleConstraints;
  qualityContract?: PlanQualityContract;
  projectDates?: boolean;
  validationRange?: { from: string; until: string };
};
export type RelatedCalendarConflict = {
  code: string;
  date: string;
  workoutId: string;
  planId: string | null;
  name?: string | null;
  managed: false;
};
type CalendarRow = {
  id: string;
  planId: string | null;
  status: string;
  scheduledDate: string;
  durationSeconds?: number | null;
};
type Issue = { code: string; date?: string; workoutId?: string };
const visible = (status: string) => !['MOVED', 'SKIPPED'].includes(status);
const ymd = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

/** All writers hold the athlete advisory lock before reading or writing their calendar. */
@Injectable()
export class PlanCalendarValidationService {
  constructor(private readonly calendar: PlanCalendarRepository) {}
  private reject(issues: Issue[]) {
    if (issues.length)
      throw new UnprocessableEntityException({
        code: 'PLAN_SCHEDULE_INVALID',
        issues,
      });
  }

  async assertCandidate(input: Candidate, tx: PlanDb) {
    const report = assessPlanSchedule(input);
    this.reject(report.issues);
    const touched = new Set(input.changedWorkoutIds);
    const candidate = input.workouts.map((w) => ({
      ...w,
      planId: input.planId,
      scheduledDate:
        input.projectDates || !w.scheduledDate
          ? addCalendarDays(input.startDate, w.dayOffset)
          : w.scheduledDate,
    }));
    const dates = [
      ...new Set(
        candidate.filter((w) => touched.has(w.id)).map((w) => w.scheduledDate),
      ),
    ];
    if (!dates.length && !input.validationRange)
      return { relatedConflicts: [] as RelatedCalendarConflict[] };
    const others = await this.calendar.otherWorkouts(
      input.userId,
      input.planId,
      dates,
      input.validationRange,
      tx,
    );
    if (input.validationRange) {
      for (const row of others.filter((w) => this.inCalendar(w))) {
        const date = ymd(row.scheduledDate)!;
        if (!dates.includes(date)) dates.push(date);
      }
    }
    const rows = [
      ...candidate,
      ...others
        .filter((w) => this.inCalendar(w))
        .map((w) => ({
          id: w.id,
          planId: w.planId,
          status: w.status,
          scheduledDate: ymd(w.scheduledDate)!,
          durationSeconds: w.plannedDurationSeconds,
        })),
    ];
    const relatedConflicts: RelatedCalendarConflict[] = others
      .filter((w) => this.inCalendar(w) && visible(w.status))
      .flatMap((w) => {
        const date = ymd(w.scheduledDate)!;
        const code = scheduleDateConflict(date, input.constraints);
        return code
          ? [
              {
                code,
                date,
                workoutId: w.id,
                planId: w.planId,
                name: w.name,
                managed: false as const,
              },
            ]
          : [];
      });
    this.reject(
      this.dailyIssues(dates, rows, input.qualityContract?.maxDailyMinutes),
    );
    // Other effective plans can impose a stricter athlete time budget too.
    await this.assertDates(input.userId, dates, rows, tx, input.planId);
    return { relatedConflicts };
  }

  async assertStored(userId: string, changedWorkoutIds: string[], tx: PlanDb) {
    if (!changedWorkoutIds.length) return;
    const changed = await this.calendar.changedDates(
      userId,
      changedWorkoutIds,
      tx,
    );
    const dates = [
      ...new Set(
        changed.flatMap((w) =>
          ymd(w.scheduledDate) ? [ymd(w.scheduledDate)!] : [],
        ),
      ),
    ];
    if (!dates.length) return;
    const rows = await this.calendar.workoutsOnDates(userId, dates, tx);
    await this.assertDates(
      userId,
      dates,
      rows
        .filter((w) => this.inCalendar(w))
        .map((w) => ({
          id: w.id,
          planId: w.planId,
          status: w.status,
          scheduledDate: ymd(w.scheduledDate)!,
          durationSeconds: w.plannedDurationSeconds,
        })),
      tx,
      undefined,
      changedWorkoutIds,
    );
  }

  private inCalendar(w: {
    scheduledDate: Date | null;
    plan: {
      status: string;
      startDate: Date | null;
      supersededBy: { status: string; startDate: Date | null } | null;
    } | null;
  }) {
    if (!w.plan) return true;
    if (!['ACTIVE', 'PAUSED', 'SCHEDULED'].includes(w.plan.status))
      return false;
    const date = ymd(w.scheduledDate);
    const start = ymd(w.plan.startDate);
    if (!date || (start && date < start)) return false;
    const successor = w.plan.supersededBy;
    return !(
      successor?.status === 'SCHEDULED' &&
      ymd(successor.startDate) &&
      date >= ymd(successor.startDate)!
    );
  }

  private dailyIssues(
    dates: string[],
    rows: Array<{
      status: string;
      scheduledDate: string;
      durationSeconds?: number | null;
    }>,
    minutes?: number,
  ): Issue[] {
    if (!minutes) return [];
    return dates.flatMap((date) => {
      const daily = rows.filter(
        (w) => visible(w.status) && w.scheduledDate === date,
      );
      if (
        daily.some(
          (w) => !Number.isFinite(w.durationSeconds) || w.durationSeconds! <= 0,
        )
      )
        return [{ code: 'DAILY_TIME_UNVERIFIED', date }];
      return daily.reduce((sum, w) => sum + w.durationSeconds!, 0) >
        minutes * 60
        ? [{ code: 'DAILY_TIME_BUDGET', date }]
        : [];
    });
  }

  private async assertDates(
    userId: string,
    dates: string[],
    rows: CalendarRow[],
    tx: PlanDb,
    excludePlanId?: string,
    changedWorkoutIds: string[] = [],
  ) {
    const changed = new Set(changedWorkoutIds);
    const plans = await this.calendar.activePlans(userId, excludePlanId, tx);
    const issues: Issue[] = [];
    for (const plan of plans) {
      const metadata = plan.generationMetadata as Record<
        string,
        unknown
      > | null;
      const contract = parsePlanQualityContract(metadata?.qualityContract);
      const constraints = parseScheduleConstraints(
        metadata?.scheduleConstraints,
      );
      const start = ymd(plan.startDate);
      const end =
        ymd(plan.endDate) ??
        (start ? addCalendarDays(start, plan.periodWeeks * 7 - 1) : null);
      const cutoff =
        plan.supersededBy?.status === 'SCHEDULED'
          ? ymd(plan.supersededBy.startDate)
          : null;
      const activeDates = dates.filter(
        (d) =>
          start && d >= start && (!end || d <= end) && (!cutoff || d < cutoff),
      );
      for (const row of rows) {
        if (
          row.planId !== plan.id ||
          !changed.has(row.id) ||
          !visible(row.status) ||
          !activeDates.includes(row.scheduledDate)
        )
          continue;
        const code = scheduleDateConflict(row.scheduledDate, constraints);
        if (code)
          issues.push({ code, date: row.scheduledDate, workoutId: row.id });
      }
      issues.push(
        ...this.dailyIssues(activeDates, rows, contract?.maxDailyMinutes),
      );
    }
    this.reject([
      ...new Map(issues.map((i) => [JSON.stringify(i), i])).values(),
    ]);
  }
}
