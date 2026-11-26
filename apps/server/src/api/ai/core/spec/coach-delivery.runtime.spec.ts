import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test';
import { emitToolStepMessages, streamCoachAnswer } from '../tool-loop-agent.runtime';
import { createAiSdkCoachTools } from '../ai-sdk-tool-adapter';
import type { AiToolContext, AiToolDef } from '../tool.types';
import type { CoachQueryYield } from '../coach-query-yield';
import { CoachRunProjector, coachSnapshotChunks } from '../coach-run-projector';
import { readUIMessageStream } from 'ai';
import type { CoachUiChunk, CoachUiMessage } from '../coach-ui-message-stream';
import { buildHistoryMessages } from '../coach-history-messages';
import { askUserQuestionTool } from '../tools/askUserQuestion.tool';
import { planSuitabilityAssessTool, planSuitabilityQuestionReviewTool } from '../tools/planSuitabilityAssess.tool';
import { presentCoachPlanDraftTool } from '../tools/presentCoachPlanDraft.tool';
import { planStagePhaseTool } from '../tools/planStagePhase.tool';
import { skillActivateTool } from '../tools/skillActivate.tool';
import { getCoachSkillByName } from '../skill.registry';
import { presentTrainingVisualizationTool } from '../tools/presentTrainingVisualization.tool';
import { sanitizeStoredCoachMessageForClient } from '../coach-history-messages';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { EnduranceWorkoutCodec } from '@/api/workout/codecs/endurance-workout.codec';
import { StrengthWorkoutCodec } from '@/api/workout/codecs/strength-workout.codec';
import { FreeformWorkoutCodec } from '@/api/workout/codecs/freeform-workout.codec';
import { WorkoutService } from '@/api/workout/workout.service';

let model: MockLanguageModelV3;
type StreamChunk =
  Awaited<
    ReturnType<MockLanguageModelV3['doStream']>
  >['stream'] extends ReadableStream<infer T>
    ? T
    : never;
jest.mock('../coach-upstream.adapter', () => ({
  ...jest.requireActual<typeof import('../coach-upstream.adapter')>(
    '../coach-upstream.adapter',
  ),
  getCoachModel: () => 'test-primary',
  getCoachUpstreamProvider: () => 'openrouter',
  createCoachLanguageModel: () => model,
  getCoachBaseUrlForLog: () => 'test',
}));

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};
const ctx = (): AiToolContext =>
  ({
    signal: new AbortController().signal,
    lang: 'zh',
    session: { user: { id: 'test' } },
    userService: { getPreferredTimezone: async () => 'UTC' },
    i18n: { t: (key: string) => key },
  }) as unknown as AiToolContext;
const draft = {
  kind: 'coach_plan_draft',
  title: '恢复跑步习惯',
  description: '每周三次轻松训练，训练日之间留出恢复时间。',
  periodWeeks: 6,
  workouts: [],
};
const finalText =
  '根据你恢复跑步习惯的目标，这份草案每周安排三次轻松训练，并在训练日之间留出恢复时间。请先检查安排，确认后点击保存草案；目前尚未保存。';
const tool = (execute: AiToolDef['execute']): AiToolDef => ({
  name: 'present_coach_plan_draft',
  kind: 'read',
  cost: 'low',
  description: 'present draft',
  parameters: {
    type: 'object',
    properties: { title: { type: 'string' } },
    additionalProperties: false,
  },
  execute,
});

function setupModel(
  mode: 'text' | 'empty' | 'error' = 'text',
  callCount = 1,
  toolName = 'present_coach_plan_draft',
  publicPrelude?: string,
  finalAnswer = finalText,
) {
  const responses: Awaited<ReturnType<MockLanguageModelV3['doStream']>>[] = [
    {
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        ...(publicPrelude
          ? [
              { type: 'reasoning-start' as const, id: 'private' },
              {
                type: 'reasoning-delta' as const,
                id: 'private',
                delta: 'PRIVATE_REASONING_DO_NOT_PUBLISH',
              },
              { type: 'reasoning-end' as const, id: 'private' },
              { type: 'text-start' as const, id: 'public' },
              {
                type: 'text-delta' as const,
                id: 'public',
                delta: publicPrelude,
              },
              { type: 'text-end' as const, id: 'public' },
            ]
          : []),
        ...Array.from({ length: callCount }, (_, index) => ({
          type: 'tool-call' as const,
          toolCallId: `draft-${index}`,
          toolName,
          input: JSON.stringify({ title: draft.title }),
        })),
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage,
        },
      ]),
    },
    {
      stream: convertArrayToReadableStream<StreamChunk>(
        mode === 'error'
          ? [
              {
                type: 'error',
                error: Object.assign(new Error('rate limited'), {
                  status: 429,
                }),
              },
            ]
          : [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'summary' },
              {
                type: 'text-delta',
                id: 'summary',
                delta: mode === 'empty' ? '' : finalAnswer,
              },
              { type: 'text-end', id: 'summary' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage,
              },
            ],
      ),
    },
  ];
  let call = 0;
  model = new MockLanguageModelV3({
    doStream: async () => responses[call++],
  });
}

function longPlanContext() {
  const context = ctx();
  context.planSuitability = { latest: {
    assessmentId: 'long-assessment', status: 'READY', skillName: 'plan-builder',
    constraints: { periodWeeks: 12, maxDailyMinutes: 45, maxTrainingDaysPerWeek: 1,
      requiredSports: ['RUN'], strengthPreference: 'EXCLUDE' },
    phases: [{ name: 'Base', startWeek: 1, endWeek: 12, purpose: 'Build endurance' }],
    weekTargets: Array.from({ length: 12 }, (_, index) => ({
      weekIndex: index + 1, focus: 'Aerobic work', phase: 'BASE' as const,
      durationMinutes: { min: 25, max: 35 }, trainingDays: { min: 1, max: 1 },
    })),
  } };
  return context;
}

describe('real AI SDK delivery loop', () => {
  it('reassesses a staged plan from the original conversation when the primary model is rate limited', async () => {
    const context = ctx();
    context.planSuitability = {};
    context.workoutDefinitions = new WorkoutDefinitionService(new WorkoutCodecRegistry(
      new EnduranceWorkoutCodec(new WorkoutService({} as never)), new StrengthWorkoutCodec(), new FreeformWorkoutCodec(),
    ));
    context.coachTools = {
      currentTime: async () => ({ user: { date: '2026-11-30' } }),
      competitionImpactResolve: async () => ({}),
    } as unknown as AiToolContext['coachTools'];
    const weekTargets = Array.from({ length: 12 }, (_, i) => ({
      weekIndex: i + 1, phase: 'BASE', focus: 'Aerobic base',
      trainingDays: { min: 1, max: 1 }, durationMinutes: { min: 25, max: 35 },
    }));
    const assessment = {
      status: 'READY', goalSummary: 'Build aerobic endurance',
      constraints: { intent: 'FITNESS_BUILD', periodWeeks: 12, maxTrainingDaysPerWeek: 1, maxDailyMinutes: 45,
        fixedTrainingWeekdays: null, requiredSports: ['RUN'], strengthPreference: 'EXCLUDE' },
      evidence: [{ source: 'USER_REPORTED_BASELINE', summary: 'Runs once a week' }],
      blueprint: { designSummary: 'Easy aerobic runs', sports: ['RUN'], weeklyTrainingDays: { min: 1, max: 1 },
        longestPlannedSessionMinutes: 30, weekTargets,
        phases: [{ name: 'Base', purpose: 'Build endurance', startWeek: 1, endWeek: 12 }] },
    };
    const phaseIds: string[] = [];
    let limited = false;
    model = new MockLanguageModelV3({
      doStream: async ({ prompt, tools }) => {
        const result = prompt.filter((message) => message.role === 'tool').at(-1)?.content.at(-1);
        const output = result?.output.type === 'text' ? JSON.parse(result.output.value) : undefined;
        const parts: StreamChunk[] = [{ type: 'stream-start', warnings: [] }];
        const call = (toolName: string, input: object) => parts.push({
          type: 'tool-call', toolCallId: `call-${model.doStreamCalls.length}`, toolName, input: JSON.stringify(input),
        });
        if (!limited && output?.completedThroughWeek === 4) {
          limited = true;
          parts.push({ type: 'error', error: Object.assign(new Error('rate limited'), { status: 429 }) });
          return { stream: convertArrayToReadableStream(parts) };
        }
        if (!tools?.length) {
          parts.push({ type: 'text-start', id: 'a' }, { type: 'text-delta', id: 'a', delta: finalText }, { type: 'text-end', id: 'a' });
        } else if (!output) {
          expect(tools.map(({ name }) => name)).toContain('plan_suitability_assess');
          call('plan_suitability_assess', assessment);
        } else if (output.next) {
          const { startWeek, endWeek } = output.next;
          if (startWeek === 1) phaseIds.push(output.assessmentId);
          call('plan_stage_phase', {
            assessmentId: output.assessmentId, startWeek, endWeek, ...(startWeek === 1 ? { startDate: '2026-11-30' } : {}),
            workouts: [{ weekIndexes: output.next.weekTargets.map((w: { weekIndex: number }) => w.weekIndex),
              dayIndex: 1, sportType: 'RUN', structureKind: 'ENDURANCE', text: 'work 30m', notes: 'Run easily for 30 minutes.' }],
          });
        } else {
          expect(output.kind).toBe('plan_phase_staged');
          call('present_coach_plan_draft', { assessmentId: output.assessmentId, title: 'Aerobic base' });
        }
        parts.push({ type: 'finish', finishReason: { unified: tools?.length ? 'tool-calls' : 'stop', raw: undefined }, usage });
        return { stream: convertArrayToReadableStream(parts) };
      },
    });
    const env = jest.replaceProperty(process, 'env', { ...process.env, OPENROUTER_DEFAULT_FALLBACK_MODELS: 'test-fallback' });
    try {
      const events: CoachQueryYield[] = [];
      for await (const event of streamCoachAnswer({
        ctx: context, activeSkill: getCoachSkillByName('plan-builder'),
        tools: [planSuitabilityAssessTool, planStagePhaseTool, presentCoachPlanDraftTool],
        messages: [{ role: 'user', content: '安排十二周跑步训练，每周一次。' }],
      })) events.push(event);
      expect(limited).toBe(true);
      expect(new Set(phaseIds).size).toBe(2);
      expect(context.planSuitability.stagedPhases).toMatchObject({ assessmentId: phaseIds[1], completedThroughWeek: 12 });
      expect(events.at(-1)).toMatchObject({ type: 'result', is_error: false, model: 'test-fallback' });
    } finally {
      env.restore();
    }
  });
  it('emits one assembled card when the provider repeats the final tool call', async () => {
    const context = longPlanContext();
    context.planSuitability!.stagedPhases = {
      assessmentId: 'long-assessment', completedThroughWeek: 12, completedWindows: 3,
      draft: { ...draft, periodWeeks: 12 }, templates: [],
    };
    setupModel('text', 2);
    const cards = [];
    for await (const event of streamCoachAnswer({
      ctx: context, activeSkill: getCoachSkillByName('plan-builder'),
      tools: [tool(async () => ({ ...draft, periodWeeks: 12 })), planStagePhaseTool],
      messages: [{ role: 'user', content: '给我十二周的训练计划' }],
    })) {
      if (event.type === 'assistant') cards.push(...event.message.content.filter(
        (block) => block.type === 'tool_use' && block.name === 'PresentCoachPlanDraft',
      ));
    }
    expect(cards).toHaveLength(1);
    expect(model.doStreamCalls[0].tools).toMatchObject([{
      name: 'present_coach_plan_draft', inputSchema: {
        additionalProperties: false, required: ['assessmentId', 'title'],
      },
    }]);
    const finalSchema = model.doStreamCalls[0].tools?.[0].inputSchema as { properties: Record<string, unknown> };
    expect(Object.keys(finalSchema.properties).sort()).toEqual(['assessmentId', 'description', 'title']);
  });

  it('withholds a final answer if the model stops before delivering the assembled plan', async () => {
    const context = longPlanContext();
    model = new MockLanguageModelV3({
      doStream: async () => ({ stream: convertArrayToReadableStream<StreamChunk>([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'answer' },
        { type: 'text-delta', id: 'answer', delta: '你的十二周草案已经准备好了。' },
        { type: 'text-end', id: 'answer' },
        { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
      ]) }),
    });
    const events: CoachQueryYield[] = [];
    for await (const event of streamCoachAnswer({
      ctx: context, activeSkill: getCoachSkillByName('plan-builder'),
      tools: [planStagePhaseTool, presentCoachPlanDraftTool],
      messages: [{ role: 'user', content: '给我十二周的训练计划' }],
    })) events.push(event);
    expect(model.doStreamCalls[0].tools?.map(({ name }) => name)).toEqual(['plan_stage_phase']);
    expect(events.at(-1)).toMatchObject({ type: 'result', is_error: true });
    expect(events.filter((event) => event.type === 'stream_event')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ event: expect.objectContaining({ type: 'text_delta' }) })]),
    );
  });

  it('exposes plan_suitability_assess as a reassess escape hatch after a phase window is rejected', async () => {
    const context = longPlanContext();
    context.planSuitability!.rejectedPhase = {
      assessmentId: 'long-assessment',
      startWeek: 1,
      endWeek: 4,
      startDate: '2026-11-30',
      templates: [],
      workouts: [],
    };
    model = new MockLanguageModelV3({
      doStream: async () => ({ stream: convertArrayToReadableStream<StreamChunk>([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'answer' },
        { type: 'text-delta', id: 'answer', delta: 'stop' },
        { type: 'text-end', id: 'answer' },
        { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
      ]) }),
    });
    for await (const _event of streamCoachAnswer({
      ctx: context, activeSkill: getCoachSkillByName('plan-builder'),
      tools: [planSuitabilityAssessTool, planStagePhaseTool, presentCoachPlanDraftTool],
      messages: [{ role: 'user', content: '给我十二周的训练计划' }],
    })) {
      // consume stream
    }
    expect(model.doStreamCalls[0].tools?.map(({ name }) => name).sort()).toEqual([
      'plan_stage_phase',
      'plan_suitability_assess',
    ]);
    expect(model.doStreamCalls[0].toolChoice).toEqual({ type: 'required' });
  });

  it('loads plan-builder before exposing the new-plan workflow in ordinary chat', async () => {
    const context = { ...ctx(), planSuitability: {} } as AiToolContext;
    const present = {
      ...tool(async () => draft),
      applicableSkills: presentCoachPlanDraftTool.applicableSkills,
      requiresActiveSkill: presentCoachPlanDraftTool.requiresActiveSkill,
    };
    const calls = [
      { toolName: 'skill_activate', input: { name: 'plan-builder' } },
      { toolName: 'plan_suitability_assess', input: {
        status: 'READY', goalSummary: 'Build a consistent running habit',
        constraints: {
          intent: 'FITNESS_BUILD', periodWeeks: 1, maxTrainingDaysPerWeek: 2,
          maxDailyMinutes: 30, fixedTrainingWeekdays: null,
          requiredSports: ['RUN'], strengthPreference: 'EXCLUDE',
        },
        evidence: [{ source: 'USER_REPORTED_BASELINE', summary: 'Runs twice per week' }],
        blueprint: {
          designSummary: 'Easy running', sports: ['RUN'],
          weeklyTrainingDays: { min: 2, max: 2 }, longestPlannedSessionMinutes: 25,
          phases: [{ name: 'Base', startWeek: 1, endWeek: 1, purpose: 'Build consistency' }],
        },
      } },
      { toolName: 'present_coach_plan_draft', input: { title: draft.title } },
    ];
    let step = 0;
    model = new MockLanguageModelV3({
      doStream: async () => {
        const current = calls[step++];
        return { stream: convertArrayToReadableStream<StreamChunk>([
          { type: 'stream-start', warnings: [] },
          ...(current ? [{
            type: 'tool-call' as const, toolCallId: `plan-${step}`,
            toolName: current.toolName, input: JSON.stringify(current.input),
          }] : [
            { type: 'text-start' as const, id: 'answer' },
            { type: 'text-delta' as const, id: 'answer', delta: finalText },
            { type: 'text-end' as const, id: 'answer' },
          ]),
          { type: 'finish', finishReason: { unified: current ? 'tool-calls' : 'stop', raw: undefined }, usage },
        ]) };
      },
    });

    const events: CoachQueryYield[] = [];
    for await (const event of streamCoachAnswer({
      ctx: context, tools: [skillActivateTool, planSuitabilityAssessTool, present],
      messages: [{ role: 'user', content: '帮我做一份跑步计划' }],
    })) events.push(event);

    const [routing, planning] = model.doStreamCalls;
    expect(routing.tools?.map((item) => item.name)).toEqual(['skill_activate']);
    expect(JSON.stringify(routing.prompt)).not.toContain('# Plan draft payload contract');
    expect(planning.tools?.map((item) => item.name)).toEqual(expect.arrayContaining([
      'plan_suitability_assess', 'present_coach_plan_draft',
    ]));
    expect(JSON.stringify(planning.prompt)).toContain('# Active skill: plan-builder');
    expect(JSON.stringify(planning.prompt)).toContain('# Plan draft payload contract');
    expect(context.planSuitability?.latest).toMatchObject({ status: 'READY', skillName: 'plan-builder' });
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({
      type: 'assistant', message: expect.objectContaining({ content: expect.arrayContaining([
        expect.objectContaining({ type: 'tool_use', name: 'PresentCoachPlanDraft' }),
      ]) }),
    })]));
  });

  it.each(['exhausted', 'abandoned'] as const)(
    'does not report a chart as completed when repair is %s',
    async (mode) => {
      let calls = 0;
      model = new MockLanguageModelV3({
        doStream: async () => {
          calls += 1;
          if (calls > 3) throw new Error('chart repair budget exceeded');
          return {
            stream: convertArrayToReadableStream<StreamChunk>(
              mode === 'abandoned' && calls === 2
                ? [
                    { type: 'stream-start', warnings: [] },
                    { type: 'text-start', id: 'answer' },
                    {
                      type: 'text-delta',
                      id: 'answer',
                      delta: '这次没有生成图表。',
                    },
                    { type: 'text-end', id: 'answer' },
                    {
                      type: 'finish',
                      finishReason: { unified: 'stop', raw: 'stop' },
                      usage,
                    },
                  ]
                : [
                    { type: 'stream-start', warnings: [] },
                    {
                      type: 'tool-call',
                      toolCallId: `chart-${calls}`,
                      toolName: 'present_training_visualization',
                      input: JSON.stringify({
                        source: 'PMC',
                        intent: 'TREND',
                        from: '2026-04-09',
                        to: '2026-10-09',
                        measures: ['CTL'],
                      }),
                    },
                    {
                      type: 'finish',
                      finishReason: {
                        unified: 'tool-calls',
                        raw: 'tool_calls',
                      },
                      usage,
                    },
                  ],
            ),
          };
        },
      });
      const execute = jest.fn<AiToolDef['execute']>(async () => ({}));
      const events: CoachQueryYield[] = [];
      for await (const event of streamCoachAnswer({
        ctx: ctx(),
        tools: [{ ...presentTrainingVisualizationTool, execute }],
        messages: [{ role: 'user', content: '看看负荷图' }],
      }))
        events.push(event);
      expect(calls).toBe(mode === 'exhausted' ? 3 : 2);
      expect(execute).not.toHaveBeenCalled();
      expect(
        events.filter((event) => event.type === 'result').at(-1),
      ).toMatchObject({
        is_error: true,
        error_code: 'invalid_ui_surface_payload',
      });
    },
  );
  it.each([false, true])(
    'handles real schema repair, persists each attempt and only exposes the final outcome (exhausted=%s)',
    async (exhausted) => {
      const valid = {
        questions: [
          {
            id: 'goal',
            header: '目标',
            question: '下一步做什么？',
            options: [
              {
                value: 'view',
                label: '看看记录',
                description: '先了解近期训练',
              },
              { value: 'plan', label: '制定计划', description: '安排后续训练' },
            ],
          },
        ],
      };
      let calls = 0;
      model = new MockLanguageModelV3({
        doStream: async () => {
          calls += 1;
          if (calls > 4) throw new Error('repair budget was not bounded');
          return {
            stream: convertArrayToReadableStream<StreamChunk>([
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-call',
                toolCallId: `question-${calls}`,
                toolName: 'ask_user_question',
                input: JSON.stringify(
                  !exhausted && calls === 3 ? valid : { questions: [] },
                ),
              },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                usage,
              },
            ]),
          };
        },
      });
      const p = new CoachRunProjector({
        run: {
          runId: 'run',
          attemptId: 'attempt',
          messageId: 'message',
          revision: 0,
          status: 'running',
          startedAt: new Date().toISOString(),
          executionMs: 0,
          previousExecutionMs: 0,
        },
      });
      p.start();
      const execute = jest.fn<AiToolDef['execute']>(async (_ctx, input) => ({
        kind: 'ask_user_question',
        ...input,
      }));
      const events: CoachQueryYield[] = [];
      for await (const event of streamCoachAnswer({
        ctx: {
          ...ctx(),
          onActivity: async (activity) => {
            p.consume({ type: 'activity', activity });
          },
        },
        tools: [{ ...askUserQuestionTool, execute }],
        messages: [{ role: 'user', content: '帮我看看训练' }],
      })) {
        events.push(event);
        p.consume(event);
      }
      expect(model.doStreamCalls).toHaveLength(3);
      expect(execute).toHaveBeenCalledTimes(exhausted ? 0 : 1);
      expect(events.filter((e) => e.type === 'result').at(-1)).toMatchObject({
        is_error: exhausted,
      });
      p.finish(exhausted ? 'failed' : 'awaiting_input');
      const stored = p.envelope().message;
      expect(
        stored.activityAudit.filter((e) => e.status === 'failed'),
      ).toHaveLength(exhausted ? 3 : 2);
      expect(JSON.stringify(stored.providerHistory)).toContain('question-1');
      expect(JSON.stringify(stored.providerHistory)).toContain(
        'must NOT have fewer than 1 items',
      );
      const publicMessage = sanitizeStoredCoachMessageForClient(stored);
      expect(JSON.stringify(publicMessage)).not.toContain(
        'must NOT have fewer',
      );
      expect(JSON.stringify(publicMessage)).not.toContain('activityAudit');
      const failures = p.message.parts.filter(
        (part) =>
          part.type === 'data-coach-activity' &&
          part.data.display !== 'hidden' &&
          part.data.status === 'failed',
      );
      expect(failures).toHaveLength(exhausted ? 1 : 0);
      expect(p.pendingInteraction !== null).toBe(!exhausted);
    },
  );
  const oldBudget = process.env.AI_COACH_MAX_AGENT_STEPS;
  afterEach(() => {
    if (oldBudget === undefined) delete process.env.AI_COACH_MAX_AGENT_STEPS;
    else process.env.AI_COACH_MAX_AGENT_STEPS = oldBudget;
  });
  it.each([true, false])(
    'publishes only public tool preludes with deep mode=%s, and restores the same message',
    async (thinking) => {
      const publicText =
        '近期训练量会影响起始负荷；我会先核对这项依据，再安排递进幅度。';
      setupModel('text', 2, 'activity_recent', publicText);
      const p = new CoachRunProjector({
        run: {
          runId: 'run',
          attemptId: 'attempt',
          messageId: 'message',
          revision: 0,
          status: 'running',
          startedAt: '2026-10-09T00:00:00.000Z',
          executionMs: 0,
          previousExecutionMs: 0,
        },
      });
      const chunks: CoachUiChunk[] = p.start();
      const events: CoachQueryYield[] = [];
      for await (const event of streamCoachAnswer({
        ctx: ctx(),
        thinking,
        tools: [
          {
            ...tool(async () => ({ kind: 'activity_recent', items: [] })),
            name: 'activity.recent',
            isConcurrencySafe: true,
          },
        ],
        messages: [{ role: 'user', content: '根据近期活动安排训练' }],
      })) {
        events.push(event);
        chunks.push(...p.consume(event));
      }
      chunks.push(...p.finish('completed'));
      const summaries = events.filter(
        (event) => event.type === 'activity' && event.activity.publicSummary,
      );
      expect(summaries).toHaveLength(thinking ? 1 : 0);
      if (thinking)
        expect(summaries[0]).toMatchObject({
          activity: {
            key: 'model:1:1',
            publicSummary: {
              source: 'assistant_public_summary',
              text: publicText,
            },
          },
        });
      expect(model.doStreamCalls).toHaveLength(2); // no classifier or summarizer request
      const system = JSON.stringify(model.doStreamCalls[0].prompt);
      expect(system.includes('This is a public reasoning summary')).toBe(
        thinking,
      );
      expect(JSON.stringify(p.message)).not.toContain(
        'PRIVATE_REASONING_DO_NOT_PUBLISH',
      );
      expect(p.envelope().content).toBe(finalText); // the summary is not the final answer
      const collect = async (frames: CoachUiChunk[]) => {
        let last: CoachUiMessage;
        for await (const message of readUIMessageStream<CoachUiMessage>({
          stream: new ReadableStream({
            start(controller) {
              frames.forEach((frame) => controller.enqueue(frame));
              controller.close();
            },
          }),
        }))
          last = message;
        return last;
      };
      expect(await collect(chunks)).toEqual(p.message);
      expect(
        await collect(coachSnapshotChunks('message', p.envelope().message)),
      ).toEqual(p.message);
    },
  );
  it('delivers card then final text, including at the step limit, without replaying tools', async () => {
    process.env.AI_COACH_MAX_AGENT_STEPS = '1';
    setupModel();
    const execute = jest.fn<AiToolDef['execute']>(async () => draft);
    const events: CoachQueryYield[] = [];
    for await (const event of streamCoachAnswer({
      ctx: ctx(),
      tools: [tool(execute)],
      messages: [{ role: 'user', content: '重新安排六周训练' }],
    }))
      events.push(event);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[1].tools ?? []).toHaveLength(0);
    expect(model.doStreamCalls[1].toolChoice).toEqual({ type: 'none' });
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain(
      draft.description,
    );
    const card = events.findIndex((event) => event.type === 'assistant');
    const explanation = events.findIndex(
      (event) =>
        event.type === 'stream_event' &&
        event.event.type === 'text_delta' &&
        event.event.text === finalText,
    );
    expect(card).toBeGreaterThan(-1);
    expect(explanation).toBeGreaterThan(card);
    expect(events.filter((event) => event.type === 'model_usage')).toHaveLength(
      2,
    );
    expect(events.at(-1)).toMatchObject({
      type: 'result',
      is_error: false,
      result: finalText,
    });
  });
  it('completes a delivered plan with safe text when the final explanation names an internal tool', async () => {
    setupModel(
      'text',
      1,
      'present_coach_plan_draft',
      undefined,
      '训练草案由 present_coach_plan_draft 生成。',
    );
    const execute = jest.fn<AiToolDef['execute']>(async () => ({
      ...draft,
      periodWeeks: 8,
      workouts: Array.from({ length: 24 }, (_, index) => ({
        weekIndex: Math.floor(index / 3) + 1,
        dayIndex: [1, 3, 5][index % 3],
        sportType: 'RUN',
        text: 'work 25m',
      })),
    }));
    const events: CoachQueryYield[] = [];
    for await (const event of streamCoachAnswer({
      ctx: {
        ...ctx(),
        i18n: {
          t: (
            _key: string,
            options: { args: { weeks: number; sessions: number } },
          ) =>
            `${options.args.weeks} 周共 ${options.args.sessions} 次训练，确认课表后请保存计划。`,
        } as unknown as AiToolContext['i18n'],
      },
      tools: [tool(execute)],
      messages: [{ role: 'user', content: '请给我完整的八周训练计划草案' }],
    })) {
      events.push(event);
    }

    expect(events.at(-1)).toMatchObject({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '8 周共 24 次训练，确认课表后请保存计划。',
    });
    const card = events.findIndex((event) => event.type === 'assistant');
    const answer = events.findIndex(
      (event) =>
        event.type === 'stream_event' && event.event.type === 'text_delta',
    );
    expect(card).toBeGreaterThanOrEqual(0);
    expect(answer).toBeGreaterThan(card);
    expect(JSON.stringify(events[answer])).not.toContain('present_coach_plan_draft');
    expect(JSON.stringify(events.at(-1))).not.toContain('present_coach_plan_draft');
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('delivers fixed calendar constraints in the draft card used to save the plan', async () => {
    setupModel();
    const scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'Asia/Shanghai',
      effectiveFrom: '2026-11-25',
      fixedRestWeekdays: [2, 4, 5, 7],
      unavailableDates: [],
      availableDateOverrides: [],
      confirmation: { source: 'USER', reference: 'confirmed-brief' },
    };
    const events: CoachQueryYield[] = [];
    for await (const event of streamCoachAnswer({
      ctx: ctx(),
      tools: [tool(async () => ({ ...draft, scheduleConstraints }))],
      messages: [{ role: 'user', content: '每周周一、周三、周六训练' }],
    })) {
      events.push(event);
    }
    expect(events.find(({ type }) => type === 'assistant')).toMatchObject({
      message: {
        content: [{ name: 'PresentCoachPlanDraft', input: { scheduleConstraints } }],
      },
    });
  });
  it.each([
    ['no accepted draft', false, '训练草案由 present_coach_plan_draft 生成。'],
    [
      'internal context was also exposed',
      true,
      '草案由 present_coach_plan_draft 生成。内部字段为 planId。',
    ],
    [
      'an unverified save was also claimed',
      true,
      '草案由 present_coach_plan_draft 生成。已保存训练计划。',
    ],
  ])(
    'keeps the unsafe-output failure when %s',
    async (_scenario, accepted, finalAnswer) => {
      setupModel('text', 1, 'present_coach_plan_draft', undefined, finalAnswer);
      const prompt = '请给我完整的训练计划草案并保存训练计划';
      const events: CoachQueryYield[] = [];
      for await (const event of streamCoachAnswer({
        ctx: { ...ctx(), currentUserPrompt: prompt },
        tools: [
          tool(async () =>
            accepted
              ? {
                  ...draft,
                  workouts: [
                    { weekIndex: 1, dayIndex: 1, sportType: 'RUN', text: 'work 25m' },
                  ],
                }
              : { error: 'draft rejected' },
          ),
        ],
        messages: [{ role: 'user', content: prompt }],
      })) {
        events.push(event);
      }
      expect(events.at(-1)).toMatchObject({
        type: 'result',
        is_error: true,
        error_code: 'unsafe_ai_output_blocked',
      });
      expect(
        events.some(
          (event) =>
            event.type === 'stream_event' && event.event.type === 'text_delta',
        ),
      ).toBe(false);
    },
  );
  it.each(['empty', 'error'] as const)(
    'preserves delivery and refuses silent success/provider replay when the summary is %s',
    async (mode) => {
      setupModel(mode);
      const execute = jest.fn<AiToolDef['execute']>(async () => draft);
      const events: CoachQueryYield[] = [];
      const run = async () => {
        for await (const event of streamCoachAnswer({
          ctx: ctx(),
          tools: [tool(execute)],
          messages: [{ role: 'user', content: '训练计划' }],
        }))
          events.push(event);
      };
      await expect(run()).rejects.toThrow(
        mode === 'empty' ? 'AI_COACH_DELIVERY_SUMMARY_EMPTY' : 'rate limited',
      );
      expect(execute).toHaveBeenCalledTimes(1);
      expect(events.some((event) => event.type === 'assistant')).toBe(true);
      expect(
        events.some((event) => event.type === 'result' && !event.is_error),
      ).toBe(false);
    },
  );
  it('blocks even hallucinated tool executions during the delivery-only phase', async () => {
    const execute = jest.fn<AiToolDef['execute']>(async () => draft);
    const tools = createAiSdkCoachTools({
      ctx: ctx(),
      tools: [tool(execute)],
      canExecute: () => false,
    });
    const result = await tools.present_coach_plan_draft.execute!(
      {},
      { toolCallId: 'blocked', messages: [] },
    );
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ stage: 'delivery' });
  });
  it('omits rejected plan candidates and repair feedback from compatibility events', async () => {
    const name = 'present_coach_plan_draft';
    const input = { title: 'PRIVATE_CANDIDATE' };
    const events = await emitToolStepMessages({
      ctx: ctx(), tools: [tool(async () => draft)],
      calls: [{ id: 'rejected', name, input }],
      results: [{ id: 'rejected', name, input, ok: false, output: {
        code: 'PLAN_QUALITY_INVALID', error: 'PRIVATE_RULE_DETAILS',
      } }],
    });
    expect(JSON.stringify(events)).not.toContain('PRIVATE_');
    expect(JSON.stringify(events)).toContain('PLAN_QUALITY_INVALID');
  });
  it('does not deduplicate equal read results from different calls in the real loop', async () => {
    setupModel('text', 2, 'activity_recent');
    const execute = jest.fn<AiToolDef['execute']>(async () => ({
      kind: 'activity_recent',
      items: [],
    }));
    const cards: string[] = [];
    for await (const event of streamCoachAnswer({
      ctx: ctx(),
      tools: [
        { ...tool(execute), name: 'activity.recent', isConcurrencySafe: true },
      ],
      messages: [{ role: 'user', content: '查询两段时间的活动' }],
    })) {
      if (event.type === 'assistant')
        for (const block of event.message.content)
          if (block.type === 'tool_use' && block.name === 'ActivityRecent')
            cards.push(block.id);
    }
    expect(execute).toHaveBeenCalledTimes(2);
    expect(cards).toEqual(['draft-0', 'draft-1']);
  });
  it('still ends immediately when questions are delivered', async () => {
    setupModel('text', 1, 'ask_user_question', '请先确认你的训练目标。');
    const execute = jest.fn<AiToolDef['execute']>(async () => ({
      kind: 'ask_user_question',
      questions: [],
    }));
    const events: CoachQueryYield[] = [];
    for await (const event of streamCoachAnswer({
      ctx: ctx(),
      thinking: true,
      tools: [{ ...tool(execute), name: 'ask_user_question' }],
      messages: [{ role: 'user', content: '新计划' }],
    }))
      events.push(event);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(
      events.some(
        (event) => event.type === 'activity' && event.activity.publicSummary,
      ),
    ).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: 'result', is_error: false });
  });
});

it('forces the per-question tool schema and stops after two malformed reviews', async () => {
  const context = ctx();
  const review = {
    questions: [{
      id: 'recent-baseline',
      header: 'Training',
      question: 'How much do you run?',
      options: [
        { value: 'a', label: 'A', description: 'Less' },
        { value: 'b', label: 'B', description: 'More' },
      ],
    }],
  };
  context.planQuestionReview = review;
  model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: convertArrayToReadableStream<StreamChunk>([
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call',
          toolCallId: 'missing-required-review',
          toolName: 'plan_suitability_assess',
          input: '{}',
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage,
        },
      ]),
    }),
  });
  for await (const _event of streamCoachAnswer({
    tools: [planSuitabilityQuestionReviewTool(review)],
    messages: [{ role: 'user', content: 'Help me make a training plan.' }],
    activeSkill: getCoachSkillByName('plan-builder'),
    ctx: context,
  })) {
    /* Drain both attempts. */
  }
  expect(model.doStreamCalls).toHaveLength(2);
  expect(model.doStreamCalls[0]).toMatchObject({
    toolChoice: { type: 'tool', toolName: 'plan_suitability_assess' },
    tools: [expect.objectContaining({
      name: 'plan_suitability_assess',
      inputSchema: expect.objectContaining({
        required: expect.arrayContaining(['questionReview']),
      }),
    })],
  });
});

describe('Report case 07: clarify a workout without replaying inaccurate zone advice', () => {
  const wrongLabel = 'Pakai 80/20: Z2 = 154–171';
  const workoutOnly = {
    value: 'workout',
    label: 'Apply my preferred cap to this workout',
    description: 'Use the preference for the current workout',
  };
  const keepSettings = {
    value: 'keep',
    label: 'Keep the usual workout guidance',
    description: 'Keep the established guidance for this workout',
  };
  const wrongZone = {
    value: 'external-zone',
    label: wrongLabel,
    description: 'Use 81–90% of the synthetic maximum heart rate of 190',
  };
  const question = (
    options: (typeof workoutOnly)[],
    prompt = 'Should the preferred 145 bpm cap apply to this workout?',
  ) => ({
    questions: [
      {
        id: 'scope',
        header: 'Workout scope',
        question: prompt,
        options,
      },
    ],
  });

  function projector(id: string) {
    return new CoachRunProjector({
      run: {
        runId: `${id}-run`,
        attemptId: `${id}-attempt`,
        messageId: `${id}-message`,
        revision: 0,
        status: 'running',
        startedAt: new Date().toISOString(),
        executionMs: 0,
        previousExecutionMs: 0,
      },
    });
  }

  function continuedHistory(status: 'cancelled' | 'interrupted' = 'cancelled') {
    const prior = projector('retired');
    prior.consume({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'previous-question',
            name: 'AskUserQuestion',
            input: question([workoutOnly, wrongZone]),
          },
        ],
      },
    });
    prior.finish(status);
    return buildHistoryMessages({
      provider: 'openrouter',
      thinking: false,
      currentUserMessage: { content: [{ type: 'text', text: 'Yes, please.' }] },
      rows: [{ role: 'ASSISTANT', ...prior.envelope() }],
    });
  }

  it.each(['cancelled', 'interrupted'] as const)(
    'does not inject %s card options into the follow-up model context',
    (status) => {
      const history = continuedHistory(status);
      expect(history.at(-1)).toMatchObject({
        role: 'user',
        content: 'Yes, please.',
      });
      expect(JSON.stringify(history)).not.toContain(wrongLabel);
    },
  );

  async function visibleQuestions(...attempts: ReturnType<typeof question>[]) {
    let step = 0;
    model = new MockLanguageModelV3({
      doStream: async () => {
        const input = attempts[step++];
        return {
          stream: convertArrayToReadableStream<StreamChunk>([
            { type: 'stream-start', warnings: [] },
            {
              type: 'tool-call',
              toolCallId: `follow-up-question-${step}`,
              toolName: 'ask_user_question',
              input: JSON.stringify(input),
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
              usage,
            },
          ]),
        };
      },
    });
    const turn = projector('follow-up');
    for await (const event of streamCoachAnswer({
      ctx: { ...ctx(), lang: 'en' },
      tools: [askUserQuestionTool],
      messages: continuedHistory(),
      maxSteps: attempts.length,
    })) {
      turn.consume(event);
    }
    expect(model.doStreamCalls).toHaveLength(attempts.length);
    return JSON.stringify(
      turn.message.parts.filter(
        (part) =>
          part.type === 'data-coach-tool' &&
          part.data.name === 'AskUserQuestion',
      ),
    );
  }

  it('still delivers a valid clarification about the workout scope', async () => {
    const visible = await visibleQuestions(
      question([workoutOnly, keepSettings]),
    );
    expect(visible).toContain(workoutOnly.label);
    expect(visible).toContain(keepSettings.label);
  });

  it('keeps an explicit power option usable', async () => {
    const power = {
      ...keepSettings,
      label: '80/20 Zone 2: 125–155 W',
    };
    const visible = await visibleQuestions(question([workoutOnly, power]));
    expect(visible).toContain(power.label);
  });

  it('accepts a user-specified cap in a workout-only option mentioning 80/20', async () => {
    const cap = {
      ...workoutOnly,
      label: '80/20: keep my 145 bpm cap for this workout',
    };
    const visible = await visibleQuestions(question([cap, keepSettings]));
    expect(visible).toContain(cap.label);
  });

  it.each([
    { prompt: undefined, option: wrongZone },
    {
      prompt: 'Use the 80/20 Running heart rate zone for this workout?',
      option: {
        ...wrongZone,
        label: 'Use 154–171 bpm for this workout',
        description: 'Use that range for the planned run',
      },
    },
  ])(
    'retries without displaying an unverified running zone ($option.label)',
    async ({ prompt, option }) => {
      const visible = await visibleQuestions(
        question([workoutOnly, option], prompt),
        question([workoutOnly, keepSettings]),
      );
      expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain(
        'UNVERIFIED_HEART_RATE_ZONE',
      );
      expect(visible).not.toContain(option.label);
      expect(visible).toContain(workoutOnly.label);
      expect(visible).toContain(keepSettings.label);
    },
  );
});
