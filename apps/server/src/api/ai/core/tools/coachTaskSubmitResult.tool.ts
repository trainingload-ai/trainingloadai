import { CoachTaskResultValidationError } from '../coach-task-result-error';
import { buildAiTool, type AiToolDef } from '../tool.types';

type Input = {
  result: Record<string, unknown>;
};

type Output =
  | { kind: 'coach_task_result_accepted'; taskType: string }
  | { code: string; error: string; stage: 'execute' };

/**
 * Server-owned background tasks use this as their only terminal result channel.
 * It is intentionally unavailable in interactive chat and does not mutate domain data.
 */
export const coachTaskSubmitResultTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'coach_task_submit_result',
  description:
    'Submit the final structured result once after gathering enough evidence. If the tool returns a correction, address it before resubmitting. Stop after one accepted result. Do not return the result as ordinary chat text.',
  kind: 'read',
  cost: 'low',
  searchHint: 'background coach task final structured result submit',
  applicableSkills: [
    'activity-review',
    'readiness-check',
    'week-review',
    'plan-day-review',
    'plan-week-review',
    'plan-cycle-review',
    'period-review',
    'plan-review-adjustment',
    'rolling-plan',
    'workout-generator',
    'metric-explainer',
  ],
  isEnabled: (ctx) => Boolean(ctx.backgroundTask),
  isReadOnly: true,
  isConcurrencySafe: false,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['result'],
    properties: {
      result: {
        type: 'object',
        description:
          'The complete task result. Its task-specific contract is provided in the server-owned task prompt.',
      },
    },
  },
  validateInput: (ctx, input) => {
    if (!ctx.backgroundTask) {
      return {
        ok: false,
        code: 'BACKGROUND_TASK_REQUIRED',
        message: 'No background coach task is active.',
      };
    }
    if (!input.result || typeof input.result !== 'object') {
      return {
        ok: false,
        code: 'RESULT_REQUIRED',
        message: 'A structured result object is required.',
      };
    }
    const missingTools = (ctx.backgroundTask.requiredToolNames ?? []).filter(
      (toolName) => !ctx.backgroundTask?.completedToolNames?.has(toolName),
    );
    if (missingTools.length > 0) {
      return {
        ok: false,
        code: 'REQUIRED_EVIDENCE_MISSING',
        message: `Complete the required evidence tools before submitting: ${missingTools.join(', ')}.`,
      };
    }
    return { ok: true };
  },
  execute: async (ctx, input) => {
    const task = ctx.backgroundTask!;
    try {
      await task.submitResult(input.result);
    } catch (error) {
      if (!(error instanceof CoachTaskResultValidationError)) throw error;
      return { code: error.code, error: error.correction, stage: 'execute' };
    }
    return {
      kind: 'coach_task_result_accepted',
      taskType: task.taskType,
    };
  },
  summarizeForModel: ({ output }) => output,
});
