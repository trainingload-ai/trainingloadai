import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { isCoachInteraction } from '@shared/ai-coach-run-contract';
import { safeParseAskUserQuestionData } from '@shared/ai-coach-schema';
import type {
  CoachAssessmentInquiry,
  OpenCoachAssessmentCaseResult,
} from '@shared/coach-assessment';
import { getStoredCoachLegacyMessage } from '../core/coach-history-messages';
import { ATHLETE_STATE_TASK } from '../core/skills/athleteState.skill';

/** Homepage projection of the existing Coach pending interaction; no separate Case workflow. */
@Injectable()
export class AthleteStateInquiryService {
  constructor(private readonly prisma: PrismaService) {}

  private run(userId: string, id: string) {
    return this.prisma.coachRun.findFirst({
      where: { id, userId, taskKind: ATHLETE_STATE_TASK },
    });
  }

  async pending(userId: string): Promise<CoachAssessmentInquiry | null> {
    const run = await this.prisma.coachRun.findFirst({
      where: { userId, taskKind: ATHLETE_STATE_TASK, status: 'awaiting_input' },
      orderBy: { startedAt: 'desc' },
    });
    if (!run || !isCoachInteraction(run.pendingInteraction)) return null;
    const pending = run.pendingInteraction;
    const row = await this.prisma.aiCoachMessage.findFirst({
      where: {
        id: pending.questionMessageId,
        userId,
        sessionId: run.sessionId,
      },
    });
    const body = getStoredCoachLegacyMessage(row?.message) as {
      content?: Array<{ id?: string; input?: unknown }>;
    };
    const parsed = safeParseAskUserQuestionData(
      body?.content?.find((part) => part.id === pending.questionToolCallId)
        ?.input,
    );
    const question = parsed?.questions[0];
    if (!question) return null;
    const assessment = await this.prisma.athleteStateAssessment.findFirst({
      where: { userId, supersededAt: null },
      orderBy: { asOf: 'desc' },
    });
    return {
      // Keep the public homepage DTO stable while resolving the real Coach run internally.
      caseId: run.id,
      questionId: pending.interactionId,
      title: question.header,
      observation: '',
      reason: '',
      decisionImpact: '',
      question,
      state: assessment?.state ?? 'UNKNOWN',
      confidence: assessment?.confidence ?? 0,
      expiresAt: null,
    };
  }

  async open(
    userId: string,
    id: string,
  ): Promise<OpenCoachAssessmentCaseResult | null> {
    const run = await this.run(userId, id);
    if (!run) return null;
    if (
      run.status !== 'awaiting_input' ||
      !isCoachInteraction(run.pendingInteraction)
    )
      throw new ConflictException('Coach question is no longer pending');
    return {
      sessionId: run.sessionId,
      branchId: run.branchId,
      contextId: null,
      planId: null,
      questionMessageId: run.pendingInteraction.questionMessageId,
    };
  }

  async dismiss(userId: string, id: string) {
    const run = await this.run(userId, id);
    if (!run) return null;
    const updated = await this.prisma.coachRun.updateMany({
      where: { id, userId, status: 'awaiting_input', revision: run.revision },
      data: {
        status: 'cancelled',
        pendingInteraction: Prisma.DbNull,
        endedAt: new Date(),
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1)
      throw new ConflictException('Coach interaction changed');
    return { ok: true };
  }

  async assertBound(
    userId: string,
    id: string,
    sessionId: string,
    branchId: string | null,
  ) {
    const run = await this.run(userId, id);
    if (!run) return false;
    if (run.sessionId !== sessionId || run.branchId !== branchId)
      throw new NotFoundException('Coach interaction not found');
    return true;
  }
}
