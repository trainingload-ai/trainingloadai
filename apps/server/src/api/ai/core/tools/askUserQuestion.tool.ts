import { aiToolError, buildAiTool, type AiToolDef } from '../tool.types';
import {
  ASK_USER_QUESTION_TYPE,
  askUserQuestionToolParametersSchema,
  parseAskUserQuestionData,
  type AskUserQuestionData,
} from '../../../../../../../packages/shared/ai-coach-schema';

type Input = AskUserQuestionData;

type Output = {
  kind: typeof ASK_USER_QUESTION_TYPE;
} & AskUserQuestionData;

export const askUserQuestionTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'ask_user_question',
  description:
    'Ask the user concise multiple-choice questions when you need structured preferences, clarifications, or decisions. Use 1-4 questions, each with 2-4 options. Prefer this over free-text follow-up when the answer can be expressed as discrete choices. For adoption of a displayed fitness calculation, use mutation_apply_fitness_calculation, which issues a question bound to the exact proposal if confirmation is needed. Do not mix questions with other tools in the same turn if you need the user to answer first.',
  searchHint: 'prompt the user with multiple-choice questions',
  cost: 'low',
  maxResultChars: 16_000,
  parameters: askUserQuestionToolParametersSchema,
  validateInput: async (ctx, input) => {
    if (ctx.questionResponse?.declinedAll) {
      return aiToolError(
        'The athlete declined this question set. Continue with known evidence and do not ask another structured question in this resumed turn.',
        'USER_DECLINED_QUESTIONS',
      );
    }
    const parsed = parseAskUserQuestionData(input);
    if (!parsed.ok) {
      return aiToolError(parsed.error, 'INVALID_INPUT');
    }
    return { ok: true };
  },
  execute: async (ctx, input) => ({
    kind: ASK_USER_QUESTION_TYPE,
    questions: input.questions,
    metadata: {
      // Action bindings are issued by their own tools, never supplied by the model.
      ...(input.metadata?.source ? { source: input.metadata.source } : {}),
      skill: ctx.activeSkillName,
      branchId: ctx.branchId ?? null,
    },
  }),
});
