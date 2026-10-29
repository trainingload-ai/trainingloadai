import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
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
  ) {}

  async pendingInquiry(userId: string): Promise<CoachAssessmentInquiry | null> {
    if (!this.flags.homeInquiryEnabled()) return null;
    const row = await this.prisma.coachAssessmentCase.findFirst({
      where: {
        userId,
        status: 'WAITING_FOR_USER',
        expiresAt: { gt: new Date() },
        questions: {
          some: { status: 'PENDING', expiresAt: { gt: new Date() } },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        expiresAt: true,
        currentOutcome: true,
        assessment: { select: { state: true, confidence: true } },
        questions: {
          where: { status: 'PENDING', expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            id: true,
            question: true,
            reason: true,
            decisionImpact: true,
          },
        },
      },
    });
    const pending = row?.questions[0];
    if (!row || !pending) return null;
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
}
