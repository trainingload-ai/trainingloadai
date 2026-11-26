import type { AiUsageKind } from '@prisma/client';
import type { CoachActivityEvent } from '@shared/ai-coach-run-contract';
import type { PlanCalendarCoachSession } from '@shared/plan-proposal';
import type { PlanQuestionReview } from './coach-plan-question-review';
import type { CoachUserMessageBody } from './coach-query-yield';
import type { AiToolContext } from './tool.types';

export type CoachTurnInput = {
  session: AiToolContext['session'];
  sid?: string;
  branchId?: string | null;
  caseId?: string | null;
  lang: string;
  prompt: string;
  message?: CoachUserMessageBody | null;
  intent?: string;
  thinking?: boolean;
  operationId?: string | null;
  usageKind?: AiUsageKind;
  model?: string;
  executionMode?: 'interactive' | 'background';
  resumeHistory?: boolean;
  runtimeRunId?: string;
  currentUserMessageId?: string;
  calendarEdit?: PlanCalendarCoachSession;
  planQuestionRefresh?: {
    review: PlanQuestionReview;
    changedEvidence: readonly string[];
  };
  platformFunded?: boolean;
  activeSkillName?: string;
  backgroundTask?: AiToolContext['backgroundTask'];
  allowWithoutConsent?: boolean;
  signal: AbortSignal;
  onActivity?: (event: CoachActivityEvent) => Promise<void>;
  onPlanValidationRejected?: AiToolContext['onPlanValidationRejected'];
};
