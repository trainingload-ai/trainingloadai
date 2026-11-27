
import { PlanStartService } from '../plan/application/plan-start.service';
import { PlanStartAssessmentService } from './plan-start-assessment.service';
import { TodaySuggestionGuidanceService } from './today-suggestion/today-suggestion-guidance.service';
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
  ParseUUIDPipe,
  UseGuards,
  Logger,
  MessageEvent,
  Res,
  Sse,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { AiService } from './ai.service';
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
import { SessionOnly } from '@/oauth/session-only.decorator';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { $Enums } from '@prisma/client';
import type { AiModelPurpose } from '@shared/ai-model';
import { createHash } from 'crypto';
import {
  CoachActionService,
  CoachActionUndoError,
} from './core/coach-action.service';
import { normalizeCoachUserMessage, writeCoachSse } from './core/coach-message.util';
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

import { CoachRunStore } from './coach-run-store.service';
import { coachV1CompatibleChunk } from './core/coach-run-projector';

import {
  CoachTurnOrchestrator,
  type CoachPostBody,
  type CoachTurnSink,
} from './coach-turn-orchestrator.service';

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
    @Inject(AI_OPERATION_LEDGER)
    private readonly operations: AiOperationLedger,
    private readonly i18n: I18nService,
    private readonly coachActions: CoachActionService,
    private readonly todaySuggestion: TodaySuggestionOrchestratorService,
    private readonly todaySuggestionEngagement: TodaySuggestionEngagementService,
    private readonly todaySuggestionWorkout: TodaySuggestionWorkoutService,
    private readonly todaySuggestionReminder: TodaySuggestionReminderService,
    private readonly planExecutionAdvice: AiPlanExecutionAdviceService,
    private readonly aiDataConsent: AiDataConsentService,
    private readonly coachRuns: CoachRunStore,
    private readonly todayGuidance: TodaySuggestionGuidanceService,
    private readonly planStarts: PlanStartService,
    private readonly planStartAssessments: PlanStartAssessmentService,
    private readonly coachTurns: CoachTurnOrchestrator,
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

  @Post('today-suggestion/:generationToken/context')
  resolveTodaySuggestionContext(
    @CurrentUserId() userId: string,
    @Param('generationToken') generationToken: string,
  ) {
    return this.todayGuidance.resolve(
      userId,
      generationToken,
      I18nContext.current()?.lang ?? 'en',
    );
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
    @Query('q') query?: string,
  ) {
    const take = takeRaw ? Number(takeRaw) : undefined;
    const offset = offsetRaw ? Number(offsetRaw) : undefined;
    return this.aiService.listCoachSessionsPage({
      userId,
      query,
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

  @Get('coach/sessions/:sid/calendar-move')
  @RequiresRuntimeCapability('ai')
  readCoachCalendarMove(
    @CurrentUserId() userId: string,
    @Param('sid') sid: string,
  ) {
    return this.planStarts.readCoachCalendarMove(userId, sid);
  }

  @Post('coach/sessions/:sid/calendar-move/refresh')
  @RequiresRuntimeCapability('ai')
  refreshCalendarMoveCoach(
    @CurrentUserId() userId: string,
    @Param('sid') sid: string,
    @Body(
      'previousConfirmationId',
      new ParseUUIDPipe({ version: '4', optional: true }),
    )
    previousConfirmationId?: string,
  ) {
    return this.planStarts.refreshCalendarMoveCoach(
      userId,
      sid,
      previousConfirmationId,
    );
  }

  @Get('plans/:planId/start-draft')
  getPlanStartDraft(
    @CurrentUserId() userId: string,
    @Param('planId') planId: string,
    @Query('startDate') startDate?: string,
  ) {
    return this.planStartAssessments.getStartDraft(userId, planId, startDate);
  }

  @Post('plans/:planId/start-assessment')
  @RequiresRuntimeCapability('ai')
  assessPlanStart(
    @CurrentUserId() userId: string,
    @Param('planId') planId: string,
    @Body()
    body: {
      startDate?: string;
      revision?: string;
      lang?: string;
    },
  ) {
    if (!body?.startDate || typeof body.startDate !== 'string') {
      throw new BadRequestException('startDate is required');
    }
    return this.planStartAssessments.assessStart(userId, planId, {
      startDate: body.startDate,
      revision: typeof body.revision === 'string' ? body.revision : undefined,
      lang: typeof body.lang === 'string' ? body.lang : undefined,
    });
  }

  @Post('plans/:planId/start-confirm')
  confirmPlanStart(
    @CurrentUserId() userId: string,
    @Param('planId') planId: string,
    @Body()
    body: {
      startDate?: string;
      revision?: string;
      choice?: 'ORIGINAL' | 'SUGGESTED';
      previewId?: string;
    },
  ) {
    if (!body?.startDate || typeof body.startDate !== 'string') {
      throw new BadRequestException('startDate is required');
    }
    if (!body?.revision || typeof body.revision !== 'string') {
      throw new BadRequestException('revision is required');
    }
    if (body.choice !== 'ORIGINAL' && body.choice !== 'SUGGESTED') {
      throw new BadRequestException('choice must be ORIGINAL or SUGGESTED');
    }
    return this.planStartAssessments.confirmStart(userId, planId, {
      startDate: body.startDate,
      revision: body.revision,
      choice: body.choice,
      previewId: typeof body.previewId === 'string' ? body.previewId : undefined,
    });
  }

  @SkipThrottle({ default: true, ai: true })
  @Throttle({
    aiCoachRead: coachReadThrottle,
  })
  @Get('coach/sessions/:sid/messages/:messageId/charts/:deliveryId')
  @RequiresRuntimeCapability('ai')
  @SessionOnly()
  readCoachMetricChart(
    @CurrentUserId() userId: string,
    @Param('sid') sid: string,
    @Param('messageId') messageId: string,
    @Param('deliveryId') deliveryId: string,
    @Query()
    options: {
      date?: string;
      hrvSource?: string;
      metricSource?: string;
      byActivity?: string;
    },
  ) {
    return this.aiService.readCoachMetricChart(
      userId,
      sid,
      messageId,
      deliveryId,
      options,
    );
  }

  /** Read the message history used to restore the conversation thread. */
  @SkipThrottle({ default: true, ai: true })
  @Throttle({ aiCoachRead: coachReadThrottle })
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
    if (!publicDemo) {
      await this.coachRuns.reconcileCurrentFacts(userId);
      await this.coachRuns.recoverStale(userId, sid);
    }
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
      await this.coachTurns.run({ userId, session, body, idempotencyKey, sink });
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
    return this.coachTurns.run({
      userId,
      session,
      body,
      idempotencyKey,
      sink: createCoachTypedSseSink(res),
    });
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
    const effectiveUseCache = publicDemo ? true : useCache;
    // Check free cache hits and platform-funded language repairs before opening
    // a user-billed AI operation slot so zero-credit or concurrent users are not blocked.
    const route = await this.aiService.probeActivityAiAnalysisRoute(
      hashId,
      userId,
      effectiveUseCache,
      lang,
      Boolean(publicDemo),
    );
    if (route.kind === 'CACHED') {
      return new Observable((subscriber) => {
        if (route.content) {
          subscriber.next({ data: { content: route.content } } as MessageEvent);
        }
        subscriber.complete();
      });
    }
    if (route.kind === 'PLATFORM_LANGUAGE_REPAIR') {
      return new Observable((subscriber) => {
        (async () => {
          try {
            const stream = await this.aiService.streamActivityAiAnalysis(
              hashId,
              userId,
              true,
              lang,
              purpose,
              operationId,
              Boolean(publicDemo),
            );
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            for await (const chunk of stream) {
              if (subscriber.closed) continue;
              const content =
                (chunk as { choices?: Array<{ delta?: { content?: string } }> })
                  .choices?.[0]?.delta?.content || '';
              if (content) {
                subscriber.next({ data: { content } } as MessageEvent);
              }
            }
            if (!subscriber.closed) subscriber.complete();
          } catch (err) {
            this.logger.error(
              `Platform language repair failed hashId=${hashId} error=${String(err)}`,
            );
            if (!subscriber.closed) subscriber.error(err);
          }
        })();
      });
    }
    const requestFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          activityHashId: hashId,
          useCache: effectiveUseCache,
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
    return new Observable((subscriber) => {
      // Nest @Sse wraps the outer event-stream; run generation inside the
      // Observable so heartbeat stays active and disconnect settlement is consistent.
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
          const stream = await this.aiService.streamActivityAiAnalysis(
            hashId,
            userId,
            publicDemo ? true : useCache,
            lang,
            purpose,
            operationId,
            Boolean(publicDemo),
          );
          let clientDisconnected = false;
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          for await (const chunk of stream) {
            const anyChunk = chunk as {
              __activityReviewId?: string;
              choices?: Array<{ delta?: { content?: string } }>;
              usage?: unknown;
            };
            if (anyChunk.__activityReviewId) {
              activityReviewId = anyChunk.__activityReviewId;
            }
            if (subscriber.closed) {
              clientDisconnected = true;
              continue;
            }
            const content = anyChunk.choices?.[0]?.delta?.content || '';
            this.logger.debug(`收到流式片段：${content}`);
            if (content) {
              subscriber.next({ data: { content } } as MessageEvent);
            }
          }
          if (!activityReviewId) throw new Error('AI_RESULT_NOT_PERSISTED');
          // Once the review is persisted in DB for the user, mark delivered and
          // complete the operation even if the SSE client disconnected mid-stream.
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
            if (!subscriber.closed && !clientDisconnected) {
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
            }
            return;
          }
          if (!subscriber.closed && !clientDisconnected) {
            subscriber.next({
              data: {
                type: 'operation',
                operation: toAiOperationResult(operation, false),
              },
            } as MessageEvent);
            subscriber.complete();
          }
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
