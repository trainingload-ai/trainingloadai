import { describe, expect, it } from '@jest/globals';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { EnduranceWorkoutCodec } from '@/api/workout/codecs/endurance-workout.codec';
import { StrengthWorkoutCodec } from '@/api/workout/codecs/strength-workout.codec';
import { FreeformWorkoutCodec } from '@/api/workout/codecs/freeform-workout.codec';
import { WorkoutService } from '@/api/workout/workout.service';
import { planPhaseProgress, planStagePhaseTool } from '../planStagePhase.tool';
import { validateAiToolInput } from '../../tool.types';
import { presentCoachPlanDraftTool } from '../presentCoachPlanDraft.tool';
import type { AiToolContext } from '../../tool.types';

const id = 'd8a4055e-0e1a-4905-9066-117cd6bd2131';
const limits = { maxDailyMinutes: 45, maxTrainingDaysPerWeek: 1, requiredSports: ['RUN'] };
const session = { dayIndex: 1, sportType: 'RUN', structureKind: 'ENDURANCE',
  name: 'Aerobic run', text: 'work 30m', notes: 'Run for half an hour at an easy conversational pace.', plannedSessionRpe: 4 };
const weeks = Array.from({ length: 12 }, (_, i) => i + 1);
function context() {
  return {
    session: null, activeSkillName: 'plan-builder', i18n: { t: (key: string) => key },
    currentTurnCalendar: { date: '2026-11-26', timezone: 'Asia/Shanghai' },
    workoutDefinitions: new WorkoutDefinitionService(new WorkoutCodecRegistry(
      new EnduranceWorkoutCodec(new WorkoutService({} as never)), new StrengthWorkoutCodec(), new FreeformWorkoutCodec(),
    )),
    planSuitability: { latest: { assessmentId: id, status: 'READY', skillName: 'plan-builder', constraints: { ...limits, requiredSports: [...limits.requiredSports], periodWeeks: 12 },
      weekTargets: weeks.map((weekIndex) => ({ weekIndex, phase: 'BASE', focus: 'Aerobic work',
        durationMinutes: { min: 25, max: 35 }, trainingDays: { min: 1, max: 1 } })),
      phases: [{ name: 'Base', startWeek: 1, endWeek: 8, purpose: 'Develop aerobic capacity' },
        { name: 'Build', startWeek: 9, endWeek: 12, purpose: 'Consolidate endurance' }],
    } },
  } as unknown as AiToolContext;
}

describe('staged fixed plans', () => {
  it('avoids Draft-07 conditional schema keywords and enforces template fields in validateInput', async () => {
    const schemaText = JSON.stringify(planStagePhaseTool.parameters);
    expect(schemaText).not.toContain('"if"');
    expect(schemaText).not.toContain('"then"');
    expect(schemaText).not.toContain('"else"');
    expect(schemaText).not.toContain('"allOf"');

    const result = await validateAiToolInput(
      planStagePhaseTool,
      context(),
      windowInput(1, 4, {
        sessionTemplates: [{ id: 'incomplete_tpl' }],
        workouts: [{ weekIndexes: [1, 2, 3, 4], dayIndex: 1, templateId: 'incomplete_tpl' }],
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
      message: expect.stringContaining('structureKind and non-empty text'),
    });
  });

  it('requires accepted phases before presenting a long plan', async () => {
    const result = await presentCoachPlanDraftTool.validateInput!(context(), {
      assessmentId: id, title: '12 weeks', periodWeeks: 12, qualityContract: limits,
      workouts: [{ ...session, weekIndexes: weeks }],
    });
    expect(result).toMatchObject({ ok: false, code: 'PLAN_PHASE_REQUIRED' });
  });
});

function windowInput(startWeek: number, endWeek: number, changes = {}) {
  return { assessmentId: id, startWeek, endWeek, ...(startWeek === 1 ? { startDate: '2026-11-30' } : {}),
    workouts: [{ ...session, weekIndexes: weeks.slice(startWeek - 1, endWeek) }], ...changes };
}

it('keeps the first confirmed schedule when a later window repeats its calendar rules', async () => {
  const ctx = context();
  const rule = { version: 1, revision: 1, calendarTimeZone: 'Asia/Shanghai',
    effectiveFrom: '2026-11-26', fixedRestWeekdays: [2, 4], unavailableDates: [], availableDateOverrides: [],
    confirmation: { source: 'USER', reference: 'Initial confirmation' } };
  await accept(ctx, windowInput(1, 4, { scheduleConstraints: rule }));
  const repeated = { ...rule, effectiveFrom: '2026-11-30', fixedRestWeekdays: [4, 2],
    confirmation: { source: 'USER', reference: 'Same dates' } };
  expect(await validateAiToolInput(planStagePhaseTool, ctx, windowInput(5, 8, {
    scheduleConstraints: { ...repeated, unavailableDates: ['2027-01-04'] },
  }))).toMatchObject({ ok: false, code: 'PLAN_PHASE_CONSTRAINTS_ALREADY_SET' });
  await accept(ctx, windowInput(5, 8, { scheduleConstraints: repeated }));
  expect(ctx.planSuitability!.stagedPhases!.draft.scheduleConstraints).toEqual(rule);
});

async function accept(ctx: AiToolContext, input: Record<string, unknown>) {
  expect(await validateAiToolInput(planStagePhaseTool, ctx, input)).toEqual({ ok: true });
  return planStagePhaseTool.execute(ctx, input);
}

it('returns precise week-budget feedback before accepting the next four weeks and presents one merged calendar', async () => {
  const ctx = context();
  const { dayIndex: _day, ...template } = session;
  const first = windowInput(1, 4, {
    sessionTemplates: [{ id: 'a', ...template }], workouts: [{ dayIndex: 1, templateId: 'a', weekIndexes: [1, 2, 3, 4] }],
  });
  expect(await accept(ctx, first)).toMatchObject({ kind: 'plan_phase_staged', completedThroughWeek: 4, next: { startWeek: 5, endWeek: 8 } });
  expect(await validateAiToolInput(planStagePhaseTool, ctx, windowInput(9,12))).toMatchObject({ code: 'PLAN_PHASE_OUT_OF_ORDER' });
  const short = windowInput(5, 8, { workouts: [{ ...session, weekIndexes: [5,6,7,8], text: 'work 23m' }] });
  expect(await validateAiToolInput(planStagePhaseTool, ctx, short)).toMatchObject({
    ok: false, modelRepair: expect.stringMatching(/W7, W8 — WEEK_TARGET_DURATION: 23m known, target 25–35m, add 2–12m/),
  });
  expect(planPhaseProgress(ctx)).toMatchObject({ completedThroughWeek: 4, completedWindows: 1 });
  expect(await accept(ctx, windowInput(5, 8, { sessionTemplates: [{ ...template, id: 'a', text: 'work 27m' }],
    workouts: [{ dayIndex: 1, weekIndexes: [5,6,7,8], templateId: 'a' }] }))).toMatchObject({ next: { startWeek: 9 } });
  expect(await accept(ctx, windowInput(9, 12))).toMatchObject({ next: null });
  const request = { assessmentId: id, title: 'Twelve-week plan' };
  expect(await validateAiToolInput(presentCoachPlanDraftTool, ctx, { ...request, workouts: [] })).toMatchObject({ ok: false });
  expect(await validateAiToolInput(presentCoachPlanDraftTool, ctx, request)).toEqual({ ok: true });
  const draft = await presentCoachPlanDraftTool.execute(ctx, request);
  expect(draft.workouts.map(w => [w.weekIndex, w.text])).toEqual(weeks.map(week => [week, week >= 5 && week <= 8 ? 'work 27m' : 'work 30m']));
  expect(draft.qualityReport?.valid).toBe(true);
});

it('compares recovery against the preceding accepted window, and retains plan-wide disciplines until the final check', async () => {
  const ctx = context();
  const assessment = ctx.planSuitability!.latest!;
  assessment.weekTargets![4].phase = 'RECOVERY';
  assessment.constraints.requiredSports.push('STRENGTH');
  await accept(ctx, windowInput(1, 4));
  expect(await validateAiToolInput(planStagePhaseTool, ctx, windowInput(5, 8))).toMatchObject({
    ok: false, feedback: expect.arrayContaining([expect.objectContaining({ code: 'RECOVERY_NOT_REDUCED',
      target: { scope: 'WEEK', weekIndex: 5 } })]),
  });
  await accept(ctx, windowInput(5, 8, { workouts: [{ ...session, weekIndexes: [6,7,8] }, { ...session, weekIndex: 5, text: 'work 25m' }] }));
  expect(await validateAiToolInput(planStagePhaseTool, ctx, windowInput(9, 12))).toMatchObject({
    ok: false, feedback: expect.arrayContaining([expect.objectContaining({ code: 'MISSING_DISCIPLINE' })]),
  });
  assessment.assessmentId = '3edd8590-af13-4829-8af0-70785a3cc616';
  expect(planPhaseProgress(ctx)).toMatchObject({ completedThroughWeek: 0, next: { startWeek: 1 } });
  expect(await validateAiToolInput(planStagePhaseTool, ctx, windowInput(9, 12))).toMatchObject({ ok: false, code: 'PLAN_PHASE_REQUIRED' });
});

it.each([
  { phaseTotal: { min: 330, max: 335 }, minutes: 35, finalMinutes: 25, repairMinutes: 28 },
  { phaseTotal: { min: 367, max: 380 }, minutes: 25, finalMinutes: 32, repairMinutes: 30 },
])('keeps the remaining weekly targets achievable for a phase totaling $phaseTotal.min–$phaseTotal.max minutes', async ({
  phaseTotal, minutes, finalMinutes, repairMinutes,
}) => {
  const ctx = context();
  ctx.planSuitability!.latest!.phases = [
    { name: 'Base', startWeek: 1, endWeek: 12, purpose: 'Build endurance', durationMinutes: phaseTotal },
  ];
  const timedWindow = (start: number, end: number, duration: number) => windowInput(start, end, {
    workouts: [{ ...session, weekIndexes: weeks.slice(start - 1, end), text: `work ${duration}m` }],
  });
  await accept(ctx, timedWindow(1, 4, 30));
  expect(await validateAiToolInput(planStagePhaseTool, ctx, timedWindow(5, 8, minutes))).toMatchObject({
    ok: false, feedback: expect.arrayContaining([expect.objectContaining({
      code: 'PHASE_TARGET_DURATION', target: { scope: 'BLOCK', firstWeek: 5, lastWeek: 8 },
    })]),
  });
  expect(planPhaseProgress(ctx)).toMatchObject({ completedThroughWeek: 4 });
  await accept(ctx, timedWindow(5, 8, repairMinutes));
  await accept(ctx, timedWindow(9, 12, finalMinutes));
});

it('accepts an explicitly empty opening phase and still validates the complete plan', async () => {
  const ctx = context();
  const assessment = ctx.planSuitability!.latest!;
  assessment.phases = [{ name: 'Rest', purpose: 'No scheduled training', startWeek: 1, endWeek: 2 },
    { name: 'Train', purpose: 'Build gradually', startWeek: 3, endWeek: 12 }];
  for (const target of assessment.weekTargets!.slice(0, 2)) {
    target.phase = 'RECOVERY';
    target.durationMinutes = { min: 0, max: 0 };
    target.trainingDays = { min: 0, max: 0 };
  }
  expect(await accept(ctx, windowInput(1, 2, { workouts: [] }))).toMatchObject({ next: { startWeek: 3, endWeek: 6 } });
  for (const [startWeek, endWeek] of [[3,6], [7,10], [11,12]]) await accept(ctx, windowInput(startWeek, endWeek));
  expect(await validateAiToolInput(presentCoachPlanDraftTool, ctx, { assessmentId: id, title: 'Return to training' })).toEqual({ ok: true });
});

it('requires every discipline before locking the last window that allows training', async () => {
  const ctx = context();
  const assessment = ctx.planSuitability!.latest!;
  assessment.constraints.requiredSports.push('CYCLING');
  for (const target of assessment.weekTargets!.slice(8)) {
    target.phase = 'RECOVERY';
    target.trainingDays = { min: 0, max: 0 };
    target.durationMinutes = { min: 0, max: 0 };
  }
  await accept(ctx, windowInput(1, 4));
  expect(await validateAiToolInput(planStagePhaseTool, ctx, windowInput(5, 8))).toMatchObject({
    ok: false, modelRepair: expect.stringContaining('requires CYCLING'),
  });
  expect(planPhaseProgress(ctx)?.completedThroughWeek).toBe(4);
  await accept(ctx, windowInput(5, 8, { workouts: [
    { ...session, weekIndexes: [5, 6, 7] },
    { ...session, weekIndex: 8, sportType: 'CYCLING', name: 'Easy ride', notes: 'Ride easily for thirty minutes.' },
  ] }));
  await accept(ctx, windowInput(9, 12, { workouts: [] }));
});

it('reuses unchanged definitions from a rejected window when retrying its complete schedule', async () => {
  const ctx = context();
  const { dayIndex: _day, ...template } = session;
  const workouts = [{ weekIndexes: [1,2], dayIndex: 1, templateId: 'ok' }, { weekIndexes: [3,4], dayIndex: 1, templateId: 'short' }];
  const rejected = windowInput(1, 4, { workouts, sessionTemplates: [
    { ...template, id: 'ok' }, { ...template, id: 'short', text: 'work 20m' },
  ] });
  expect(await validateAiToolInput(planStagePhaseTool, ctx, rejected)).toMatchObject({ ok: false, code: 'PLAN_QUALITY_INVALID' });
  await accept(ctx, windowInput(1, 4, { workouts, sessionTemplates: [{ ...template, id: 'short', text: 'work 25m' }] }));
  expect(planPhaseProgress(ctx)?.completedThroughWeek).toBe(4);
});

it('repairs the rejected week 11 swim templates while retaining their calendar and prior accepted sessions', async () => {
  const ctx = context();
  const assessment = ctx.planSuitability!.latest!;
  assessment.constraints.maxTrainingDaysPerWeek = 2;
  const { dayIndex: _day, ...swim } = { ...session, sportType: 'SWIM', sportDefinitionCode: 'POOL_SWIMMING' };
  const endurance = 'warmup 5m\nwork 12m\nrecovery 2m\nwork 12m\ncooldown 4m';
  const quality = 'warmup 5m\nrepeat 5 {\n  work 2m\n  recovery 30s\n}\nrecovery 2m\nwork 6m\ncooldown 3m';
  const change = { assessmentId: id, startWeek: 9, endWeek: 12, sessionTemplates: [
    { id: 'T11_END40', text: endurance.replace('12m', '14m'), notes: 'Swim fourteen minutes, recover, then swim twelve minutes.' },
  ] };
  await accept(ctx, windowInput(1, 4));
  await accept(ctx, windowInput(5, 8, {
    sessionTemplates: [{ ...swim, id: 'T11_END40', text: endurance }],
    workouts: [{ weekIndexes: [5, 6, 7, 8], isoWeekday: 6, templateId: 'T11_END40' }],
  }));
  assessment.weekTargets![10].durationMinutes = { min: 65, max: 75 };
  assessment.weekTargets![10].trainingDays = { min: 2, max: 2 };
  expect(await validateAiToolInput(planStagePhaseTool, ctx, change)).toMatchObject({ ok: false });
  const submitted = windowInput(9, 12, {
    sessionTemplates: [{ ...swim, id: 'T11_QUAL30', text: quality }],
    workouts: [
      { ...session, weekIndexes: [9, 10, 12] },
      { weekIndex: 11, isoWeekday: 2, templateId: 'T11_QUAL30' },
      { weekIndex: 11, isoWeekday: 6, templateId: 'T11_END40' },
    ],
  });
  expect(await validateAiToolInput(planStagePhaseTool, ctx, submitted)).toMatchObject({
    ok: false, modelRepair: expect.stringContaining('63.5m known, target 65–75m'),
  });
  for (const sessionTemplates of [[], [{ id: 'T11_END40' }], [{ id: 'T11_END40', text: endurance }], [{ id: 'NEW', text: 'work 35m' }]]) {
    expect(await validateAiToolInput(planStagePhaseTool, ctx, { ...change, sessionTemplates })).toMatchObject({ ok: false });
  }
  expect(await validateAiToolInput(planStagePhaseTool, ctx, { ...change, sessionTemplates: [
    { id: 'T11_END40', text: ' ' },
  ] })).toMatchObject({ ok: false });
  expect(await validateAiToolInput(planStagePhaseTool, ctx, { ...change, sessionTemplates: [
    { id: 'T11_END40', text: endurance.replace('12m', '13m') },
  ] })).toMatchObject({ ok: false, modelRepair: expect.stringContaining('64.5m known') });
  await accept(ctx, change);
  const draft = ctx.planSuitability!.stagedPhases!.draft;
  expect(draft.workouts.filter(w => w.weekIndex === 11)).toMatchObject([
    { dayIndex: 2, text: quality },
    { dayIndex: 6, text: change.sessionTemplates[0].text, notes: change.sessionTemplates[0].notes, structureKind: 'ENDURANCE' },
  ]);
  expect(draft.workouts.filter(w => w.weekIndex >= 5 && w.weekIndex <= 8).map(w => w.text)).toEqual(Array(4).fill(endurance));
  expect(await validateAiToolInput(planStagePhaseTool, ctx, change)).toMatchObject({ ok: false });
});

it('retains the opening date and confirmed exceptions when a template-only repair succeeds', async () => {
  const ctx = context();
  const { dayIndex: _day, ...template } = session;
  const rule = { version: 1, revision: 1, calendarTimeZone: 'Asia/Shanghai',
    effectiveFrom: '2026-11-26', fixedRestWeekdays: [2, 4], unavailableDates: ['2026-12-01'], availableDateOverrides: [],
    confirmation: { source: 'USER', reference: 'Original confirmation' } };
  expect(await validateAiToolInput(planStagePhaseTool, ctx, windowInput(1, 4, { scheduleConstraints: rule,
    sessionTemplates: [{ ...template, id: 'short', text: 'work 20m' }],
    workouts: [{ weekIndexes: [1, 2, 3, 4], isoWeekday: 1, templateId: 'short' }],
  }))).toMatchObject({ ok: false, code: 'PLAN_QUALITY_INVALID' });
  await accept(ctx, { assessmentId: id, startWeek: 1, endWeek: 4, sessionTemplates: [{ id: 'short', text: 'work 30m' }] });
  expect(ctx.planSuitability!.stagedPhases!.draft).toMatchObject({
    qualityContract: { startDate: '2026-11-30' }, scheduleConstraints: rule,
  });
});

it('explains all eight swim sessions from the rejected first phase, including both over-budget days', async () => {
  const ctx = context();
  const assessment = ctx.planSuitability!.latest!;
  assessment.constraints = { ...assessment.constraints, maxDailyMinutes: 40, maxTrainingDaysPerWeek: 2, requiredSports: ['SWIM'] };
  for (const target of assessment.weekTargets!) {
    target.durationMinutes = { min: 70, max: 80 };
    target.trainingDays = { min: 2, max: 2 };
  }
  const logged = [[10, 30], [16, 40], [17, 30], [18, 40], [21, 30], [24, 30], [26, 30], [32, 30]];
  function swim(workCount: number, rest: number) {
    return ['warmup 5m', ...Array.from({ length: workCount }, (_, index) => index ? ['recovery ' + rest + 's', 'work 2m'] : ['work 2m']).flat(), 'cooldown 5m'].join('\n');
  }
  const workouts = logged.map(([count, rest], index) => ({ ...session, name: 'Pool intervals', sportType: 'SWIM', text: swim(count, rest),
    weekIndex: 1 + Math.floor(index / 2), dayIndex: index % 2 ? 5 : 1 }));
  const result = await validateAiToolInput(planStagePhaseTool, ctx, windowInput(1, 4, {
    sessionTemplates: workouts.map(({ weekIndex, dayIndex, ...workout }, i) => ({ ...workout, id: `swim_${i}` })),
    workouts: workouts.map(({ weekIndex, dayIndex }, i) => ({ weekIndex, dayIndex, templateId: `swim_${i}` })),
  }));
  if (result.ok !== false) throw new Error('Expected the original eight workouts to be rejected');
  expect(result.modelRepair).toContain('16 × 2m + 15 × 40s');
  expect(result.modelRepair).toContain('16→11 work reps');
  expect(result.modelRepair).toMatch(/W2.*change together.*17→12 work reps.*39m30s.*18→11 work reps.*38m40s.*78m10s/);
  expect(result.modelRepair).toMatch(/W3.*change together.*21→12 work reps.*24→12 work reps.*79m/);
  expect(result.modelRepair).toMatch(/W4.*change together.*26→12 work reps.*32→12 work reps.*79m/);
  const preview = result.modelRepair?.match(/swim_7: (warmup 5m\nrepeat 31 \{[\s\S]*?cooldown 5m)/)?.[1];
  expect(preview).toBeDefined();
  expect(ctx.workoutDefinitions.resolve({ kind: 'ENDURANCE', version: 1, source: 'TEXT', text: preview! }).summary.durationSeconds).toBe(5370);
  const compact = await validateAiToolInput(planStagePhaseTool, ctx, windowInput(1, 4, { workouts: workouts.map((w, i) => ({
    ...w, text: `warmup 5m\nrepeat ${logged[i][0] - 1} {\nwork 2m\nrecovery ${logged[i][1]}s\n}\nwork 2m\ncooldown 5m`,
  })) }));
  expect(compact).toMatchObject({ ok: false, modelRepair: expect.stringMatching(/W2.*17→12 work reps.*18→11 work reps.*78m10s/) });
  const chosen = [10, 11, 12, 11, 12, 12, 12, 12];
  await accept(ctx, windowInput(1, 4, { workouts: workouts.map((w,i) => ({...w, text: swim(chosen[i], logged[i][1])})) }));
});
