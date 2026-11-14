import { Injectable, Optional } from '@nestjs/common';
import { AthleteStateInquiryService } from './athlete-state-inquiry.service';
import { PrismaService } from '@/prisma/prisma.service';
import {
  OPTIONAL_RECOVERY_EVIDENCE_KINDS,
  isOptionalRecoveryEvidence,
} from '@/athlete-state/domain/optional-evidence';
import { AthleteStateFeatureFlags } from '@/athlete-state/athlete-state-feature-flags.service';
import type { CoachAssessmentInquiry } from '@shared/coach-assessment';
import { safeParseAskUserQuestionData } from '@shared/ai-coach-schema';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class CoachAssessmentCaseQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: AthleteStateFeatureFlags,
    @Optional() private readonly inquiries?: AthleteStateInquiryService,
  ) {}

  async pendingInquiry(userId: string): Promise<CoachAssessmentInquiry | null> {
    if (!this.flags.homeInquiryEnabled()) return null;
    const inquiry = await this.inquiries?.pending(userId);
    if (inquiry) return inquiry;
    const row = await this.prisma.coachAssessmentCase.findFirst({
      where: {
        userId,
        status: 'WAITING_FOR_USER',
        expiresAt: { gt: new Date() },
        questions: {
          some: {
            status: 'PENDING',
            expiresAt: { gt: new Date() },
            evidenceKind: { notIn: [...OPTIONAL_RECOVERY_EVIDENCE_KINDS] },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        expiresAt: true,
        currentOutcome: true,
        assessment: { select: { state: true, confidence: true } },
        questions: {
          where: {
            status: 'PENDING',
            expiresAt: { gt: new Date() },
            evidenceKind: { notIn: [...OPTIONAL_RECOVERY_EVIDENCE_KINDS] },
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            id: true,
            evidenceKind: true,
            question: true,
            reason: true,
            decisionImpact: true,
          },
        },
      },
    });
    const pending = row?.questions[0];
    if (!row || !pending || isOptionalRecoveryEvidence(pending.evidenceKind))
      return null;
    const parsed = safeParseAskUserQuestionData({
      questions: [pending.question],
    });
    const question = parsed?.questions[0];
    if (!question) return null;
    const outcome = record(row.currentOutcome);
    return {
      caseId: row.id,
      questionId: pending.id,
      title: String(outcome.title ?? question.header),
      observation: String(outcome.observation ?? ''),
      reason: String(outcome.reason ?? pending.reason ?? ''),
      decisionImpact: pending.decisionImpact,
      question,
      state: row.assessment.state,
      confidence: row.assessment.confidence,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  requireOwned(userId: string, caseId: string) {
    return this.prisma.coachAssessmentCase.findFirst({
      where: { id: caseId, userId },
      include: {
        assessment: true,
        questions: { orderBy: { createdAt: 'asc' } },
        context: { select: { id: true, planId: true } },
      },
    });
  }
  async answerEvidence(userId: string, questionId: string) {
    const question = await this.prisma.coachAssessmentQuestion.findFirst({
      where: {
        id: questionId,
        case: { userId },
        answerMessageId: { not: null },
      },
    });
    return question?.answer
      ? [
          {
            evidenceKind: question.evidenceKind,
            answer: question.answer,
            eventStart: question.eventStart?.toISOString() ?? null,
            eventEnd: question.eventEnd?.toISOString() ?? null,
          },
        ]
      : undefined;
  }
}
