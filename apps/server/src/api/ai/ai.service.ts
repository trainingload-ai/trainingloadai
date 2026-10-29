import { loadReferencedCoachQuestion } from './core/coach-question-reference';
import { fitnessConfirmationFromQuestion } from './fitness-assessment-confirmation';
import { parseFitnessUserAction } from '@shared/fitness-assessment';
import { FitnessCalculationService } from '@/fitness-calculation/fitness-calculation.service';
import { FitnessAssessmentApplyService } from './fitness-assessment-apply.service';
import { FitnessAssessmentFollowupService } from './fitness-assessment-followup.service';
import type {
  FitnessConfirmation,
  FitnessTrackingReply,
  FitnessProtocolReply,
} from '@shared/fitness-assessment';
import { sanitizeCoachAssistantTextForLocale } from '@shared/coach-reply-language';
import { PrismaService } from '@/prisma/prisma.service';
import {
  Injectable,
  ConflictException,
  Inject,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';

import { UserService } from '../user/user.service';
import { $Enums, AiUsageKind, type Prisma } from '@prisma/client';
import type { AiModelPurpose } from '@shared/ai-model';
import {
  AiCoachMessageRole,
  AiCoachSessionType,
  AiCoachReviewScope,
} from '@prisma/client';
import { UserSession } from '@thallesp/nestjs-better-auth';
import { I18nService } from 'nestjs-i18n';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import { streamCoachAnswer } from './core/tool-loop-agent.runtime';
import { previewTextForLog } from './core/safe-json-preview';
import { sha256Hex, stableJson } from './core/ai-common.util';
import {
  createCoachClient,
  getCoachModel,
  getCoachBaseUrlForLog,
  getCoachUpstreamProvider,
  isCoachUpstreamConfigured,
} from './core/coach-upstream.adapter';
import {
  parseCoachReviewAdjustment,
  parseDailyPlanReviewJudgment,
  type CoachReviewAction,
} from './daily-plan-review-judgment';
import {
  buildCoachReviewAdjustmentSystemPrompt,
  buildPlanReviewJudgmentSystemPrompt,
  serializeCoachReviewAdjustmentInput,
  serializePlanReviewJudgmentContext,
} from './core/prompt-contracts/plan-review-judgment.contract';
import {
  parseCoachQuestionReplyLikeToolResultPayload,
  type PlanWorkoutAdjustmentDraftData,
} from '@shared/ai-coach-schema';
import type { CoachTurnErrorData } from '@shared/coach-turn-error';
import type {
  CoachAssistantMessageBody,
  CoachQueryYield,
  CoachUserMessageBody,
} from './core/coach-query-yield';
import { getCoachTools } from './core/tool.registry';
import { CoachToolsService } from './core/coach-tools.service';
import { CoachActionService } from './core/coach-action.service';
import { AiUsageService, parseOpenAIUsage } from './ai-usage.service';
import { PlanService } from '../plan/plan.service';
import { PlanQueryService } from '../plan/application/plan-query.service';
import { PlanExecutionContextService } from '../plan/plan-execution-context.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityReadService } from '../activity/activity-read.service';
import { UserQueryService } from '../user/user-query.service';
import { ActivityAiReviewService } from '../activity/activity-ai-review.service';
import { PMCService } from '@/training-load/pmc.service';
import { ReviewDigestQueryService } from '@/review/review-digest-query.service';
import { CoachBranchingService } from './coach-branching.service';
import {
  buildActivityReviewGenerationContext,
  buildUnifiedActivityAnalysisInput,
} from './activity-coach-unified-input';
import { hashActivityCoachDedupe } from './activity-coach-evidence-hash';
import {
  compileActivityCoachMessages,
  formatActivityCoachCompiledPromptLog,
} from './activity-coach-envelope';
import { resolveCoachActiveSkill } from './core/coach-skill-resolution';
import { getCoachSkillByName } from './core/skill.registry';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { resolveSupportedLocale } from '@/utils/locale.util';
import {
  buildStoredCoachUiMessageEnvelope,
  buildHistoryMessages,
  getStoredCoachLegacyMessage,
  isStoredCoachTurnFailureRow,
  sanitizeStoredCoachMessageForClient,
  shouldReplayStoredCoachMessageToProvider,
  type StoredCoachMessageRow,
} from './core/coach-history-messages';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
import { ExternalProviderStatusQueryService } from '@/integrations/external-provider/external-provider-status-query.service';
import { ActivitySeriesQueryService } from '@/api/activity/activity-series-query.service';
import { TrainingDataCoverageQueryService } from './core/training-data-coverage-query.service';
import { CoachRunStore } from './coach-run-store.service';
import {
  AI_OPERATION_LEDGER,
  type AiOperationLedger,
} from './ai-operation-ledger.port';
import { resolveAiModel } from './ai-model-catalog';
import { WorkoutService } from '../workout/workout.service';
import { WorkoutDefinitionService } from '../workout/workout-definition.service';
import {
  coachSafetyConcern,
  resolveCoachReplyLanguage,
  urgentCoachSafetyReply,
  withCoachSafetyReminder,
} from './core/coach-safety-policy';
import { currentDecisionConfirmationId } from './core/coach-workout-change';
import { CoachMemoryExtractionEnqueuer } from './memory/coach-memory-extraction-enqueuer.service';
import { AthleteMemoryQueryService } from '@/athlete-memory/application/athlete-memory-query.service';
import { ApplyMemoryOperationsService } from '@/athlete-memory/application/apply-memory-operations.service';
import type { AmbientMemoryContext } from '@/athlete-memory/application/ambient-memory-context.service';
import { MEMORY_POLICY_VERSION } from '@/athlete-memory/domain/memory-operation';
import { readPublicDemoText } from '@/public-demo/public-demo-localized-text';
import {
  WEB_EVIDENCE_GATEWAY,
  type WebEvidenceGateway,
} from './core/web-evidence.gateway';

dayjs.extend(utc);
dayjs.extend(timezone);
import * as crypto from 'crypto';
function buildUserMessageBody(content: string): CoachUserMessageBody {
  return { content: [{ type: 'text', text: content }] };
}

function buildAssistantMessageBody(content: string): CoachAssistantMessageBody {
  const trimmed = String(content ?? '').trim();
  return { content: trimmed ? [{ type: 'text', text: trimmed }] : [] };
}

type ActivityAnalysisStreamChunk = {
  choices: Array<{ delta?: { content?: string } }>;
  usage?: unknown;
  __activityReviewId?: string;
};

type ActivityAnalysisResult = { content: string; reviewId: string };

export type AiTrainingAdviceWeatherContext = {
  status?: 'unavailable' | 'available';
  summary?: string | null;
  temperatureC?: number | null;
  feelsLikeC?: number | null;
  precipitationProbability?: number | null;
  windKph?: number | null;
  airQuality?: string | null;
};

export type AiTrainingAdviceContext = {
  locale?: string;
  date?: string;
  weekday?: string;
  timezone?: string | null;
  surface?: string;
  factHash?: string | null;
  contextId?: string | null;
  dayCompletionState?: string | null;
  activePlan?: {
    title?: string | null;
    goal?: string | null;
    periodWeeks?: number | null;
    currentWeekIndex?: number | null;
  } | null;
  todayWorkouts?: Array<{
    title?: string | null;
    sport?: string | null;
    duration?: string | null;
    status?: string | null;
    focus?: string | null;
  }>;
  tomorrowWorkouts?: Array<Record<string, unknown>>;
  nextWorkouts?: Array<Record<string, unknown>>;
  currentWorkout?: Record<string, unknown> | null;
  load?: {
    currentWeekLoad?: number | null;
    previousWeekLoad?: number | null;
    loadDrift?: number | null;
    ctl?: number | null;
    atl?: number | null;
    tsb?: number | null;
  };
  recentActivity?: {
    title?: string | null;
    sportType?: string | null;
    startTime?: string | null;
    durationMinutes?: number | null;
    distanceKm?: number | null;
    load?: number | null;
    status?: string | null;
  } | null;
  linkedActivities?: unknown[];
  unlinkedActivities?: unknown[];
  recentEvents?: unknown[];
  coachState?: {
    decisionReadStatus?: 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
    decisions?: Array<Record<string, unknown>>;
    recentReviews?: Array<Record<string, unknown>>;
  };
  coachStateHash?: string | null;
  weather?: AiTrainingAdviceWeatherContext | null;
  weatherImpact?: import('@/weather/weather.types').TodayWeatherImpact | null;
  _timingHints?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AiTrainingAdviceResult = {
  summary: string;
  tags: string[];
  coachDecisionHandling?: Array<{
    decisionId: string;
    handling: 'FOLLOW' | 'CONDITIONAL' | 'DEPART' | 'HISTORY' | 'IGNORE';
    reason: string | null;
  }>;
};

type BackgroundCoachTaskRun<T> = {
  result: T;
  usage: ReturnType<typeof parseOpenAIUsage>;
  provider: string | null;
  model: string;
  runId: string;
  operationId: string;
  replayed: boolean;
};

type AnonymousCoachTaskRun<T> = {
  result: T;
  usage: ReturnType<typeof parseOpenAIUsage>;
  provider: string | null;
  model: string;
};

export class AnonymousCoachTaskExecutionError extends Error {
  constructor(
    cause: unknown,
    readonly usage: ReturnType<typeof parseOpenAIUsage>,
  ) {
    super(
      cause instanceof Error
        ? cause.message
        : String(cause || 'ANONYMOUS_COACH_TASK_FAILED'),
    );
    this.name = 'AnonymousCoachTaskExecutionError';
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

function aggregateCoachUsage(events: unknown[]) {
  const parsed = events.map((usage) => parseOpenAIUsage(usage));
  return {
    inputTokens: parsed.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: parsed.reduce((sum, item) => sum + item.outputTokens, 0),
    cachedInputTokens: parsed.reduce(
      (sum, item) => sum + item.cachedInputTokens,
      0,
    ),
    reported: parsed.some((item) => item.reported),
  };
}

function hasVisibleTextMessageBlock(message: unknown): boolean {
  // 判断结构化消息里是否有用户可见文本，用于避免只含工具回填的消息被当作普通气泡展示。
  const uiParts = (message as { parts?: unknown } | null)?.parts;
  if (Array.isArray(uiParts)) {
    return uiParts.some((part) => {
      if (!part || typeof part !== 'object' || Array.isArray(part)) {
        return false;
      }
      const p = part as { type?: unknown; text?: unknown };
      return (
        p.type === 'text' &&
        typeof p.text === 'string' &&
        p.text.trim() &&
        !isNonVisibleCoachTextPayload(p.text)
      );
    });
  }

  const legacyMessage = getStoredCoachLegacyMessage(message);
  const content = (legacyMessage as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return false;
  return content.some((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      return false;
    }
    const b = block as { type?: unknown; text?: unknown };
    return (
      b.type === 'text' &&
      typeof b.text === 'string' &&
      b.text.trim() &&
      !isNonVisibleCoachTextPayload(b.text)
    );
  });
}

/** Upper bound of consecutive trailing failure rows inspected on retry. */
const COACH_TAIL_FAILURE_SCAN_LIMIT = 20;

const NON_VISIBLE_COACH_TEXT_KINDS = new Set([
  'coach_question_reply_text',
  'coach_question_skip_text',
  'coach_plan_draft_saved',
  'plan_workout_adjustment_applied',
]);

function getStructuredCoachTextKind(raw: string): string | null {
  const compact = String(raw ?? '').trim();
  if (!compact.startsWith('{') || !compact.endsWith('}')) return null;

  try {
    const parsed = JSON.parse(compact) as { kind?: unknown };
    return typeof parsed?.kind === 'string' ? parsed.kind : null;
  } catch {
    return null;
  }
}

function isNonVisibleCoachTextPayload(raw: string): boolean {
  const kind = getStructuredCoachTextKind(raw);
  return kind ? NON_VISIBLE_COACH_TEXT_KINDS.has(kind) : false;
}

function deriveCoachSessionTitle(raw: string): string | null {
  const compact = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!compact) return null;

  if (isNonVisibleCoachTextPayload(compact)) {
    return null;
  }

  return compact.length > 80 ? `${compact.slice(0, 80)}…` : compact;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly running = new Map<
    string,
    {
      createdAt: number;
      done: Promise<ActivityAnalysisResult>;
    }
  >();

  constructor(
    private prisma: PrismaService,
    private userService: UserService,
    private coachTools: CoachToolsService,
    private readonly i18n: I18nService,
    private readonly coachActions: CoachActionService,
    private readonly planService: PlanService,
    private readonly planQuery: PlanQueryService,
    private readonly planExecutionContext: PlanExecutionContextService,
    private readonly activityService: ActivityService,
    private readonly activityAiReviewService: ActivityAiReviewService,
    private readonly coachBranching: CoachBranchingService,
    private readonly pmcService: PMCService,
    private readonly reviewDigests: ReviewDigestQueryService,
    private readonly activityRead: ActivityReadService,
    private readonly users: UserQueryService,
    private readonly aiDataConsent: AiDataConsentService,
    private readonly integrationStatus: ExternalProviderStatusQueryService,
    private readonly activitySeries: ActivitySeriesQueryService,
    private readonly trainingDataCoverage: TrainingDataCoverageQueryService,
    private readonly workoutService: WorkoutService,
    private readonly workoutDefinitions: WorkoutDefinitionService,
    private readonly aiUsage: AiUsageService,
    private readonly coachRuns: CoachRunStore,
    @Inject(AI_OPERATION_LEDGER)
    private readonly operations: AiOperationLedger,
    @Inject(WEB_EVIDENCE_GATEWAY)
    private readonly webEvidence: WebEvidenceGateway,
    @Optional()
    private readonly fitnessCalculations?: FitnessCalculationService,
    @Optional() private readonly fitnessApply?: FitnessAssessmentApplyService,
    @Optional()
    private readonly fitnessFollowup?: FitnessAssessmentFollowupService,
    @Optional()
    private readonly memoryExtraction?: CoachMemoryExtractionEnqueuer,
    @Optional()
    private readonly athleteMemory?: AthleteMemoryQueryService,
    @Optional()
    private readonly memoryCommands?: ApplyMemoryOperationsService,
  ) {}

  /**
   * 获取 AI Coach 所使用的模型名称（按上游 provider 读取环境变量）
   */
  private getCoachModel(options?: { thinking?: boolean }) {
    return getCoachModel(options);
  }

  getActivityAnalysisRuntime(purpose: AiModelPurpose) {
    const upstream = this.resolveActivityAnalysisUpstream();
    const model =
      upstream.provider === 'legacy-dashscope'
        ? upstream.model
        : this.getCoachModel({ thinking: purpose === 'REASONING' });
    return { provider: upstream.provider, model, baseURL: upstream.baseURL };
  }

  private resolveActivityAnalysisUpstream(): {
    model: string;
    provider: string;
    baseURL: string;
  } {
    // 活动分析沿用旧 DashScope 配置；若 Coach 已配置统一上游，则优先复用同一 OpenAI-compatible client。
    const explicitModel = String(process.env.AI_ANALYSIS_MODEL ?? '').trim();
    const provider = getCoachUpstreamProvider();

    if (provider) {
      const model = explicitModel || this.getCoachModel();
      return {
        model: model || 'qwen3.5-plus-2026-02-15',
        provider,
        baseURL: getCoachBaseUrlForLog(provider),
      };
    }

    if (process.env.SELF_HOST_MODE?.trim()) {
      return {
        model: explicitModel,
        provider: 'disabled',
        baseURL: 'none',
      };
    }

    const apiKey = String(
      process.env.DASHSCOPE_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
    ).trim();
    return {
      model: explicitModel || 'qwen3.5-plus-2026-02-15',
      provider: apiKey ? 'legacy-dashscope' : 'disabled',
      baseURL: process.env.DASHSCOPE_BASE_URL ?? 'none',
    };
  }

  private summarizeAnalysisMessageForLog(message: unknown) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return { role: 'unknown', content: previewTextForLog(message) };
    }
    const m = message as {
      role?: unknown;
      content?: unknown;
      tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }>;
    };
    return {
      role: typeof m.role === 'string' ? m.role : 'unknown',
      content:
        typeof m.content === 'string'
          ? previewTextForLog(m.content)
          : m.content == null
            ? null
            : previewTextForLog(m.content),
      toolCalls: Array.isArray(m.tool_calls)
        ? m.tool_calls.map((tc) => ({
            name: tc?.function?.name,
            args: previewTextForLog(tc?.function?.arguments, 300),
          }))
        : undefined,
    };
  }

  private async allocateCoachMessageSequence(
    tx: Prisma.TransactionClient,
    userId: string,
    safeSid: string,
  ): Promise<number> {
    // 在会话行上自增 nextSequence，保证并发写入时消息顺序仍由数据库事务决定。
    const row = await tx.aiCoachSession.update({
      where: { userId_id: { userId, id: safeSid } },
      data: { nextSequence: { increment: 1 } },
      select: { nextSequence: true },
    });
    return row.nextSequence - 1;
  }

  /**
   * 从数据库读取教练上下文：会话级 summary + 最近若干条消息（按 sequence）
   */
  private async loadCoachContextFromDb(
    userId: string,
    safeSid: string,
  ): Promise<{ summary: string; rows: StoredCoachMessageRow[] }> {
    const maxTurnPairs = Number(process.env.AI_COACH_RECENT_TURNS || 8);
    const take = maxTurnPairs * 2;

    const sessionRow = await this.prisma.aiCoachSession.findUnique({
      where: { userId_id: { userId, id: safeSid } },
      select: { summary: true },
    });

    const rows = await this.prisma.aiCoachMessage.findMany({
      where: { userId, sessionId: safeSid },
      orderBy: { sequence: 'desc' },
      take,
      select: { role: true, content: true, message: true },
    });

    rows.reverse();

    const s = sessionRow?.summary?.trim();
    return {
      summary: s ? String(sessionRow.summary) : '',
      rows,
    };
  }

  private textFromStoredBranchContent(content: unknown): string {
    const blocks = (content as { content?: unknown } | null)?.content;
    if (!Array.isArray(blocks)) {
      try {
        return JSON.stringify(content ?? {});
      } catch {
        return '';
      }
    }
    return blocks
      .map((block) => {
        if (!block || typeof block !== 'object' || Array.isArray(block)) {
          return '';
        }
        const b = block as { type?: unknown; text?: unknown };
        return b.type === 'text' && typeof b.text === 'string' ? b.text : '';
      })
      .join('')
      .trim();
  }

  private async loadCoachBranchContextFromDb(
    userId: string,
    branchId: string,
  ): Promise<{ summary: string; rows: StoredCoachMessageRow[] }> {
    const branch = await this.prisma.coachBranch.findFirst({
      where: {
        id: branchId,
        context: { userId },
      },
      include: {
        context: {
          select: {
            id: true,
            planId: true,
            status: true,
            headEventSeq: true,
          },
        },
      },
    });
    if (!branch) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Coach branch not found',
      });
    }

    const [messages, systemMessages, compactions, decisions] =
      await Promise.all([
        this.prisma.coachBranchMessage.findMany({
          where: { branchId },
          orderBy: { msgSeq: 'asc' },
          take: Number(process.env.AI_COACH_BRANCH_RECENT_MESSAGES || 40),
          select: { role: true, content: true },
        }),
        this.prisma.coachBranchMessage.findMany({
          where: { branchId, role: 'system' },
          orderBy: { msgSeq: 'desc' },
          take: 5,
          select: { content: true },
        }),
        this.prisma.coachBranchCompaction.findMany({
          where: { branchId },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: {
            summaryText: true,
            summaryJson: true,
            fromSeq: true,
            toSeq: true,
          },
        }),
        this.prisma.coachDecision.findMany({
          where: { branchId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            state: true,
            riskTier: true,
            decisionType: true,
            rationale: true,
            confidence: true,
            baseEventSeq: true,
            approvedAt: true,
            appliedAt: true,
            options: {
              select: {
                optionKey: true,
                title: true,
                isSelected: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        }),
      ]);

    const rows: StoredCoachMessageRow[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role:
          m.role === 'assistant'
            ? AiCoachMessageRole.ASSISTANT
            : m.role === 'user'
              ? AiCoachMessageRole.USER
              : AiCoachMessageRole.SYSTEM,
        content: this.textFromStoredBranchContent(m.content),
        message: m.content,
      }));

    const compactionText = compactions
      .map((c) => {
        const text = String(c.summaryText ?? '').trim();
        if (text) return `seq ${c.fromSeq}-${c.toSeq}: ${text}`;
        try {
          return `seq ${c.fromSeq}-${c.toSeq}: ${JSON.stringify(c.summaryJson ?? {})}`;
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .join('\n');

    const decisionText = decisions
      .map((d) => {
        const selected = d.options
          .filter((o) => o.isSelected)
          .map((o) => `${o.optionKey}${o.title ? `:${o.title}` : ''}`)
          .join(',');
        const options = d.options
          .map((o) => `${o.optionKey}${o.title ? `:${o.title}` : ''}`)
          .join(',');
        return [
          `decisionId=${d.id}`,
          `state=${d.state}`,
          `type=${d.decisionType}`,
          `risk=${d.riskTier}`,
          typeof d.confidence === 'number' ? `confidence=${d.confidence}` : '',
          typeof d.baseEventSeq === 'number'
            ? `baseEventSeq=${d.baseEventSeq}`
            : '',
          d.approvedAt ? `approvedAt=${d.approvedAt.toISOString()}` : '',
          d.appliedAt ? `appliedAt=${d.appliedAt.toISOString()}` : '',
          selected ? `selectedOption=${selected}` : '',
          options ? `options=${options}` : '',
          d.rationale ? `rationale=${d.rationale}` : '',
        ]
          .filter(Boolean)
          .join('; ');
      })
      .join('\n');

    const rebaseText = systemMessages
      .map((m) => {
        const c = m.content as Record<string, unknown> | null;
        if (!c || c.kind !== 'decision_rebase') return '';
        try {
          return JSON.stringify(c);
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .join('\n');

    const summary = [
      `Coach branch context: branchId=${branch.id}, contextId=${branch.contextId}, planId=${branch.context.planId}, branchStatus=${branch.status}, contextStatus=${branch.context.status}.`,
      `Base event seq=${branch.baseEventSeq}; current context head event seq=${branch.context.headEventSeq}.`,
      branch.openReason ? `Open reason: ${branch.openReason}.` : '',
      rebaseText
        ? `Rebase source. Treat the prior decision as historical context, not as already valid for the current head event sequence. Re-evaluate whether it still holds before drafting any replacement decision:\n${rebaseText}`
        : '',
      decisionText ? `Branch decisions:\n${decisionText}` : '',
      compactionText ? `Branch compactions:\n${compactionText}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return { summary, rows };
  }

  /**
   * 追加一条用户消息（仅写库，上下文以 DB 为准）
   *
   * 返回：
   * - 规范化后的 sid（为空则为 'default'）
   */
  async coachAppendUserTurn(params: {
    session: UserSession;
    sid?: string;
    lang: string;
    content: string;
    message?: CoachUserMessageBody | null;
  }): Promise<string> {
    // 只负责落库用户轮次；真正组装上下文与流式生成在 coachStream 中完成。
    const userId = params.session?.user?.id;
    if (!userId) return String(params.sid ?? '').trim() || 'default';
    const safeSid = String(params.sid ?? '').trim() || 'default';

    const content = String(params.content ?? '');
    const message = params.message ?? buildUserMessageBody(content);
    await this.prisma.$transaction(async (tx) => {
      await tx.aiCoachSession.upsert({
        where: { userId_id: { userId, id: safeSid } },
        create: {
          userId,
          id: safeSid,
          lang: params.lang,
        },
        update: { lang: params.lang },
      });

      // 失败后重试同一条提问：末条（忽略其后的失败提示行）已是相同 USER 文本时
      // 复用该行，并删除被本次重试取代的失败提示，避免「你好」叠两条。
      const { lastTurn, trailingFailureIds } = await this.findCoachTailTurn(
        tx,
        userId,
        safeSid,
      );
      if (
        lastTurn?.role === AiCoachMessageRole.USER &&
        lastTurn.content === content
      ) {
        if (trailingFailureIds.length > 0) {
          await tx.aiCoachMessage.deleteMany({
            where: { userId, id: { in: trailingFailureIds } },
          });
        }
        return;
      }

      const seq = await this.allocateCoachMessageSequence(tx, userId, safeSid);
      const userMessage = await tx.aiCoachMessage.create({
        data: {
          userId,
          sessionId: safeSid,
          role: AiCoachMessageRole.USER,
          content,
          message: buildStoredCoachUiMessageEnvelope({
            role: 'user',
            content,
            message,
          }) as unknown as Prisma.InputJsonValue,
          sequence: seq,
        },
      });
      await this.memoryExtraction?.enqueueEligibleMessage({
        tx,
        userId,
        sessionId: safeSid,
        sourceMessageId: userMessage.id,
        content,
        hasStructuredUserInput: message.content.length > 0,
      });

      const sess = await tx.aiCoachSession.findUnique({
        where: { userId_id: { userId, id: safeSid } },
      });
      if (sess && !sess.title && content.trim()) {
        const title = deriveCoachSessionTitle(content);
        if (title) {
          await tx.aiCoachSession.update({
            where: { userId_id: { userId, id: safeSid } },
            data: {
              title,
            },
          });
        }
      }
    });

    return safeSid;
  }

  /**
   * 会话末尾的「真实轮次」：跳过末尾仅供展示的失败提示行（providerReplay=false）。
   */
  private async findCoachTailTurn(
    db: Pick<Prisma.TransactionClient, 'aiCoachMessage'>,
    userId: string,
    sid: string,
  ): Promise<{
    lastTurn: { role: AiCoachMessageRole; content: string } | null;
    trailingFailureIds: string[];
  }> {
    const tail = await db.aiCoachMessage.findMany({
      where: { userId, sessionId: sid },
      orderBy: { sequence: 'desc' },
      take: COACH_TAIL_FAILURE_SCAN_LIMIT,
      select: { id: true, role: true, content: true, message: true },
    });
    const trailingFailureIds: string[] = [];
    for (const row of tail) {
      if (isStoredCoachTurnFailureRow(row)) {
        trailingFailureIds.push(row.id);
        continue;
      }
      return { lastTurn: row, trailingFailureIds };
    }
    return { lastTurn: null, trailingFailureIds };
  }

  /**
   * 落库一条失败提示（助手角色、providerReplay=false、带 data-coach-turn-error 部件）。
   * 刷新后仍可见、可重试；永远不会作为上下文回放给模型。
   */
  async coachAppendTurnFailure(params: {
    session: UserSession;
    sid?: string;
    lang: string;
    content: string;
    code: string;
    branchId?: string | null;
  }): Promise<string | null> {
    return this.coachAppendAssistantTurn({
      session: params.session,
      sid: params.sid,
      lang: params.lang,
      content: params.content,
      branchId: params.branchId,
      providerReplay: false,
      turnError: { code: params.code },
    });
  }

  /**
   * 用 digest markdown 覆盖 `review-digest-*` Coach 会话。
   * Review worker 只调这个门面，不直写 AiCoachSession / AiCoachMessage。
   */
  async replaceReviewDigestSession(args: {
    userId: string;
    digestId: string;
    type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    lang: string;
    title: string;
    markdown: string;
  }): Promise<void> {
    const sid = `review-digest-${args.digestId}`;
    const reviewScope =
      args.type === 'DAILY'
        ? AiCoachReviewScope.DAILY
        : args.type === 'WEEKLY'
          ? AiCoachReviewScope.WEEKLY
          : AiCoachReviewScope.MONTHLY;

    await this.prisma.$transaction(async (tx) => {
      await tx.aiCoachSession.upsert({
        where: { userId_id: { userId: args.userId, id: sid } },
        create: {
          userId: args.userId,
          id: sid,
          lang: args.lang,
          type: AiCoachSessionType.REVIEW,
          reviewScope,
          title: args.title,
          nextSequence: 2,
        },
        update: {
          lang: args.lang,
          type: AiCoachSessionType.REVIEW,
          reviewScope,
          title: args.title,
          nextSequence: 2,
          summary: null,
        },
      });

      await tx.aiCoachMessage.deleteMany({
        where: { userId: args.userId, sessionId: sid },
      });
      await tx.aiCoachMessage.create({
        data: {
          userId: args.userId,
          sessionId: sid,
          role: AiCoachMessageRole.ASSISTANT,
          content: args.markdown,
          message: null,
          sequence: 1,
        },
      });
    });
  }

  /**
   * 视情况压缩会话上下文（balanced 策略，数据来自 DB）
   * - 仅当「消息条数/总字符」超阈值时调用模型生成摘要
   * - 将更早的对话压进 `AiCoachSession.summary`；**不删除**消息行，完整历史仍供 API / 前端使用
   *
   * 注意：该压缩是“尽力而为”，失败不会影响主流程
   */
  private async maybeCompressCoachFromDb(args: {
    userId: string;
    sid: string;
    signal: AbortSignal;
  }) {
    const maxRecent = Number(process.env.AI_COACH_RECENT_TURNS || 8);
    const maxChars = Number(process.env.AI_COACH_MAX_CHARS || 12000);

    const sessionRow = await this.prisma.aiCoachSession.findUnique({
      where: { userId_id: { userId: args.userId, id: args.sid } },
      select: { summary: true },
    });
    const summary = sessionRow?.summary?.trim()
      ? String(sessionRow.summary)
      : '';

    const rows = await this.prisma.aiCoachMessage.findMany({
      where: { userId: args.userId, sessionId: args.sid },
      orderBy: { sequence: 'asc' },
      select: { role: true, content: true, message: true },
    });
    const replayableRows = rows.filter(
      (row) =>
        row.role !== AiCoachMessageRole.ASSISTANT ||
        shouldReplayStoredCoachMessageToProvider(row.message),
    );

    const totalChars =
      summary.length +
      replayableRows.reduce((n, r) => n + (r.content?.length ?? 0) + 16, 0);

    if (replayableRows.length <= maxRecent * 2 && totalChars <= maxChars)
      return;

    const keep = replayableRows.slice(-maxRecent * 2);
    const old = replayableRows.slice(
      0,
      Math.max(0, replayableRows.length - keep.length),
    );
    if (old.length === 0) return;

    if (!isCoachUpstreamConfigured()) return;

    const client = createCoachClient();
    const model = this.getCoachModel();
    const res = await client.chat.completions.create(
      {
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: [
              `You summarize conversation history for Trainingload.ai AI Coach. Preserve the coach's direct relationship with the athlete; do not introduce a separate coach persona.`,
              `Write a compact, factual summary that preserves: athlete background, goals, constraints, recent training context, key decisions, unresolved questions.`,
              `Do not include tool outputs verbatim; abstract them.`,
              `Output plain text, <= 1200 chars.`,
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              summary ? `Existing summary:\n${summary}\n` : '',
              `Older turns to summarize:`,
              JSON.stringify(
                old.map((r) => ({
                  role:
                    r.role === AiCoachMessageRole.USER
                      ? 'user'
                      : r.role === AiCoachMessageRole.ASSISTANT
                        ? 'assistant'
                        : 'system',
                  content: r.content,
                })),
              ),
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      },
      { signal: args.signal },
    );

    try {
      await this.aiUsage.recordUsageEvent({
        userId: args.userId,
        kind: AiUsageKind.CONTEXT_COMPRESS,
        provider: getCoachUpstreamProvider(),
        model,
        usage: parseOpenAIUsage(res.usage),
        sid: args.sid,
      });
    } catch (error) {
      // The model cost has already happened. Telemetry failure must be visible,
      // but must not discard a valid summary or fail the user's coach response.
      this.logger.error(
        `[AI][教练] 压缩用量记录失败 userId=${args.userId} sid=${args.sid} error=${String(error)}`,
      );
    }

    const nextSummary = String(
      res?.choices?.[0]?.message?.content ?? '',
    ).trim();
    if (!nextSummary) return;

    const merged = nextSummary.slice(0, 1200);
    try {
      await this.prisma.aiCoachSession.update({
        where: { userId_id: { userId: args.userId, id: args.sid } },
        data: { summary: merged },
      });
    } catch {
      // 会话可能不存在，忽略
    }
  }

  /**
   * 追加一条助手回复（仅写库），并触发“尽力而为”的摘要压缩
   *
   * 说明：
   * - SSE 中断（Abort）时不应写入助手内容，调用方会确保这一点
   */
  async coachAppendAssistantTurn(params: {
    session: UserSession;
    sid?: string;
    lang: string;
    content: string;
    message?: CoachAssistantMessageBody | null;
    branchId?: string | null;
    providerReplay?: boolean;
    turnError?: CoachTurnErrorData;
  }): Promise<string | null> {
    const userId = params.session?.user?.id;
    if (!userId) return null;
    const safeSid = String(params.sid ?? '').trim() || 'default';

    const assistantContent = String(params.content ?? '');
    const message =
      params.message ?? buildAssistantMessageBody(assistantContent);
    const messageId = await this.prisma.$transaction(async (tx) => {
      await tx.aiCoachSession.upsert({
        where: { userId_id: { userId, id: safeSid } },
        create: {
          userId,
          id: safeSid,
          lang: params.lang,
        },
        update: { lang: params.lang },
      });
      const seq = await this.allocateCoachMessageSequence(tx, userId, safeSid);
      const created = await tx.aiCoachMessage.create({
        data: {
          userId,
          sessionId: safeSid,
          role: AiCoachMessageRole.ASSISTANT,
          content: assistantContent,
          message: buildStoredCoachUiMessageEnvelope({
            role: 'assistant',
            content: assistantContent,
            message,
            providerReplay: params.providerReplay,
            turnError: params.turnError,
          }) as unknown as Prisma.InputJsonValue,
          sequence: seq,
        },
      });
      return created.id;
    });

    await this.coachAssistantDelivered({
      userId,
      sid: safeSid,
      messageId,
      message,
      branchId: params.branchId,
      skipCompression:
        params.providerReplay === false || Boolean(params.turnError),
    });
    return messageId;
  }

  /** Delivery side effects are shared by legacy appends and durable run projections. */
  async coachAssistantDelivered(params: {
    userId: string;
    sid: string;
    messageId: string;
    message: CoachAssistantMessageBody;
    branchId?: string | null;
    skipCompression?: boolean;
  }) {
    const { userId, sid: safeSid, messageId, message } = params;
    const calculationIds = message.content
      .filter((b) => b.type === 'tool_use' && b.name === 'FitnessAssessment')
      .map(
        (b) =>
          (b as { input?: { calculationId?: string } }).input?.calculationId,
      )
      .filter((id): id is string => typeof id === 'string');
    if (calculationIds.length && this.fitnessCalculations)
      await this.fitnessCalculations.markPresented(
        {
          userId,
          sessionId: safeSid,
          branchId: params.branchId ?? null,
          now: new Date(),
        },
        calculationIds,
        messageId,
      );

    if (params.skipCompression) return;

    // best-effort compression (non-blocking failure)
    const abort = new AbortController();
    const timeoutMs = Number(process.env.AI_COACH_COMPRESS_TIMEOUT_MS || 6000);
    const timer = setTimeout(() => abort.abort('compress_timeout'), timeoutMs);
    try {
      await this.maybeCompressCoachFromDb({
        userId,
        sid: safeSid,
        signal: abort.signal,
      });
    } catch (e) {
      this.logger.warn(`[AI][教练] 压缩跳过：${String(e)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * AI Coach 对话（工具调用 + 流式输出）
   *
   * 流程：
   * - 模型先决定需要调用哪些“查询工具”（tool_choice=auto，非流式）
   * - 服务端执行工具（查 DB/聚合）
   * - 将工具结果 + 当前提问 +（可选）上下文摘要/最近对话 交给模型，流式输出最终回答
   */
  async coachStream(params: {
    session: UserSession;
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
    /** Server-owned tasks reuse the same Agent without interactive history or write tools. */
    executionMode?: 'interactive' | 'background';
    activeSkillName?: string;
    backgroundTask?: {
      taskType: string;
      allowedToolNames: readonly string[];
      requiredToolNames?: readonly string[];
      completedToolNames?: Set<string>;
      submitResult: (result: unknown) => Promise<void> | void;
    };
    allowWithoutConsent?: boolean;
    signal: AbortSignal;
    onActivity?: (
      event: import('@shared/ai-coach-run-contract').CoachActivityEvent,
    ) => Promise<void>;
  }): Promise<AsyncGenerator<CoachQueryYield, void, undefined>> {
    // 读取 DB 中的摘要与最近消息，再追加当前用户消息，交给 agent 循环处理工具调用。
    const { session, sid, prompt, intent, signal } = params;
    const currentTurnStartedAt = new Date();
    const lang = resolveCoachReplyLanguage(prompt, params.lang);
    const userId = session?.user?.id ?? '';
    const background = params.executionMode === 'background';
    if (!params.allowWithoutConsent) {
      await this.aiDataConsent.assertGranted(userId);
    }
    let ambientMemory: AmbientMemoryContext | undefined;
    if (userId && this.athleteMemory) {
      const athleteTimezone =
        (await this.userService.getPreferredTimezone(userId)) ?? 'UTC';
      ambientMemory = await this.athleteMemory.buildAmbientContext({
        userId,
        asOf: currentTurnStartedAt,
        timezone: athleteTimezone,
      });
    }
    const safetyConcern = background ? null : coachSafetyConcern(prompt);
    if (safetyConcern === 'urgent_pain')
      return urgentCoachSafetyReply(this.i18n, lang);
    if (!isCoachUpstreamConfigured()) {
      this.logger.error('[ai][coach] 未配置上游模型密钥，无法调用上游模型');
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.ai_coach_openrouter_not_configured'),
      });
    }
    const safeSid = String(sid ?? '').trim() || 'default';
    let historyRows: StoredCoachMessageRow[] = [];
    let summary = '';
    if (userId && !background) {
      const branchId = String(params.branchId ?? '').trim();
      const ctx = branchId
        ? await this.loadCoachBranchContextFromDb(userId, branchId)
        : await this.loadCoachContextFromDb(userId, safeSid);
      historyRows = ctx.rows;
      summary = ctx.summary;
    }
    const assessmentContext = {
      userId,
      sessionId: safeSid,
      branchId: params.branchId ?? null,
      now: currentTurnStartedAt,
    };
    const fitnessEnabled =
      !background &&
      process.env.FITNESS_ASSESSMENT_ENABLED === 'true' &&
      !!this.fitnessCalculations;
    if (fitnessEnabled) await this.fitnessFollowup?.wakeUser(userId);
    const task = fitnessEnabled
      ? await this.fitnessCalculations.currentTask(assessmentContext)
      : null;
    let restoredSkill: string | null = null;
    let questionResponse:
      | { declinedAll: boolean; skippedQuestionIds: string[] }
      | undefined;
    let fitnessConfirmation: FitnessConfirmation | undefined;
    let fitnessTrackingReply: FitnessTrackingReply | undefined;
    let protocolResult: unknown;
    const factMessage = fitnessEnabled
      ? await this.prisma.aiCoachMessage.findFirst({
          where: { userId, sessionId: safeSid, role: 'USER', content: prompt },
          orderBy: { sequence: 'desc' },
          select: { id: true },
        })
      : null;
    for (const block of params.message?.content ?? []) {
      if (
        block.type !== 'tool_result' ||
        !block.content ||
        typeof block.content !== 'object'
      )
        continue;
      const content = block.content as Record<string, unknown>;
      if (
        String(content.kind ?? '').startsWith('fitness_') &&
        !parseFitnessUserAction(content)
      )
        throw new NotFoundException('Invalid assessment action');
      if (
        content.kind === 'coach_question_reply' ||
        content.kind === 'coach_question_skip'
      ) {
        const parsedReply =
          parseCoachQuestionReplyLikeToolResultPayload(content);
        if (parsedReply.ok) {
          questionResponse = {
            declinedAll: parsedReply.data.kind === 'coach_question_skip',
            skippedQuestionIds:
              parsedReply.data.kind === 'coach_question_reply'
                ? (parsedReply.data.skippedQuestionIds ?? [])
                : [],
          };
        }
        const question = await loadReferencedCoachQuestion(
          this.prisma,
          assessmentContext,
          content,
        );
        restoredSkill = question?.metadata?.skill ?? null;
        if (fitnessEnabled) {
          const confirmation = fitnessConfirmationFromQuestion(
            question,
            content,
          );
          if (confirmation) {
            fitnessConfirmation = confirmation;
            restoredSkill = 'fitness-assessment';
          }
        }
      }
      if (
        fitnessEnabled &&
        content.kind === 'fitness_apply_confirmation' &&
        typeof content.calculationId === 'string' &&
        typeof content.applyOptionId === 'string' &&
        typeof content.proposalDigest === 'string'
      ) {
        fitnessConfirmation = content as unknown as FitnessConfirmation;
        restoredSkill = 'fitness-assessment';
      }
      if (fitnessEnabled && content.kind === 'fitness_segment_reply') {
        const previous = await this.fitnessCalculations.calculation(
          assessmentContext,
          String(content.calculationId ?? ''),
        );
        if (
          !previous.presentedAt ||
          previous.presentedAt >= currentTurnStartedAt
        )
          throw new NotFoundException('Displayed assessment not found');
        const frozen =
          previous.input as unknown as import('@/fitness-calculation/fitness-calculation.service').FrozenFitnessInput;
        const request = { ...frozen.request, taskId: previous.taskId };
        if (content.kind === 'fitness_segment_reply')
          request.segment = {
            activityHashId: String(content.activityHashId ?? ''),
            startSeconds: Number(content.startSeconds),
          };
        protocolResult = await this.fitnessCalculations.prepare(
          assessmentContext,
          request,
        );
        restoredSkill = 'fitness-assessment';
      }
      if (fitnessEnabled && content.kind === 'fitness_recompute') {
        protocolResult = await this.fitnessCalculations.recompute(
          assessmentContext,
          String(content.calculationId ?? ''),
          typeof content.taskId === 'string' ? content.taskId : undefined,
        );
        restoredSkill = 'fitness-assessment';
      }
      if (fitnessEnabled && content.kind === 'fitness_workout_request') {
        await this.fitnessCalculations.task(
          assessmentContext,
          String(content.taskId ?? ''),
        );
        restoredSkill = 'fitness-assessment';
      }
      if (fitnessEnabled && content.kind === 'fitness_tracking_reply') {
        fitnessTrackingReply = content as unknown as FitnessTrackingReply;
        restoredSkill = 'fitness-assessment';
      }
      if (fitnessEnabled && content.kind === 'fitness_protocol_reply') {
        const reply = content as unknown as FitnessProtocolReply;
        protocolResult = await this.fitnessCalculations.protocolReply(
          assessmentContext,
          reply.calculationId,
          reply.taskRevision,
          reply.answer,
          factMessage?.id ?? 'unpersisted-user-turn',
        );
        restoredSkill = 'fitness-assessment';
      }
    }
    if (
      fitnessEnabled &&
      task?.stage === 'WAITING_USER' &&
      task.lastCalculationId &&
      !protocolResult
    ) {
      const answer =
        /^(?:只是|就是|这是)?(?:普通|轻松|恢复)(?:训练|骑行|骑|跑步)[。！!\s]*$/.test(
          prompt.trim(),
        )
          ? 'ORDINARY'
          : /^(?:是[，,]?\s*)?独自连续(?:尽力|全力)(?:完成)?\s*30\s*分钟[。！!\s]*$/.test(
                prompt.trim(),
              )
            ? 'TEST'
            : /^(?:暂不确认|不想补充|不补充了|不知道|先不算了|skip)[。！!\s]*$/i.test(
                  prompt.trim(),
                )
              ? 'SKIP'
              : null;
      if (answer) restoredSkill = 'fitness-assessment';
      if (answer)
        protocolResult = await this.fitnessCalculations.protocolReply(
          assessmentContext,
          task.lastCalculationId,
          task.revision,
          answer,
          factMessage?.id ?? 'unpersisted-user-turn',
        );
    }
    if (
      !restoredSkill &&
      task &&
      /^(?:今天|都|按|基于|根据|更新|重算|应用|确认|采用|只是|骑行|跑步)|(?:latest|recalculate|apply)/i.test(
        prompt.trim(),
      )
    )
      restoredSkill = 'fitness-assessment';
    const activeSkill = background
      ? getCoachSkillByName(params.activeSkillName ?? '')
      : resolveCoachActiveSkill({
          prompt,
          intent,
          message: params.message,
          restoredSkill,
        });
    if (background && !activeSkill) {
      throw new Error(
        `Unknown background coach skill: ${params.activeSkillName ?? '(empty)'}`,
      );
    }
    const boundAssessmentCase = params.caseId
      ? await this.prisma.coachAssessmentCase.findFirst({
          where: { id: params.caseId, userId },
          select: { assessment: { select: { state: true } } },
        })
      : null;
    const athleteStateSafetyMode =
      boundAssessmentCase?.assessment.state === 'HIGH_CONCERN'
        ? ('HIGH_CONCERN' as const)
        : undefined;
    const toolCtx = {
      onActivity: params.onActivity,
      fitnessCalculations: this.fitnessCalculations,
      fitnessApply: this.fitnessApply,
      fitnessFollowup: this.fitnessFollowup,
      fitnessConfirmation,
      fitnessTrackingReply,
      fitnessAssessmentActive: activeSkill?.name === 'fitness-assessment',
      planSuitability: activeSkill?.name === 'plan-builder' ? {} : undefined,
      activeSkillName: activeSkill?.name,
      prisma: this.prisma,
      userService: this.userService,
      i18n: this.i18n,
      coachTools: this.coachTools,
      coachActions: this.coachActions,
      coachBranching: this.coachBranching,
      planService: this.planService,
      planQuery: this.planQuery,
      planExecutionContext: this.planExecutionContext,
      activityService: this.activityService,
      activities: this.activityRead,
      users: this.users,
      integrationStatus: this.integrationStatus,
      trainingDataCoverage: this.trainingDataCoverage,
      activitySeries: this.activitySeries,
      workoutService: this.workoutService,
      workoutDefinitions: this.workoutDefinitions,
      pmc: this.pmcService,
      athleteMemory: this.athleteMemory,
      session,
      sid: safeSid,
      branchId: params.branchId ?? null,
      currentUserPrompt: prompt,
      questionResponse,
      confirmedDecisionId: currentDecisionConfirmationId(params.message),
      currentTurnStartedAt,
      webEvidence: this.webEvidence,
      webEvidenceBudget: { searchCalls: 0, fetchCalls: 0 },
      athleteStateSafetyMode,
      backgroundTask: params.backgroundTask,
      aiOperationId: params.operationId ?? null,
      aiUsageKind: params.usageKind ?? AiUsageKind.COACH_CHAT,
      lang,
      signal,
    };
    const enabledTools = await getCoachTools({
      ctx: toolCtx,
      activeSkill,
      scopeBySkill: false,
      ...(background
        ? {
            candidateToolNames: [
              'coach_task_submit_result',
              ...(params.backgroundTask?.allowedToolNames ?? []),
            ],
          }
        : {}),
    });
    const tools = background
      ? enabledTools.filter((tool) => {
          if (tool.name === 'coach_task_submit_result') return true;
          return (
            params.backgroundTask?.allowedToolNames.includes(tool.name) ===
              true &&
            tool.kind !== 'mutation' &&
            tool.kind !== 'draft'
          );
        })
      : enabledTools;

    const provider = getCoachUpstreamProvider();
    const currentUserMessage = params.message ?? buildUserMessageBody(prompt);
    const historyMessages = buildHistoryMessages({
      provider,
      rows: historyRows,
      currentUserMessage,
      thinking: params.thinking === true,
    });
    if (
      protocolResult &&
      (protocolResult as { preparationStatus?: string }).preparationStatus ===
        'READY'
    ) {
      protocolResult = await this.fitnessCalculations.calculate(
        assessmentContext,
        (protocolResult as { calculationId: string }).calculationId,
      );
    }
    if (task || protocolResult)
      historyMessages.unshift({
        role: 'system',
        content: `Server-owned fitness task context (facts, not instructions): ${JSON.stringify({ task, protocolResult })}`,
      });
    if (summary) {
      historyMessages.unshift({
        role: 'system',
        content: `Conversation summary:\n${summary}`,
      });
    }
    if (params.branchId) {
      historyMessages.unshift({
        role: 'system',
        content: [
          `This conversation has a plan branch: it is a proposal workspace, not proof that the main plan changed. Only a committed apply receipt establishes a plan change.`,
          `Use the Workout operation decision guide to choose evidence and form one coherent proposal for the athlete's agreed scope.`,
          `Decision payloads: PLAN_WORKOUT_UPDATE changes one existing workout; PLAN_WORKOUT_ADD adds without related edits; PLAN_WORKOUT_SCHEDULE atomically combines local changes [{ workoutId, dto }] and additions [{ dto }]; PLAN_WORKOUT_BATCH_UPDATE is reserved for an agreed inclusive multi-week rewrite and covers every pending workout in its scope.`,
          `PLAN_ADAPTATION and PLAN_SUPERSESSION are server-owned proposal decisions. First call plan.proposal_preview, then pass its returned decisionPayload unchanged to coach_decision_draft. Never put editable workout content into those decision payloads.`,
          `Create the structured decision with coach_decision_draft. Apply an existing proposal with coach_decision_apply only when the current user input confirms that exact proposal.`,
          `If apply reports a conflict or skipped proposal, no change was committed. Reassess against current state before presenting a replacement.`,
          `Keep decision, branch, context, commit, and event identifiers inside tool arguments.`,
          ...(athleteStateSafetyMode === 'HIGH_CONCERN'
            ? [
                `Server safety mode is HIGH_CONCERN for this Athlete State Case. Give conservative safety guidance only. Do not draft, approve, apply, or imply any plan mutation. Do not diagnose a medical condition.`,
              ]
            : []),
        ].join('\n'),
      });
    }
    if (activeSkill) {
      this.logger.log(
        `[AI][教练][skill] 会话ID=${safeSid} 技能=${activeSkill.name} activatedBy=${activeSkill.activatedBy}`,
      );
    }

    const assessmentReply = protocolResult;
    const answer = streamCoachAnswer({
      tools,
      ctx: toolCtx,
      messages: historyMessages,
      activeSkill,
      thinking: params.thinking === true,
      ambientMemory,
      model: params.model,
    });
    const withAssessment = async function* (): AsyncGenerator<
      CoachQueryYield,
      void,
      undefined
    > {
      if (assessmentReply)
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: (assessmentReply as { calculationId: string })
                  .calculationId,
                name: 'FitnessAssessment',
                input: assessmentReply,
              },
            ],
          },
        };
      yield* answer;
    };
    return withCoachSafetyReminder(
      withAssessment() /* assessment card plus model explanation */,
      safetyConcern
        ? String(this.i18n.t(`common.coach_safety.${safetyConcern}`, { lang }))
        : null,
    );
  }

  /**
   * Execute a hidden, server-owned coach task through the same ToolLoopAgent as chat.
   * The caller owns scheduling. This method owns the durable run/attempt timeline,
   * AI operation lifecycle, reasoning, tools, result validation and usage aggregation.
   */
  async runBackgroundCoachTask<T>(params: {
    userId: string;
    lang: string;
    taskType: string;
    activeSkillName: string;
    instructions: string;
    validateResult: (result: unknown) => T;
    /** Stable logical identity. When omitted, the complete task input is hashed. */
    dedupeKey?: string;
    triggerType?: string;
    triggerRef?: string;
    /** Task-specific read-tool allowlist. Defaults to the skill's suggestions. */
    allowedToolNames?: readonly string[];
    /** Evidence tools that must complete before structured result submission. */
    requiredToolNames?: readonly string[];
    signal?: AbortSignal;
    allowWithoutConsent?: boolean;
    usageKind?: AiUsageKind;
    /** Optional task-specific model override. */
    model?: string;
    /** Provider-neutral model purpose used by the shared model catalog. */
    modelPurpose?: AiModelPurpose;
    /**
     * Who funds this background run. Platform-funded tasks keep the complete
     * CoachRun and usage audit trail, but never enter the user's AI operation
     * admission, credit reservation, or settlement lifecycle.
     */
    funding?: 'USER' | 'PLATFORM';
    /**
     * An API surface may already own admission/delivery/settlement for this
     * operation. Reuse that id for the CoachRun attempt without admitting or
     * settling a second operation.
     */
    callerManagedOperationId?: string;
  }): Promise<BackgroundCoachTaskRun<T>> {
    const activeSkill = getCoachSkillByName(params.activeSkillName);
    if (!activeSkill) {
      throw new Error(
        `Unknown background coach skill: ${params.activeSkillName}`,
      );
    }
    const allowedToolNames =
      params.allowedToolNames ?? activeSkill.suggestedTools;
    const requiredToolNames = [...new Set(params.requiredToolNames ?? [])];
    const unavailableRequiredTool = requiredToolNames.find(
      (toolName) => !allowedToolNames.includes(toolName),
    );
    if (unavailableRequiredTool) {
      throw new Error(
        `Required background tool is not allowed: ${unavailableRequiredTool}`,
      );
    }
    const prompt = [
      'This is a server-owned background coach task, not an interactive user message.',
      'Use the normal Coach tools to inspect authoritative facts. Do not assume missing training means rest before checking data coverage.',
      'Do not call mutation or UI presentation tools. Do not write a conversational answer.',
      'Finish by calling coach_task_submit_result exactly once with the complete task-specific result.',
      `Task type: ${params.taskType}`,
      params.instructions,
    ].join('\n\n');
    const platformFunded = params.funding === 'PLATFORM';
    const explicitModel = String(params.model ?? '').trim();
    const model =
      explicitModel ||
      (platformFunded
        ? resolveAiModel(params.modelPurpose ?? 'DEFAULT').modelId
        : this.getCoachModel({
            thinking: params.modelPurpose === 'REASONING',
          }));
    const usageKind = params.usageKind ?? AiUsageKind.OTHER;
    const inputHash = sha256Hex(
      stableJson({
        taskType: params.taskType,
        activeSkillName: params.activeSkillName,
        lang: params.lang,
        model,
        allowedToolNames: [...allowedToolNames],
        requiredToolNames,
        instructions: prompt,
      }),
    );
    const dedupeKey = params.dedupeKey?.trim() || inputHash;
    const callerManagedOperationId = String(
      params.callerManagedOperationId ?? '',
    ).trim();
    const ownsUserOperation = !platformFunded && !callerManagedOperationId;
    const operationId = callerManagedOperationId || crypto.randomUUID();
    const begun = await this.coachRuns.beginBackground({
      userId: params.userId,
      taskKind: params.taskType,
      lang: params.lang,
      instructions: prompt,
      dedupeKey,
      inputHash,
      operationId,
      triggerType: params.triggerType,
      triggerRef: params.triggerRef,
    });

    if (begun.replay) {
      const stored = begun.replay.result;
      const replayedResult = params.validateResult(stored.result);
      if (ownsUserOperation) {
        const storedOperation = begun.replay.operationId
          ? await this.operations.get(params.userId, begun.replay.operationId)
          : null;
        if (
          storedOperation &&
          storedOperation.status !== 'COMPLETED' &&
          storedOperation.status !== 'FAILED'
        ) {
          await this.operations.markDelivered({
            userId: params.userId,
            operationId: storedOperation.id,
            resultRef: {
              kind: 'BACKGROUND_COACH_RUN',
              runId: begun.replay.runId,
              taskKind: params.taskType,
            },
          });
          await this.operations.complete(params.userId, storedOperation.id);
        }
      }
      return {
        result: replayedResult,
        usage: parseOpenAIUsage(stored.usage),
        provider: stored.provider,
        model: stored.model,
        runId: begun.replay.runId,
        operationId: callerManagedOperationId || begun.replay.operationId,
        replayed: true,
      };
    }

    const handle = begun.handle;
    if (!handle) throw new Error('BACKGROUND_COACH_RUN_NOT_STARTED');
    const runId = handle.projector.run.runId;
    const attemptId = handle.projector.run.attemptId;
    if (ownsUserOperation) {
      let admission: Awaited<ReturnType<AiOperationLedger['begin']>>;
      try {
        admission = await this.operations.begin({
          userId: params.userId,
          operationId: handle.operationId,
          idempotencyKey: `background:${runId}:${attemptId}`,
          kind: usageKind,
          purpose: 'DEFAULT',
          metadata: {
            taskKind: params.taskType,
            runId,
            attemptId,
            requestFingerprint: inputHash,
          },
        });
      } catch (error) {
        handle.projector.finish('failed');
        await this.coachRuns
          .checkpoint(handle, 'failed')
          .catch(() => undefined);
        throw error;
      }
      if (admission.replay) {
        handle.projector.finish('failed');
        await this.coachRuns
          .checkpoint(handle, 'failed')
          .catch(() => undefined);
        throw new ConflictException(
          `Background Coach operation was already admitted with status ${admission.operation.status}`,
        );
      }
    }

    let submitted: T | undefined;
    const usageEvents: unknown[] = [];
    let provider: string | null = null;
    let actualModel = model;
    let finalized = false;
    let projectionQueue: Promise<void> = Promise.resolve();
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(params.signal?.reason);
    if (params.signal?.aborted) forwardAbort();
    else params.signal?.addEventListener('abort', forwardAbort, { once: true });
    const project = (event: CoachQueryYield) => {
      const write = projectionQueue.then(async () => {
        const chunks = handle.projector.consume(event);
        if (
          chunks.length > 0 ||
          event.type === 'assistant' ||
          event.type === 'user'
        ) {
          await this.coachRuns.checkpoint(handle);
        }
      });
      projectionQueue = write.catch(() => undefined);
      return write;
    };
    const heartbeat = setInterval(() => {
      void (async () => {
        const reason = await this.coachRuns.heartbeat(handle);
        if (!platformFunded) {
          await this.operations.heartbeat(params.userId, handle.operationId);
        }
        if (reason) controller.abort(reason);
      })().catch(() => controller.abort('background_heartbeat_failed'));
    }, 15_000);

    try {
      const session = {
        user: { id: params.userId },
        session: { id: handle.sessionId, userId: params.userId },
      } as UserSession;
      const completedToolNames = new Set<string>();
      const stream = await this.coachStream({
        session,
        sid: handle.sessionId,
        lang: params.lang,
        prompt,
        intent: params.activeSkillName,
        operationId: handle.operationId,
        executionMode: 'background',
        activeSkillName: params.activeSkillName,
        backgroundTask: {
          taskType: params.taskType,
          allowedToolNames,
          requiredToolNames,
          completedToolNames,
          submitResult: (raw) => {
            submitted = params.validateResult(raw);
          },
        },
        allowWithoutConsent: params.allowWithoutConsent,
        usageKind,
        model: params.model,
        signal: controller.signal,
        onActivity: async (activity) => {
          await project({ type: 'activity', activity });
        },
      });
      for await (const event of stream) {
        await project(event);
        if (event.type === 'model_usage' && event.status === 'SUCCESS') {
          usageEvents.push(event.usage);
          provider = event.provider ?? provider;
          actualModel = event.model || actualModel;
        }
        if (event.type === 'result' && event.is_error) {
          throw new Error(event.error_code ?? 'BACKGROUND_COACH_TASK_FAILED');
        }
      }
      await projectionQueue;
      if (submitted === undefined) {
        throw new Error('BACKGROUND_COACH_TASK_RESULT_MISSING');
      }
      const usage = aggregateCoachUsage(usageEvents);
      const resultRef = {
        resultType: params.taskType,
        result: submitted,
        usage,
        provider,
        model: actualModel,
      };
      // User-funded usage must exist before its Managed operation is settled.
      // Platform-funded tasks deliberately persist a null operationId: Managed
      // accounting records the model cost against the platform while keeping
      // the CoachRun attempt id as the durable audit identity.
      await this.aiUsage.recordUsageEvent({
        userId: params.userId,
        operationId: platformFunded ? null : handle.operationId,
        callKey: `${handle.operationId}:background-aggregate`,
        kind: usageKind,
        provider,
        model: actualModel,
        usage,
        sid: handle.sessionId,
        entityId: params.triggerRef ?? null,
      });
      if (ownsUserOperation) {
        await this.operations.markDelivered({
          userId: params.userId,
          operationId: handle.operationId,
          resultRef: {
            kind: 'BACKGROUND_COACH_RUN',
            runId,
            taskKind: params.taskType,
          },
        });
      }
      handle.projector.finish('completed');
      await this.coachRuns.checkpoint(handle, 'completed', undefined, {
        resultType: params.taskType,
        resultRef,
      });
      finalized = true;
      if (ownsUserOperation) {
        try {
          await this.operations.complete(params.userId, handle.operationId);
        } catch (operationError) {
          this.logger.warn(
            `[AI][background] run completed before operation settlement task=${params.taskType} run=${runId} operation=${handle.operationId} error=${String(operationError)}`,
          );
        }
      }
      return {
        result: submitted,
        usage,
        provider,
        model: actualModel,
        runId,
        operationId: handle.operationId,
        replayed: false,
      };
    } catch (error) {
      await projectionQueue.catch(() => undefined);
      if (!finalized) {
        try {
          handle.projector.finish('failed');
          await this.coachRuns.checkpoint(handle, 'failed');
        } catch (checkpointError) {
          this.logger.error(
            `[AI][background] failed to persist terminal run task=${params.taskType} run=${runId} error=${String(checkpointError)}`,
          );
        }
        if (ownsUserOperation) {
          await this.operations
            .fail({
              userId: params.userId,
              operationId: handle.operationId,
              errorCode:
                error instanceof Error
                  ? error.message.slice(0, 120)
                  : 'BACKGROUND_COACH_TASK_FAILED',
            })
            .catch(() => undefined);
        }
      }
      throw error;
    } finally {
      clearInterval(heartbeat);
      params.signal?.removeEventListener('abort', forwardAbort);
    }
  }

  /**
   * Run an account-less task through the same ToolLoopAgent and Skill runtime.
   *
   * Anonymous marketing tools have no T_user, CoachSession, or AiOperation to
   * attach to. Their caller owns quota, cancellation, and durable audit state;
   * this method owns the model loop, capability envelope, terminal result
   * validation, provider fallback, and aggregate usage.
   */
  async runAnonymousCoachTask<T>(params: {
    lang: string;
    taskType: string;
    activeSkillName: string;
    instructions: string;
    validateResult: (result: unknown) => T;
    allowedToolNames?: readonly string[];
    signal?: AbortSignal;
    model?: string;
    requestRef?: string;
  }): Promise<AnonymousCoachTaskRun<T>> {
    const activeSkill = getCoachSkillByName(params.activeSkillName);
    if (!activeSkill) {
      throw new Error(
        `Unknown anonymous coach skill: ${params.activeSkillName}`,
      );
    }
    const allowedToolNames = params.allowedToolNames ?? [];
    const prompt = [
      'This is a server-owned anonymous coach task, not an interactive user message.',
      'The caller supplies the complete evidence snapshot. Do not query or mutate account data.',
      'Do not ask the visitor a question and do not write a conversational answer.',
      'Finish by calling coach_task_submit_result exactly once with the complete task-specific result.',
      `Task type: ${params.taskType}`,
      params.instructions,
    ].join('\n\n');
    const fallbackModel =
      String(params.model ?? '').trim() || this.getCoachModel();
    let submitted: T | undefined;
    const usageEvents: unknown[] = [];
    let provider: string | null = null;
    let actualModel = fallbackModel;
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(params.signal?.reason);
    if (params.signal?.aborted) forwardAbort();
    else params.signal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      const stream = await this.coachStream({
        session: {
          user: { id: '' },
          session: { id: `anonymous:${params.taskType}`, userId: '' },
        } as UserSession,
        sid: `anonymous:${params.taskType}`,
        lang: params.lang,
        prompt,
        intent: params.activeSkillName,
        executionMode: 'background',
        activeSkillName: params.activeSkillName,
        backgroundTask: {
          taskType: params.taskType,
          allowedToolNames,
          submitResult: (raw) => {
            submitted = params.validateResult(raw);
          },
        },
        allowWithoutConsent: true,
        usageKind: AiUsageKind.OTHER,
        model: params.model,
        signal: controller.signal,
      });
      for await (const event of stream) {
        if (event.type === 'model_usage' && event.status === 'SUCCESS') {
          usageEvents.push(event.usage);
          provider = event.provider ?? provider;
          actualModel = event.model || actualModel;
        }
        if (event.type === 'result' && event.is_error) {
          throw new Error(event.error_code ?? 'ANONYMOUS_COACH_TASK_FAILED');
        }
      }
      if (submitted === undefined) {
        throw new Error('ANONYMOUS_COACH_TASK_RESULT_MISSING');
      }
      const usage = aggregateCoachUsage(usageEvents);
      this.logger.log(
        `[AI][anonymous-background] completed task=${params.taskType} request=${params.requestRef ?? 'untracked'} model=${actualModel}`,
      );
      return { result: submitted, usage, provider, model: actualModel };
    } catch (error) {
      throw new AnonymousCoachTaskExecutionError(
        error,
        aggregateCoachUsage(usageEvents),
      );
    } finally {
      params.signal?.removeEventListener('abort', forwardAbort);
    }
  }

  /**
   * Execute an imported/recomputed activity review through the durable Coach
   * Agent runtime. Activity owns evidence and result persistence; AI owns the
   * model, skill/tool execution, run timeline, operation and replay behavior.
   */
  async processQueuedActivityAiReview(
    reviewId: string,
    options?: {
      callerManagedOperationId?: string;
      allowWithoutConsent?: boolean;
    },
  ) {
    const prepared = await this.activityAiReviewService.prepareGeneration(
      reviewId,
      {
        allowWithoutConsent: options?.allowWithoutConsent,
      },
    );
    if (prepared.outcome === 'SKIPPED') return prepared;

    const reviewContext = buildActivityReviewGenerationContext(
      prepared.unifiedInput,
    );
    const messages = compileActivityCoachMessages({
      sportContext: prepared.unifiedInput.sport_context,
      unifiedInputJson: JSON.stringify({
        ...prepared.unifiedInput,
        ...(reviewContext ? { review_context: reviewContext } : {}),
      }),
      lang: prepared.lang,
    });
    this.logger.log(
      formatActivityCoachCompiledPromptLog({
        tag: '单次活动 AI 教练解读（后台 Agent）',
        locale: prepared.lang,
        activityId: prepared.review.activityId,
        userId: prepared.review.userId,
        messages,
      }),
    );

    const systemContract =
      messages.find((message) => message.role === 'system')?.content ?? '';
    const activityEvidence =
      messages.find((message) => message.role === 'user')?.content ?? '';
    const model =
      String(process.env.ACTIVITY_AI_REVIEW_MODEL ?? '').trim() ||
      this.getCoachModel();
    const task = await this.runBackgroundCoachTask<{ markdown: string }>({
      userId: prepared.review.userId,
      lang: prepared.lang,
      taskType: 'ACTIVITY_REVIEW',
      activeSkillName: 'activity-review',
      usageKind: AiUsageKind.ACTIVITY_ANALYSIS,
      model,
      allowedToolNames: [],
      dedupeKey: sha256Hex(
        stableJson({
          reviewId: prepared.review.id,
          evidenceHash: prepared.evidenceHash,
          systemContract,
        }),
      ),
      triggerType: `ACTIVITY_REVIEW_${prepared.review.trigger}`,
      triggerRef: prepared.review.id,
      callerManagedOperationId: options?.callerManagedOperationId,
      allowWithoutConsent: options?.allowWithoutConsent,
      instructions: [
        'Review exactly one completed activity using the supplied server-owned contract and evidence.',
        'The evidence snapshot is already complete for this task. Do not fetch a different activity and do not ask the athlete a question.',
        'Follow the review contract below, but return the final Markdown through coach_task_submit_result instead of ordinary assistant text.',
        'Submit result with shape: {"markdown":"complete athlete-facing Markdown review"}.',
        `ACTIVITY_REVIEW_CONTRACT_BEGIN\n${systemContract}\nACTIVITY_REVIEW_CONTRACT_END`,
        `ACTIVITY_EVIDENCE_BEGIN\n${activityEvidence}\nACTIVITY_EVIDENCE_END`,
      ].join('\n\n'),
      validateResult: (raw) => {
        const value =
          raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : null;
        const markdown = String(value?.markdown ?? '').trim();
        if (!markdown) {
          throw new Error('Activity review markdown is required.');
        }
        return { markdown };
      },
    });

    return await this.activityAiReviewService.persistGeneratedReview({
      prepared,
      markdown: task.result.markdown,
      provider: task.provider,
      model: task.model,
      operationId: task.operationId,
      usage: task.usage,
    });
  }

  /**
   * 用户主动触发的活动单次 AI 分析入口。
   *
   * API 仍保留 SSE 形状，但模型执行与导入后自动复盘共用同一个
   * ActivityReview Agent task。服务端完成持久化后一次性返回 Markdown，
   * 避免 API 层再维护一条直连模型的平行实现。
   */
  async streamActivityAiAnalysis(
    activityHashId: string,
    userId: string,
    useCache: boolean = true,
    lang?: string,
    purpose: AiModelPurpose = 'DEFAULT',
    operationId?: string,
    allowWithoutConsent = false,
  ) {
    if (!allowWithoutConsent) {
      await this.aiDataConsent.assertGranted(userId);
    }
    const requestedLang = resolveSupportedLocale(lang);

    this.logger.log(
      `[ai][analysis] 请求 activityHashId=${activityHashId} 用户ID=${userId} useCache=${useCache} 语言=${requestedLang}`,
    );

    const activityIdentity = await this.prisma.activity.findFirst({
      where: readyActivityWhere({ hashId: activityHashId, userId }),
      select: { id: true },
    });
    if (!activityIdentity) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
        message: this.i18n.t(
          'common.error.activity_not_found_or_no_permission',
        ),
      });
    }

    const activity =
      await this.activityAiReviewService.loadActivityForCoachAnalysis(
        activityIdentity.id,
        userId,
      );

    const runningKey = this.getAnalysisRunningKey(
      activity.id,
      userId,
      requestedLang,
      purpose,
    );
    const existing = this.running.get(runningKey);
    if (existing) {
      this.logger.log(
        `[ai][analysis] 等待进行中任务 活动ID=${activity.id} 用户ID=${userId} 运行键=${runningKey}`,
      );
      return this.waitForRunningAnalysis(existing.done, {
        activityId: activity.id,
        userId,
        runningKey,
      });
    }
    const profile = await this.userService.getComposedUserProfile(
      userId,
      activity.sportType,
    );
    const unifiedInput = await buildUnifiedActivityAnalysisInput(
      activity,
      userId,
      profile,
      this.pmcService,
    );
    const evidenceHash = await hashActivityCoachDedupe({
      unifiedInput,
      lang: requestedLang,
    });
    if (useCache) {
      const cached = await this.resolveSucceededReviewMarkdown(
        userId,
        activityHashId,
        evidenceHash,
        requestedLang,
      );
      if (cached) {
        this.logger.log(
          `[ai][analysis] 复盘缓存命中 活动ID=${activity.id} 用户ID=${userId} 内容长度=${cached.content.length}`,
        );
        return AiService.staticContentStream(
          cached.content,
          true,
          cached.reviewId,
        );
      }
    }
    const startedAt = Date.now();
    if (!operationId)
      throw new Error('Activity analysis is missing operationId');
    const done = (async (): Promise<ActivityAnalysisResult> => {
      const queued = await this.activityAiReviewService.enqueueForActivity({
        activityId: activity.id,
        userId,
        trigger: $Enums.ActivityAiReviewTrigger.MANUAL,
        language: requestedLang,
        metadata: { source: 'activity-review-sse', purpose },
      });
      const generated = await this.processQueuedActivityAiReview(queued.id, {
        callerManagedOperationId: operationId,
        allowWithoutConsent,
      });
      if (generated.outcome !== 'SUCCEEDED') {
        throw new Error(generated.code || 'ACTIVITY_ANALYSIS_SKIPPED');
      }
      return {
        content: generated.markdown,
        reviewId: generated.reviewId,
      };
    })();
    this.running.set(runningKey, { createdAt: startedAt, done });
    void done.catch(() => undefined);
    this.logger.log(
      `[ai][analysis] 开始 Agent 复盘 活动ID=${activity.id} 用户ID=${userId} 运行键=${runningKey}`,
    );
    try {
      const result = await done;
      this.logger.log(
        `[ai][analysis] Agent 复盘完成 活动ID=${activity.id} 用户ID=${userId} 运行键=${runningKey} 持续毫秒=${Date.now() - startedAt} 内容长度=${result.content.length}`,
      );
      return AiService.staticContentStream(
        result.content,
        false,
        result.reviewId,
      );
    } finally {
      this.running.delete(runningKey);
    }
  }

  private async resolveSucceededReviewMarkdown(
    userId: string,
    activityHashId: string,
    expectedEvidenceHash: string,
    language: string,
  ): Promise<ActivityAnalysisResult | undefined> {
    const snap = await this.activityAiReviewService.getAiReviewForActivityHash({
      userId,
      activityHashId,
      language,
    });
    if (
      snap.found &&
      snap.markdown &&
      snap.evidenceHash === expectedEvidenceHash &&
      snap.status === $Enums.ActivityAiReviewStatus.SUCCEEDED
    ) {
      if (!snap.reviewId) return undefined;
      return { content: snap.markdown, reviewId: snap.reviewId };
    }
    return undefined;
  }

  private static async *staticContentStream(
    content: string,
    _replayed: boolean,
    reviewId: string,
  ): AsyncGenerator<ActivityAnalysisStreamChunk> {
    yield {
      choices: [{ delta: { content } }],
      __activityReviewId: reviewId,
    };
  }

  private async *waitForRunningAnalysis(
    done: Promise<ActivityAnalysisResult>,
    ctx: { activityId: number; userId: string; runningKey: string },
  ): AsyncGenerator<ActivityAnalysisStreamChunk> {
    const result = await done;
    this.logger.log(
      `[ai][analysis] 进行中任务完成 活动ID=${ctx.activityId} 用户ID=${ctx.userId} 运行键=${ctx.runningKey} 内容长度=${result.content.length}`,
    );
    yield {
      choices: [{ delta: { content: result.content } }],
      __activityReviewId: result.reviewId,
    };
  }

  private getAnalysisRunningKey(
    activityId: number,
    userId: string,
    language: string,
    purpose: AiModelPurpose,
  ) {
    return `${activityId}:${userId}:${language}:${purpose}`;
  }

  /**
   * 分页列出当前用户的 AI 教练会话
   * - 置顶（pinnedAt 非空）优先，按 pinnedAt 降序；其余按 updatedAt 降序
   * - 使用 offset 分页，避免与置顶排序混用 cursor 出错
   */
  async listCoachSessionsPage(params: {
    userId: string;
    offset?: number;
    take?: number;
    kind?: 'chat' | 'review';
    reviewScope?: 'daily' | 'weekly' | 'monthly';
    publicDemoLocale?: string;
  }): Promise<{
    items: Array<{
      id: string;
      title: string | null;
      updatedAt: string;
      pinnedAt: string | null;
      reviewScope: 'daily' | 'weekly' | 'monthly' | null;
      lastMessagePreview: string | null;
      /** 最近一条助手消息摘要，用于历史列表「回答」预览 */
      lastReplyPreview: string | null;
      /** 关联 `review-digest-*` 会话时，来自 ReviewDigest 的统计周期 */
      periodStart: string | null;
      periodEnd: string | null;
      timezone: string | null;
    }>;
    nextOffset: number | null;
  }> {
    const userId = params.userId;
    if (!userId) return { items: [], nextOffset: null };

    const take = Math.min(Math.max(Number(params.take) || 20, 1), 50);
    const offset = Math.max(0, Number(params.offset) || 0);

    const sessionType =
      params.kind === 'review'
        ? AiCoachSessionType.REVIEW
        : AiCoachSessionType.CHAT;
    const reviewScope =
      params.reviewScope === 'daily'
        ? AiCoachReviewScope.DAILY
        : params.reviewScope === 'weekly'
          ? AiCoachReviewScope.WEEKLY
          : params.reviewScope === 'monthly'
            ? AiCoachReviewScope.MONTHLY
            : undefined;
    const rows = await this.prisma.aiCoachSession.findMany({
      where: {
        userId,
        type: sessionType,
        ...(sessionType === AiCoachSessionType.REVIEW && reviewScope
          ? { reviewScope }
          : {}),
        // 首条发送失败会留下 nextSequence=1、无消息的空壳；列表不当成对话。
        messages: { some: {} },
      },
      orderBy: [
        { pinnedAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
        { id: 'desc' },
      ],
      skip: offset,
      take: take + 1,
      include: {
        messages: {
          orderBy: { sequence: 'desc' },
          take: 24,
          select: { role: true, content: true, message: true },
        },
      },
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const digestIds: string[] = [];
    const digestIdBySessionId = new Map<string, string>();
    for (const r of page) {
      const m = /^review-digest-(.+)$/.exec(r.id);
      if (m?.[1]) {
        digestIdBySessionId.set(r.id, m[1]);
        digestIds.push(m[1]);
      }
    }
    const uniqueDigestIds = [...new Set(digestIds)];
    const digestRows =
      uniqueDigestIds.length > 0
        ? await this.reviewDigests.findManyByIdsForUser(userId, uniqueDigestIds)
        : [];
    const digestById = new Map(digestRows.map((d) => [d.id, d] as const));

    const clip = (s: string, max = 120) => {
      const x = s.replace(/\s+/g, ' ').trim();
      if (x.length <= max) return x;
      return `${x.slice(0, max)}…`;
    };

    const items = page.map((r) => {
      const lastUser = r.messages.find(
        (m) =>
          m.role === AiCoachMessageRole.USER &&
          hasVisibleTextMessageBlock(m.message),
      );
      const lastAsst = r.messages.find(
        (m) => m.role === AiCoachMessageRole.ASSISTANT,
      );
      const digestId = digestIdBySessionId.get(r.id);
      const digest = digestId ? digestById.get(digestId) : undefined;
      const localize = (value: string | null) =>
        value && params.publicDemoLocale && r.id.startsWith('demo-')
          ? readPublicDemoText(value, params.publicDemoLocale)
          : value;
      return {
        id: r.id,
        title: localize(r.title),
        updatedAt: r.updatedAt.toISOString(),
        pinnedAt: r.pinnedAt ? r.pinnedAt.toISOString() : null,
        reviewScope: r.reviewScope
          ? (String(r.reviewScope).toLowerCase() as
              | 'daily'
              | 'weekly'
              | 'monthly')
          : null,
        lastMessagePreview: lastUser?.content
          ? clip(localize(lastUser.content) ?? '', 120)
          : null,
        lastReplyPreview: lastAsst?.content
          ? clip(localize(lastAsst.content) ?? '', 240)
          : null,
        periodStart: digest?.periodStart.toISOString() ?? null,
        periodEnd: digest?.periodEnd.toISOString() ?? null,
        timezone: digest?.snapshot?.timezone ?? null,
      };
    });

    const nextOffset = hasMore && page.length > 0 ? offset + page.length : null;

    return { items, nextOffset };
  }

  /**
   * 创建空教练会话，sid 由服务端生成（UUID），落库后再由首条用户消息写标题等
   */
  async createCoachSession(params: {
    session: UserSession;
    lang?: string;
    kind?: 'chat' | 'review';
    reviewScope?: 'daily' | 'weekly' | 'monthly';
  }): Promise<{
    id: string;
    title: string | null;
    updatedAt: string;
    pinnedAt: string | null;
    reviewScope: 'daily' | 'weekly' | 'monthly' | null;
    lastMessagePreview: string | null;
    lastReplyPreview: string | null;
    periodStart: null;
    periodEnd: null;
  }> {
    const userId = params.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: this.i18n.t('common.error.missing_user_id'),
      });
    }
    const safeLang = String(params.lang ?? 'en').trim() || 'en';
    const sessionType =
      params.kind === 'review'
        ? AiCoachSessionType.REVIEW
        : AiCoachSessionType.CHAT;
    const reviewScope =
      params.reviewScope === 'daily'
        ? AiCoachReviewScope.DAILY
        : params.reviewScope === 'weekly'
          ? AiCoachReviewScope.WEEKLY
          : params.reviewScope === 'monthly'
            ? AiCoachReviewScope.MONTHLY
            : null;
    const id = crypto.randomUUID();
    const maxSidChars = Number(process.env.AI_COACH_MAX_SID_CHARS || 64);
    if (id.length > maxSidChars) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.invalid_sid') ?? 'Invalid sid',
      });
    }

    const row = await this.prisma.aiCoachSession.create({
      data: {
        userId,
        id,
        lang: safeLang,
        type: sessionType,
        reviewScope:
          sessionType === AiCoachSessionType.REVIEW ? reviewScope : null,
      },
    });

    return {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      pinnedAt: row.pinnedAt ? row.pinnedAt.toISOString() : null,
      reviewScope: row.reviewScope
        ? (String(row.reviewScope).toLowerCase() as
            | 'daily'
            | 'weekly'
            | 'monthly')
        : null,
      lastMessagePreview: null,
      lastReplyPreview: null,
      periodStart: null,
      periodEnd: null,
    };
  }

  /**
   * 更新教练会话（标题 / 置顶）
   */
  async updateCoachSession(params: {
    session: UserSession;
    sid: string;
    title?: string | null;
    pinned?: boolean;
  }): Promise<{
    id: string;
    title: string | null;
    updatedAt: string;
    pinnedAt: string | null;
    lastMessagePreview: string | null;
    lastReplyPreview: string | null;
  }> {
    const userId = params.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: this.i18n.t('common.error.missing_user_id'),
      });
    }
    const safeSid = String(params.sid ?? '').trim();
    const maxSidChars = Number(process.env.AI_COACH_MAX_SID_CHARS || 64);
    if (!safeSid || safeSid.length > maxSidChars) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.invalid_sid') ?? 'Invalid sid',
      });
    }

    if (params.title === undefined && params.pinned === undefined) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'No fields to update',
      });
    }

    const existing = await this.prisma.aiCoachSession.findUnique({
      where: { userId_id: { userId, id: safeSid } },
    });
    if (!existing) {
      throw new NotFoundException('Coach session not found');
    }

    const data: {
      title?: string | null;
      pinnedAt?: Date | null;
    } = {};
    if (params.title !== undefined) {
      const t = String(params.title ?? '').trim();
      data.title = t.length > 0 ? t.slice(0, 200) : null;
    }
    if (params.pinned !== undefined) {
      data.pinnedAt = params.pinned ? new Date() : null;
    }

    const updated = await this.prisma.aiCoachSession.update({
      where: { userId_id: { userId, id: safeSid } },
      data,
      include: {
        messages: {
          orderBy: { sequence: 'desc' },
          take: 24,
          select: { role: true, content: true, message: true },
        },
      },
    });

    const clip = (s: string, max = 120) => {
      const x = s.replace(/\s+/g, ' ').trim();
      if (x.length <= max) return x;
      return `${x.slice(0, max)}…`;
    };
    const lastUser = updated.messages.find(
      (m) =>
        m.role === AiCoachMessageRole.USER &&
        hasVisibleTextMessageBlock(m.message),
    );
    const lastAsst = updated.messages.find(
      (m) => m.role === AiCoachMessageRole.ASSISTANT,
    );

    return {
      id: updated.id,
      title: updated.title,
      updatedAt: updated.updatedAt.toISOString(),
      pinnedAt: updated.pinnedAt ? updated.pinnedAt.toISOString() : null,
      lastMessagePreview: lastUser?.content
        ? clip(lastUser.content, 120)
        : null,
      lastReplyPreview: lastAsst?.content ? clip(lastAsst.content, 240) : null,
    };
  }

  /**
   * 删除教练会话及其消息（级联）
   */
  async deleteCoachSession(params: {
    session: UserSession;
    sid: string;
  }): Promise<{ ok: true }> {
    const userId = params.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: this.i18n.t('common.error.missing_user_id'),
      });
    }
    const safeSid = String(params.sid ?? '').trim();
    const maxSidChars = Number(process.env.AI_COACH_MAX_SID_CHARS || 64);
    if (!safeSid || safeSid.length > maxSidChars) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.invalid_sid') ?? 'Invalid sid',
      });
    }

    const r = await this.prisma.$transaction(async (tx) => {
      const sourceMessages = await tx.aiCoachMessage.findMany({
        where: { userId, sessionId: safeSid, role: AiCoachMessageRole.USER },
        select: { id: true },
      });
      await this.memoryCommands?.retractEvidence(
        {
          userId,
          sourceMessageIds: sourceMessages.map((message) => message.id),
          policyVersion: `${MEMORY_POLICY_VERSION}:session-delete`,
        },
        tx,
      );
      return tx.aiCoachSession.deleteMany({
        where: { userId, id: safeSid },
      });
    });
    if (r.count === 0) {
      throw new NotFoundException('Coach session not found');
    }
    return { ok: true };
  }

  /**
   * 某会话下的全部消息（按 sequence 升序）
   * 尚无会话行时返回空数组（客户端会先分配 sid，首条用户消息写入时才 upsert 会话）
   */
  async listCoachSessionMessages(params: {
    userId: string;
    sid: string;
    publicDemoLocale?: string;
  }): Promise<
    Array<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      message: unknown | null;
      createdAt: string;
    }>
  > {
    const userId = params.userId;
    if (!userId) return [];

    const safeSid = String(params.sid ?? '').trim();
    const maxSidChars = Number(process.env.AI_COACH_MAX_SID_CHARS || 64);
    if (!safeSid || safeSid.length > maxSidChars) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.invalid_sid') ?? 'Invalid sid',
      });
    }

    const sess = await this.prisma.aiCoachSession.findUnique({
      where: { userId_id: { userId, id: safeSid } },
    });
    if (!sess) {
      return [];
    }

    const rows = await this.prisma.aiCoachMessage.findMany({
      where: { userId, sessionId: safeSid },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        message: true,
        createdAt: true,
      },
    });

    return rows.map((r) => {
      const isAssistant = r.role === AiCoachMessageRole.ASSISTANT;
      const role =
        r.role === AiCoachMessageRole.USER
          ? 'user'
          : isAssistant
            ? 'assistant'
            : 'system';
      const content = params.publicDemoLocale
        ? readPublicDemoText(r.content, params.publicDemoLocale)
        : r.content;
      return {
        id: r.id,
        role,
        content: isAssistant
          ? sanitizeCoachAssistantTextForLocale(
              content,
              params.publicDemoLocale ?? sess.lang ?? 'en',
            )
          : content,
        message: params.publicDemoLocale
          ? buildStoredCoachUiMessageEnvelope({
              role,
              content,
              message: null,
            })
          : sanitizeStoredCoachMessageForClient(
              r.message ?? null,
              isAssistant ? (sess.lang ?? 'en') : undefined,
            ),
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /**
   * 编辑某条用户消息：更新文案，并删除该条之后的所有消息（含助手回复）。
   * 用于前端「编辑并重答」：随后 SSE 需带 skip_user_append，避免再插入一条 user。
   */
  async editCoachUserMessage(params: {
    session: UserSession;
    sid: string;
    messageId: string;
    content: string;
  }): Promise<
    Array<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      message: unknown | null;
      createdAt: string;
    }>
  > {
    const userId = params.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: this.i18n.t('common.error.missing_user_id'),
      });
    }
    const safeSid = String(params.sid ?? '').trim();
    const maxSidChars = Number(process.env.AI_COACH_MAX_SID_CHARS || 64);
    if (!safeSid || safeSid.length > maxSidChars) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.invalid_sid') ?? 'Invalid sid',
      });
    }
    const mid = String(params.messageId ?? '').trim();
    if (!mid) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.missing_prompt'),
      });
    }
    const content = String(params.content ?? '').trim();
    const maxPromptChars = Number(
      process.env.AI_COACH_MAX_PROMPT_CHARS || 2000,
    );
    if (!content) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.missing_prompt'),
      });
    }
    if (content.length > maxPromptChars) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          this.i18n.t('common.error.prompt_too_long') ?? 'Prompt too long',
      });
    }

    const row = await this.prisma.aiCoachMessage.findFirst({
      where: { id: mid, userId, sessionId: safeSid },
      select: { id: true, role: true, sequence: true, message: true },
    });
    if (!row) {
      throw new NotFoundException('Coach message not found');
    }
    if (row.role !== AiCoachMessageRole.USER) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.coach_edit_not_user_message'),
      });
    }
    if (!hasVisibleTextMessageBlock(row.message)) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.coach_edit_not_user_message'),
      });
    }

    const durable = await this.prisma.aiCoachMessage.findFirst({
      where: {
        userId,
        sessionId: safeSid,
        sequence: { gte: row.sequence },
        runAttempt: { isNot: null },
      },
      select: { id: true },
    });
    if (durable)
      throw new ConflictException('Durable Coach runs are append-only');
    await this.prisma.$transaction(async (tx) => {
      // Editing the legacy transcript must never cascade-delete durable attempts.
      const durable = await tx.aiCoachMessage.findFirst({
        where: {
          userId,
          sessionId: safeSid,
          sequence: { gte: row.sequence },
          runAttempt: { isNot: null },
        },
        select: { id: true },
      });
      if (durable)
        throw new ConflictException('Durable Coach runs are append-only');
      const affectedSources = await tx.aiCoachMessage.findMany({
        where: {
          userId,
          sessionId: safeSid,
          role: AiCoachMessageRole.USER,
          sequence: { gte: row.sequence },
        },
        select: { id: true },
      });
      await this.memoryCommands?.retractEvidence(
        {
          userId,
          sourceMessageIds: affectedSources.map((message) => message.id),
          policyVersion: `${MEMORY_POLICY_VERSION}:message-edit`,
        },
        tx,
      );
      await tx.aiCoachMessage.update({
        where: { id: row.id },
        data: {
          content,
          message: buildStoredCoachUiMessageEnvelope({
            role: 'user',
            content,
            message: buildUserMessageBody(content),
          }) as unknown as Prisma.InputJsonValue,
        },
      });
      const editHash = crypto
        .createHash('sha256')
        .update(content)
        .digest('hex')
        .slice(0, 16);
      await this.memoryExtraction?.enqueueEligibleMessage({
        tx,
        userId,
        sessionId: safeSid,
        sourceMessageId: row.id,
        content,
        hasStructuredUserInput: true,
        policyVersion: `${MEMORY_POLICY_VERSION}:edit:${editHash}`,
      });
      await tx.aiCoachMessage.deleteMany({
        where: {
          userId,
          sessionId: safeSid,
          sequence: { gt: row.sequence },
        },
      });
      await tx.aiCoachSession.update({
        where: { userId_id: { userId, id: safeSid } },
        data: { summary: null },
      });
    });

    return this.listCoachSessionMessages({
      userId,
      sid: safeSid,
    });
  }

  /**
   * skip_user_append 流式请求：DB 中最后一条须为用户且与 q 一致，防止跳过追加时上下文错乱
   */
  async assertCoachSkipAppendMatchesPrompt(params: {
    session: UserSession;
    sid: string;
    prompt: string;
  }): Promise<void> {
    const userId = params.session?.user?.id;
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: this.i18n.t('common.error.missing_user_id'),
      });
    }
    const safeSid = String(params.sid ?? '').trim() || 'default';
    // 重答前若残留失败提示行，忽略它们来定位真正的末条用户消息。
    const { lastTurn: last } = await this.findCoachTailTurn(
      this.prisma,
      userId,
      safeSid,
    );
    const p = String(params.prompt ?? '').trim();
    if (
      !last ||
      last.role !== AiCoachMessageRole.USER ||
      last.content.trim() !== p
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.coach_skip_append_mismatch'),
      });
    }
  }

  async generateTrainingAdviceSnippet(params: {
    userId: string;
    lang: string;
    context: AiTrainingAdviceContext;
    taskType?: string;
    usageKind?: AiUsageKind;
    triggerType?: string;
    triggerRef?: string;
    signal?: AbortSignal;
    /** Only verified system-owned passive Demo surfaces may bypass consent. */
    allowWithoutConsent?: boolean;
  }): Promise<
    AiTrainingAdviceResult & {
      usage: ReturnType<typeof parseOpenAIUsage>;
      provider: string | null;
      model: string;
      runId: string;
      operationId: string;
      replayed: boolean;
    }
  > {
    // Both production callers reject oversized prompt contexts before reaching
    // this shared Agent path. Keep the JSON complete: byte slicing can remove
    // trailing grounding rules and produces an invalid evidence envelope.
    const contextJson = JSON.stringify(params.context);
    const activityEvidence =
      params.context.activityEvidence &&
      typeof params.context.activityEvidence === 'object' &&
      !Array.isArray(params.context.activityEvidence)
        ? (params.context.activityEvidence as Record<string, unknown>)
        : null;
    const coverageInspection =
      activityEvidence?.coverageInspection &&
      typeof activityEvidence.coverageInspection === 'object' &&
      !Array.isArray(activityEvidence.coverageInspection)
        ? (activityEvidence.coverageInspection as Record<string, unknown>)
        : null;
    const coverageInspectionRequired = coverageInspection?.required === true;
    const task = await this.runBackgroundCoachTask<AiTrainingAdviceResult>({
      userId: params.userId,
      lang: params.lang,
      taskType: params.taskType ?? 'ATHLETE_CHECK_IN',
      activeSkillName: 'readiness-check',
      triggerType: params.triggerType,
      triggerRef: params.triggerRef,
      signal: params.signal,
      allowWithoutConsent: params.allowWithoutConsent,
      usageKind: params.usageKind ?? AiUsageKind.OTHER,
      ...(coverageInspectionRequired
        ? { requiredToolNames: ['training.data_coverage'] }
        : {}),
      instructions: [
        'Produce the athlete-facing today suggestion from the supplied context and any additional facts you need from tools.',
        'The supplied context is server-owned fact data. Treat context.groundingRules as hard constraints.',
        'context.activityEvidence is lightweight recency evidence, not a provider diagnosis. If activityEvidence.coverageInspection.required is true, call training.data_coverage before submitting the result.',
        'When coverage inspection is not required, use the normal Agent loop to decide whether a plan/activity mismatch or uncertain zero load materially requires training.data_coverage. Do not inspect provider connections on every run.',
        'Call integration.status only when provider-specific connection, permission or sync detail would materially change the guidance after the coverage facts are known.',
        'When recommending data import or connection, name only file formats or providers explicitly reported by training.data_coverage or integration.status. Never generalize a supported provider into a generic watch, wearable, device, or unrelated platform connection.',
        "If the system has no connected activity source and no recent file import, you may ask one concise, high-information question only when its answer would materially change today's recommendation.",
        'Never claim an active plan, scheduled workout, completion, competition phase, weather detail, or recovery state that the facts do not establish.',
        'Respect terminal workout statuses and the supplied local timing hints exactly. Avoid medical certainty.',
        'Use coachState silently. Resolve active proposals against current facts; do not expose internal state names in athlete-facing copy.',
        'Submit result with shape: {"summary":"athlete-facing suggestion","tags":["2-5 short labels"],"coachDecisionHandling":[{"decisionId":"id","handling":"FOLLOW|CONDITIONAL|DEPART|HISTORY|IGNORE","reason":"grounded reason or null"}]}.',
        'For the home surface, normally use 90-140 Chinese characters or 45-75 English words. Include the main rationale, one concrete action, and one adjustment or recovery cue. For compact plan/day/workout/activity surfaces, stay concise but complete.',
        `Write athlete-facing fields in locale ${params.lang || 'en'}.`,
        `SERVER_CONTEXT_DATA_BEGIN\n${contextJson}\nSERVER_CONTEXT_DATA_END`,
      ].join('\n'),
      validateResult: (raw) => {
        const obj =
          raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : null;
        const summary = String(obj?.summary ?? '')
          .trim()
          .slice(0, 500);
        if (!summary) throw new Error('Today suggestion summary is required.');
        const tags = Array.isArray(obj?.tags)
          ? obj.tags
              .map((tag) => String(tag ?? '').trim())
              .filter(Boolean)
              .slice(0, 5)
          : [];
        const allowedCoachHandling = new Set([
          'FOLLOW',
          'CONDITIONAL',
          'DEPART',
          'HISTORY',
          'IGNORE',
        ]);
        const coachDecisionHandling = Array.isArray(obj?.coachDecisionHandling)
          ? obj.coachDecisionHandling.flatMap((value) => {
              const row =
                value && typeof value === 'object' && !Array.isArray(value)
                  ? (value as Record<string, unknown>)
                  : null;
              const decisionId = String(row?.decisionId ?? '').trim();
              const handling = String(row?.handling ?? '')
                .trim()
                .toUpperCase();
              if (!decisionId || !allowedCoachHandling.has(handling)) return [];
              const reason = String(row?.reason ?? '').trim();
              return [
                {
                  decisionId,
                  handling: handling as
                    | 'FOLLOW'
                    | 'CONDITIONAL'
                    | 'DEPART'
                    | 'HISTORY'
                    | 'IGNORE',
                  reason: reason ? reason.slice(0, 240) : null,
                },
              ];
            })
          : [];
        return { summary, tags, coachDecisionHandling };
      },
    });
    return {
      ...task.result,
      usage: task.usage,
      provider: task.provider,
      model: task.model,
      runId: task.runId,
      operationId: task.operationId,
      replayed: task.replayed,
    };
  }

  /**
   * 日 Runtime 的 LLM 入口，内部就是 scale=daily 的 generatePlanReviewJudgment。
   */
  async generateDailyPlanReviewJudgment(params: {
    userId: string;
    lang: string;
    context: unknown;
    signal?: AbortSignal;
  }) {
    return this.generatePlanReviewJudgment({ ...params, scale: 'daily' });
  }

  /**
   * 日/周/月 Runtime 共用的 KEEP/PROPOSE 判断。
   * 只返回判断，不写账本、不改课。解析失败由 parseDailyPlanReviewJudgment 收成 KEEP。
   * Prompt 合同：plan-review-judgment.contract.ts。
   */
  async generatePlanReviewJudgment(params: {
    userId: string;
    lang: string;
    scale?: 'daily' | 'weekly' | 'monthly';
    context: unknown;
    signal?: AbortSignal;
  }): Promise<{
    decision: 'KEEP' | 'ADJUST';
    presentation?: 'SILENT' | 'GUIDANCE' | 'DECISION';
    action: CoachReviewAction | null;
    targetWorkoutId: string | null;
    sourceWorkoutId?: string | null;
    targetDate?: string | null;
    rationale: string;
    confidence: number | null;
    evidenceCodes: string[];
    adjustmentIntent: {
      magnitude: 'SMALL' | 'MODERATE';
      preserve: string[];
    } | null;
    usage: ReturnType<typeof parseOpenAIUsage>;
    provider: string | null;
    model: string;
    runId: string;
    operationId: string;
    replayed: boolean;
  }> {
    const scale = params.scale ?? 'daily';
    const skillName =
      scale === 'daily'
        ? 'plan-day-review'
        : scale === 'weekly'
          ? 'plan-week-review'
          : 'plan-cycle-review';
    const usageKind =
      scale === 'daily'
        ? AiUsageKind.REVIEW_DAILY
        : scale === 'weekly'
          ? AiUsageKind.REVIEW_WEEKLY
          : AiUsageKind.REVIEW_MONTHLY;
    const task = await this.runBackgroundCoachTask({
      userId: params.userId,
      lang: params.lang,
      taskType: `PLAN_${scale.toUpperCase()}_REVIEW`,
      activeSkillName: skillName,
      signal: params.signal,
      usageKind,
      allowedToolNames: [
        'training.data_coverage',
        'integration.status',
        'time.current',
        'plan.active',
        'plan.by_id',
        'plan.recent',
        'plan.execution_context',
        'training.weekSummary',
        'training.readiness',
        'activity.search',
        'activity.byHashId',
        'activity.series',
        'profile.current',
        'competition.events.list',
        'competition.impact.resolve',
        'metric.history',
        'metric.current',
        'bests.summary',
      ],
      instructions: [
        buildPlanReviewJudgmentSystemPrompt({
          scale,
          lang: params.lang,
          delivery: 'agent-tool',
        }),
        serializePlanReviewJudgmentContext(params.context),
      ].join('\n\n'),
      validateResult: (raw) => {
        const object =
          raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : null;
        if (
          !object ||
          (object.decision !== 'KEEP' && object.decision !== 'ADJUST')
        ) {
          throw new Error('Review decision must be KEEP or ADJUST.');
        }
        const parsed = parseDailyPlanReviewJudgment(JSON.stringify(object));
        if (object.decision === 'ADJUST' && parsed.decision !== 'ADJUST') {
          throw new Error(
            'ADJUST result is incomplete or internally inconsistent.',
          );
        }
        if (!parsed.rationale.trim()) {
          throw new Error('Review rationale is required.');
        }
        return parsed;
      },
    });
    return {
      ...task.result,
      usage: task.usage,
      provider: task.provider,
      model: task.model,
      runId: task.runId,
      operationId: task.operationId,
      replayed: task.replayed,
    };
  }

  /** Coach Review v4 第二阶段：只把已确定的轻量调整意图编译为合法课表草案。 */
  async generatePlanReviewAdjustment(params: {
    userId: string;
    lang: string;
    scale: 'daily' | 'weekly' | 'monthly';
    action: string;
    input: unknown;
    targetWorkoutId: string;
    validationError?: string | null;
    signal?: AbortSignal;
  }): Promise<{
    draft: PlanWorkoutAdjustmentDraftData | null;
    usage: ReturnType<typeof parseOpenAIUsage>;
    provider: string | null;
    model: string;
    runId: string;
    operationId: string;
    replayed: boolean;
  }> {
    const prompt = [
      buildCoachReviewAdjustmentSystemPrompt({
        lang: params.lang,
        action: params.action,
        validationError: params.validationError,
        delivery: 'agent-tool',
      }),
      serializeCoachReviewAdjustmentInput(params.input),
    ].join('\n\n');
    const task = await this.runBackgroundCoachTask<{
      draft: PlanWorkoutAdjustmentDraftData | null;
    }>({
      userId: params.userId,
      lang: params.lang,
      taskType: `PLAN_${params.scale.toUpperCase()}_REVIEW_ADJUSTMENT`,
      activeSkillName: 'plan-review-adjustment',
      instructions: prompt,
      allowedToolNames: [],
      signal: params.signal,
      usageKind:
        params.scale === 'daily'
          ? AiUsageKind.REVIEW_DAILY
          : params.scale === 'weekly'
            ? AiUsageKind.REVIEW_WEEKLY
            : AiUsageKind.REVIEW_MONTHLY,
      dedupeKey: sha256Hex(
        stableJson({
          action: params.action,
          input: params.input,
          validationError: params.validationError ?? null,
        }),
      ),
      triggerType: `PLAN_${params.scale.toUpperCase()}_REVIEW_ADJUSTMENT`,
      triggerRef: params.targetWorkoutId,
      validateResult: (raw) => {
        const value =
          raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : null;
        const draft = parseCoachReviewAdjustment(
          JSON.stringify(value?.draft ?? {}),
        );
        return { draft };
      },
    });
    return {
      draft: task.result.draft,
      usage: task.usage,
      provider: task.provider,
      model: task.model,
      runId: task.runId,
      operationId: task.operationId,
      replayed: task.replayed,
    };
  }
}
