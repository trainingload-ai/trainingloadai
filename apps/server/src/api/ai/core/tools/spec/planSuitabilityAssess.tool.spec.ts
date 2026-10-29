import { describe, expect, it } from '@jest/globals';
import { planSuitabilityAssessTool } from '../planSuitabilityAssess.tool';
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
    ).toContain('ordinary training-session');
    expect(
      properties.blueprint.properties.longestPlannedSessionMinutes.description,
    ).toContain('Exclude the actual goal event');
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
      },
    };

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
    });
  });
});
