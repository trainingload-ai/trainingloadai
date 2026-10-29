import type { Response } from 'express';
import type { I18nService } from 'nestjs-i18n';
import { COACH_MODEL_UNAVAILABLE_ERROR_CODE } from '@shared/coach-turn-error';
import type {
  CoachAssistantContentBlock,
  CoachUserMessageBody,
} from './coach-query-yield';

/**
 * assistant.message.content 里「仅 UI 卡片、不走内部 tool 链路」的 tool_use.name
 *（与 UIMessage 落库 / SSE card 事件使用的草案工具 PascalCase 对齐）
 */
const COACH_UI_SURFACE_TOOL_NAMES = new Set([
  'AskUserQuestion',
  'FitnessAssessment',
  'FitnessTracking',
  'PresentCoachPlanDraft',
  'PresentPlanWorkoutAdjustmentDraft',
  'PlanDayView',
  'ActivityRecent',
  'ActivityDayView',
  'PmcRange',
  'TrainingVisualization',
  'ProfileZones',
  'ProfileZoneRanges',
  'CompetitionEvents',
  'MutationApplied',
  'CoachDecisionDraft',
  'CoachDecisionApplied',
]);

/** UI 卡片 tool_use.name（与落库 / SSE 一致）；回放上游历史时不得 emit 为 OpenAI tool_calls。 */
export function isCoachUiSurfaceToolName(name: string): boolean {
  return COACH_UI_SURFACE_TOOL_NAMES.has(name);
}

export function coachAssistantBlockIsInternalToolUse(block: {
  type?: unknown;
  name?: unknown;
}): boolean {
  return (
    block.type === 'tool_use' &&
    typeof block.name === 'string' &&
    !isCoachUiSurfaceToolName(block.name)
  );
}

export function coachAssistantBlockIsUiSurface(block: {
  type?: unknown;
  name?: unknown;
}): boolean {
  return (
    block.type === 'text' ||
    (block.type === 'tool_use' &&
      typeof block.name === 'string' &&
      isCoachUiSurfaceToolName(block.name))
  );
}

const UI_SURFACE_FALLBACK_ERROR_CODES: Record<string, string> = {
  ask_user_question: 'invalid_ask_user_question_payload',
  present_plan_workout_adjustment_draft:
    'invalid_plan_workout_adjustment_payload',
  present_coach_plan_draft: 'invalid_plan_draft_payload',
};

const UI_SURFACE_FALLBACK_I18N_KEYS: Record<string, string> = {
  ask_user_question: 'common.error.ai_coach_invalid_ask_user_question_payload',
  present_plan_workout_adjustment_draft:
    'common.error.ai_coach_invalid_plan_workout_adjustment_payload',
  present_coach_plan_draft: 'common.error.ai_coach_invalid_plan_draft_payload',
};

/** UI 卡片工具校验耗尽重试次数后，推给客户端的 SSE 终态错误文案。 */
export function coachSsePayloadForUiSurfaceFallback(args: {
  i18n: I18nService;
  lang: string;
  toolName: string;
}): { error_code: string; result: string } {
  const error_code =
    UI_SURFACE_FALLBACK_ERROR_CODES[args.toolName] ??
    'invalid_ui_surface_payload';
  const i18nKey =
    UI_SURFACE_FALLBACK_I18N_KEYS[args.toolName] ??
    'common.error.ai_coach_invalid_ui_surface_payload';
  return {
    error_code,
    result:
      args.i18n.t(i18nKey, { lang: args.lang }) ??
      args.i18n.t('common.error.ai_coach_invalid_ui_surface_payload', {
        lang: args.lang,
      }) ??
      'Failed to generate structured content. Please retry.',
  };
}

/** 内部上下文或实现细节命中可见输出策略时，返回不含原文的安全终态。 */
export function coachSsePayloadForUnsafeOutput(args: {
  i18n: I18nService;
  lang: string;
}): { error_code: 'unsafe_ai_output_blocked'; result: string } {
  return {
    error_code: 'unsafe_ai_output_blocked',
    result:
      args.i18n.t('common.error.ai_coach_unsafe_output_blocked', {
        lang: args.lang,
      }) ?? 'The response could not be shown safely. Please retry.',
  };
}

/**
 * 任一模型侧失败（上游报错、超时、档位不可用、限流、流结束但没有可用回答）的统一
 * 终态：客户端据此提示「切换模型后重试」。具体原因只写服务端日志。
 */
export function coachSsePayloadForModelUnavailable(args: {
  i18n: I18nService;
  lang: string;
}): { error_code: typeof COACH_MODEL_UNAVAILABLE_ERROR_CODE; result: string } {
  return {
    error_code: COACH_MODEL_UNAVAILABLE_ERROR_CODE,
    result:
      args.i18n.t('common.error.ai_coach_model_unavailable', {
        lang: args.lang,
      }) ??
      'The model is temporarily unable to respond. Try switching models and retry.',
  };
}

/** 客户端断开 / 主动停止时的 SSE 载荷（总超时属于模型失败，走 coachSsePayloadForModelUnavailable）。 */
export function coachSsePayloadForAbort(i18n: I18nService): {
  code: 'aborted';
  message: string;
} {
  return {
    code: 'aborted',
    message:
      i18n.t('common.error.ai_coach_request_aborted') ??
      'The request was interrupted. Please retry.',
  };
}

export function normalizeCoachUserMessage(
  raw: unknown,
): CoachUserMessageBody | null {
  // 只接受前端定义的 text/tool_result block，过滤掉未知结构，避免直接把客户端任意 JSON 写入对话上下文。
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const content = (raw as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const blocks: CoachUserMessageBody['content'] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      continue;
    }
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') {
      blocks.push({ type: 'text', text: b.text });
      continue;
    }
    if (
      b.type === 'tool_result' &&
      typeof b.tool_use_id === 'string' &&
      b.content !== undefined
    ) {
      blocks.push({
        type: 'tool_result',
        tool_use_id: b.tool_use_id,
        content: b.content,
        ...(typeof b.is_error === 'boolean' ? { is_error: b.is_error } : {}),
      });
    }
  }
  return blocks.length > 0 ? { content: blocks } : null;
}

export function textFromCoachUserMessage(
  message: CoachUserMessageBody | null,
): string {
  return (
    message?.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim() ?? ''
  );
}

export function writeCoachSse(res: Response, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function hasCoachMetaOnlyToolResult(
  message: CoachUserMessageBody | null,
): boolean {
  // 保存草案/应用调整这类回执只用于更新会话记忆，不需要再请求模型生成回复。
  return Boolean(
    message?.content.some((block) => {
      if (block.type !== 'tool_result') return false;
      const c = block.content;
      return (
        c !== null &&
        typeof c === 'object' &&
        !Array.isArray(c) &&
        ((c as Record<string, unknown>).kind === 'coach_plan_draft_saved' ||
          (c as Record<string, unknown>).kind ===
            'plan_workout_adjustment_applied')
      );
    }),
  );
}

export function buildAssistantMessageBody(args: {
  prose: string;
  reasoningContent?: string;
  /** Visible text/card blocks in the exact order emitted by the runtime. */
  orderedContent?: CoachAssistantContentBlock[];
  assistantMessages: Array<{
    content: CoachAssistantContentBlock[];
    reasoning_content?: string;
  }>;
}): {
  content: string;
  message: {
    content: CoachAssistantContentBlock[];
    reasoning_content?: string;
  };
} {
  // 将流式正文和结构化 UI 工具卡片合并成一条可落库的 assistant message。
  const content = args.prose.trim();
  const reasoningContent =
    args.reasoningContent?.trim() ||
    args.assistantMessages
      .map((message) => message.reasoning_content?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n');
  const blocks: CoachAssistantContentBlock[] = args.orderedContent
    ? args.orderedContent.filter(
        (block) => block.type !== 'text' || block.text.trim().length > 0,
      )
    : [];
  if (!args.orderedContent) {
    if (content) {
      blocks.push({ type: 'text', text: content });
    }
    for (const msg of args.assistantMessages) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          if (block.text.trim()) blocks.push(block);
          continue;
        }
        blocks.push(block);
      }
    }
  }
  return {
    content,
    message: {
      content: blocks,
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
    },
  };
}

export function textFromAssistantMessageBody(message: {
  content: CoachAssistantContentBlock[];
}): string {
  return message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
}
