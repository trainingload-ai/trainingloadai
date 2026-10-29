import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  AiUsageKind,
  CompetitionAssessmentStatus,
  Prisma,
  type CompetitionImpactAssessment,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { CompetitionRepository } from './persistence/competition.repository';
import { parseCompetitionYmd } from './competition-calendar.util';
import { CompetitionImpactContextService } from './competition-impact-context.service';
import { CompetitionImpactEvaluator } from './competition-impact.evaluator';
import { CompetitionImpactFallback } from './competition-impact-fallback';
import type {
  CompetitionImpactInput,
  CompetitionImpactResult,
  ResolveCompetitionImpactArgs,
} from './competition-impact.types';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';

export const COMPETITION_IMPACT_PROMPT_VERSION =
  'competition-impact-v3-coach-voice';
export const COMPETITION_IMPACT_SCHEMA_VERSION = 1;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class CompetitionImpactService {
  private readonly logger = new Logger(CompetitionImpactService.name);
  constructor(
    private readonly contextService: CompetitionImpactContextService,
    private readonly evaluator: CompetitionImpactEvaluator,
    private readonly fallback: CompetitionImpactFallback,
    private readonly aiDataConsent: AiDataConsentService,
    private readonly competitions: CompetitionRepository,
  ) {}

  async resolve(args: ResolveCompetitionImpactArgs) {
    const input = await this.contextService.buildInput(args);
    const inputHash = this.hashInput(input);
    if (!args.forceRefresh) {
      const cached = await this.competitions.findAssessmentUnique({
        where: {
          userId_inputHash_promptVersion_schemaVersion: {
            userId: args.userId,
            inputHash,
            promptVersion: COMPETITION_IMPACT_PROMPT_VERSION,
            schemaVersion: COMPETITION_IMPACT_SCHEMA_VERSION,
          },
        },
      });
      if (
        cached?.result &&
        cached.status === CompetitionAssessmentStatus.SUCCESS
      ) {
        return this.toResponse(cached, true);
      }
    }

    const startedAt = Date.now();
    let result: CompetitionImpactResult;
    let status: CompetitionAssessmentStatus =
      CompetitionAssessmentStatus.SUCCESS;
    let errorCode: string | null = null;
    let fallbackVersion: string | null = null;
    try {
      if (input.events.length) {
        if (!(await this.aiDataConsent.isGranted(args.userId))) {
          throw new Error('COMPETITION_IMPACT_AI_DATA_CONSENT_REQUIRED');
        }
        result = await this.evaluator.evaluate(input, {
          userId: args.userId,
          operationId: args.aiOperationId,
          kind: args.aiUsageKind ?? AiUsageKind.OTHER,
        });
      } else {
        result = this.emptyResult(input);
      }
    } catch (error) {
      const rawError = error instanceof Error ? error.message : '';
      errorCode = rawError.startsWith('COMPETITION_IMPACT_')
        ? rawError.slice(0, 160)
        : 'COMPETITION_IMPACT_AI_OR_VALIDATION_FAILED';
      this.logger.warn(
        `impact evaluation fallback userHash=${this.userLogHash(args.userId)} inputHash=${inputHash} eventCount=${input.events.length} error=${errorCode}`,
      );
      result = this.fallback.build(input);
      status = CompetitionAssessmentStatus.FALLBACK;
      fallbackVersion = this.fallback.version;
    }

    const confidence = this.aggregateConfidence(result);
    try {
      const assessment = await this.competitions.upsertAssessment({
        where: {
          userId_inputHash_promptVersion_schemaVersion: {
            userId: args.userId,
            inputHash,
            promptVersion: COMPETITION_IMPACT_PROMPT_VERSION,
            schemaVersion: COMPETITION_IMPACT_SCHEMA_VERSION,
          },
        },
        create: {
          userId: args.userId,
          scopeType: args.scopeType,
          scopeStartDate: parseCompetitionYmd(
            args.scopeStartDate,
            'scopeStartDate',
          ),
          scopeEndDate: parseCompetitionYmd(args.scopeEndDate, 'scopeEndDate'),
          anchorDate: parseCompetitionYmd(args.anchorDate, 'anchorDate'),
          inputHash,
          inputSnapshot: input as unknown as Prisma.InputJsonObject,
          result: result as unknown as Prisma.InputJsonObject,
          status,
          confidence,
          model:
            status === CompetitionAssessmentStatus.SUCCESS
              ? this.evaluator.model()
              : null,
          provider:
            status === CompetitionAssessmentStatus.SUCCESS
              ? this.evaluator.provider()
              : null,
          promptVersion: COMPETITION_IMPACT_PROMPT_VERSION,
          schemaVersion: COMPETITION_IMPACT_SCHEMA_VERSION,
          fallbackVersion,
          durationMs: Date.now() - startedAt,
          errorCode,
        },
        update: {
          result: result as unknown as Prisma.InputJsonObject,
          status,
          confidence,
          model:
            status === CompetitionAssessmentStatus.SUCCESS
              ? this.evaluator.model()
              : null,
          provider:
            status === CompetitionAssessmentStatus.SUCCESS
              ? this.evaluator.provider()
              : null,
          fallbackVersion,
          durationMs: Date.now() - startedAt,
          errorCode,
          createdAt: new Date(),
        },
      });
      this.logger.log(
        `impact evaluation complete userHash=${this.userLogHash(args.userId)} assessmentId=${assessment.id} inputHash=${inputHash} scope=${args.scopeType} eventCount=${input.events.length} status=${status} cacheHit=false durationMs=${Date.now() - startedAt}`,
      );
      return this.toResponse(assessment, false);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const assessment = await this.competitions.findAssessmentUniqueOrThrow({
          where: {
            userId_inputHash_promptVersion_schemaVersion: {
              userId: args.userId,
              inputHash,
              promptVersion: COMPETITION_IMPACT_PROMPT_VERSION,
              schemaVersion: COMPETITION_IMPACT_SCHEMA_VERSION,
            },
          },
        });
        return this.toResponse(assessment, true);
      }
      throw error;
    }
  }

  async resolveForContext(args: ResolveCompetitionImpactArgs) {
    const input = await this.contextService.buildInput(args);
    const inputHash = this.hashInput(input);
    const cached = await this.competitions.findAssessmentUnique({
      where: {
        userId_inputHash_promptVersion_schemaVersion: {
          userId: args.userId,
          inputHash,
          promptVersion: COMPETITION_IMPACT_PROMPT_VERSION,
          schemaVersion: COMPETITION_IMPACT_SCHEMA_VERSION,
        },
      },
    });
    const fallbackFresh =
      cached?.status === CompetitionAssessmentStatus.FALLBACK &&
      Date.now() - cached.createdAt.getTime() < 10 * 60_000;
    if (
      cached?.result &&
      (cached.status === CompetitionAssessmentStatus.SUCCESS || fallbackFresh)
    ) {
      return this.toResponse(cached, true);
    }

    const result = this.fallback.build(input);
    void this.resolve({ ...args, forceRefresh: true }).catch((error) => {
      this.logger.warn(
        `background impact refresh failed userHash=${this.userLogHash(args.userId)} inputHash=${inputHash} error=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    });
    return {
      assessmentId: null,
      status: CompetitionAssessmentStatus.FALLBACK,
      cacheHit: false,
      inputHash,
      assessedAt: new Date().toISOString(),
      confidence: this.aggregateConfidence(result),
      model: null,
      provider: null,
      promptVersion: COMPETITION_IMPACT_PROMPT_VERSION,
      schemaVersion: COMPETITION_IMPACT_SCHEMA_VERSION,
      fallbackVersion: this.fallback.version,
      events: input.events,
      result,
    };
  }

  private hashInput(input: CompetitionImpactInput) {
    return createHash('sha256').update(canonicalJson(input)).digest('hex');
  }

  private userLogHash(userId: string) {
    return createHash('sha256')
      .update(`competition-log:${userId}`)
      .digest('hex')
      .slice(0, 16);
  }

  private aggregateConfidence(result: CompetitionImpactResult) {
    if (result.eventAssessments.length === 0) return 1;
    return (
      result.eventAssessments.reduce((sum, item) => sum + item.confidence, 0) /
      result.eventAssessments.length
    );
  }

  private emptyResult(input: CompetitionImpactInput): CompetitionImpactResult {
    return {
      schemaVersion: 1,
      assessmentDate: input.anchorDate,
      eventAssessments: [],
      combinedImpact: {
        overallLevel: 'LOW',
        conflicts: [],
        strategySummary:
          'No candidate competition events were found for this scope.',
      },
    };
  }

  private toResponse(
    assessment: CompetitionImpactAssessment,
    cacheHit: boolean,
  ) {
    const inputSnapshot = assessment.inputSnapshot as
      | { events?: unknown[] }
      | null
      | undefined;
    return {
      assessmentId: assessment.id,
      status: assessment.status,
      cacheHit,
      inputHash: assessment.inputHash,
      assessedAt: assessment.createdAt.toISOString(),
      confidence: assessment.confidence,
      model: assessment.model,
      provider: assessment.provider,
      promptVersion: assessment.promptVersion,
      schemaVersion: assessment.schemaVersion,
      fallbackVersion: assessment.fallbackVersion,
      events: Array.isArray(inputSnapshot?.events) ? inputSnapshot.events : [],
      result: assessment.result,
    };
  }
}
