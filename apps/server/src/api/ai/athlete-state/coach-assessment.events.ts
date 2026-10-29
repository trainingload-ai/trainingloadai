import type { EventEmitter2 } from '@nestjs/event-emitter';

export const COACH_ASSESSMENT_ANSWERED_EVENT =
  'coach.assessment-question.answered.v1';

export const COACH_ASSESSMENT_DECISION_REQUESTED_EVENT =
  'coach.assessment-decision.requested.v1';

export type CoachAssessmentAnsweredEvent = {
  userId: string;
  caseId: string;
  questionId: string;
  promptMessageId: string;
  answerMessageId: string;
  reply: {
    kind: string;
    answers?: Record<string, string | string[]>;
    notes?: Record<string, string>;
    skippedQuestionIds?: string[];
  };
};

export type CoachAssessmentDecisionRequestedEvent = {
  userId: string;
  caseId: string;
  requestedAt: string;
};

export async function emitCoachAssessmentDecisionRequested(
  events: EventEmitter2 | undefined,
  event: Omit<CoachAssessmentDecisionRequestedEvent, 'requestedAt'>,
) {
  if (!events) return;
  await events.emitAsync(COACH_ASSESSMENT_DECISION_REQUESTED_EVENT, {
    ...event,
    requestedAt: new Date().toISOString(),
  } satisfies CoachAssessmentDecisionRequestedEvent);
}
