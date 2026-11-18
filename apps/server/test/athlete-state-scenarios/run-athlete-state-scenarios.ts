import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseEnv } from 'dotenv';
import { streamCoachAnswer } from '../../src/api/ai/core/tool-loop-agent.runtime';
import { COACH_TOOL_DEFINITIONS } from '../../src/api/ai/core/tool.registry';
import type {
  AiToolContext,
  AiToolDef,
} from '../../src/api/ai/core/tool.types';
import type { ActiveCoachSkill } from '../../src/api/ai/core/skill.types';
import {
  getCoachModel,
  getCoachUpstreamProvider,
  isCoachUpstreamConfigured,
} from '../../src/api/ai/core/coach-upstream.adapter';
import {
  athleteStateSkill,
  ATHLETE_STATE_TOOLS,
} from '../../src/api/ai/core/skills/athleteState.skill';
import { AthleteStateAgentService } from '../../src/api/ai/athlete-state/athlete-state-agent.service';
import { ATHLETE_STATE_PROMPT_VERSION } from '@/athlete-state/athlete-state-policy';
import {
  buildAthleteStateScenarios,
  type StateScenario,
} from './athlete-state-scenarios';

function option(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
}

/** Import only AI configuration. Database, storage and user credentials are never used. */
function loadAiConfiguration(path?: string) {
  if (!path) return;
  const values = parseEnv(readFileSync(resolve(path)));
  for (const [name, value] of Object.entries(values)) {
    if (
      /^(AI_|OPENAI_|OPENROUTER_|DEEPSEEK_|DASHSCOPE_|XAI_|GOOGLE_AI_)/.test(
        name,
      ) &&
      !process.env[name]
    )
      process.env[name] = value;
  }
}

async function runScenario(
  scenario: StateScenario,
  model: string,
  attempt = 1,
) {
  const started = Date.now();
  let saved: Record<string, unknown> | undefined;
  const toolCalls: Array<{ name: string; input: unknown; output?: unknown }> =
    [];
  const questions: unknown[] = [];
  const usage: unknown[] = [];
  let failure: string | undefined;
  const service = new AthleteStateAgentService(
    {
      saveAssessment: async (input: { result: Record<string, unknown> }) => {
        saved = structuredClone(input.result);
        return {
          assessment: { id: `synthetic-${scenario.id}`, ...input.result },
        };
      },
    } as never,
    { eligibility: async () => null } as never,
  );
  const signal = AbortSignal.timeout(120_000);
  const turn = service.openTurn({
    userId: 'synthetic-athlete',
    sessionId: `synthetic:${scenario.id}`,
    runId: `synthetic-run:${scenario.id}`,
    timezone: 'Asia/Shanghai',
    asOf: new Date(),
  });
  const ctx = {
    session: { user: { id: 'synthetic-athlete' } },
    sid: `synthetic:${scenario.id}`,
    userService: { getPreferredTimezone: async () => 'Asia/Shanghai' },
    i18n: { t: (key: string) => key },
    lang: 'zh',
    signal,
    currentTurnStartedAt: new Date(),
    activeSkillName: 'athlete-state',
    athleteState: turn,
    questionResponse: scenario.declined
      ? { declinedAll: true, skippedQuestionIds: [] }
      : undefined,
    backgroundTask: {
      taskType: 'ATHLETE_STATE_UPDATE',
      resultToolName: 'athlete_state.answer',
      allowedToolNames: ATHLETE_STATE_TOOLS,
      requiredToolNames: ['training.data_coverage'],
      completedToolNames: new Set<string>(),
      submitResult: () => undefined,
    },
  } as unknown as AiToolContext;
  const tools: AiToolDef[] = COACH_TOOL_DEFINITIONS.filter((tool) =>
    ATHLETE_STATE_TOOLS.includes(tool.name as never),
  ).map((tool) => ({
    ...tool,
    // Fixtures represent model-facing read outputs; production schemas, permissions,
    // tool scoping, the Agent loop and the final state writer remain in use.
    summarizeForModel: ({ output }) => output,
    execute: async (context, input) => {
      const call = { name: tool.name, input } as (typeof toolCalls)[number];
      toolCalls.push(call);
      if (
        tool.name === 'athlete_state.answer' ||
        tool.name === 'ask_user_question'
      ) {
        const output = await tool.execute(context, input);
        call.output = structuredClone(output);
        return output;
      }
      if (!Object.prototype.hasOwnProperty.call(scenario.responses, tool.name))
        throw new Error('SCENARIO_TOOL_FIXTURE_MISSING');
      const output = structuredClone(scenario.responses[tool.name]);
      call.output = structuredClone(output);
      return output;
    },
  }));
  const taskMessage = [
    'This is a server-owned passive Athlete State task with synthetic tool facts.',
    'Use tools to inspect coverage and relevant facts. Finish by calling athlete_state.answer, or ask only an essential question and wait. Do not modify plans or deliver conversational prose.',
    scenario.feedback ?? '',
    scenario.declined
      ? 'The athlete explicitly declined the previous clarification question. Continue without asking again; record uncertainty in the result.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  try {
    const stream = streamCoachAnswer({
      tools,
      ctx,
      model,
      activeSkill: {
        ...athleteStateSkill,
        activatedBy: 'system',
      } as ActiveCoachSkill,
      messages: [{ role: 'user', content: taskMessage }],
    });
    for await (const event of stream) {
      if (event.type === 'model_usage') usage.push(event.usage);
      if (event.type === 'assistant')
        for (const block of event.message.content)
          if (block.type === 'tool_use' && block.name === 'AskUserQuestion')
            questions.push(block.input);
      if (event.type === 'result' && event.is_error)
        failure = event.error_code ?? 'AGENT_RUN_FAILED';
    }
  } catch (error) {
    // Never print provider exception bodies, request headers, credentials or model reasoning.
    failure = error instanceof Error ? error.name : 'SCENARIO_EXECUTION_FAILED';
  }
  const violations: string[] = [];
  if (failure) violations.push(failure);
  if (questions.length && !scenario.mayAsk)
    violations.push('UNNECESSARY_QUESTION');
  if (
    questions.length > 1 ||
    questions.some(
      (card) =>
        Array.isArray((card as { questions?: unknown[] }).questions) &&
        (card as { questions: unknown[] }).questions.length > 1,
    )
  )
    violations.push('MULTIPLE_QUESTIONS');
  if (!saved && !questions.length)
    violations.push('NO_STRUCTURED_RESULT_OR_QUESTION');
  if (saved && !scenario.acceptedStates.includes(String(saved.state)))
    violations.push('UNEXPECTED_STATE');
  if (
    saved &&
    scenario.acceptedReadiness &&
    !scenario.acceptedReadiness.includes(String(saved.decisionReadiness))
  )
    violations.push('UNEXPECTED_READINESS');
  if (saved && questions.length)
    violations.push('RESULT_AND_QUESTION_IN_SAME_TURN');
  return {
    id: scenario.id,
    attempt,
    description: scenario.description,
    input: {
      taskMessage,
      toolResponses: scenario.responses,
      declinedQuestion: scenario.declined === true,
    },
    modelToolInput:
      toolCalls.findLast((call) => call.name === 'athlete_state.answer')
        ?.input ?? null,
    passed: violations.length === 0,
    violations,
    outcome: questions.length
      ? 'awaiting_input'
      : saved
        ? 'assessment_saved'
        : 'failed',
    assessment: saved ?? null,
    questions,
    toolCalls,
    usage,
    elapsedMs: Date.now() - started,
  };
}

async function main() {
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
  }).format(new Date());
  const selected = option('cases')?.split(',');
  const scenarios = buildAthleteStateScenarios(today).filter(
    (scenario) => !selected || selected.includes(scenario.id),
  );
  if (!process.argv.includes('--live')) {
    console.log(
      JSON.stringify(
        {
          live: false,
          scenarios: scenarios.map(({ responses: _, ...metadata }) => metadata),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!scenarios.length) throw new Error('NO_SCENARIOS_SELECTED');
  loadAiConfiguration(option('env-file'));
  if (!isCoachUpstreamConfigured())
    throw new Error('AI_PROVIDER_NOT_CONFIGURED');
  Logger.overrideLogger(false);
  process.env.AI_COACH_MAX_AGENT_STEPS = '8';
  process.env.AI_LOG_PROMPTS = 'false';
  process.env.AI_LOG_TOOL_OUTPUTS = 'false';
  process.env.AI_LOG_TOOL_DEBUG = 'false';
  const repeat = Number(option('repeat') ?? 1);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 3)
    throw new Error('SCENARIO_REPEAT_OUT_OF_RANGE');
  const jobs = scenarios.flatMap((scenario) =>
    Array.from({ length: repeat }, (_, i) => ({ scenario, attempt: i + 1 })),
  );
  const model = getCoachModel();
  const results: Awaited<ReturnType<typeof runScenario>>[] = [];
  // Bound API concurrency and use no application workers or database connections.
  for (let i = 0; i < jobs.length; i += 2) {
    const batch = await Promise.all(
      jobs
        .slice(i, i + 2)
        .map(({ scenario, attempt }) => runScenario(scenario, model, attempt)),
    );
    results.push(...batch);
    for (const item of batch)
      console.log(
        JSON.stringify({
          id: item.id,
          passed: item.passed,
          outcome: item.outcome,
          state: item.assessment?.state,
          readiness: item.assessment?.decisionReadiness,
          violations: item.violations,
        }),
      );
  }
  const report = {
    schemaVersion: 1,
    synthetic: true,
    liveModel: true,
    provider: getCoachUpstreamProvider(),
    model,
    promptVersion: ATHLETE_STATE_PROMPT_VERSION,
    activeSkillPrompt: athleteStateSkill.prompt,
    generatedAt: new Date().toISOString(),
    passed: results.filter((row) => row.passed).length,
    total: results.length,
    results,
  };
  if (option('output'))
    writeFileSync(
      resolve(option('output')!),
      JSON.stringify(report, null, 2) + '\n',
    );
  console.log(
    JSON.stringify({
      completed: true,
      passed: report.passed,
      total: report.total,
    }),
  );
  if (report.passed !== report.total) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.name : 'SCENARIO_RUN_FAILED');
  process.exitCode = 1;
});
