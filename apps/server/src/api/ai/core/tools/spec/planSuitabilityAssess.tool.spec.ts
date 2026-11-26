import { describe, expect, it } from '@jest/globals';
import { planSuitabilityAssessTool } from '../planSuitabilityAssess.tool';
import { planWeekTargetsSchema } from '@shared/plan-quality';
import type { AiToolContext } from '../../tool.types';

const constraints = {
  intent: 'RACE_PREP' as const,
  periodWeeks: 12,
  maxTrainingDaysPerWeek: 5,
  maxDailyMinutes: 70,
  requiredSports: ['RUN'] as const,
  strengthPreference: 'AUTO' as const,
  raceDiscipline: 'RUN' as const,
  raceDistance: 'MARATHON',
};

it('gives the coach an actionable planning range while preserving exact athlete budgets', () => {
  const rule = planWeekTargetsSchema.items.properties.durationMinutes.description;
  expect(rule).toContain('50–60');
  expect(rule).toContain('15%');
  expect(rule).toContain('15–20');
  expect(rule).toMatch(/explicitly fixed/i);
});

const evidence = [
  { source: 'PLAN_BRIEF' as const, summary: '12-week marathon brief' },
  {
    source: 'TRAINING_BASELINE' as const,
    summary: 'Four recent weeks with a 55-minute longest run',
  },
];

function ctx() {
  return {
    session: { user: { id: 'user-1' } },
    planSuitability: {},
  } as unknown as AiToolContext;
}

describe('planSuitabilityAssessTool', () => {
  it('budgets the available weekdays before a plan can be READY', async () => {
    const input = {
      status: 'READY' as const, goalSummary: 'Run 10 km', evidence,
      constraints: { ...constraints, requiredSports: ['RUN' as const], periodWeeks: 2, maxTrainingDaysPerWeek: 3,
        maxDailyMinutes: 90, fixedTrainingWeekdays: [1, 3, 6], maxMinutesByIsoWeekday: { 1: 45, 3: 45, 6: 90 } },
      blueprint: { designSummary: 'Use Monday, Wednesday and Saturday', sports: ['RUN' as const],
        weeklyTrainingDays: { min: 2, max: 3 }, longestPlannedSessionMinutes: 75,
        phases: [{ name: 'Endurance', startWeek: 1, endWeek: 2, purpose: 'Build endurance' }],
        weekTargets: [1, 2].map(weekIndex => ({ weekIndex, phase: 'BASE' as const, focus: 'Easy running',
          trainingDays: { min: 2, max: 2 }, durationMinutes: { min: 110, max: 140 } })),
      },
    };
    const context = ctx();
    expect(await planSuitabilityAssessTool.validateInput!(context, input))
      .toMatchObject({ ok: false, code: 'PLAN_SUITABILITY_WEEK_TARGETS_INVALID', message: expect.stringContaining('135') });
    input.blueprint.weekTargets.forEach(week => { week.durationMinutes.max = 135; });
    expect(await planSuitabilityAssessTool.validateInput!(context, input)).toEqual({ ok: true });
    await planSuitabilityAssessTool.execute(context, input);
    expect(context.planSuitability?.latest?.constraints).toMatchObject({ maxMinutesByIsoWeekday: { 1: 45, 3: 45, 6: 90 } });
  });
  it('defines the daily limit as a training budget rather than a fake race duration', () => {
    const properties = planSuitabilityAssessTool.parameters.properties as {
      constraints: {
        properties: { maxDailyMinutes: { description: string } };
      };
      blueprint: {
        properties: {
          longestPlannedSessionMinutes: { description: string };
        };
      };
    };

    expect(
      properties.constraints.properties.maxDailyMinutes.description,
    ).toMatch(/combined duration.*one day/i);
    expect(
      properties.blueprint.properties.longestPlannedSessionMinutes.description,
    ).toContain('Exclude the actual goal event');
  });

  it('uses one week as the continuous preview horizon', async () => {
    const context = { ...ctx(), rollingPlanDraft: true };
    const input = {
      status: 'NEEDS_INPUT' as const,
      goalSummary: 'Build endurance over time',
      constraints: { ...constraints, requiredSports: ['RUN' as const] },
      evidence,
      missingFacts: [{ key: 'availability', reason: 'Confirm fixed rest days' }],
    };
    expect(await planSuitabilityAssessTool.validateInput!(context, input)).toMatchObject({
      ok: false,
      code: 'PLAN_SUITABILITY_CONSTRAINT_CONFLICT',
    });
    expect(await planSuitabilityAssessTool.validateInput!(context, {
      ...input,
      constraints: { ...input.constraints, periodWeeks: 1 },
    })).toEqual({ ok: true });
  });

  it('rejects READY when the blueprint exceeds the agreed session limit', async () => {
    const result = await planSuitabilityAssessTool.validateInput!(ctx(), {
      status: 'READY',
      goalSummary: 'Prepare for a marathon',
      constraints: { ...constraints, requiredSports: ['RUN'] },
      evidence,
      blueprint: {
        designSummary: 'Build then taper',
        sports: ['RUN'],
        weeklyTrainingDays: { min: 4, max: 5 },
        longestPlannedSessionMinutes: 90,
        phases: [
          { name: 'Build', startWeek: 1, endWeek: 9, purpose: 'Build' },
          { name: 'Taper', startWeek: 10, endWeek: 12, purpose: 'Taper' },
        ],
      },
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'PLAN_SUITABILITY_CONSTRAINT_CONFLICT',
      message: expect.stringContaining('90-minute'),
    });
  });

  it.each([
    { label: 'single-session minutes copied to both week totals', longest: 30, firstMax: 30, lastMax: 30, minDays: 2, valid: false },
    { label: 'two short sessions within a larger daily cap', longest: 12, firstMax: 24, lastMax: 24, minDays: 2, valid: true },
    { label: 'a short recovery week followed by a longer week', longest: 30, firstMax: 20, lastMax: 50, minDays: 2, valid: true },
    { label: 'one planned training day can contain the longest session', longest: 30, firstMax: 30, lastMax: 30, minDays: 1, valid: true },
  ])('checks the longest planned session against complete weeks: $label', async ({ longest, firstMax, lastMax, minDays, valid }) => {
    const result = await planSuitabilityAssessTool.validateInput!(ctx(), {
      status: 'READY',
      goalSummary: 'Two weeks of easy running',
      constraints: { ...constraints, periodWeeks: 2, maxTrainingDaysPerWeek: 2, maxDailyMinutes: 30, requiredSports: ['RUN'] },
      evidence,
      blueprint: {
        designSummary: 'Maintain the running habit',
        sports: ['RUN'],
        weeklyTrainingDays: { min: minDays, max: 2 },
        longestPlannedSessionMinutes: longest,
        phases: [{ name: 'Maintenance', startWeek: 1, endWeek: 2, purpose: 'Consistency' }],
        weekTargets: [firstMax, lastMax].map((minutes, index) => ({
          weekIndex: index + 1, phase: 'MAINTENANCE', focus: 'Easy running',
          trainingDays: { min: minDays, max: 2 },
          durationMinutes: { min: minutes, max: minutes },
        })),
      },
    });
    if (valid) expect(result).toEqual({ ok: true });
    else expect(result).toMatchObject({
      code: 'PLAN_SUITABILITY_WEEK_TARGETS_INVALID',
      message: expect.stringContaining('30-minute'),
    });
  });

  it('requires coherent scenario packages instead of a one-field patch', async () => {
    const result = await planSuitabilityAssessTool.validateInput!(ctx(), {
      status: 'NEEDS_ADJUSTMENT',
      goalSummary: 'Prepare for a marathon',
      constraints: { ...constraints, requiredSports: ['RUN'] },
      evidence,
      scenarios: [
        {
          id: 'longer-weekend',
          title: 'Longer weekend sessions',
          recommended: true,
          preserves: ['Marathon goal'],
          changes: ['Long-session availability'],
          whySuitable: 'Creates room for marathon-specific endurance work.',
          tradeoffs: ['More weekend time'],
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'PLAN_SUITABILITY_INVALID',
    });
  });

  it.each([
    { weeks: 8, expected: 'reject' },
    { weeks: 24, expected: 'reject' },
    { weeks: 8, restWeeks: 1, expected: 'reject' },
    { weeks: 8, restWeeks: 1, evidenceIndex: 2, expected: 'accept' },
    { weeks: 2, restWeeks: 1, expected: 'accept' },
    { weeks: 1, expected: 'accept' },
    { weeks: 8, ranged: true, expected: 'accept' },
    { weeks: 8, skill: 'plan-cycle-review', expected: 'accept' },
    { weeks: 8, evidenceIndex: 1, expected: 'reject' },
    { weeks: 8, evidenceIndex: 3, expected: 'reject' },
    { weeks: 8, evidenceIndex: -1, expected: 'reject' },
  ])('checks the evidence for a full cycle of exact weekly totals: %j', async ({
    weeks, restWeeks = 0, evidenceIndex, ranged, skill = 'plan-builder', expected,
  }) => {
    const input = {
      status: 'READY' as const, goalSummary: 'Keep up short runs',
      constraints: { ...constraints, periodWeeks: weeks, requiredSports: ['RUN' as const],
        maxTrainingDaysPerWeek: 2, maxDailyMinutes: 30 },
      evidence: [
        ...evidence,
        { source: 'PLAN_BRIEF' as const, summary: 'The athlete specifies two 12-minute sessions in every training week.' },
      ],
      blueprint: {
        designSummary: 'Short regular sessions', sports: ['RUN' as const], weeklyTrainingDays: { min: 1, max: 2 },
        longestPlannedSessionMinutes: 12, exactWeeklyMinutesEvidenceIndex: evidenceIndex,
        phases: [{ name: 'Maintenance', startWeek: 1, endWeek: weeks, purpose: 'Consistency' }],
        weekTargets: Array.from({ length: weeks }, (_, i) => ({
          weekIndex: i + 1, phase: 'MAINTENANCE' as const, focus: i < restWeeks ? 'Rest' : 'Short runs',
          trainingDays: i < restWeeks ? { min: 0, max: 0 } : { min: 2, max: 2 },
          durationMinutes: i < restWeeks ? { min: 0, max: 0 } : { min: 24, max: ranged && i > 0 ? 30 : 24 },
        })),
      },
    };
    const result = await planSuitabilityAssessTool.validateInput!({ ...ctx(), activeSkillName: skill }, input);
    if (expected === 'accept') expect(result).toEqual({ ok: true });
    else expect(result).toMatchObject({ ok: false, code: 'PLAN_SUITABILITY_WEEK_TARGETS_INVALID',
      message: expect.stringContaining('PLAN_BRIEF') });
  });

  it('stores an auditable READY gate for the current turn', async () => {
    const context = ctx();
    const input = {
      status: 'READY' as const,
      goalSummary: 'Prepare for a marathon',
      constraints: {
        ...constraints,
        maxDailyMinutes: 120,
        requiredSports: ['RUN'] as ('RUN' | 'STRENGTH')[],
      },
      evidence,
      blueprint: {
        designSummary: 'Progressive run build with a taper',
        sports: ['RUN'] as ('RUN' | 'STRENGTH')[],
        weeklyTrainingDays: { min: 4, max: 5 },
        longestPlannedSessionMinutes: 120,
        phases: [
          { name: 'Base', startWeek: 1, endWeek: 3, purpose: 'Consistency' },
          { name: 'Build', startWeek: 4, endWeek: 9, purpose: 'Endurance' },
          { name: 'Taper', startWeek: 10, endWeek: 12, purpose: 'Freshness' },
        ],
        weekTargets: Array.from({ length: 12 }, (_, index) => ({
          weekIndex: index + 1,
          phase: index < 3 ? 'BASE' as const : index < 9 ? 'BUILD' as const : 'TAPER' as const,
          focus: index < 9 ? 'Build endurance' : 'Maintain freshness',
          trainingDays: { min: 4, max: 5 },
          durationMinutes: { min: 120, max: 280 },
        })),
      },
    };

    const { weekTargets, ...withoutWeeks } = input.blueprint;
    for (const blueprint of [withoutWeeks, { ...input.blueprint, weekTargets: weekTargets.slice(1) }]) {
      expect(await planSuitabilityAssessTool.validateInput!(context, { ...input, blueprint })).toMatchObject({
        ok: false,
        code: 'PLAN_SUITABILITY_WEEK_TARGETS_INVALID',
      });
    }
    expect(
      await planSuitabilityAssessTool.validateInput!(context, input),
    ).toEqual({
      ok: true,
    });
    const output = await planSuitabilityAssessTool.execute(context, input);

    expect(output).toMatchObject({
      kind: 'plan_suitability_assessment',
      status: 'READY',
      assessmentId: expect.any(String),
    });
    expect(context.planSuitability?.latest).toMatchObject({
      assessmentId: output.assessmentId,
      status: 'READY',
      constraints: { maxDailyMinutes: 120, periodWeeks: 12 },
      weekTargets,
    });
  });
});
