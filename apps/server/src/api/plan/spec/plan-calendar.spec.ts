import { describe, expect, it } from '@jest/globals';
import {
  assessPlanSchedule,
  projectPlanCalendar,
  parseScheduleConstraints,
  resolveScheduleQualityContract,
  resolveScheduleRulesAtDate,
} from '@shared/plan-calendar';

describe('plan calendar projection', () => {
  it('rechecks the actual ISO weekday when starting the same draft on a different date', () => {
    const candidate = {
      startDate: '2026-12-05', periodWeeks: 1, projectDates: true,
      qualityContract: { startDate: '2026-12-05', maxDailyMinutes: 90, maxMinutesByIsoWeekday: { 3: 45 } },
      workouts: [{ id: 'long', dayOffset: 0, status: 'PLANNED', durationSeconds: 75 * 60 }],
      changedWorkoutIds: ['long'],
    };
    expect(assessPlanSchedule(candidate).valid).toBe(true);
    expect(assessPlanSchedule({ ...candidate, startDate: '2026-12-09' }).issues).toEqual([
      { code: 'DAILY_TIME_BUDGET', date: '2026-12-09' },
    ]);
  });
  it('regroups a dated plan for Sunday-first display without moving workouts', () => {
    const plan = {
      periodWeeks: 1,
      startDate: '2026-11-30',
      calendarTimeZone: 'America/New_York',
      workouts: [
        { weekIndex: 1, dayIndex: 1 },
        { weekIndex: 1, dayIndex: 7 },
      ],
    };
    const mondayFirst = projectPlanCalendar(plan);
    const sundayFirst = projectPlanCalendar({ ...plan, firstDayOfWeek: 7 });

    expect(sundayFirst.workouts).toEqual(mondayFirst.workouts);
    expect(sundayFirst.weeks.map((week) => week.startDate)).toEqual([
      '2026-11-29',
      '2026-12-06',
    ]);
    expect(sundayFirst.weeks[0]?.days.map((day) => day.isoWeekday)).toEqual([
      7, 1, 2, 3, 4, 5, 6,
    ]);
    expect(sundayFirst.weeks[1]?.days[0]?.workouts[0]?.date).toBe('2026-12-06');
  });

  it('uses civil dates across leap days and DST in the explicit calendar time zone', () => {
    const workouts = [
      { weekIndex: 1, dayIndex: 1 },
      { weekIndex: 1, dayIndex: 2 },
      { weekIndex: 1, dayIndex: 3 },
    ];
    expect(
      projectPlanCalendar({
        periodWeeks: 1,
        startDate: '2028-02-28',
        calendarTimeZone: 'Pacific/Auckland',
        workouts,
      }).workouts.map((w) => w.date),
    ).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
    expect(
      projectPlanCalendar({
        periodWeeks: 1,
        startDate: '2026-03-07',
        calendarTimeZone: 'America/New_York',
        workouts,
      }).workouts.map((w) => w.date),
    ).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
  });
  it('does not reinterpret unknown legacy offsets and replaces only explicitly agreed allowedDays', () => {
    const previous = {
      allowedDays: [1, 4],
      maxDailyMinutes: 60,
      requiredSports: ['RUN'],
    };
    expect(
      resolveScheduleQualityContract(previous, { mode: 'INHERIT' }),
    ).toEqual(previous);
    expect(
      resolveScheduleQualityContract(previous, {
        mode: 'REPLACE_ALLOWED_DAYS',
        allowedDays: [2, 3],
      }),
    ).toEqual({
      allowedDays: [2, 3],
      maxDailyMinutes: 60,
      requiredSports: ['RUN'],
    });
    expect(parseScheduleConstraints(undefined)).toBeUndefined();
  });
  it('applies rules only in their effective window and honors explicitly confirmed date exceptions', () => {
    const projection = projectPlanCalendar({
      periodWeeks: 1,
      startDate: '2026-11-22',
      calendarTimeZone: 'Asia/Shanghai',
      workouts: [
        { weekIndex: 1, dayIndex: 1 },
        { weekIndex: 1, dayIndex: 4 },
        { weekIndex: 1, dayIndex: 6 },
      ],
      constraints: {
        version: 1,
        revision: 1,
        calendarTimeZone: 'Asia/Shanghai',
        fixedRestWeekdays: [3, 5, 7],
        unavailableDates: ['2026-11-27'],
        availableDateOverrides: ['2026-11-25'],
        effectiveFrom: '2026-11-23',
        confirmation: { source: 'USER', reference: 'explicit-exception' },
      },
    });
    expect(projection.conflicts).toEqual([
      { code: 'UNAVAILABLE_DATE', date: '2026-11-27', workoutIndex: 2 },
    ]);
  });
  it('rejects malformed dates, unknown versions and contradictory confirmed exceptions', () => {
    expect(() =>
      projectPlanCalendar({
        periodWeeks: 1,
        startDate: '2026-02-30',
        calendarTimeZone: 'UTC',
        workouts: [],
      }),
    ).toThrow();
    expect(() => parseScheduleConstraints({ version: 2 })).toThrow();
  });
  it('reads legacy constraint history without transition provenance and keeps inherited budgets', () => {
    const previous = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [],
      unavailableDates: ['2099-11-23'],
      availableDateOverrides: [],
      effectiveFrom: '2099-11-22',
      confirmation: { source: 'USER', reference: 'old-rule' },
    };
    const metadata = {
      qualityContract: { maxDailyMinutes: 60, requiredSports: ['RUN'] },
      scheduleConstraints: {
        ...previous,
        revision: 2,
        unavailableDates: [],
        effectiveFrom: '2099-11-25',
      },
      qualityContractTransition: { mode: 'INHERIT' },
      scheduleConstraintHistory: [
        {
          scheduleConstraints: null,
          qualityContract: { maxDailyMinutes: 60, requiredSports: ['RUN'] },
        },
        {
          scheduleConstraints: previous,
          qualityContract: { maxDailyMinutes: 60, requiredSports: ['RUN'] },
        },
      ],
    };
    expect(resolveScheduleRulesAtDate(metadata, '2099-11-23')).toMatchObject({
      constraints: { unavailableDates: ['2099-11-23'] },
      qualityContract: { maxDailyMinutes: 60, requiredSports: ['RUN'] },
    });
    expect(resolveScheduleRulesAtDate(metadata, '2099-11-25')).toMatchObject({
      constraints: { unavailableDates: [] },
      qualityContract: { maxDailyMinutes: 60 },
    });
  });
  it('keeps Wednesday and Friday rest rules when a Monday draft starts on Sunday', () => {
    const result = projectPlanCalendar({
      periodWeeks: 1,
      startDate: '2026-11-22',
      calendarTimeZone: 'Asia/Shanghai',
      workouts: [
        { weekIndex: 1, dayIndex: 4 },
        { weekIndex: 1, dayIndex: 6 },
      ],
      constraints: {
        version: 1,
        revision: 1,
        calendarTimeZone: 'Asia/Shanghai',
        fixedRestWeekdays: [3, 5],
        unavailableDates: [],
        availableDateOverrides: [],
        effectiveFrom: '2026-11-16',
        confirmation: { source: 'USER', reference: 'message-1' },
      },
    });
    expect(result.workouts.map((w) => [w.date, w.isoWeekday])).toEqual([
      ['2026-11-25', 3],
      ['2026-11-27', 5],
    ]);
    expect(result.conflicts.map((c) => c.code)).toEqual([
      'FIXED_REST_DAY',
      'FIXED_REST_DAY',
    ]);
    expect(
      result.weeks.map((w) => [
        w.startDate,
        w.days.filter((d) => d.inPlan).length,
      ]),
    ).toEqual([
      ['2026-11-16', 1],
      ['2026-11-23', 6],
    ]);
  });
});
