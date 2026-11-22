import {
  safeParseAskUserQuestionData,
  type AskUserQuestionItem,
} from '@shared/ai-coach-schema';
import { stableJson } from './ai-common.util';
import type { CoachFactContextService } from './coach-fact-context.service';
import { coachingSemanticValue } from './coach-fact-semantic';
import { coachAssistantBlockIsUiSurface } from './coach-message.util';
import type { CoachQueryYield } from './coach-query-yield';

export type PlanQuestionReviewDecision = {
  id: string;
  outcome: 'KEEP' | 'ANSWERED' | 'IRRELEVANT' | 'REPLACE';
  reason: string;
};

export type PlanQuestionReview = {
  questions: AskUserQuestionItem[];
  decisions?: PlanQuestionReviewDecision[];
};

type CoachFacts = Awaited<ReturnType<CoachFactContextService['build']>>;

function planQuestionEvidence(facts: CoachFacts) {
  return {
    calendar: [facts.date, facts.timezone],
    health: facts.health,
    training: 'training' in facts ? facts.training : null,
    memory: facts.memory?.semanticRevision ?? facts.memory?.items,
    coverage: [
      facts.status,
      facts.limitations.filter(
        (value) => value !== 'USER_REPORT_EXTRACTION_PENDING_OR_FAILED',
      ),
    ],
  };
}

export function changedPlanQuestionEvidence(
  previous: CoachFacts,
  current: CoachFacts,
) {
  const before = planQuestionEvidence(previous);
  const after = planQuestionEvidence(current);
  return (Object.keys(after) as Array<keyof typeof after>).filter(
    (key) =>
      stableJson(coachingSemanticValue(after[key])) !==
      stableJson(coachingSemanticValue(before[key])),
  );
}

export function reviewRemainingQuestions(
  review: PlanQuestionReview,
  proposed: AskUserQuestionItem[],
): AskUserQuestionItem[] | null {
  if (!review.decisions) return null;
  const byId = new Map(proposed.map((question) => [question.id, question]));
  const decisions = new Map(
    review.decisions.map((decision) => [decision.id, decision.outcome]),
  );
  const remaining: AskUserQuestionItem[] = [];
  for (const original of review.questions) {
    const outcome = decisions.get(original.id);
    const replacement = byId.get(original.id);
    if (outcome === 'REPLACE') {
      if (!replacement || stableJson(replacement) === stableJson(original))
        return null;
      remaining.push(replacement);
    } else if (outcome === 'KEEP') {
      remaining.push(original);
    } else if (replacement) return null;
  }
  for (const question of proposed) {
    if (!decisions.has(question.id)) remaining.push(question);
  }
  return remaining.length > 0 && remaining.length <= 4 ? remaining : null;
}

export function isPlanClarification(raw: unknown): boolean {
  const metadata = safeParseAskUserQuestionData(raw)?.metadata;
  return (
    metadata?.skill === 'plan-builder' &&
    !metadata.assessmentCaseId &&
    !metadata.assessmentQuestionId
  );
}

/** Keep the question provisional until the model turn and fact read have both settled. */
export async function* reviewPlanQuestionsBeforeDelivery(args: {
  stream: AsyncIterable<CoachQueryYield>;
  canReview: () => boolean;
  refresh: (questions: AskUserQuestionItem[]) => Promise<{
    stream: AsyncIterable<CoachQueryYield>;
    review: PlanQuestionReview;
  } | null>;
}): AsyncGenerator<CoachQueryYield, void, undefined> {
  const held: CoachQueryYield[] = [];
  let questions: AskUserQuestionItem[] | undefined;
  let otherDelivery = false;
  let success = false;
  for await (const event of args.stream) {
    if (event.type === 'assistant') {
      const visible = event.message.content.filter(
        coachAssistantBlockIsUiSurface,
      );
      const block = visible.length === 1 ? visible[0] : undefined;
      if (
        !otherDelivery &&
        !questions &&
        block?.type === 'tool_use' &&
        block.name === 'AskUserQuestion' &&
        isPlanClarification(block.input)
      ) {
        questions = safeParseAskUserQuestionData(block.input)!.questions;
        held.push(event);
        continue;
      }
      if (visible.length) otherDelivery = true;
    } else if (
      event.type === 'stream_event' &&
      event.event.type === 'text_delta'
    ) {
      otherDelivery = true;
    } else if (event.type === 'result') {
      success = event.is_error === false;
    }
    // Record both model calls under the existing operation, including a discarded preview.
    if (questions && event.type !== 'model_usage') held.push(event);
    else yield event;
  }
  if (success && questions && !otherDelivery && args.canReview()) {
    const updated = await args.refresh(questions);
    if (updated) {
      const delivery: CoachQueryYield[] = [];
      let validQuestion = false;
      let validOutput = false;
      let finished = false;
      for await (const event of updated.stream) {
        if (event.type === 'model_usage') {
          yield event;
          continue;
        }
        if (event.type === 'assistant') {
          validQuestion ||= event.message.content.some(
            (block) =>
              block.type === 'tool_use' && block.name === 'AskUserQuestion',
          );
          validOutput ||= event.message.content.some(
            coachAssistantBlockIsUiSurface,
          );
        }
        if (event.type === 'stream_event' && event.event.type === 'text_delta')
          validOutput ||= Boolean(event.event.text.trim());
        if (event.type === 'result') finished = !event.is_error;
        delivery.push(event);
      }
      const remaining = updated.review.decisions?.some(
        (decision) =>
          decision.outcome === 'KEEP' || decision.outcome === 'REPLACE',
      );
      if (
        finished &&
        updated.review.decisions &&
        (remaining ? validQuestion : validOutput)
      ) {
        yield* delivery;
        return;
      }
      // An inconclusive review cannot establish that the original question is obsolete.
    }
  }
  yield* held;
}
