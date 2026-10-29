import { sanitizeCoachAssistantTextForLocale } from '@shared/coach-reply-language';

export const COACH_INTERNAL_CONTEXT_LEAK_ERROR_CODE =
  'unsafe_ai_output_blocked' as const;

export type CoachVisibleOutputViolation = {
  code: typeof COACH_INTERNAL_CONTEXT_LEAK_ERROR_CODE;
  ruleIds: string[];
};

const MUTATION_REQUEST_PATTERNS = [
  /(?:请|帮我|替我|把|将).{0,80}(?:更新|修改|更正|记录|保存|添加|删除|推迟|移动|取消|暂停|应用|执行|设为|设置|改成)/u,
  /(?:记录|保存|添加|删除|推迟|移动|取消|暂停|应用|执行|设为|设置|改成).{0,80}(?:体重|FTP|阈值|计划|训练|课程|活动|备注|RPE)/iu,
  /\b(?:set|update|change|correct|record|save|add|delete|remove|move|postpone|reschedule|apply|activate|pause|cancel|link|unlink)\b/iu,
];

const COMMITTED_MUTATION_CLAIM_PATTERNS = [
  /(?:^|[\s，。；：])(?:已(?:经)?(?:执行|更新|修改|更正|记录|保存|添加|删除|推迟|移动|取消|暂停|应用|设置)|现已(?:生效|完成))/u,
  /(?:现在|目前).{0,40}(?:更新为|修改为|更正为|设为|设置为|记录为|已生效)/u,
  /\b(?:has|have) been (?:updated|changed|corrected|recorded|saved|added|deleted|removed|moved|postponed|rescheduled|applied|activated|paused|cancelled|canceled|linked|unlinked)\b/iu,
  /\b(?:successfully|now) (?:updated|changed|corrected|recorded|saved|added|deleted|removed|moved|postponed|rescheduled|applied|activated|paused|cancelled|canceled|linked|unlinked)\b/iu,
];

function isUnverifiedMutationClaim(args: {
  text: string;
  currentUserPrompt?: string;
  committedWrite?: boolean;
}): boolean {
  if (args.committedWrite) return false;
  const prompt = String(args.currentUserPrompt ?? '').trim();
  if (!MUTATION_REQUEST_PATTERNS.some((pattern) => pattern.test(prompt)))
    return false;
  return COMMITTED_MUTATION_CLAIM_PATTERNS.some((pattern) =>
    pattern.test(args.text),
  );
}

type VisibleOutputRule = {
  id: string;
  patterns: RegExp[];
};

// Keep this list limited to implementation-only vocabulary. The policy is a
// final safety net after prompting and context isolation, not a general content
// moderator for ordinary coaching answers.
const VISIBLE_OUTPUT_RULES: VisibleOutputRule[] = [
  {
    id: 'internal_context_wrapper',
    patterns: [/<\/?coach_(?:app|user)_context\b/i],
  },
  {
    id: 'legacy_context_header',
    patterns: [
      /Visible plan draft from the previous assistant UI card/i,
      /Visible plan workout adjustment draft from the previous assistant UI card/i,
      /Internal app context:/i,
      /Structured plan brief from the product UI:/i,
      /Structured app receipt:/i,
      /Structured decision (?:confirmation|reanalysis request) from the product UI:/i,
      /Saved plan id for tool use only:/i,
      /Activity reference for tool use only:/i,
    ],
  },
  {
    id: 'internal_data_field',
    patterns: [
      /\bpersonalizationReadiness\b/i,
      /\b(?:decisionId|branchId|contextId|commitId|planId|activityId|workoutId|toolUseId|tool_use_id|tool_calls)\b/i,
    ],
  },
  {
    id: 'internal_tool_identifier',
    patterns: [
      /\b(?:ask_user_question|present_coach_plan_draft|present_plan_workout_adjustment_draft|coach_decision_apply|training\.plan_context|profile\.current)\b/i,
    ],
  },
  {
    id: 'internal_validation_narration',
    patterns: [
      /\bDSL\b[\s\S]{0,64}(?:格式|语法|校验|解析|错误|问题|修复|重试|format|syntax|validat|pars|error|issue|repair|retry)/iu,
      /\b(?:parser|schema|payload|tool call|function calling)\b[\s\S]{0,64}(?:validat|invalid|error|fail|repair|retry|syntax|format)/iu,
      /(?:校验|解析|错误|问题|修复|重试)[\s\S]{0,64}\b(?:parser|schema|payload|tool call|function calling)\b/iu,
      /\bI need to (?:add|provide|include) explicit string values?\b/i,
    ],
  },
];

export function inspectCoachVisibleText(
  text: string,
): { safe: true } | { safe: false; violation: CoachVisibleOutputViolation } {
  const ruleIds = VISIBLE_OUTPUT_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text)),
  ).map((rule) => rule.id);

  if (ruleIds.length === 0) return { safe: true };
  return {
    safe: false,
    violation: {
      code: COACH_INTERNAL_CONTEXT_LEAK_ERROR_CODE,
      ruleIds,
    },
  };
}

export function resolveCoachVisibleStepText(args: {
  text: string;
  hasToolCalls: boolean;
  lang?: string;
  /** 本轮是否已经收到服务端写入成功回执。 */
  committedWrite?: boolean;
  /** 只用于识别本轮是否是写请求，不进入可见输出。 */
  currentUserPrompt?: string;
}): { text: string; violation: CoachVisibleOutputViolation | null } {
  const visibleText = args.lang
    ? sanitizeCoachAssistantTextForLocale(args.text, args.lang)
    : args.text;
  if (!visibleText) {
    return { text: '', violation: null };
  }

  const inspection = inspectCoachVisibleText(visibleText);
  if ('violation' in inspection) {
    return { text: '', violation: inspection.violation };
  }
  if (
    isUnverifiedMutationClaim({
      text: visibleText,
      currentUserPrompt: args.currentUserPrompt,
      committedWrite: args.committedWrite,
    })
  ) {
    return {
      text: '',
      violation: {
        code: COACH_INTERNAL_CONTEXT_LEAK_ERROR_CODE,
        ruleIds: ['unverified_mutation_claim'],
      },
    };
  }

  // Text emitted in a tool-call step is model process narration (for example,
  // "I'll pull your data") rather than a completed answer. Keeping it hidden
  // also prevents a provider from leaking the wrong language before the
  // localized tool card is rendered. User-facing prose belongs in a separate
  // text-only step, where its position relative to cards is unambiguous.
  if (args.hasToolCalls) {
    return { text: '', violation: null };
  }
  return { text: visibleText, violation: null };
}
