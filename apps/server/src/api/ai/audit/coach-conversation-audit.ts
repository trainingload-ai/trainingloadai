import { THIRD_PARTY_PROVIDER_IDS } from '@deployment/provider-catalog';
import {
  AI_OPERATION_ERROR_CODES,
  aiOperationErrorReason,
} from '@shared/ai-operation-errors';
import {
  COACH_TURN_ERROR_CODES,
  COACH_TURN_ERROR_PART_TYPE,
  coachTurnErrorReason,
} from '@shared/coach-turn-error';
import { isCoachUiSurfaceToolName } from '../core/coach-message.util';
import { COACH_TOOL_DEFINITIONS } from '../core/tool.registry';
import { toProviderToolName } from '../core/tool.types';
import { getStoredCoachLegacyMessage } from '../core/coach-history-messages';

type RecordValue = Record<string, unknown>;
export type AuditMessage = {
  role: string;
  sequence: number;
  content: string;
  message?: unknown;
};

const knownTools = new Set(
  COACH_TOOL_DEFINITIONS.flatMap((tool) => [
    tool.name,
    toProviderToolName(tool.name),
    ...(tool.aliases ?? []),
  ]),
);
const states = new Set([
  'DRAFT',
  'APPROVED',
  'APPLIED',
  'REJECTED',
  'SUPERSEDED',
  'CONFLICT',
  'REBASE_REQUIRED',
  'FAILED',
  'SUCCEEDED',
  'QUEUED',
  'SKIPPED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'OPEN',
  'CLOSED',
  'INVALID',
  'REVOKED',
  'NOT_CONNECTED',
  'UNSUPPORTED',
  'MANUAL',
  'AUTOMATIC',
  'INTEGRATION_DISABLED',
  'MISSING_PERMISSION',
  'MANUAL_AVAILABLE',
  'MANUAL_REQUIRES_CONNECTION',
  'AUTOMATIC_DISABLED',
  'AUTOMATIC_ENABLED',
  'AUTO',
  'ESTIMATED',
]);
const kinds = new Set([
  'integration_status',
  'coach_plan_draft',
  'plan_workout_adjustment_draft',
  'ask_user_question',
  'ask_user_question_response',
  'ask_user_question_skip',
  'coach_question_reply',
  'coach_question_skip',
  'coach_plan_draft_saved',
  'plan_workout_adjustment_applied',
  'coach_decision_draft',
  'coach_decision_apply',
  'coach_decision_confirmation',
  'mutation_applied',
]);
const numericKeys = [
  'periodWeeks',
  'week',
  'weekIndex',
  'day',
  'dayOfWeek',
  'sessionIndex',
  'durationSec',
  'durationMinutes',
  'totalDurationSec',
  'changedWorkoutCount',
  'queuedCount',
  'succeededCount',
  'failedCount',
  'skippedCount',
  'count',
  'value',
  'effectiveCurrent',
  'manualValue',
  'estimatedValue',
  'dayIndex',
  'manual',
  'estimated',
  'automatic',
  'delta',
  'deltaPct',
  'fromSecond',
  'toSecond',
  'minGrade',
  'maxGrade',
  'maxPoints',
  'duration_min',
  'distance_km',
  'ascent_m',
  'descent_m',
  'avg',
  'max',
  'cadence',
  'totalLoad',
  'activeDays',
  'days',
  'avgDailyLoad',
  'duration_s',
  'percent',
] as const;
const booleanKeys = [
  'ok',
  'success',
  'enabled',
  'connected',
  'requiresConnection',
  'autoUpdate',
  'autoUpdateEnabled',
  'autoUpdateSupported',
  'estimatedOnly',
  'supported',
  'movingOnly',
  'excludeZeroPower',
  'importActivitiesAutomatically',
  'exportActivitiesAutomatically',
  'importPlannedWorkouts',
  'exportPlannedWorkouts',
  'importWellness',
  'exportWellness',
  'importAthleteProfile',
  'exportAthleteProfile',
] as const;
const objectKeys = [
  'settings',
  'operations',
  'productCapabilities',
  'effectiveCapabilities',
  'completedActivities',
  'plannedWorkouts',
  'wellness',
  'athleteProfile',
  'import',
  'export',
  'before',
  'after',
  'receipt',
  'payload',
  'qualityContract',
  'effectiveCurrent',
  'manualCurrent',
  'estimatedCurrent',
  'automaticCurrent',
  'autoUpdate',
  'hr',
  'power',
  'cadence',
  'periodA',
  'periodB',
  'delta',
] as const;
const arrayKeys = [
  'questions',
  'options',
  'workouts',
  'changes',
  'fields',
  'statuses',
  'items',
] as const;
const idKeys = [
  'planId',
  'workoutId',
  'decisionId',
  'commitId',
  'branchId',
  'hashId',
] as const;
const changeFields = new Set([
  'weekIndex',
  'dayIndex',
  'text',
  'sportDefinitionCode',
  'name',
  'notes',
  'week',
  'dayOfWeek',
  'sessionIndex',
  'scheduledDate',
  'sportType',
  'workoutDsl',
  'targetType',
  'durationSec',
  'status',
]);

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function parsePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  // Never interpret truncated previews as complete results, or copy opaque text.
  if (value.length > 1_000_000) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Local, per-export aliases. Neither original identifiers nor an alias key are exported. */
export class AuditRedactor {
  private readonly aliases = new Map<string, string>();
  private readonly identities: string[];

  constructor(identities: string[] = []) {
    this.identities = [...new Set(identities.filter(Boolean))].sort(
      (a, b) => b.length - a.length,
    );
  }

  id(value: string): string {
    if (!this.aliases.has(value))
      this.aliases.set(value, `ref-${this.aliases.size + 1}`);
    return this.aliases.get(value)!;
  }

  text(value: string): string {
    let text = value;
    for (const identity of this.identities) {
      text = text.split(identity).join('[identity]');
    }
    for (const [id, alias] of this.aliases)
      text = text.split(id).join(`[${alias}]`);
    return text
      .replace(/https?:\/\/[^\s<>]+/gi, '[url]')
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
      .replace(/\b(?:Bearer\s+)[^\s,;]+/gi, 'Bearer [secret]')
      .replace(/\b(?:sk-[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, '[secret]')
      .replace(
        /\b(?:access[_-]?token|refresh[_-]?token|api[_-]?key|password|authorization)["']?\s*[:=]\s*["']?[^\s,"'}]+/gi,
        '[secret]',
      )
      .replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, '[id]')
      .replace(/\bc[a-z0-9]{20,}\b/gi, '[id]')
      .replace(/\+\d[\d ()-]{8,}\d|\b\d{11,15}\b/g, '[phone]');
  }
}

/** Deliberate field allowlist: no free-form titles, prompts, errors, scopes, URLs or credentials. */
export function summarizeAuditPayload(
  value: unknown,
  redactor: AuditRedactor,
  depth = 0,
): RecordValue {
  const input = record(parsePayload(value));
  if (!input || depth > 6) return { detail: 'omitted' };
  if (input.truncated === true) return { truncated: true };
  const out: RecordValue = {};
  for (const key of numericKeys) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key]))
      out[key] = input[key];
    else if (input[key] === null) out[key] = null;
  }
  for (const key of booleanKeys)
    if (typeof input[key] === 'boolean' || input[key] === null)
      out[key] = input[key];
  for (const key of [
    'state',
    'connectionState',
    'status',
    'result',
    'productMode',
    'effectiveMode',
    'effectiveSource',
    'source',
    'import',
    'export',
  ]) {
    if (typeof input[key] === 'string' && states.has(input[key]))
      out[key] = input[key];
  }
  if (typeof input.kind === 'string' && kinds.has(input.kind))
    out.kind = input.kind;
  if (
    [
      'ftp',
      'eftp',
      'cp',
      'ecp',
      'vo2Max',
      'weight',
      'lthr',
      'maxHr',
      'restingHr',
      'pMax',
      'tp',
      'cs',
    ].includes(String(input.metric))
  )
    out.metric = input.metric;
  if (
    ['W', 'w', 'bpm', 'kg', 'ml/kg/min', 'm/s', 's/km', 's/100m'].includes(
      String(input.unit),
    )
  )
    out.unit = input.unit;
  for (const key of ['from', 'to', 'date', 'startDate', 'scheduledDate']) {
    if (
      typeof input[key] === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(input[key])
    )
      out[key] = input[key];
  }
  if ((THIRD_PARTY_PROVIDER_IDS as readonly unknown[]).includes(input.provider))
    out.provider = input.provider;
  if (
    [
      'RUN',
      'RIDE',
      'CYCLING',
      'SWIM',
      'STRENGTH',
      'DEFAULT',
      'Run',
      'Ride',
      'Swim',
    ].includes(String(input.sportType))
  )
    out.sportType = input.sportType;
  for (const key of idKeys) {
    if (typeof input[key] === 'string' && input[key])
      out[key] = redactor.id(input[key]);
  }
  for (const key of objectKeys)
    if (record(input[key]))
      out[key] = summarizeAuditPayload(input[key], redactor, depth + 1);
  for (const key of arrayKeys) {
    if (!Array.isArray(input[key])) continue;
    const items = input[key];
    out[`${key}Count`] = items.length;
    // Question/option/workout wording is private; counts suffice. Changes and integration
    // state need their safe values to distinguish a preview from a verified receipt.
    if (['changes', 'fields', 'statuses', 'items'].includes(key)) {
      out[key] = items.slice(0, 200).map((item) => {
        const field = record(item);
        if (key === 'fields') {
          return {
            field: changeFields.has(String(field?.field))
              ? field!.field
              : 'other',
            ...([
              'week',
              'weekIndex',
              'dayIndex',
              'dayOfWeek',
              'sessionIndex',
              'durationSec',
            ].includes(String(field?.field))
              ? Object.fromEntries(
                  ['before', 'after']
                    .filter(
                      (key) =>
                        field[key] === null ||
                        (typeof field[key] === 'number' &&
                          Number.isFinite(field[key])),
                    )
                    .map((key) => [key, field[key]]),
                )
              : {}),
          };
        }
        return summarizeAuditPayload(item, redactor, depth + 1);
      });
      if (items.length > 200) out[`${key}Truncated`] = true;
    }
  }
  const sync = record(input.sync);
  if (record(input.answers))
    out.answerCount = Object.keys(input.answers).length;
  if (sync)
    out.sync = {
      hasStarted: sync.startedAt != null,
      hasCompleted: sync.completedAt != null,
      hasError: Boolean(sync.lastError),
    };
  if (input.error != null) out.hasError = true;
  return out;
}

type ToolAudit = {
  ref: string;
  name: string;
  surface: 'card' | 'internal' | 'unknown';
  phase: 'call' | 'result';
  outcome?: 'success' | 'failure' | 'unknown';
  summary: RecordValue;
};

type TurnErrorAudit = {
  code: string;
  summary: string;
};

const safeTurnErrorCodes = new Set<string>([
  ...AI_OPERATION_ERROR_CODES,
  ...COACH_TURN_ERROR_CODES,
]);

function auditTurnError(value: unknown): TurnErrorAudit {
  const code =
    typeof value === 'string' && safeTurnErrorCodes.has(value)
      ? value
      : 'other';
  const operationSummary = {
    accessRequired: '当前实例未授予 AI 使用权限',
    inProgress: '已有 AI 操作正在进行',
    settlementPending: '上一项 AI 操作仍在结算',
    purposeUnavailable: '所选模型档位暂不可用',
  }[aiOperationErrorReason(code) ?? ''];
  if (operationSummary) return { code, summary: operationSummary };
  const coachSummary = {
    modelUnavailable: '模型暂时无法响应',
    aborted: '生成请求已中断',
    business: '业务规则拒绝了当前请求',
    internal: '服务内部错误',
    upstreamFailed: '上游模型服务调用失败',
    unsafeOutput: '回答因安全检查被停止展示',
    invalidStructuredOutput: '结构化内容未通过格式校验',
    unknown: '未识别的内部错误',
  }[coachTurnErrorReason(code)];
  return { code, summary: coachSummary };
}

function describeTool(name: unknown): Pick<ToolAudit, 'name' | 'surface'> {
  if (typeof name !== 'string')
    return { name: 'unknown_tool', surface: 'unknown' };
  const surface = isCoachUiSurfaceToolName(name)
    ? 'card'
    : knownTools.has(name)
      ? 'internal'
      : 'unknown';
  return { name: surface === 'unknown' ? 'unknown_tool' : name, surface };
}

/** Missing error flags on older records are UNKNOWN, not successful completion. */
function outcome(block: RecordValue): 'success' | 'failure' | 'unknown' {
  const content = record(parsePayload(block.content));
  if (
    block.is_error === true ||
    content?.ok === false ||
    content?.success === false ||
    content?.error != null
  )
    return 'failure';
  if (
    block.is_error === false ||
    content?.ok === true ||
    content?.success === true
  )
    return 'success';
  return 'unknown';
}

/** Prefer the canonical legacy copy, which also includes internal calls. UI
 * parts supplement failure markers that are intentionally absent from the
 * provider-facing legacy message; mirrored text/tools are never counted twice. */
function auditContentBlocks(message: unknown): unknown[] {
  const envelope = record(message);
  const envelopeParts =
    envelope?.kind !== 'ui_message' ||
    ![1, 2].includes(Number(envelope.version)) ||
    !Array.isArray(envelope.parts)
      ? []
      : envelope.parts;
  const turnErrors = envelopeParts.flatMap((part) => {
    const p = record(part);
    const data = record(p?.data);
    return p?.type === COACH_TURN_ERROR_PART_TYPE && data
      ? [{ type: 'turn_error', code: data.code }]
      : [];
  });
  const legacy = record(getStoredCoachLegacyMessage(message));
  if (Array.isArray(legacy?.content)) {
    const legacyHasTurnError = legacy.content.some(
      (item) => record(item)?.type === 'turn_error',
    );
    return legacyHasTurnError
      ? legacy.content
      : [...legacy.content, ...turnErrors];
  }
  return envelopeParts.map((part) => {
    const p = record(part);
    const data = record(p?.data);
    if (p?.type === 'text' || p?.type === 'reasoning') return p;
    if (p?.type === 'data-coach-tool' && data)
      return {
        type: 'tool_use',
        id: data.toolCallId ?? p.id,
        name: data.name,
        input: data.input,
      };
    if (p?.type === 'data-coach-user-tool-result' && data)
      return {
        type: 'tool_result',
        tool_use_id: data.toolUseId ?? p.id,
        content: data.content,
        ...(typeof data.isError === 'boolean'
          ? { is_error: data.isError }
          : {}),
      };
    if (p?.type === COACH_TURN_ERROR_PART_TYPE && data)
      return { type: 'turn_error', code: data.code };
    return null;
  });
}

export function auditConversation(
  messages: AuditMessage[],
  redactor: AuditRedactor,
) {
  const ordered = [...messages]
    .sort((a, b) => a.sequence - b.sequence)
    .map((message) => ({
      ...message,
      auditBlocks: auditContentBlocks(message.message),
    }));
  const calls = new Map<
    string,
    { name: string; surface: ToolAudit['surface'] }
  >();
  // Cards may be persisted after their result. Resolve names in a first pass.
  for (const msg of ordered) {
    const blocks = msg.auditBlocks;
    for (const item of blocks) {
      const b = record(item);
      // Collect all allowed identifiers before redacting any prose, including
      // IDs first encountered in a later result/receipt. Do not inspect opaque previews.
      if (b?.type === 'tool_use') summarizeAuditPayload(b.input, redactor);
      if (b?.type === 'tool_result') {
        summarizeAuditPayload(b.content, redactor);
        if (typeof b.tool_use_id === 'string') redactor.id(b.tool_use_id);
      }
      if (
        b?.type !== 'tool_use' ||
        typeof b.id !== 'string' ||
        typeof b.name !== 'string'
      )
        continue;
      const description = describeTool(b.name);
      const previous = calls.get(b.id);
      calls.set(
        b.id,
        previous && previous.name !== description.name
          ? describeTool(null)
          : description,
      );
      redactor.id(b.id);
    }
  }
  return ordered.map((msg) => {
    const body = record(msg.message);
    const blocks = msg.auditBlocks;
    const tools: ToolAudit[] = [];
    const turnErrors: TurnErrorAudit[] = [];
    let omittedBlocks = 0;
    let blockText = '';
    for (const item of blocks) {
      const b = record(item);
      if (b?.type === 'text' && typeof b.text === 'string') {
        blockText += b.text;
        continue;
      }
      if (b?.type === 'tool_use' && typeof b.id === 'string') {
        const call = describeTool(b.name);
        tools.push({
          ref: redactor.id(b.id),
          ...call,
          phase: 'call',
          summary: summarizeAuditPayload(b.input, redactor),
        });
      } else if (
        b?.type === 'tool_result' &&
        typeof b.tool_use_id === 'string'
      ) {
        const call = calls.get(b.tool_use_id) ?? {
          name: 'unknown_tool',
          surface: 'unknown' as const,
        };
        tools.push({
          ref: redactor.id(b.tool_use_id),
          ...call,
          phase: 'result',
          outcome: outcome(b),
          summary: summarizeAuditPayload(b.content, redactor),
        });
      } else if (b?.type === 'turn_error') {
        turnErrors.push(auditTurnError(b.code));
      } else omittedBlocks++;
    }
    const role = ['USER', 'ASSISTANT', 'SYSTEM'].includes(
      msg.role.toUpperCase(),
    )
      ? msg.role.toUpperCase()
      : 'UNKNOWN';
    // System/hidden reasoning is never a transcript. Visible prose remains sensitive
    // even after best-effort de-identification; this export is not public/anonymized data.
    const text =
      role === 'SYSTEM' ? '' : redactor.text(msg.content?.trim() || blockText);
    const cards = tools.filter(
      (tool) => tool.phase === 'call' && tool.surface === 'card',
    );
    return {
      sequence: msg.sequence,
      role,
      text,
      delivery: text
        ? turnErrors.length
          ? 'partial_with_error'
          : cards.length
            ? 'text_and_cards'
            : 'text_only'
        : turnErrors.length
          ? 'error_only'
          : cards.length
            ? 'cards_only'
            : tools.length
              ? 'tool_chain_only'
              : 'unknown_empty',
      structuredAvailable: body !== null,
      omittedBlocks,
      tools,
      turnErrors,
      // Persisted cards are evidence of a server artifact, not proof of client rendering.
      clientRenderVerified: false,
    };
  });
}

export function auditMarkdown(args: {
  sessions: Array<{
    userAlias: string;
    messages: ReturnType<typeof auditConversation>;
    truncated: boolean;
  }>;
  truncated: boolean;
}): string {
  const lines = [
    '# AI Coach 内部去标识化审计导出 v2',
    '',
    '> 仅限内部授权分析；自由文本仍可能包含健康及身份线索，不可公开或提交 Git。',
    '> 来源：AiCoachSession/AiCoachMessage（不重复导出镜像分支）。工具结果仅保留白名单摘要；不导出原始参数、结果、错误、系统消息或 reasoning。',
    '> success/failure 是工具执行结果，不等于计划已应用或第三方已同步；请另看 result/state/receipt。',
    '> unknown_empty 表示缺少可见交付证据，不直接认定失败；cards_only 不证明客户端实际展示。未保存的 SSE 终态不可追溯。',
    `> 会话截断：${args.truncated}；导出会话数：${args.sessions.length}`,
    '',
  ];
  args.sessions.forEach((session, index) => {
    lines.push(
      `## 对话 ${index + 1} · ${session.userAlias}`,
      '',
      `消息截断：${session.truncated}`,
      '',
    );
    for (const msg of session.messages) {
      lines.push(
        `### ${msg.sequence} · ${msg.role}`,
        '',
        `交付：${msg.delivery}；结构记录：${msg.structuredAvailable}；省略块：${msg.omittedBlocks}`,
        '',
      );
      if (msg.text) {
        // A variable fence prevents transcript text from breaking the audit structure.
        const fence = '`'.repeat(
          Math.max(
            3,
            ...[...msg.text.matchAll(/`+/g)].map((m) => m[0].length + 1),
          ),
        );
        lines.push(fence, msg.text, fence, '');
      }
      if (msg.turnErrors.length)
        lines.push(
          '失败终态（安全错误码与可读含义）：',
          '',
          ...msg.turnErrors.map(
            (turnError) => `- \`${turnError.code}\`：${turnError.summary}`,
          ),
          '',
        );
      if (msg.tools.length)
        lines.push('```json', JSON.stringify(msg.tools, null, 2), '```', '');
    }
  });
  return lines.join('\n');
}
