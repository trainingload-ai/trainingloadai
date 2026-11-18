import type { AskUserQuestionItem } from "./ai-coach-schema";

export type CoachAssessmentInquiry = {
  caseId: string;
  questionId: string;
  title: string;
  observation: string;
  reason: string;
  decisionImpact: string;
  question: AskUserQuestionItem;
  state: string;
  confidence: number;
  /** Legacy Case deadlines; persisted Coach interactions may have no deadline. */
  expiresAt: string | null;
};

export type OpenCoachAssessmentCaseResult = {
  sessionId: string;
  branchId: string | null;
  contextId: string | null;
  planId: string | null;
  questionMessageId: string;
};
