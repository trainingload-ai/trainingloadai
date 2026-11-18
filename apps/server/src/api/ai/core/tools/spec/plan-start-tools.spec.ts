import { describe, expect, it } from '@jest/globals';
import { planByIdTool } from '../planById.tool';
import { planProposalPreviewTool } from '../planProposalPreview.tool';
import { coachDecisionDraftTool } from '../coachDecisionDraft.tool';
import { resolveCoachActiveSkill } from '../../coach-skill-resolution';
import { toolSchemaValidator } from '../../tool-input-validation';
import { addCalendarDays } from '@shared/plan-calendar';

const request = {
  mode: 'START',
  planId: 'p',
  startDate: '2026-11-22',
  rationale: 'Recent easy training supports this schedule',
  evidenceRefs: [{ type: 'training', label: 'Recent training reviewed' }],
  changes: [],
  additions: [],
  deletions: [],
  preserveUnmentioned: true,
} as const;

describe('saved draft start tools', () => {
  it('resolves the explicit start entry without routing it to new-plan generation', () => {
    expect(
      resolveCoachActiveSkill({
        prompt: 'Review this draft',
        intent: 'plan-start',
      })?.name,
    ).toBe('plan-start');
  });
  it('requires a trusted conversation binding before preview and passes only server context binding', async () => {
    expect(
      await planProposalPreviewTool.validateInput!(
        { coachBranching: {} } as never,
        request as never,
      ),
    ).toMatchObject({ ok: false });
    let received: unknown;
    await planProposalPreviewTool.execute(
      {
        session: { user: { id: 'u' } },
        sid: 's',
        branchId: 'b',
        currentUserMessageId: 'input',
        coachBranching: {
          createPlanProposalPreview: async (args: unknown) => {
            received = args;
            return {};
          },
        },
      } as never,
      request as never,
    );
    expect(received).toMatchObject({
      userId: 'u',
      binding: { sid: 's', branchId: 'b', userMessageId: 'input' },
      request,
    });
  });
  it('accepts the complete server-owned START payload as one coherent decision', async () => {
    expect(
      await coachDecisionDraftTool.validateInput!({} as never, {
        decisionType: 'PLAN_START',
        payload: {
          planId: 'p',
          previewId: 'preview',
          presentation: { rows: [{ name: 'Run' }, { name: 'Strength' }] },
        },
      }),
    ).toEqual({ ok: true });
  });
  it('pages all source identities and revisions with honest coverage for a long plan', async () => {
    const workouts = Array.from({ length: 95 }, (_, i) => ({
      id: `w${i + 1}`,
      revision: i === 80 ? 4 : 1,
      plannedSessionRpe: i === 80 ? 6 : null,
      dayOffset: i,
      sportType: 'RUN',
      status: 'PLANNED',
    }));
    const ctx = {
      session: { user: { id: 'u' } },
      currentTurnCalendar: { date: '2026-11-18', timezone: 'UTC' },
      planQuery: {
        findCoachPlanSnapshot: async () => ({
          id: 'p',
          title: 'Long draft',
          status: 'DRAFT',
          sourceType: 'USER',
          periodWeeks: 20,
          workouts,
        }),
      },
    } as never;
    const first = await planByIdTool.execute(ctx, {
      planId: 'p',
      includeAllWorkouts: true,
    });
    expect(first.workoutInventory).toEqual({
      total: 95,
      offset: 0,
      returned: 40,
      hasMore: true,
      nextOffset: 40,
    });
    const last = await planByIdTool.execute(ctx, {
      planId: 'p',
      includeAllWorkouts: true,
      workoutOffset: 80,
    });
    expect(last.workoutInventory).toEqual({
      total: 95,
      offset: 80,
      returned: 15,
      hasMore: false,
      nextOffset: null,
    });
    expect(last.allWorkouts?.[0]).toMatchObject({
      id: 'w81',
      revision: 4,
      plannedSessionRpe: 6,
    });
  });
});

it('pages effective rule periods separately from workout inventory without truncating the promised date range', async () => {
  const rule = (index: number) => ({
    version: 1,
    revision: index + 1,
    calendarTimeZone: 'UTC',
    fixedRestWeekdays: [],
    unavailableDates: [],
    availableDateOverrides: [],
    effectiveFrom: addCalendarDays('2099-11-01', index),
    confirmation: { source: 'USER', reference: `rule-${index}` },
  });
  const plan = {
    id: 'p',
    title: 'Rules',
    status: 'ACTIVE',
    sourceType: 'USER',
    periodWeeks: 20,
    workouts: [],
    generationMetadata: {
      qualityContract: { maxDailyMinutes: 60 },
      scheduleConstraints: rule(60),
      qualityContractTransition: { mode: 'INHERIT' },
      scheduleConstraintHistory: Array.from({ length: 60 }, (_, index) => ({
        scheduleConstraints: rule(index),
        qualityContract: { maxDailyMinutes: 60 },
        qualityContractTransition: { mode: 'INHERIT' },
      })),
    },
  };
  const ctx = {
    session: { user: { id: 'u' } },
    currentTurnCalendar: { date: '2099-11-01' },
    planQuery: {
      findCoachPlanSnapshot: async () => plan,
      findRelatedCalendarPage: async () => ({
        workouts: [],
        total: 0,
        offset: 0,
        returned: 0,
        hasMore: false,
        nextOffset: null,
      }),
    },
  } as never;
  const input = {
    planId: 'p',
    calendarFrom: '2099-11-01',
    calendarTo: addCalendarDays('2099-11-01', 61),
  };
  const first = await planByIdTool.execute(ctx, input);
  expect(first.scheduleRuleInventory).toEqual({
    total: 61,
    offset: 0,
    returned: 40,
    hasMore: true,
    nextOffset: 40,
  });
  const last = await planByIdTool.execute(ctx, {
    ...input,
    scheduleRuleOffset: 40,
  });
  expect(last.scheduleRuleInventory).toEqual({
    total: 61,
    offset: 40,
    returned: 21,
    hasMore: false,
    nextOffset: null,
  });
  expect(last.scheduleRulePeriods!.at(-1)!.to).toBe(input.calendarTo);
});

describe('START planned session RPE', () => {
  const ctx = {
    session: { user: { id: 'u' } },
    sid: 's',
    branchId: 'b',
    currentUserMessageId: 'input',
    coachBranching: {},
  };
  const workout = {
    weekIndex: 1,
    dayIndex: 1,
    sportType: 'RUN',
    text: 'Easy run',
  };
  const withRpe = (field: 'changes' | 'additions', rpe: unknown) => ({
    ...request,
    [field]:
      field === 'changes'
        ? [
            {
              sourceWorkoutId: 'w',
              expectedRevision: 1,
              workout: { ...workout, plannedSessionRpe: rpe },
            },
          ]
        : [
            {
              candidateKey: 'extra',
              workout: { ...workout, plannedSessionRpe: rpe },
            },
          ],
  });
  it.each(['changes', 'additions'] as const)(
    'rejects invalid RPE in %s at both the schema and direct validation seams',
    async (field) => {
      const validate = toolSchemaValidator(planProposalPreviewTool.parameters!);
      for (const rpe of [0, 11, null, '7']) {
        const input = withRpe(field, rpe);
        expect(validate(input).success).toBe(false);
        expect(
          await planProposalPreviewTool.validateInput!(
            ctx as never,
            input as never,
          ),
        ).toMatchObject({ ok: false });
      }
    },
  );
  it('preserves valid RPE values on changed and added workouts in the trusted preview request', async () => {
    const input = {
      ...withRpe('changes', 1),
      additions: withRpe('additions', 10).additions,
    };
    expect(
      toolSchemaValidator(planProposalPreviewTool.parameters!)(input).success,
    ).toBe(true);
    expect(
      await planProposalPreviewTool.validateInput!(
        ctx as never,
        input as never,
      ),
    ).toEqual({ ok: true });
    let received: unknown;
    await planProposalPreviewTool.execute(
      {
        ...ctx,
        coachBranching: {
          createPlanProposalPreview: async (args: unknown) => {
            received = args;
            return {};
          },
        },
      } as never,
      input as never,
    );
    expect(received).toMatchObject({
      request: {
        changes: [{ workout: { plannedSessionRpe: 1 } }],
        additions: [{ workout: { plannedSessionRpe: 10 } }],
      },
    });
  });
});

it('accepts one complete SCHEDULE proposal and preserves the trusted ordinary-chat binding', async () => {
  const schedule = {
    ...request,
    mode: 'SCHEDULE',
    range: { from: '2099-11-22', to: '2100-06-30' },
  };
  delete (schedule as { startDate?: string }).startDate;
  expect(
    toolSchemaValidator(planProposalPreviewTool.parameters!)(schedule).success,
  ).toBe(true);
  expect(
    await planProposalPreviewTool.validateInput!(
      {
        coachBranching: {},
        sid: 'ordinary',
        branchId: 'b',
        currentUserMessageId: 'user',
      } as never,
      schedule as never,
    ),
  ).toEqual({ ok: true });
  expect(
    await coachDecisionDraftTool.validateInput!({} as never, {
      decisionType: 'PLAN_SCHEDULE',
      payload: {
        planId: 'p',
        previewId: 'preview',
        presentation: { rows: [{ name: 'Run' }, { name: 'Strength' }] },
      },
    }),
  ).toEqual({ ok: true });
});
