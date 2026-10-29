import type { I18nService } from 'nestjs-i18n';
import { resolveSupportedLocale } from '@/utils/locale.util';
import {
  parseFitnessUserAction,
  type FitnessApplyOption,
  type FitnessConfirmation,
} from '@shared/fitness-assessment';
import {
  parseAskUserQuestionData,
  parseCoachQuestionReplyLikeToolResultPayload,
} from '@shared/ai-coach-schema';

const questionId = 'fitness_apply';
const confirmValue = 'apply';

/** The question and its action binding are produced from the saved proposal. */
export function fitnessConfirmationQuestion(args: {
  calculationId: string;
  option: FitnessApplyOption;
  branchId?: string | null;
  lang?: string;
  i18n: I18nService;
}) {
  const t = (key: string, values?: Record<string, string>) =>
    String(
      args.i18n.t(`fitnessAssessment.confirmation.${key}`, {
        lang: resolveSupportedLocale(args.lang),
        args: values,
      }),
    );
  const changes = args.option.changes
    .map((change) => `${change.metric}: ${change.value} ${change.unit}`)
    .join(', ');
  return {
    kind: 'ask_user_question' as const,
    questions: [
      {
        id: questionId,
        header: t('header'),
        question: t('question', {
          sport: t(`sports.${args.option.sport}`),
          changes,
          date: args.option.effectiveDate,
        }),
        options: [
          {
            value: confirmValue,
            label: t('apply'),
            description: t('applyDescription'),
          },
          {
            value: 'keep',
            label: t('keep'),
            description: t('keepDescription'),
          },
        ],
      },
    ],
    metadata: {
      skill: 'fitness-assessment',
      branchId: args.branchId ?? null,
      fitnessConfirmation: {
        kind: 'fitness_apply_confirmation' as const,
        calculationId: args.calculationId,
        applyOptionId: args.option.id,
        proposalDigest: args.option.proposalDigest,
      },
    },
  };
}

/** Only call with a question loaded from this user's scoped assistant history. */
export function fitnessConfirmationFromQuestion(
  storedQuestion: unknown,
  reply: unknown,
): FitnessConfirmation | undefined {
  const parsedReply = parseCoachQuestionReplyLikeToolResultPayload(reply);
  if (!parsedReply.ok || parsedReply.data.kind !== 'coach_question_reply')
    return;
  const { answers, notes } = parsedReply.data;
  if (
    Object.keys(answers).length !== 1 ||
    answers[questionId] !== confirmValue ||
    Object.values(notes).some((note) => note.trim())
  )
    return;
  const question = parseAskUserQuestionData(storedQuestion);
  if (!question.ok || question.data.questions.length !== 1) return;
  const item = question.data.questions[0];
  if (
    item.id !== questionId ||
    item.multiSelect ||
    !item.options.some((o) => o.value === confirmValue)
  )
    return;
  const metadata = (
    storedQuestion as { metadata?: { fitnessConfirmation?: unknown } }
  ).metadata;
  const confirmation = parseFitnessUserAction(metadata?.fitnessConfirmation);
  return confirmation?.kind === 'fitness_apply_confirmation'
    ? confirmation
    : undefined;
}
