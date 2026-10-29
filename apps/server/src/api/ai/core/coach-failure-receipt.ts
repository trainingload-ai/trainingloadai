import type {
  CoachAssistantMessageBody,
  CoachUserMessageBody,
} from './coach-query-yield';

type ProviderHistoryRow = {
  role: 'ASSISTANT' | 'USER';
  content: string;
  message: unknown;
};

export type StoredCoachFailureReceipt = {
  version: 1;
  outcome: 'failed' | 'interrupted' | 'cancelled';
  terminal?: { code: string; message?: string };
  completedChanges: Array<{
    type?: string;
    summary: string;
    bodyWeight?: {
      valueKg: number;
      effectiveDate: string;
      changed: boolean;
    };
  }>;
  planDraft?: {
    attempts: number;
    produced: false;
    reason: 'INVALID_STRUCTURE' | 'QUALITY_CONSTRAINTS' | 'VALIDATION_FAILED';
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function compact(value: unknown, maxChars: number): string | undefined {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function parseResult(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function assistantBody(value: unknown): CoachAssistantMessageBody | null {
  return isRecord(value) && Array.isArray(value.content)
    ? (value as CoachAssistantMessageBody)
    : null;
}

function userBody(value: unknown): CoachUserMessageBody | null {
  return isRecord(value) && Array.isArray(value.content)
    ? (value as CoachUserMessageBody)
    : null;
}

function draftReason(
  codes: string[],
): StoredCoachFailureReceipt['planDraft']['reason'] {
  if (codes.includes('PLAN_QUALITY_INVALID')) return 'QUALITY_CONSTRAINTS';
  if (codes.includes('INVALID_INPUT') || codes.includes('EMPTY_TOOL_ARGUMENTS'))
    return 'INVALID_STRUCTURE';
  return 'VALIDATION_FAILED';
}

/**
 * Build a narrow, server-owned receipt for the next model turn. Raw tool
 * inputs, identifiers, reasoning, and read results are deliberately excluded.
 */
export function buildCoachFailureReceipt(args: {
  outcome: 'failed' | 'interrupted' | 'cancelled';
  providerHistory: ProviderHistoryRow[];
  terminal?: { code?: string; message?: string } | null;
  toolNameByCallId?: ReadonlyMap<string, string>;
}): StoredCoachFailureReceipt | null {
  const toolNameByCallId = new Map(args.toolNameByCallId ?? []);
  const completedChanges: StoredCoachFailureReceipt['completedChanges'] = [];
  let planDraftAttempts = 0;
  let planDraftProduced = false;
  const planDraftFailureCodes: string[] = [];

  for (const row of args.providerHistory) {
    if (row.role === 'ASSISTANT') {
      const message = assistantBody(row.message);
      for (const block of message?.content ?? []) {
        if (
          block.type === 'tool_use' &&
          typeof block.id === 'string' &&
          typeof block.name === 'string'
        ) {
          if (!toolNameByCallId.has(block.id)) {
            toolNameByCallId.set(block.id, block.name);
          }
        }
      }
      continue;
    }

    const message = userBody(row.message);
    for (const block of message?.content ?? []) {
      if (block.type !== 'tool_result') continue;
      const toolName = toolNameByCallId.get(block.tool_use_id);
      const result = parseResult(block.content);
      if (!toolName || !result) continue;

      if (toolName === 'present_coach_plan_draft') {
        planDraftAttempts += 1;
        if (result.kind === 'coach_plan_draft' && !result.error) {
          planDraftProduced = true;
        } else {
          const code = compact(result.code, 80);
          if (code) planDraftFailureCodes.push(code);
        }
        continue;
      }

      if (
        toolName.startsWith('mutation_') &&
        result.kind === 'mutation_applied' &&
        result.ok === true
      ) {
        const summary = compact(result.summary, 300);
        if (!summary) continue;
        const completed: StoredCoachFailureReceipt['completedChanges'][number] =
          {
            ...(compact(result.type, 80)
              ? { type: compact(result.type, 80) }
              : {}),
            summary,
          };
        if (
          toolName === 'mutation_user_body_weight' &&
          isRecord(result.payload)
        ) {
          const valueKg = Number(result.payload.valueKg);
          const effectiveDate = compact(result.payload.effectiveDate, 10);
          if (Number.isFinite(valueKg) && effectiveDate) {
            completed.bodyWeight = {
              valueKg,
              effectiveDate,
              changed: result.payload.changed === true,
            };
          }
        }
        completedChanges.push(completed);
      }
    }
  }

  const terminalCode = compact(args.terminal?.code, 100);
  const terminalMessage = compact(args.terminal?.message, 300);
  const planDraft =
    planDraftAttempts > 0 && !planDraftProduced
      ? {
          attempts: planDraftAttempts,
          produced: false as const,
          reason: draftReason(planDraftFailureCodes),
        }
      : undefined;
  if (
    !terminalCode &&
    !terminalMessage &&
    !completedChanges.length &&
    !planDraft
  )
    return null;

  return {
    version: 1,
    outcome: args.outcome,
    ...(terminalCode || terminalMessage
      ? {
          terminal: {
            code: terminalCode ?? 'coach_run_failed',
            ...(terminalMessage ? { message: terminalMessage } : {}),
          },
        }
      : {}),
    completedChanges,
    ...(planDraft ? { planDraft } : {}),
  };
}

export function coachFailureReceiptContext(value: unknown): string | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (!['failed', 'interrupted', 'cancelled'].includes(String(value.outcome)))
    return null;

  const lines = [
    'The immediately preceding Coach run did not complete. This is a server-owned execution receipt, not user-authored content.',
  ];
  const completedChanges = Array.isArray(value.completedChanges)
    ? value.completedChanges
    : [];
  for (const raw of completedChanges.slice(0, 8)) {
    if (!isRecord(raw)) continue;
    const summary = compact(raw.summary, 300);
    if (summary)
      lines.push(`- A requested change completed successfully: ${summary}`);
  }

  if (isRecord(value.planDraft)) {
    const attempts = Math.max(
      1,
      Math.min(9, Number(value.planDraft.attempts) || 1),
    );
    const reason = String(value.planDraft.reason);
    const explanation =
      reason === 'QUALITY_CONSTRAINTS'
        ? 'the generated draft did not satisfy plan quality constraints'
        : reason === 'INVALID_STRUCTURE'
          ? 'the generated draft did not satisfy the required plan structure'
          : 'the generated draft did not pass validation';
    lines.push(
      `- A training-plan draft was submitted ${attempts} time(s), but ${explanation}. No plan draft was produced or persisted.`,
    );
  }

  if (isRecord(value.terminal)) {
    const message = compact(value.terminal.message, 300);
    if (message)
      lines.push(`- The user-facing terminal result was: ${message}`);
  }
  lines.push(
    'Use these facts when answering follow-up questions about what succeeded or failed. Never claim an operation was not attempted when this receipt says it was. Do not expose internal identifiers, tool names, payloads, or validation mechanics. If the receipt does not establish a fact, say you cannot verify it instead of guessing.',
  );
  return lines.join('\n');
}
