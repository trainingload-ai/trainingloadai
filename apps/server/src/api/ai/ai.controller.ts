import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Inject,
  Post,
  Param,
  Patch,
  Query,
  ParseBoolPipe,
  UseGuards,
  Logger,
  MessageEvent,
  Res,
  Sse,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { AiService } from './ai.service';
import { AiUsageService, parseOpenAIUsage } from './ai-usage.service';
import { TodaySuggestionOrchestratorService } from './today-suggestion/today-suggestion-orchestrator.service';
import { TodaySuggestionEngagementService } from './today-suggestion/today-suggestion-engagement.service';
import { TodaySuggestionWorkoutService } from './today-suggestion/today-suggestion-workout.service';
import { TodaySuggestionReminderService } from './today-suggestion/today-suggestion-reminder.service';
import {
  AiPlanExecutionAdviceService,
  type PlanExecutionAdviceBody,
  type PlanExecutionAdviceResult,
} from './ai-plan-execution-advice.service';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { RequiresRuntimeCapability } from '@/runtime-capabilities/requires-runtime-capability.decorator';
import { Session, UserSession } from '@thallesp/nestjs-better-auth';
import { OAuthHybridAuthGuard } from '@/oauth/oauth-hybrid-auth.guard';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { $Enums, AiUsageStatus } from '@prisma/client';
import type { AiModelPurpose } from '@shared/ai-model';
import { PrismaService } from '@/prisma/prisma.service';
import { createHash, randomUUID } from 'crypto';
import { aiOperationError, isAiOperationErrorCode } from './ai-operation.error';
import type {
  CoachAssistantContentBlock,
  CoachUserMessageBody,
} from './core/coach-query-yield';
import {
  getCoachModel,
  getCoachUpstreamProvider,
} from './core/coach-upstream.adapter';
import { purposeForActualModel } from '@/api/ai/ai-model-catalog';
import {
  CoachActionService,
  CoachActionUndoError,
} from './core/coach-action.service';
import { CoachBranchingService } from './coach-branching.service';
import {
  previewText,
  asRecord,
  unknownErrorFields,
} from './core/ai-common.util';
import {
  buildAssistantMessageBody,
  coachAssistantBlockIsInternalToolUse,
  coachAssistantBlockIsUiSurface,
  coachSsePayloadForAbort,
  coachSsePayloadForModelUnavailable,
  hasCoachMetaOnlyToolResult,
  normalizeCoachUserMessage,
  textFromAssistantMessageBody,
  textFromCoachUserMessage,
  writeCoachSse,
} from './core/coach-message.util';
import { resolveSupportedLocale } from '@/utils/locale.util';
import { TodaySuggestionBodyDto } from './dto/today-suggestion.dto';
import {
  TodaySuggestionInteractionDto,
  TodaySuggestionReminderDto,
} from './dto/today-suggestion-action.dto';
import type { TodaySuggestionInteractionInput } from '@shared/ai-today-suggestion-contract';
import {
  pipeCoachQueryYieldsToUIMessageResponse,
  type CoachUiStreamYield,
} from './core/coach-ui-message-stream';
import { UpdateAiDataConsentDto } from '@/ai-data-consent/ai-data-consent.dto';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
import { CoachClientOutputGuard } from './core/coach-client-output-guard';
import { resolveCoachReplyLanguage } from './core/coach-safety-policy';
import { resolveCoachUsageKind } from './core/coach-usage-kind';
import { APIError as UpstreamApiError } from 'openai';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import {
  CurrentPublicDemo,
  type PublicDemoRequestContext,
} from '@/public-demo/current-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';
import {
  AI_OPERATION_LEDGER,
  type AiOperation,
  type AiOperationLedger,
  toAiOperationResult,
} from './ai-operation-ledger.port';

import {
  CoachRunStore,
  CoachRunCancelledError,
  type CoachRunHandle,
} from './coach-run-store.service';
import {
  parseCoachRunCommand,
  type CoachRunStatus,
} from '@shared/ai-coach-run-contract';
import {
  coachSnapshotChunks,
  coachV1CompatibleChunk,
} from './core/coach-run-projector';
import { CoachAssessmentCaseService } from './athlete-state/coach-assessment-case.service';

type CoachPostBody = {
  protocolVersion?: number;
  runCommand?: unknown;
  operationId?: string;
  purpose?: AiModelPurpose;
  sid?: string;
  lang?: string;
  intent?: string;
  skip_user_append?: boolean | string;
  message?: unknown;
  q?: string;
  contextId?: string;
  planId?: string;
  branchId?: string;
  caseId?: string;
  openReason?: string;
  sourceNode?: unknown;
};

function parseRequestedModelPurpose(value: unknown): AiModelPurpose {
  if (value === undefined || value === null || value === '') {
    return String(process.env.AI_DEFAULT_MODEL_PURPOSE ?? '')
      .trim()
      .toUpperCase() === 'REASONING'
      ? 'REASONING'
      : 'DEFAULT';
  }
  if (value === 'DEFAULT' || value === 'REASONING') return value;
  throw aiOperationError('AI_MODEL_PURPOSE_UNAVAILABLE');
}

/**
 * Provider-side failure from the OpenAI-compatible SDK (HTTP error, connection
 * error, SDK timeout). Application exceptions are never treated as such.
 */
function isUpstreamModelError(err: unknown): boolean {
  if (err instanceof HttpException) return false;
  if (err instanceof UpstreamApiError) return true;
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400;
}

function createAsyncQueue<T>() {
  const items: T[] = [];
  let closed = false;
  let failure: unknown = null;
  let wake: (() => void) | null = null;

  const notify = () => {
    const fn = wake;
    wake = null;
    fn?.();
  };

  return {
    push(value: T) {
      if (closed) return;
      items.push(value);
      notify();
    },
    close() {
      if (closed) return;
      closed = true;
      notify();
    },
    fail(error: unknown) {
      if (closed) return;
      failure = error;
      closed = true;
      notify();
    },
    async *iterable(): AsyncGenerator<T, void, undefined> {
      while (true) {
        const next = items.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        if (failure) throw failure;
        if (closed) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    },
  };
}

type CoachTurnSink = {
  start(): void;
  emit(event: CoachUiStreamYield): void | Promise<void>;
  end(): void;
  isClosed(): boolean;
  onClose(listener: () => void): void;
  offClose(listener: () => void): void;
};

function createCoachTypedSseSink(res: Response): CoachTurnSink {
  return {
    start() {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
    },
    emit(event) {
      writeCoachSse(res, event);
    },
    end() {
      res.end();
    },
    isClosed() {
      return res.writableEnded;
    },
    onClose(listener) {
      res.on('close', listener);
    },
    offClose(listener) {
      res.off('close', listener);
    },
  };
}

function createCoachUiMessageSink(args: { response: Response }): CoachTurnSink {
  const queue = createAsyncQueue<CoachUiStreamYield>();
  pipeCoachQueryYieldsToUIMessageResponse({
    response: args.response,
    source: queue.iterable(),
  });

  return {
    start() {
      // `pipeUIMessageStreamToResponse` already owns the response headers.
    },
    emit(event) {
      queue.push(event);
    },
    end() {
      queue.close();
    },
    isClosed() {
      return args.response.writableEnded;
    },
    onClose(listener) {
      args.response.on('close', listener);
    },
    offClose(listener) {
      args.response.off('close', listener);
    },
  };
}

/** 教练历史只读接口：与 SSE 生成共用类级 `ai` 桶时易 429，此处单独放宽（仍走全局限流 default + ai 两套） */
const coachReadThrottle = {
  ttl: Number(process.env.AI_COACH_READ_THROTTLE_TTL_MS || 60_000),
  limit: Number(process.env.AI_COACH_READ_THROTTLE_LIMIT || 120),
} as const;

@Controller('ai')
@UseGuards(OAuthHybridAuthGuard) // 该控制器下的接口均需要登录态
@SkipThrottle({ default: true })
@Throttle({
  ai: {
    ttl: Number(process.env.AI_THROTTLE_TTL_MS || 60_000),
    limit: Number(process.env.AI_THROTTLE_LIMIT || 20),
  },
})
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly aiUsage: AiUsageService,
    @Inject(AI_OPERATION_LEDGER)
    private readonly operations: AiOperationLedger,
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly coachActions: CoachActionService,
    private readonly coachBranching: CoachBranchingService,
    private readonly todaySuggestion: TodaySuggestionOrchestratorService,
    private readonly todaySuggestionEngagement: TodaySuggestionEngagementService,
    private readonly todaySuggestionWorkout: TodaySuggestionWorkoutService,
    private readonly todaySuggestionReminder: TodaySuggestionReminderService,
    private readonly planExecutionAdvice: AiPlanExecutionAdviceService,
    private readonly aiDataConsent: AiDataConsentService,
    private readonly coachRuns: CoachRunStore,
    private readonly assessmentCases: CoachAssessmentCaseService,
  ) {}

  @Post('data-consent')
  updateAiDataConsent(
    @CurrentUserId() userId: string,
    @Body() body: UpdateAiDataConsentDto,
  ) {
    return this.aiDataConsent.recordDecision({
      userId,
      granted: body.granted,
      source: body.source,
      locale: body.locale,
    });
  }

  @Get('data-consent')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.AI_USAGE_READ)
  getAiDataConsent(@CurrentUserId() userId: string) {
    return this.aiDataConsent.getStatus(userId);
  }

  @Post('plan-execution-advice')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.AI_PASSIVE_GENERATION)
  async generatePlanExecutionAdvice(
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
    @Body() body: PlanExecutionAdviceBody = {},
  ): Promise<PlanExecutionAdviceResult> {
    const allowAi = publicDemo
      ? true
      : await this.aiDataConsent.isGranted(userId);
    const locale = resolveSupportedLocale(
      body.locale ?? I18nContext.current()?.lang,
    );
    return this.planExecutionAdvice.generatePlanExecutionAdvice({
      userId,
      locale,
      body,
      allowAi,
      allowWithoutConsent: Boolean(publicDemo),
    });
  }

  @Get('today-suggestion')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.AI_PASSIVE_GENERATION)
  async getTodaySuggestion(
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
    @Query('locale') localeQuery?: string,
    @Query('timezone') timezoneQuery?: string,
  ) {
    const allowAi = publicDemo
      ? true
      : await this.aiDataConsent.isGranted(userId);
    const locale = resolveSupportedLocale(
      localeQuery ?? I18nContext.current()?.lang,
    );
    return this.todaySuggestion.get({
      userId,
      locale,
      timezone: timezoneQuery,
      allowAi,
      allowWithoutConsent: Boolean(publicDemo),
    });
  }

  @Post('today-suggestion')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.AI_PASSIVE_GENERATION)
  async postTodaySuggestion(
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
    @Body() body: TodaySuggestionBodyDto = {},
  ) {
    const allowAi = publicDemo
      ? true
      : await this.aiDataConsent.isGranted(userId);
    const locale = resolveSupportedLocale(
      body.locale ?? I18nContext.current()?.lang,
    );
    return this.todaySuggestion.get({
      userId,
      locale,
      timezone: body.timezone,
      location: body.location,
      allowAi,
      allowWithoutConsent: Boolean(publicDemo),
    });
  }

  @Post('today-suggestion/:generationToken/interactions')
  recordTodaySuggestionInteraction(
    @CurrentUserId() userId: string,
    @Param('generationToken') generationToken: string,
    @Body() body: TodaySuggestionInteractionDto,
  ) {
    let input: TodaySuggestionInteractionInput;
    if (body.kind === 'PRESENTED') {
      input = { kind: 'PRESENTED' };
    } else if (body.kind === 'INTENT_SELECTED' && body.intentType) {
      input = { kind: 'INTENT_SELECTED', intentType: body.intentType };
    } else if (body.kind === 'FEEDBACK' && body.feedback) {
      input = { kind: 'FEEDBACK', feedback: body.feedback };
    } else {
      throw new BadRequestException('INVALID_TODAY_SUGGESTION_INTERACTION');
    }
    return this.todaySuggestionEngagement.recordInteraction({
      userId,
      generationToken,
      input,
    });
  }

  @Post('today-suggestion/:generationToken/workout')
  createTodaySuggestionWorkout(
    @CurrentUserId() userId: string,
    @Param('generationToken') generationToken: string,
  ) {
    return this.todaySuggestionWorkout.create({ userId, generationToken });
  }

  @Post('today-suggestion/:generationToken/reminder')
  scheduleTodaySuggestionReminder(
    @CurrentUserId() userId: string,
    @Param('generationToken') generationToken: string,
    @Body() body: TodaySuggestionReminderDto,
  ) {
    return this.todaySuggestionReminder.schedule({
      userId,
      generationToken,
      remindAt: body.remindAt,
    });
  }

  @Delete('today-suggestion/:generationToken/reminder')
  cancelTodaySuggestionReminder(
    @CurrentUserId() userId: string,
    @Param('generationToken') generationToken: string,
  ) {
    return this.todaySuggestionReminder.cancel({ userId, generationToken });
  }

  /**
   * 列出当前登录用户的 AI 教练会话（分页；置顶在前，其余按更新时间）
   *
   * 查询参数：
   * - offset：跳过条数，默认 0
   * - take：每页条数，默认 20，最大 50
   */
  @SkipThrottle({ default: true, ai: true })
  @Throttle({
    aiCoachRead: coachReadThrottle,
  })
  @Get('coach/sessions')
  @RequiresRuntimeCapability('ai')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.AI_HISTORY_READ)
  async listCoachSessions(
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
    @Query('offset') offsetRaw?: string,
    @Query('take') takeRaw?: string,
    @Query('kind') kindRaw?: string,
    @Query('reviewScope') reviewScopeRaw?: string,
  ) {
    const take = takeRaw ? Number(takeRaw) : undefined;
    const offset = offsetRaw ? Number(offsetRaw) : undefined;
    return this.aiService.listCoachSessionsPage({
      userId,
      offset: Number.isFinite(offset) ? offset : undefined,
      take: Number.isFinite(take) ? take : undefined,
      kind: kindRaw === 'review' ? 'review' : 'chat',
      reviewScope:
        reviewScopeRaw === 'daily' ||
        reviewScopeRaw === 'weekly' ||
        reviewScopeRaw === 'monthly'
          ? reviewScopeRaw
          : undefined,
      publicDemoLocale: publicDemo
        ? (I18nContext.current()?.lang ?? 'en')
        : undefined,
    });
  }

  /**
   * 创建空教练会话（服务端生成 sid）
   */
  @SkipThrottle({ default: true, ai: true })
  @Throttle({
    aiCoachRead: coachReadThrottle,
  })
  @Post('coach/sessions')
  @RequiresRuntimeCapability('ai')
  async createCoachSession(
    @Session() session: UserSession,
    @Body()
    body: {
      lang?: string;
      kind?: 'chat' | 'review';
      reviewScope?: 'daily' | 'weekly' | 'monthly';
    },
  ) {
    return this.aiService.createCoachSession({
      session,
      lang: body?.lang,
      kind: body?.kind,
      reviewScope: body?.reviewScope,
    });
  }

  /**
   * 更新教练会话（标题、置顶）
   */
  @SkipThrottle({ default: true, ai: true })
  @Throttle({
    aiCoachRead: coachReadThrottle,
  })
  @Patch('coach/sessions/:sid')
  @RequiresRuntimeCapability('ai')
  async patchCoachSession(
    @Session() session: UserSession,
    @Param('sid') sid: string,
    @Body() body: { title?: string | null; pinned?: boolean },
  ) {
    return this.aiService.updateCoachSession({
      session,
      sid,
      title: body?.title,
      pinned: body?.pinned,
    });
  }

  /**
   * 删除教练会话及下属消息
   */
  @SkipThrottle({ default: true, ai: true })
  @Throttle({
    aiCoachRead: coachReadThrottle,
  })
  @Delete('coach/sessions/:sid')
  @RequiresRuntimeCapability('ai')
  async deleteCoachSession(
    @Session() session: UserSession,
    @Param('sid') sid: string,
  ) {
    return this.aiService.deleteCoachSession({ session, sid });
  }

  /**
   * 拉取指定会话的全部消息（用于前端恢复对话线程）
   */
  @SkipThrottle({ default: true, ai: true })
  @Throttle({
    aiCoachRead: coachReadThrottle,
  })
  @Get('coach/sessions/:sid/messages')
  @RequiresRuntimeCapability('ai')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.AI_HISTORY_READ)
  async listCoachSessionMessages(
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
    @Param('sid') sid: string,
    @Query('protocolVersion') protocolVersion?: string,
  ) {
    // Demo conversations are curated snapshots. Reading them must not repair
    // or otherwise mutate their stored run state.
    if (!publicDemo) await this.coachRuns.recoverStale(userId, sid);
    const rows = await this.aiService.listCoachSessionMessages({
      userId,
      sid,
      publicDemoLocale: publicDemo
        ? (I18nContext.current()?.lang ?? 'en')
        : undefined,
    });
    if (protocolVersion === '2') return rows;
    return rows.map((row) => {
      const envelope = row.message as {
        kind?: string;
        version?: number;
        parts?: Array<{ type: string }>;
      } | null;
      return envelope?.kind === 'ui_message' && envelope.version === 2
        ? {
            ...row,
            message: {
              ...envelope,
              version: 1,
              // In v1 providerReplay=false means a legacy failed-answer card,
              // not a progress-only interrupted attempt.
              providerReplay: !envelope.parts?.some(
                (part) => part.type === 'data-coach-turn-error',
              ),
              metadata: undefined,
              parts: envelope.parts?.filter(
                (p) =>
                  ![
                    'data-coach-run',
                    'data-coach-activity',
                    'data-coach-interaction',
                    'data-coach-text-segment',
                  ].includes(p.type),
              ),
            },
          }
        : row;
    });
  }

  @Post('coach/runs/:runId/cancel')
  @RequiresRuntimeCapability('ai')
  async cancelCoachRun(
    @CurrentUserId() userId: string,
    @Param('runId') runId: string,
    @Body() body: { attemptId?: string },
  ) {
    if (typeof body?.attemptId !== 'string' || body.attemptId.length > 160)
      throw new HttpException('Invalid attemptId', 400);
    return this.coachRuns.cancel(userId, runId, body.attemptId);
  }

  /**
   * 编辑某条用户消息并删除其后的所有消息（用于「编辑并重答」）
   */
  @SkipThrottle({ default: true, ai: true })
  @Throttle({
    aiCoachRead: coachReadThrottle,
  })
  @Patch('coach/sessions/:sid/messages/:messageId')
  @RequiresRuntimeCapability('ai')
  async patchCoachUserMessage(
    @Session() session: UserSession,
    @Param('sid') sid: string,
    @Param('messageId') messageId: string,
    @Body() body: { content?: string },
  ) {
    return this.aiService.editCoachUserMessage({
      session,
      sid,
      messageId,
      content: body?.content ?? '',
    });
  }

  /**
   * 列出当前用户最近的 AI 教练写动作（用于「撤销窗口」展示与「我都帮你做了什么」复盘）
   */
  @SkipThrottle({ default: true, ai: true })
  @Throttle({
    aiCoachRead: coachReadThrottle,
  })
  @Get('coach/actions')
  @RequiresRuntimeCapability('ai')
  async listCoachActions(
    @CurrentUserId() userId: string,
    @Query('sid') sidRaw?: string,
    @Query('take') takeRaw?: string,
  ) {
    const take = takeRaw ? Number(takeRaw) : undefined;
    const items = await this.coachActions.list({
      userId,
      sid: sidRaw?.trim() || null,
      take: Number.isFinite(take) ? take : undefined,
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        riskTier: item.riskTier,
        summary: item.summary,
        createdAt: item.createdAt.toISOString(),
        undoUntil: item.undoUntil ? item.undoUntil.toISOString() : null,
        undoneAt: item.undoneAt ? item.undoneAt.toISOString() : null,
        messageId: item.messageId,
        sid: item.sid,
      })),
    };
  }

  /**
   * 撤销一次教练写动作（仅 LOW 风险动作有撤销窗口，HIGH 风险动作直接 422）
   *
   * 错误码：
   * - NOT_FOUND          → 业务错误「写动作不存在」
   * - ALREADY_UNDONE     → 业务错误「写动作已撤销」
   * - WINDOW_CLOSED      → 业务错误「撤销窗口已关闭」
   * - HANDLER_MISSING    → 内部错误（说明工厂注册不全，记日志）
   */
  @SkipThrottle({ default: true, ai: true })
  @Throttle({
    aiCoachRead: coachReadThrottle,
  })
  @Post('coach/actions/:id/undo')
  @RequiresRuntimeCapability('ai')
  async undoCoachAction(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ) {
    if (!id || !id.trim()) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          this.i18n.t('common.error.invalid_request') ?? 'Invalid request',
      });
    }
    try {
      const result = await this.coachActions.undo({
        userId,
        id: id.trim(),
      });
      return {
        id: result.id,
        undoneAt: result.undoneAt ? result.undoneAt.toISOString() : null,
      };
    } catch (err) {
      if (err instanceof CoachActionUndoError) {
        if (err.code === 'HANDLER_MISSING') {
          this.logger.error(
            `[AI][教练][撤销] handler 缺失 用户ID=${userId} actionId=${id}`,
          );
          throw new BusinessException({
            code: BUSINESS_ERROR_CODE.COMMON,
            message: this.i18n.t('common.error.internal') ?? 'Internal error',
          });
        }
        const message = (() => {
          switch (err.code) {
            case 'NOT_FOUND':
              return (
                this.i18n.t('common.error.coach_action_not_found') ??
                'Coach action not found'
              );
            case 'ALREADY_UNDONE':
              return (
                this.i18n.t('common.error.coach_action_already_undone') ??
                'Coach action already undone'
              );
            case 'WINDOW_CLOSED':
              return (
                this.i18n.t('common.error.coach_action_undo_window_closed') ??
                'Coach action undo window has closed'
              );
            default:
              return err.message;
          }
        })();
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message,
        });
      }
      throw err;
    }
  }

  /** AI 教练（POST 发起，AI SDK UIMessage stream 响应） */
  @Post('coach/ui')
  @RequiresRuntimeCapability('ai')
  async coachUi(
    @CurrentUserId() userId: string,
    @Session() session: UserSession,
    @Body() body: CoachPostBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const wireSink = createCoachUiMessageSink({
      response: res,
    });
    const sink: CoachTurnSink =
      body.protocolVersion === 2
        ? wireSink
        : {
            ...wireSink,
            emit(event) {
              if (event.type !== 'ui_chunk') return wireSink.emit(event);
              const chunk = coachV1CompatibleChunk(event.chunk);
              if (chunk) return wireSink.emit({ type: 'ui_chunk', chunk });
            },
          };

    try {
      if (body.protocolVersion !== 2) {
        const command = await this.coachRuns.legacyAnswerCommand(
          userId,
          String(body.sid ?? ''),
          normalizeCoachUserMessage(body.message),
          String(body.operationId ?? ''),
        );
        if (command)
          body = { ...body, protocolVersion: 2, runCommand: command };
      }
      await this.runCoachTurn({ userId, session, body, idempotencyKey, sink });
    } catch (err) {
      const safeMessage =
        err instanceof BusinessException
          ? String(
              (err.getResponse() as { message?: unknown })?.message ?? '',
            ).trim() || this.i18n.t('common.error.internal')
          : (this.i18n.t('common.error.internal') ??
            'Internal error. Please try again later.');
      sink.emit({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        error_code: err instanceof BusinessException ? 'business' : 'internal',
        result: safeMessage,
      });
      sink.end();
    }
  }

  /** AI 教练（POST 发起，legacy typed SSE 响应） */
  @Post('coach')
  @RequiresRuntimeCapability('ai')
  async coach(
    @CurrentUserId() userId: string,
    @Session() session: UserSession,
    @Body() body: CoachPostBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    return this.runCoachTurn({
      userId,
      session,
      body,
      idempotencyKey,
      sink: createCoachTypedSseSink(res),
    });
  }

  private async runCoachTurn(args: {
    userId: string;
    session: UserSession;
    body: CoachPostBody;
    idempotencyKey?: string;
    sink: CoachTurnSink;
  }): Promise<void> {
    const { userId, session, idempotencyKey } = args;
    let body = args.body;
    const v2 = body.protocolVersion === 2;
    const command = v2 ? parseCoachRunCommand(body.runCommand) : null;
    if (v2 && !command)
      throw new HttpException('Invalid Coach run command', 400);
    await this.aiDataConsent.assertGranted(userId);
    if (command && !body.branchId) {
      const branchId = await this.coachRuns.existingRequestBranch(
        userId,
        String(body.sid ?? ''),
        command,
      );
      if (branchId) body = { ...body, branchId };
    }
    if (command?.kind === 'answer' && !body.branchId) {
      const branchId = await this.coachRuns.answerBranch(
        userId,
        String(body.sid ?? ''),
        command.runId,
      );
      body = { ...body, branchId: branchId ?? undefined };
    }
    if (command?.kind === 'retry') {
      const input = await this.coachRuns.retryInput(
        userId,
        String(body.sid ?? ''),
        command,
      );
      body = {
        ...body,
        q: input.prompt,
        message: input.message,
        branchId: input.branchId ?? undefined,
      };
    }
    if (body.caseId) {
      await this.assessmentCases.assertBoundRequest({
        userId,
        caseId: body.caseId,
        sessionId: String(body.sid ?? ''),
        branchId: body.branchId ?? null,
      });
    }
    const rawSink = args.sink;
    let runHandle: CoachRunHandle | undefined;
    let runFinished = false;
    const lateActivities: import('@shared/ai-coach-run-contract').CoachActivityEvent[] =
      [];
    const runClosingChunks: import('./core/coach-ui-message-stream').CoachUiChunk[] =
      [];
    let runQueue: Promise<void> = Promise.resolve();
    let runTimer: ReturnType<typeof setInterval> | undefined;
    let runLastFlush = 0;
    let runDirty = false;
    let heartbeatBusy = false;
    const preRunEvents: CoachUiStreamYield[] = [];
    const sink: CoachTurnSink = !v2
      ? rawSink
      : {
          ...rawSink,
          end() {
            /* The producer finalizes durable state before closing its stream. */
          },
          emit: async (event) => {
            if (event.type === 'result' && event.operation) {
              await rawSink.emit({
                type: 'ui_chunk',
                chunk: {
                  type: 'data-coach-operation',
                  data: { operation: event.operation },
                  transient: true,
                },
              });
            }
            if (!runHandle) {
              preRunEvents.push(event);
              return;
            }
            if (runFinished) return;
            const write = runQueue.then(async () => {
              if (runFinished) return;
              const chunks = runHandle.projector.consume(event);
              if (
                !chunks.length &&
                event.type !== 'user' &&
                event.type !== 'assistant'
              )
                return;
              const isText =
                event.type === 'stream_event' &&
                event.event.type === 'text_delta';
              runDirty = true;
              if (!isText || Date.now() - runLastFlush >= 500) {
                await this.coachRuns.checkpoint(runHandle);
                runLastFlush = Date.now();
                runDirty = false;
              }
              for (const chunk of chunks)
                await rawSink.emit({ type: 'ui_chunk', chunk });
            });
            runQueue = write.catch(() => undefined);
            return write;
          },
        };
    const finishRun = async (
      status: CoachRunStatus,
      legacyMessage?: unknown,
    ) => {
      await runQueue;
      if (!runHandle || runFinished) return;
      if (status === 'completed' || status === 'awaiting_input') {
        const cancellation = await this.coachRuns.heartbeat(runHandle);
        if (cancellation) {
          abort.abort(cancellation);
          throw new Error(cancellation);
        }
      }
      const chunks = runHandle.projector.finish(status);
      try {
        await this.coachRuns.checkpoint(runHandle, status, legacyMessage);
      } catch (error) {
        if (error instanceof CoachRunCancelledError)
          abort.abort('user_cancelled');
        throw error;
      }
      runFinished = true;
      for (const activity of lateActivities.splice(0))
        await this.coachRuns.recordLateOutcome(runHandle, activity);
      for (const chunk of chunks) {
        if (chunk.type === 'finish' || chunk.type === 'finish-step')
          runClosingChunks.push(chunk);
        else await rawSink.emit({ type: 'ui_chunk', chunk });
      }
    };
    const reqId = randomUUID();
    const startedAt = Date.now();
    const coachUserMessage = normalizeCoachUserMessage(body?.message);
    if (!v2) await this.coachRuns.assertLegacyInput(coachUserMessage);
    const isMetaOnlyToolResult = hasCoachMetaOnlyToolResult(coachUserMessage);
    const prompt = (
      textFromCoachUserMessage(coachUserMessage) || String(body?.q ?? '')
    ).trim();
    if (!prompt && !isMetaOnlyToolResult) {
      this.logger.warn(`[AI][教练][${reqId}] 缺少提问内容 用户ID=${userId}`);
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.missing_prompt') ?? 'Missing prompt',
      });
    }
    const sessionId = String(body?.sid ?? '').trim();
    if (!sessionId) {
      this.logger.warn(
        `[AI][教练][${reqId}] 请求体未带 sid，落库将使用会话键 default，易与地址栏 UUID 会话不一致`,
      );
    }
    const lang = resolveCoachReplyLanguage(
      prompt,
      String(body?.lang ?? 'en').trim() || 'en',
    );
    const intent = String(body?.intent ?? '').trim();
    const purpose = parseRequestedModelPurpose(body?.purpose);
    const thinking = purpose === 'REASONING';
    const operationId = String(body?.operationId ?? '').trim();
    if (!isMetaOnlyToolResult && !operationId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'operationId is required',
      });
    }
    const maxPromptChars = Number(
      process.env.AI_COACH_MAX_PROMPT_CHARS || 2000,
    );
    const maxSidChars = Number(process.env.AI_COACH_MAX_SID_CHARS || 64);
    if (!isMetaOnlyToolResult && prompt.length > maxPromptChars) {
      this.logger.warn(
        `[AI][教练][${reqId}] 提问内容过长 用户ID=${userId} 提示字符数=${prompt.length} 最大值=${maxPromptChars}`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          this.i18n.t('common.error.prompt_too_long') ?? 'Prompt too long',
      });
    }
    if (sessionId && sessionId.length > maxSidChars) {
      this.logger.warn(
        `[AI][教练][${reqId}] 会话标识不合法 用户ID=${userId} 会话ID字符数=${sessionId.length} 最大值=${maxSidChars}`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.invalid_sid') ?? 'Invalid sid',
      });
    }

    const skipUserAppend =
      body?.skip_user_append === true ||
      body?.skip_user_append === '1' ||
      body?.skip_user_append === 'true';

    const provider = getCoachUpstreamProvider();
    const model = getCoachModel({ thinking });
    this.logger.log(
      `[AI][教练][${reqId}] 开始处理 用户ID=${userId} 会话ID=${sessionId || 'default'} 语言=${lang} 服务商=${provider ?? 'none'} 模型=${model || 'none'} skipUserAppend=${skipUserAppend ? '是' : 'no'} 提示字符数=${prompt.length} promptPreview="${previewText(prompt)}"`,
    );

    sink.start();

    const abort = new AbortController();
    const totalTimeoutMs = Number(
      process.env.AI_COACH_TOTAL_TIMEOUT_MS || 360_000,
    );
    const totalTimer = setTimeout(
      () => {
        if (!abort.signal.aborted) {
          this.logger.warn(
            `[AI][教练][${reqId}] 总超时中断 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${Date.now() - startedAt} 超时毫秒=${totalTimeoutMs}`,
          );
          abort.abort('total_timeout');
        }
      },
      Math.max(1, totalTimeoutMs),
    );

    const cleanup = () => {
      if (!abort.signal.aborted && !sink.isClosed()) {
        this.logger.warn(
          `[AI][教练][${reqId}] 客户端断开连接 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${Date.now() - startedAt}`,
        );
        abort.abort('client_disconnected');
      }
    };
    sink.onClose(cleanup);

    let operationStarted = false;
    let operationCompleted = false;
    let operationFailed = false;
    let operationCompletionPending = false;
    let operationHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let coachSessionKey = String(sessionId ?? '').trim() || 'default';
    let lastUsage: unknown = undefined;
    let actualModel = model;
    let actionUsageKind: $Enums.AiUsageKind = $Enums.AiUsageKind.COACH_CHAT;
    const modelUsageEvents: Array<
      Extract<CoachUiStreamYield, { type: 'model_usage' }>
    > = [];
    const persistedUsageCallKeys = new Set<string>();
    let assistantResultPersisted = false;
    let assistantResultMessageId: string | null = null;
    // 本轮用户消息已在库中（新写入或编辑重答已存在）：失败提示才有落库意义。
    let userTurnPersisted = false;
    let coachBranchId = String(body?.branchId ?? '').trim() || null;
    const requestFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          sessionId: sessionId || 'default',
          purpose,
          intent: intent || null,
          prompt,
          message: coachUserMessage,
          branchId: body?.branchId ?? null,
          contextId: body?.contextId ?? null,
          planId: body?.planId ?? null,
        }),
      )
      .digest('hex');

    const persistCoachUsage = async (ensureModelCall = false) => {
      const hasReportedUsage =
        modelUsageEvents.length > 0 || lastUsage !== undefined;
      if (!hasReportedUsage && !ensureModelCall) return;
      const events =
        modelUsageEvents.length > 0
          ? modelUsageEvents
          : [
              {
                type: 'model_usage' as const,
                usage: lastUsage,
                model: actualModel,
                provider: provider ?? undefined,
                status: 'SUCCESS' as const,
              },
            ];
      for (const [index, event] of events.entries()) {
        const callKey = `${operationId}:coach-model:${index}`;
        if (persistedUsageCallKeys.has(callKey)) continue;
        const eventModel = event.model.trim() || actualModel;
        const eventProvider = event.provider?.trim() || provider;
        try {
          await this.aiUsage.recordUsageEvent({
            userId,
            operationId,
            callKey,
            kind: actionUsageKind,
            provider: eventProvider,
            model: eventModel,
            purpose: purposeForActualModel({
              provider: eventProvider,
              modelId: eventModel,
              requestedPurpose: purpose,
            }),
            usage: parseOpenAIUsage(event.usage),
            sid: coachSessionKey,
            status: event.status as AiUsageStatus,
          });
          persistedUsageCallKeys.add(callKey);
        } catch (error) {
          this.logger.error(
            `[AI][教练][${reqId}] usage 落库失败 operationId=${operationId} callKey=${callKey} error=${String(error)}`,
          );
        }
      }
    };

    const operationAdmissionArgs = {
      userId,
      operationId,
      idempotencyKey,
      kind: $Enums.AiUsageKind.COACH_CHAT,
      purpose,
      metadata: {
        sid: sessionId || 'default',
        intent: intent || null,
        requestFingerprint,
      },
    };

    const emitOperationReplay = async (operation: AiOperation) => {
      await sink.emit({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
        operation: toAiOperationResult(operation, true),
      });
      sink.end();
    };

    /**
     * 失败提示落库为助手行（providerReplay=false + data-coach-turn-error），刷新后可见、
     * 可重试，且永远不会进入模型上下文。客户端主动断开时不写。
     */
    const persistTurnFailure = async (failure: {
      code: string;
      message: string;
    }) => {
      const content = failure.message.trim();
      if (v2) return;
      if (!content || !userTurnPersisted) return;
      if (abort.signal.reason === 'client_disconnected') return;
      try {
        await this.aiService.coachAppendTurnFailure({
          session,
          sid: coachSessionKey,
          lang,
          content,
          code: failure.code,
          branchId: coachBranchId,
        });
      } catch (error) {
        this.logger.error(
          `[AI][教练][${reqId}] 保存失败提示失败 用户ID=${userId} 会话ID=${coachSessionKey} 代码=${failure.code} 原因=${String(error)}`,
        );
      }
    };

    /** 推送终态错误并落库失败提示，然后结束本轮。 */
    const failTurn = async (failure: {
      code: string;
      message: string;
      data?: unknown;
    }) => {
      await sink.emit({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        error_code: failure.code,
        result: failure.message,
        ...(failure.data !== undefined ? { data: failure.data } : {}),
      });
      await persistTurnFailure(failure);
      sink.end();
    };

    const modelUnavailable = () => {
      const payload = coachSsePayloadForModelUnavailable({
        i18n: this.i18n,
        lang,
      });
      return { code: payload.error_code, message: payload.result };
    };

    try {
      if (!isMetaOnlyToolResult && !v2) {
        const peeked = await this.operations.peekReplay(operationAdmissionArgs);
        if (peeked.replay) {
          await emitOperationReplay(peeked.operation);
          return;
        }
      }

      if (
        !coachBranchId &&
        (String(body?.contextId ?? '').trim() ||
          String(body?.planId ?? '').trim())
      ) {
        const opened = await this.coachBranching.openBranch({
          userId,
          contextId: String(body?.contextId ?? '').trim() || undefined,
          planId: String(body?.planId ?? '').trim() || undefined,
          openReason:
            String(body?.openReason ?? '').trim() || 'coach_chat_branch',
          sourceNode: body?.sourceNode,
        });
        coachBranchId = opened.branch.id;
        await sink.emit({
          type: 'branch',
          subtype: 'opened',
          branch: opened.branch,
        });
      }

      if (!sessionId && coachBranchId) {
        coachSessionKey = coachBranchId;
      }

      if (v2 && !isMetaOnlyToolResult) {
        const begun = await this.coachRuns.begin({
          userId,
          sid: coachSessionKey,
          branchId: coachBranchId,
          lang,
          prompt,
          message: coachUserMessage ?? {
            content: [{ type: 'text', text: prompt }],
          },
          operationId,
          command,
        });
        if (begun.replay) {
          const replayChunks = coachSnapshotChunks(
            begun.replay.id,
            begun.replay.message,
          );
          for (const chunk of replayChunks.slice(0, -2))
            await rawSink.emit({ type: 'ui_chunk', chunk });
          const operation = await this.operations.get(
            userId,
            begun.replay.operationId,
          );
          if (operation)
            await rawSink.emit({
              type: 'ui_chunk',
              chunk: {
                type: 'data-coach-operation',
                data: { operation: toAiOperationResult(operation, true) },
                transient: true,
              },
            });
          for (const chunk of replayChunks.slice(-2))
            await rawSink.emit({ type: 'ui_chunk', chunk });
          preRunEvents.length = 0;
          return;
        }
        runHandle = begun.handle;
        userTurnPersisted = true;
        const chunks = runHandle.projector.start();
        await this.coachRuns.checkpoint(runHandle);
        for (const chunk of chunks)
          await rawSink.emit({ type: 'ui_chunk', chunk });
        for (const event of preRunEvents.splice(0)) await sink.emit(event);
        if (coachBranchId && command.kind !== 'retry')
          await this.coachBranching.appendBranchMessage({
            userId,
            branchId: coachBranchId,
            role: 'user',
            message: coachUserMessage ?? {
              content: [{ type: 'text', text: prompt }],
            },
          });
        runTimer = setInterval(() => {
          if (heartbeatBusy || runFinished) return;
          heartbeatBusy = true;
          void (async () => {
            const reason = await this.coachRuns.heartbeat(runHandle);
            if (reason) abort.abort(reason);
            if (runDirty && !runFinished) {
              const write = runQueue.then(async () => {
                if (!runFinished && runDirty) {
                  await this.coachRuns.checkpoint(runHandle);
                  runDirty = false;
                }
              });
              runQueue = write.catch(() => undefined);
              await write;
            }
          })()
            .catch(() => abort.abort('checkpoint_failed'))
            .finally(() => {
              heartbeatBusy = false;
            });
        }, 500);
      } else if (skipUserAppend) {
        await this.aiService.assertCoachSkipAppendMatchesPrompt({
          session,
          sid: coachSessionKey,
          prompt,
        });
        userTurnPersisted = true;
        this.logger.debug(
          `[AI][教练][${reqId}] 跳过追加用户行（编辑重答） 用户ID=${userId} 会话ID=${coachSessionKey}`,
        );
      } else {
        coachSessionKey = await this.aiService.coachAppendUserTurn({
          session,
          sid: coachSessionKey,
          lang,
          content: prompt,
          message: coachUserMessage ?? undefined,
        });
        userTurnPersisted = !isMetaOnlyToolResult;
        if (coachBranchId) {
          await this.coachBranching.appendBranchMessage({
            userId,
            branchId: coachBranchId,
            role: 'user',
            message: coachUserMessage ?? {
              content: [{ type: 'text', text: prompt }],
            },
          });
        }
        this.logger.debug(
          `[AI][教练][${reqId}] 已写入会话记忆 用户ID=${userId} 会话ID=${coachSessionKey} branchId=${coachBranchId ?? 'none'} structuredUserMessage=${coachUserMessage ? '是' : 'no'}`,
        );
      }

      if (!skipUserAppend && hasCoachMetaOnlyToolResult(coachUserMessage)) {
        this.logger.debug(
          `[AI][教练][${reqId}] coach meta-only tool_result，跳过模型流 用户ID=${userId} 会话ID=${coachSessionKey}`,
        );
        sink.end();
        return;
      }

      // USER 必须在模型操作登记前落库。否则模型不可用会留下
      // 空壳 sid，用户发的「你好」无法从同一会话恢复。
      if (!isMetaOnlyToolResult) {
        const admission = await this.operations.begin(operationAdmissionArgs);
        if (admission.replay) {
          await emitOperationReplay(admission.operation);
          return;
        }
        operationStarted = true;
        operationHeartbeatTimer = setInterval(() => {
          void this.operations.heartbeat(userId, operationId);
        }, 30_000);
      }

      let assistantText = '';
      let assistantReasoningText = '';
      const orderedAssistantContent: CoachAssistantContentBlock[] = [];
      let chunkCount = 0;
      let reasoningChunkCount = 0;
      const structuredEventsToPersist: Array<
        | {
            type: 'assistant';
            message: {
              content: CoachAssistantContentBlock[];
              reasoning_content?: string;
            };
          }
        | { type: 'user'; message: CoachUserMessageBody }
      > = [];
      const stream = await this.aiService.coachStream({
        session,
        sid: coachSessionKey,
        lang,
        prompt,
        message: coachUserMessage,
        intent: intent || undefined,
        thinking,
        operationId,
        usageKind: $Enums.AiUsageKind.COACH_CHAT,
        branchId: coachBranchId,
        caseId: body.caseId ?? null,
        signal: abort.signal,
        onActivity: v2
          ? async (activity) => {
              const reason = await this.coachRuns.heartbeat(runHandle);
              if (reason) abort.abort(reason);
              if (runFinished || reason === 'ownership_lost') {
                await this.coachRuns.recordLateOutcome(runHandle, activity);
                return;
              }
              if (runHandle.projector.run.status !== 'running') {
                lateActivities.push(activity);
                return;
              }
              // Completed tool receipts must be recorded even after a disconnect.
              if (activity.status === 'running' || activity.status === 'queued')
                abort.signal.throwIfAborted();
              await sink.emit({ type: 'activity', activity });
            }
          : undefined,
      });
      this.logger.log(
        `[AI][教练][${reqId}] 流式输出已打开 用户ID=${userId} 会话ID=${coachSessionKey}`,
      );
      let streamStep = 0;
      let currentPhase: 'model' | 'tool_run' | 'running' = 'running';
      let phaseStartedAt = Date.now();
      let modelPhaseMs = 0;
      let toolRunPhaseMs = 0;
      let runningPhaseMs = 0;
      let toolStartCount = 0;
      let toolEndCount = 0;
      let lastDeltaDebugAt = Date.now();
      let firstTextDeltaMs: number | null = null;
      let emittedTerminalResult = false;
      let emittedTerminalError = false;
      let terminalSuccessEvent: Extract<
        CoachUiStreamYield,
        { type: 'result' }
      > | null = null;
      let terminalErrorEvent: Extract<
        CoachUiStreamYield,
        { type: 'result' }
      > | null = null;
      const clientOutputGuard = new CoachClientOutputGuard(this.i18n, lang);
      const streamLoopStartedAt = Date.now();
      const switchPhase = (next: 'model' | 'tool_run' | 'running') => {
        if (next === currentPhase) return;
        const now = Date.now();
        const phaseElapsed = now - phaseStartedAt;
        if (currentPhase === 'model') modelPhaseMs += phaseElapsed;
        else if (currentPhase === 'tool_run') toolRunPhaseMs += phaseElapsed;
        else runningPhaseMs += phaseElapsed;
        currentPhase = next;
        phaseStartedAt = now;
      };
      for await (const event of stream) {
        if (event.type === 'model_usage') {
          modelUsageEvents.push(event);
          await persistCoachUsage();
          continue;
        }
        const clientEvent = clientOutputGuard.handle(event);
        if (clientEvent?.type === 'result' && clientEvent.is_error !== true) {
          terminalSuccessEvent = clientEvent;
        } else if (clientEvent) {
          await sink.emit(clientEvent);
        }
        if (clientEvent?.type === 'result') {
          emittedTerminalResult = true;
          if (clientEvent.is_error === true) {
            emittedTerminalError = true;
            terminalErrorEvent = clientEvent;
          }
        }
        if (event.type === 'result' && event.usage !== undefined) {
          lastUsage = event.usage;
        }
        if (event.type === 'result' && event.model?.trim()) {
          actualModel = event.model.trim();
        }
        if (
          event.type === 'result' &&
          event.is_error === false &&
          clientEvent?.type === 'result' &&
          clientEvent.is_error === true
        ) {
          this.logger.warn(
            `[AI][教练][${reqId}] 空成功终态已转换为错误 用户ID=${userId} 会话ID=${coachSessionKey}`,
          );
        }
        if (event.type === 'system' && event.subtype === 'status') {
          streamStep = event.step ?? streamStep;
          switchPhase(event.status);
          this.logger.debug(
            `[AI][教练][${reqId}] 阶段状态 用户ID=${userId} 会话ID=${coachSessionKey} 步骤=${streamStep} 状态=${event.status}`,
          );
        }
        if (event.type === 'stream_event' && event.event.type === 'phase') {
          switchPhase(event.event.phase);
          this.logger.debug(
            `[AI][教练][${reqId}] 阶段切换 用户ID=${userId} 会话ID=${coachSessionKey} 步骤=${streamStep} 阶段=${event.event.phase}`,
          );
        }
        if (event.type === 'tool_progress') {
          if (event.status === 'start') toolStartCount += 1;
          if (event.status === 'end') toolEndCount += 1;
          this.logger.debug(
            `[AI][教练][${reqId}] 工具进度 用户ID=${userId} 会话ID=${coachSessionKey} 步骤=${streamStep} 阶段=${currentPhase} 工具=${event.tool_name} 状态=${event.status}${typeof event.ok === 'boolean' ? ` ok=${event.ok}` : ''}${typeof event.result_count === 'number' ? ` resultCount=${event.result_count}` : ''}`,
          );
        }
        if (
          event.type === 'stream_event' &&
          event.event.type === 'text_delta'
        ) {
          assistantText += event.event.text;
          const last = orderedAssistantContent.at(-1);
          if (last?.type === 'text') last.text += event.event.text;
          else
            orderedAssistantContent.push({
              type: 'text',
              text: event.event.text,
            });
          chunkCount += 1;
          const now = Date.now();
          if (firstTextDeltaMs === null) {
            firstTextDeltaMs = now - startedAt;
          }
          if (
            chunkCount === 1 ||
            now - lastDeltaDebugAt >= 3_000 ||
            chunkCount % 50 === 0
          ) {
            this.logger.debug(
              `[AI][教练][${reqId}] 文本增量 用户ID=${userId} 会话ID=${coachSessionKey} 步骤=${streamStep} 阶段=${currentPhase} 分片数=${chunkCount} chars=${assistantText.length} 耗时毫秒=${now - startedAt}`,
            );
            lastDeltaDebugAt = now;
          }
        }
        if (
          event.type === 'stream_event' &&
          event.event.type === 'reasoning_delta'
        ) {
          assistantReasoningText += event.event.text;
          reasoningChunkCount += 1;
        }
        if (event.type === 'assistant') {
          structuredEventsToPersist.push(event);
          for (const block of event.message.content) {
            if (
              block.type === 'tool_use' &&
              coachAssistantBlockIsUiSurface(block)
            ) {
              orderedAssistantContent.push(block);
            }
          }
          this.logger.debug(
            `[AI][教练][${reqId}] 结构化助手消息 用户ID=${userId} 会话ID=${coachSessionKey} 步骤=${streamStep} 块数=${event.message.content.length}`,
          );
        }
        if (event.type === 'user') {
          structuredEventsToPersist.push(event);
          this.logger.debug(
            `[AI][教练][${reqId}] 结构化用户消息 用户ID=${userId} 会话ID=${coachSessionKey} 步骤=${streamStep} 块数=${event.message.content.length}`,
          );
        }
      }
      {
        const now = Date.now();
        const phaseElapsed = now - phaseStartedAt;
        switch (currentPhase as 'model' | 'tool_run' | 'running') {
          case 'model':
            modelPhaseMs += phaseElapsed;
            break;
          case 'tool_run':
            toolRunPhaseMs += phaseElapsed;
            break;
          default:
            runningPhaseMs += phaseElapsed;
            break;
        }
      }

      if (abort.signal.aborted) {
        if (emittedTerminalResult) {
          this.logger.warn(
            `[AI][教练][${reqId}] 已发送终态结果，跳过超时补发 用户ID=${userId} 会话ID=${coachSessionKey} 原因=${String(abort.signal.reason)}`,
          );
          sink.end();
          return;
        }
        this.logger.warn(
          `[AI][教练][${reqId}] 流迭代结束但连接已中断 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 原因=${String(abort.signal.reason)} 耗时毫秒=${Date.now() - startedAt}`,
        );
        if (abort.signal.reason === 'total_timeout') {
          await failTurn(modelUnavailable());
          return;
        }
        const { code, message } = coachSsePayloadForAbort(this.i18n);
        await sink.emit({
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          result: message,
          error_code: code,
        });
        sink.end();
        return;
      }

      if (!emittedTerminalResult) {
        const fallback = clientOutputGuard.missingTerminalResult();
        this.logger.warn(
          `[AI][教练][${reqId}] 模型流缺少终态 用户ID=${userId} 会话ID=${coachSessionKey}`,
        );
        if (fallback) {
          await sink.emit(fallback);
          if (fallback.type === 'result') {
            await persistTurnFailure({
              code: fallback.error_code ?? 'internal',
              message: String(fallback.result ?? ''),
            });
          }
        }
        if (operationStarted) {
          await persistCoachUsage(true);
          await this.operations.fail({
            userId,
            operationId,
            errorCode: 'MISSING_TERMINAL_RESULT',
          });
          operationFailed = true;
        }
        sink.end();
        return;
      }

      if (emittedTerminalError) {
        const terminalError = terminalErrorEvent;
        await persistTurnFailure({
          code: terminalError?.error_code ?? 'internal',
          message: String(terminalError?.result ?? ''),
        });
        this.logger.warn(
          `[AI][教练][${reqId}] 终态错误已返回并保存为可见消息，跳过成功结果持久化 用户ID=${userId} 会话ID=${coachSessionKey} 代码=${terminalError?.error_code ?? 'none'}`,
        );
        if (operationStarted) {
          await persistCoachUsage(true);
          await this.operations.fail({
            userId,
            operationId,
            errorCode: 'MODEL_TERMINAL_ERROR',
          });
          operationFailed = true;
        }
        sink.end();
        return;
      }

      actionUsageKind = resolveCoachUsageKind(structuredEventsToPersist);
      if (
        operationStarted &&
        actionUsageKind !== $Enums.AiUsageKind.COACH_CHAT
      ) {
        await this.operations.updateKind(userId, operationId, actionUsageKind);
      }

      // Usage 与操作状态均为必需步骤，不能 best-effort 跳过。
      const usageRecordStartedAt = Date.now();
      await persistCoachUsage(true);
      const usageRecordMs = Date.now() - usageRecordStartedAt;

      const internalStructuredEvents = structuredEventsToPersist.filter(
        // 内部工具调用要按 assistant/tool_result 形态落库，UI-only 工具卡片则合并进最终助手消息。
        (event) =>
          event.type === 'user' ||
          event.message.content.some((block) =>
            coachAssistantBlockIsInternalToolUse(block),
          ),
      );
      const internalPersistStartedAt = Date.now();
      for (const event of internalStructuredEvents) {
        if (event.type === 'assistant') {
          if (!runHandle)
            await this.aiService.coachAppendAssistantTurn({
              branchId: coachBranchId,
              session,
              sid: coachSessionKey,
              lang,
              content: textFromAssistantMessageBody(event.message),
              message: event.message,
            });
          if (coachBranchId) {
            await this.coachBranching.appendBranchMessage({
              userId,
              branchId: coachBranchId,
              role: 'assistant',
              message: event.message,
              allowTerminalWrite: true,
            });
          }
        } else {
          if (!runHandle)
            await this.aiService.coachAppendUserTurn({
              session,
              sid: coachSessionKey,
              lang,
              content: textFromCoachUserMessage(event.message),
              message: event.message,
            });
          if (coachBranchId) {
            await this.coachBranching.appendBranchMessage({
              userId,
              branchId: coachBranchId,
              role: 'user',
              message: event.message,
              allowTerminalWrite: true,
            });
          }
        }
      }
      const internalPersistMs = Date.now() - internalPersistStartedAt;

      const uiAssistantMessages = structuredEventsToPersist
        // 只保留前端会渲染的工具卡片；内部工具调用不应该出现在聊天气泡里。
        .filter((event) => event.type === 'assistant')
        .map((event) => ({
          ...event.message,
          content: event.message.content.filter((block) =>
            coachAssistantBlockIsUiSurface(block),
          ),
        }))
        .filter((message) => message.content.length > 0);
      const assistantPersist = buildAssistantMessageBody({
        prose: assistantText,
        reasoningContent: assistantReasoningText,
        orderedContent: orderedAssistantContent,
        assistantMessages: uiAssistantMessages,
      });

      if (
        !abort.signal.aborted &&
        (assistantPersist.content.length > 0 ||
          assistantPersist.message.content.length > 0 ||
          Boolean(assistantPersist.message.reasoning_content?.trim()))
      ) {
        const assistantPersistStartedAt = Date.now();
        if (runHandle) {
          assistantResultMessageId = runHandle.projector.message.id;
          await this.aiService.coachAssistantDelivered({
            userId,
            sid: coachSessionKey,
            branchId: coachBranchId,
            message: assistantPersist.message,
            messageId: assistantResultMessageId,
            skipCompression: true,
          });
        } else
          assistantResultMessageId =
            await this.aiService.coachAppendAssistantTurn({
              branchId: coachBranchId,
              session,
              sid: coachSessionKey,
              lang,
              content: assistantPersist.content,
              message: assistantPersist.message,
            });
        if (coachBranchId) {
          await this.coachBranching.appendBranchMessage({
            userId,
            branchId: coachBranchId,
            role: 'assistant',
            message: assistantPersist.message,
            allowTerminalWrite: true,
          });
        }
        if (runHandle)
          await finishRun(
            runHandle.projector.pendingInteraction
              ? 'awaiting_input'
              : 'completed',
            assistantPersist.message,
          );
        assistantResultPersisted = Boolean(assistantResultMessageId);
        const assistantPersistMs = Date.now() - assistantPersistStartedAt;
        this.logger.debug(
          `[AI][教练][${reqId}] 已保存助手回复 用户ID=${userId} 会话ID=${coachSessionKey} 正文字符数=${assistantText.length} 持久化字符数=${assistantPersist.content.length} 消息块数=${assistantPersist.message.content.length} 分片数=${chunkCount} 持久化耗时毫秒=${assistantPersistMs}`,
        );
      }
      const totalElapsedMs = Date.now() - startedAt;
      const streamLoopMs = Date.now() - streamLoopStartedAt;
      this.logger.log(
        `[AI][教练][${reqId}] 完成 用户ID=${userId} 会话ID=${coachSessionKey} aborted=${abort.signal.aborted ? '是' : 'no'} 耗时毫秒=${totalElapsedMs} 流循环耗时毫秒=${streamLoopMs} 模型阶段耗时毫秒=${modelPhaseMs} 工具阶段耗时毫秒=${toolRunPhaseMs} 运行阶段耗时毫秒=${runningPhaseMs} 首文本增量耗时毫秒=${firstTextDeltaMs ?? -1} 用量记录耗时毫秒=${usageRecordMs} 内部持久化耗时毫秒=${internalPersistMs} 助手字符数=${assistantText.length} reasoning字符数=${assistantReasoningText.length} 持久化字符数=${assistantPersist.content.length} 消息块数=${assistantPersist.message.content.length} 文本分片数=${chunkCount} reasoning分片数=${reasoningChunkCount} 工具开始次数=${toolStartCount} 工具结束次数=${toolEndCount}`,
      );
      if (!assistantResultPersisted) {
        throw new Error('AI_RESULT_NOT_PERSISTED');
      }
      await this.operations.markDelivered({
        userId,
        operationId,
        resultRef: {
          kind: 'COACH_SESSION',
          sid: coachSessionKey,
          messageId: assistantResultMessageId,
          branchId: coachBranchId,
        },
      });
      try {
        const operation = await this.operations.complete(userId, operationId);
        operationCompleted = true;
        await sink.emit({
          ...(terminalSuccessEvent ?? {
            type: 'result' as const,
            subtype: 'success' as const,
            is_error: false,
            result: assistantText,
          }),
          operation: toAiOperationResult(operation, false),
        });
      } catch (completionError) {
        operationCompletionPending = true;
        this.logger.error(
          `[AI][教练][${reqId}] 操作完成状态待恢复 userId=${userId} operationId=${operationId} error=${String(completionError)}`,
        );
        await sink.emit({
          ...(terminalSuccessEvent ?? {
            type: 'result' as const,
            subtype: 'success' as const,
            is_error: false,
            result: assistantText,
          }),
          operation: {
            operationId,
            status: 'RUNNING',
            replayed: false,
            pending: true,
            purpose,
            recovery: {
              kind: 'COACH_SESSION',
              sid: coachSessionKey,
              messageId: assistantResultMessageId,
              branchId: coachBranchId,
            },
          },
        });
      }
      sink.end();
    } catch (err) {
      if (
        operationStarted &&
        !operationCompleted &&
        !operationCompletionPending
      ) {
        await persistCoachUsage().catch(() => undefined);
        try {
          await this.operations.fail({
            userId,
            operationId,
            errorCode: 'AI_OPERATION_FAILED',
          });
          operationFailed = true;
        } catch {
          // finally 会再尝试释放操作锁。
        }
      }
      const fields = unknownErrorFields(err);
      const responseBody =
        err && typeof err === 'object' && 'getResponse' in err
          ? asRecord((err as { getResponse: () => unknown }).getResponse())
          : null;
      const operationErrorCode = String(responseBody?.code ?? '');
      const elapsedMs = Date.now() - startedAt;
      if (operationErrorCode === 'AI_MODEL_PURPOSE_UNAVAILABLE') {
        this.logger.warn(
          `[AI][教练][${reqId}] 模型用途不可用 用户ID=${userId} 用途=${purpose} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${elapsedMs}`,
        );
        await failTurn(modelUnavailable());
        return;
      }
      if (isAiOperationErrorCode(operationErrorCode)) {
        await sink.emit({
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          error_code: operationErrorCode,
          result: operationErrorCode,
          data: responseBody?.data,
        });
        sink.end();
        return;
      }
      if (fields.name === 'AbortError' || abort.signal.aborted) {
        if (sink.isClosed()) {
          return;
        }
        this.logger.warn(
          `[AI][教练][${reqId}] 已中断 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 原因=${String(abort.signal.reason ?? fields.message ?? 'aborted')} 耗时毫秒=${elapsedMs}`,
        );
        if (abort.signal.reason === 'total_timeout') {
          await failTurn(modelUnavailable());
          return;
        }
        const { code, message } = coachSsePayloadForAbort(this.i18n);
        await sink.emit({
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          result: message,
          error_code: code,
        });
        sink.end();
        return;
      }
      if (fields.status === 429 || fields.code === 429) {
        const nested = fields.error;
        const metadata = nested ? asRecord(nested.metadata) : null;
        const rawMsg =
          metadata?.raw ||
          nested?.message ||
          fields.message ||
          'Upstream rate limited';
        this.logger.warn(
          `[AI][教练][${reqId}] 上游限流(429) 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${elapsedMs} msg="${previewText(String(rawMsg), 240)}"`,
        );
        await failTurn(modelUnavailable());
        return;
      }
      if (fields.code === 'AI_COACH_STREAM_IDLE_TIMEOUT') {
        this.logger.warn(
          `[AI][教练][${reqId}] 模型流停滞 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${elapsedMs}`,
        );
        await failTurn(modelUnavailable());
        return;
      }
      if (fields.code === 'AI_COACH_STEP_TIMEOUT') {
        this.logger.warn(
          `[AI][教练][${reqId}] 模型单步达到硬上限 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${elapsedMs}`,
        );
        await failTurn(modelUnavailable());
        return;
      }
      if (err instanceof BusinessException) {
        const body = err.getResponse() as { message?: string };
        const msg =
          String(body?.message ?? '').trim() ||
          this.i18n.t('common.error.internal', { lang });
        this.logger.warn(
          `[AI][教练][${reqId}] 业务异常 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${elapsedMs} msg="${previewText(msg, 240)}"`,
        );
        await failTurn({ code: 'business', message: msg });
        return;
      }
      if (isUpstreamModelError(err)) {
        this.logger.error(
          `[AI][教练][${reqId}] 上游模型调用失败 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 状态=${String(fields.status ?? 'none')} 耗时毫秒=${elapsedMs} msg="${previewText(String(fields.message ?? ''), 240)}"`,
        );
        await failTurn(modelUnavailable());
        return;
      }
      this.logger.error(
        `[AI][教练][${reqId}] SSE 流发生错误 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${elapsedMs}`,
        err,
      );
      await failTurn({
        code: 'internal',
        message:
          this.i18n.t('common.error.internal', { lang }) ??
          'Internal error. Please try again later.',
      });
    } finally {
      if (runTimer) clearInterval(runTimer);
      if (v2) {
        try {
          if (runHandle && !runFinished) {
            const reason = abort.signal.reason;
            await finishRun(
              reason === 'user_cancelled'
                ? 'cancelled'
                : reason === 'client_disconnected' ||
                    reason === 'ownership_lost'
                  ? 'interrupted'
                  : 'failed',
            );
          } else if (!runHandle) {
            for (const event of preRunEvents) await rawSink.emit(event);
          }
        } catch (error) {
          this.logger.error(
            `Coach run final checkpoint failed: ${String(error)}`,
          );
        } finally {
          for (const chunk of runClosingChunks)
            await rawSink.emit({ type: 'ui_chunk', chunk });
          rawSink.end();
        }
      }
      if (
        operationStarted &&
        !operationCompleted &&
        !operationFailed &&
        !operationCompletionPending
      ) {
        await persistCoachUsage().catch(() => undefined);
        await this.operations
          .fail({
            userId,
            operationId,
            errorCode: 'AI_OPERATION_INTERRUPTED',
          })
          .catch(() => undefined);
      }
      clearTimeout(totalTimer);
      if (operationHeartbeatTimer) clearInterval(operationHeartbeatTimer);
      sink.offClose(cleanup);
    }
  }

  /**
   * 活动 AI 解读（SSE 流式输出）
   *
   * 说明：
   * - 该接口要求用户已登录
   * - `hashId` 为活动的 hashId（从数据库中读取已解析/已处理数据）
   * - 通过 SSE 逐段返回模型输出：`{ data: { content: string } }`
   *
   * 入参：
   * - hashId: 活动 hashId（必填）
   * - useCache: 是否使用缓存（默认 true）
   * - lang: 语言偏好
   *
   * 该入口固定使用默认模型用途，不接受推理用途切换。
   */
  @Sse('activity-reviews/:hashId/stream')
  @RequiresRuntimeCapability('ai')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.AI_PASSIVE_GENERATION)
  async streamActivityAiAnalysis(
    @Param('hashId') hashId: string,
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
    @Query('useCache', new ParseBoolPipe({ optional: true })) useCache = true,
    @Query('lang') lang = 'en',
    @Query('operationId') operationIdRaw?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<Observable<MessageEvent>> {
    if (!hashId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.missing_activity_id'),
      });
    }
    const maxHashIdChars = Number(
      process.env.AI_ACTIVITY_MAX_HASHID_CHARS || 128,
    );
    if (String(hashId).length > maxHashIdChars) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.invalid_activity_id'),
      });
    }
    const operationId = String(operationIdRaw ?? '').trim();
    if (!operationId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'operationId is required',
      });
    }
    const purpose: AiModelPurpose = 'DEFAULT';
    const requestFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          activityHashId: hashId,
          useCache: publicDemo ? true : useCache,
          lang,
          purpose,
        }),
      )
      .digest('hex');
    const admission = await this.operations.begin({
      userId,
      operationId,
      idempotencyKey,
      kind: $Enums.AiUsageKind.ACTIVITY_ANALYSIS,
      purpose,
      metadata: { activityHashId: hashId, requestFingerprint },
    });
    if (admission.replay) {
      return new Observable((subscriber) => {
        subscriber.next({
          data: {
            type: 'operation',
            operation: toAiOperationResult(admission.operation, true),
          },
        } as MessageEvent);
        subscriber.complete();
      });
    }
    let stream: Awaited<ReturnType<AiService['streamActivityAiAnalysis']>>;
    try {
      stream = await this.aiService.streamActivityAiAnalysis(
        hashId,
        userId,
        publicDemo ? true : useCache,
        lang,
        purpose,
        operationId,
        Boolean(publicDemo),
      );
    } catch (error) {
      await this.operations.fail({
        userId,
        operationId,
        errorCode: 'ACTIVITY_ANALYSIS_START_FAILED',
      });
      throw error;
    }
    return new Observable((subscriber) => {
      // Nest @Sse 会负责外层 event-stream，这里只把模型 delta 包成 MessageEvent.data。
      (async () => {
        let completionPending = false;
        let activityReviewId: string | null = null;
        const heartbeatTimer = setInterval(() => {
          void this.operations
            .heartbeat(userId, operationId)
            .catch((error) =>
              this.logger.warn(
                `Activity analysis operation heartbeat failed operationId=${operationId} error=${String(error)}`,
              ),
            );
        }, 30_000);
        try {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          for await (const chunk of stream) {
            if (subscriber.closed) {
              throw new Error('ACTIVITY_ANALYSIS_CLIENT_DISCONNECTED');
            }
            const anyChunk = chunk as {
              __activityReviewId?: string;
              choices?: Array<{ delta?: { content?: string } }>;
              usage?: unknown;
            };
            if (anyChunk.__activityReviewId) {
              activityReviewId = anyChunk.__activityReviewId;
            }
            const content = anyChunk.choices?.[0]?.delta?.content || '';
            this.logger.debug(`收到流式片段：${content}`);
            if (content) {
              subscriber.next({ data: { content } } as MessageEvent);
            }
          }
          if (subscriber.closed) {
            throw new Error('ACTIVITY_ANALYSIS_CLIENT_DISCONNECTED');
          }
          if (!activityReviewId) throw new Error('AI_RESULT_NOT_PERSISTED');
          await this.operations.markDelivered({
            userId,
            operationId,
            resultRef: {
              kind: 'ACTIVITY_REVIEW',
              activityHashId: hashId,
              reviewId: activityReviewId,
            },
          });
          let operation: AiOperation;
          try {
            operation = await this.operations.complete(userId, operationId);
          } catch (completionError) {
            completionPending = true;
            this.logger.error(
              `Activity analysis operation completion pending operationId=${operationId} userId=${userId} error=${String(completionError)}`,
            );
            subscriber.next({
              data: {
                type: 'operation',
                operation: {
                  operationId,
                  status: 'RUNNING',
                  replayed: false,
                  pending: true,
                  purpose,
                  recovery: {
                    kind: 'ACTIVITY_REVIEW',
                    activityHashId: hashId,
                    reviewId: activityReviewId,
                  },
                },
              },
            } as MessageEvent);
            subscriber.complete();
            return;
          }
          subscriber.next({
            data: {
              type: 'operation',
              operation: toAiOperationResult(operation, false),
            },
          } as MessageEvent);
          subscriber.complete();
        } catch (err) {
          if (!completionPending) {
            await this.operations
              .fail({
                userId,
                operationId,
                errorCode: 'ACTIVITY_ANALYSIS_FAILED',
              })
              .catch((failureError) =>
                this.logger.error(
                  `Activity analysis operation release failed operationId=${operationId} error=${String(failureError)}`,
                ),
              );
          }
          this.logger.error('SSE 流处理失败', err);
          if (subscriber.closed) return;
          const safeMessage =
            this.i18n.t('common.error.internal') ??
            'Internal error. Please try again later.';
          subscriber.next({
            data: {
              type: 'error',
              code: 'internal',
              message: safeMessage,
            },
          } as MessageEvent);
          subscriber.complete();
        } finally {
          clearInterval(heartbeatTimer);
        }
      })();
    });
  }
}
