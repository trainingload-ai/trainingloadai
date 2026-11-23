import { reviewRemainingQuestions } from '../coach-plan-question-review';
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

const EIGHTY_TWENTY = /\b80\s*[/:-]\s*20\b/i;
const ZONE = /\b(?:z|zone|zona)\s*[1-7]\b|区间|區間/i;
const HEART_RATE =
  /\b(?:heart rate|hr\s*max|max\s*hr|herzfrequenz|detak jantung|bpm)\b|心率/i;
const NON_HEART_RATE_UNIT =
  /^\s*(?:%|w(?:atts?)?\b|min\b|\/\s*(?:km|mi)\b|km(?:\/h)?\b)/i;

function containsEightyTwentyHeartRateClaim(
  text: string,
  methodInQuestion = false,
  heartRateZoneInQuestion = false,
) {
  const normalized = text.normalize('NFKC');
  const hasZone = ZONE.test(normalized);
  if (!methodInQuestion && !EIGHTY_TWENTY.test(normalized)) return false;

  const claim = normalized.replace(EIGHTY_TWENTY, '');
  const hasHeartRate = HEART_RATE.test(claim);
  if (hasZone && /\b\d{2,3}\s*bpm\b/i.test(claim)) return true;
  if (hasHeartRate && /\d{2,3}\s*%/.test(claim)) return true;
  if (!hasZone && !hasHeartRate && !heartRateZoneInQuestion) return false;

  return [
    ...claim.matchAll(
      /\b\d{2,3}\s*(?:[-–—−]|to|bis|sampai|至|到)\s*\d{2,3}\b/gi,
    ),
  ].some(
    (range) =>
      !NON_HEART_RATE_UNIT.test(claim.slice(range.index + range[0].length)),
  );
}

export const askUserQuestionTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'ask_user_question',
  description:
    'Ask the user concise multiple-choice questions when you need structured preferences, clarifications, or decisions. Use 1-4 questions, each with 2-4 options. Prefer this over free-text follow-up when the answer can be expressed as discrete choices. Clarify workout-only versus long-term scope without embedding estimated 80/20 running heart-rate zones in the options. For adoption of a displayed fitness calculation, use mutation_apply_fitness_calculation, which issues a question bound to the exact proposal if confirmation is needed. Do not mix questions with other tools in the same turn if you need the user to answer first.',
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
    const questions = ctx.planQuestionReview
      ? reviewRemainingQuestions(ctx.planQuestionReview, parsed.data.questions)
      : parsed.data.questions;
    if (!questions) {
      return aiToolError(
        'Complete the prior-question assessment first. Include a revised question with the same ID for each REPLACE decision, and omit ANSWERED or IRRELEVANT IDs.',
        'PLAN_QUESTION_REVIEW_REQUIRED',
      );
    }
    const hasUnsupportedZone = questions.some((question) => {
      const prompt = `${question.header}\n${question.question}`.normalize(
        'NFKC',
      );
      const methodInQuestion = EIGHTY_TWENTY.test(prompt);
      const heartRateZoneInQuestion =
        ZONE.test(prompt) && HEART_RATE.test(prompt);
      return (
        containsEightyTwentyHeartRateClaim(prompt) ||
        question.options.some((option) =>
          containsEightyTwentyHeartRateClaim(
            `${option.label}\n${option.description ?? ''}`,
            methodInQuestion,
            heartRateZoneInQuestion,
          ),
        )
      );
    });
    if (hasUnsupportedZone) {
      return aiToolError(
        'Ask only about the intended scope or cap. An 80/20 Running heart-rate zone requires a verified lactate threshold heart rate and the correct method, not maximum heart rate. Remove estimated zone numbers from this question.',
        'UNVERIFIED_HEART_RATE_ZONE',
      );
    }
    return { ok: true };
  },
  execute: async (ctx, input) => ({
    kind: ASK_USER_QUESTION_TYPE,
    questions: ctx.planQuestionReview
      ? reviewRemainingQuestions(ctx.planQuestionReview, input.questions)!
      : input.questions,
    metadata: {
      // Action bindings are issued by their own tools, never supplied by the model.
      ...(input.metadata?.source ? { source: input.metadata.source } : {}),
      skill: ctx.activeSkillName,
      branchId: ctx.branchId ?? null,
    },
  }),
});
