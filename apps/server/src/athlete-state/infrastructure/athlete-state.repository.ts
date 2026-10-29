import { Injectable } from '@nestjs/common';
import {
  CoachAssessmentCaseStatus,
  CoachAssessmentQuestionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  AthleteStateAssessmentResult,
  BuiltAthleteStateEvidence,
} from '../domain/athlete-state.contracts';
import {
  ATHLETE_STATE_POLICY_VERSION,
  ATHLETE_STATE_PROMPT_VERSION,
  ACTIVE_COACH_ASSESSMENT_CASE_STATUSES,
} from '../athlete-state-policy';

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));

@Injectable()
export class AthleteStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findReusable(args: {
    userId: string;
    evidenceHash: string;
    policyVersion?: string;
    promptVersion?: string;
  }) {
    const assessment = await this.prisma.athleteStateAssessment.findUnique({
      where: {
        userId_evidenceHash_policyVersion_promptVersion: {
          userId: args.userId,
          evidenceHash: args.evidenceHash,
          policyVersion: args.policyVersion ?? ATHLETE_STATE_POLICY_VERSION,
          promptVersion: args.promptVersion ?? ATHLETE_STATE_PROMPT_VERSION,
        },
      },
    });
    return assessment &&
      !assessment.supersededAt &&
      assessment.expiresAt > new Date()
      ? assessment
      : null;
  }

  latestForUser(userId: string) {
    return this.prisma.athleteStateAssessment.findFirst({
      where: { userId, supersededAt: null },
      orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async isAssessmentAnswerSource(userId: string, sourceMessageId: string) {
    const question = await this.prisma.coachAssessmentQuestion.findFirst({
      where: {
        answerMessageId: sourceMessageId,
        status: CoachAssessmentQuestionStatus.ANSWERED,
        case: { userId },
      },
      select: { id: true },
    });
    return question !== null;
  }

  async saveAssessment(args: {
    userId: string;
    evidence: BuiltAthleteStateEvidence;
    result: AthleteStateAssessmentResult;
    model?: string;
    promptVersion?: string;
    preserveCaseId?: string;
  }) {
    const promptVersion = args.promptVersion ?? ATHLETE_STATE_PROMPT_VERSION;
    const uniqueWhere = {
      userId_evidenceHash_policyVersion_promptVersion: {
        userId: args.userId,
        evidenceHash: args.evidence.evidenceHash,
        policyVersion: ATHLETE_STATE_POLICY_VERSION,
        promptVersion,
      },
    } as const;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.athleteStateAssessment.findUnique({
          where: uniqueWhere,
        });
        if (existing) return { assessment: existing, reused: true };
        const assessment = await tx.athleteStateAssessment.create({
          data: {
            userId: args.userId,
            asOf: new Date(args.evidence.snapshot.asOf),
            timezone: args.evidence.snapshot.timezone,
            state: args.result.state,
            confidence: args.result.confidence,
            decisionReadiness: args.result.decisionReadiness,
            evidenceHash: args.evidence.evidenceHash,
            policyVersion: ATHLETE_STATE_POLICY_VERSION,
            promptVersion,
            model: args.model ?? null,
            evidenceSnapshot: json(args.evidence.snapshot),
            dimensions: json(args.result.dimensions),
            hypotheses: json(args.result.hypotheses),
            evidenceRequests: json(args.result.evidenceRequests),
            safetyFlags: json(args.result.safetyFlags),
            limitations: json(args.result.limitations),
            latestSourceAt: args.evidence.latestSourceAt,
            expiresAt: args.evidence.expiresAt,
          },
        });
        const supersededAt = new Date();
        const previous = await tx.athleteStateAssessment.findMany({
          where: {
            userId: args.userId,
            id: { not: assessment.id },
            supersededAt: null,
          },
          select: { id: true },
        });
        if (previous.length) {
          await tx.athleteStateAssessment.updateMany({
            where: { id: { in: previous.map((row) => row.id) } },
            data: {
              supersededAt,
              supersededById: assessment.id,
            },
          });
          await tx.coachAssessmentCase.updateMany({
            where: {
              assessmentId: { in: previous.map((row) => row.id) },
              ...(args.preserveCaseId
                ? { id: { not: args.preserveCaseId } }
                : {}),
              status: { in: [...ACTIVE_COACH_ASSESSMENT_CASE_STATUSES] },
            },
            data: {
              status: CoachAssessmentCaseStatus.SUPERSEDED,
              resolvedAt: supersededAt,
              revision: { increment: 1 },
            },
          });
        }
        return { assessment, reused: false };
      });
    } catch (error) {
      // Two workers may finish the same model input concurrently. The unique
      // evidence identity selects one immutable snapshot; the loser reuses it
      // instead of failing the trigger or creating divergent Case state.
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const existing = await this.prisma.athleteStateAssessment.findUnique({
        where: uniqueWhere,
      });
      if (!existing) throw error;
      return { assessment: existing, reused: true };
    }
  }

  async invalidateForUser(userId: string) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const assessments = await tx.athleteStateAssessment.updateMany({
        where: { userId, supersededAt: null },
        data: { supersededAt: now },
      });
      const cases = await tx.coachAssessmentCase.findMany({
        where: {
          userId,
          status: { in: [...ACTIVE_COACH_ASSESSMENT_CASE_STATUSES] },
        },
        select: { id: true },
      });
      if (cases.length) {
        await tx.coachAssessmentCase.updateMany({
          where: { id: { in: cases.map((row) => row.id) } },
          data: {
            status: CoachAssessmentCaseStatus.SUPERSEDED,
            resolvedAt: now,
            revision: { increment: 1 },
          },
        });
        await tx.coachAssessmentQuestion.updateMany({
          where: {
            caseId: { in: cases.map((row) => row.id) },
            status: CoachAssessmentQuestionStatus.PENDING,
          },
          data: { status: CoachAssessmentQuestionStatus.SUPERSEDED },
        });
      }
      return { assessments: assessments.count, cases: cases.length };
    });
  }
}
