const FIELDS = [
  'weekIndex',
  'dayIndex',
  'sessionIndex',
  'sportType',
  'sportDefinitionCode',
  'name',
  'text',
  'notes',
  'scheduledDate',
] as const;

export function workoutChangeSnapshot(workout: object) {
  const row = workout as Record<string, unknown>;
  return Object.fromEntries(FIELDS.map((key) => [key, row[key] ?? null]));
}

export function workoutChangeDiff(before: object, after: object) {
  const from = workoutChangeSnapshot(before);
  const to = workoutChangeSnapshot(after);
  return FIELDS.filter((field) => from[field] !== to[field]).map((field) => ({
    field,
    before: from[field],
    after: to[field],
  }));
}

/** Exact current-turn evidence; application also checks owner and branch server-side. */
export function hasCurrentDecisionConfirmation(
  prompt: string | undefined,
  quote: string,
): boolean {
  const text = prompt?.trim() ?? '';
  if (!text || text !== quote.trim()) return false;
  if (
    /不要|别|先不|暂不|等等|取消|还没|尚未|是否|能否|解释|分析|查看|看看|为什么|如何|怎么|稍后|以后|但是|除非|如果|[?？]|\b(?:not|no|don't|wait|cancel|maybe|if|unless|explain|show|later|but)\b/i.test(
      text,
    )
  )
    return false;
  return /确认|同意|应用|执行|按这个|照这个|可以|好的|^好$|\b(?:yes|okay|ok|confirm|apply|proceed|approve)\b|^(?:oui|ja|sí|sim|네)$/i.test(
    text,
  );
}

export function currentDecisionConfirmationId(
  message: unknown,
): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  const ids = content.flatMap((block) => {
    if (block?.type !== 'tool_result' || block.is_error) return [];
    const value = block.content;
    return value?.kind === 'coach_decision_confirmation' &&
      typeof value.decisionId === 'string' &&
      value.decisionId.trim()
      ? [value.decisionId.trim()]
      : [];
  });
  return ids.length === 1 ? ids[0] : undefined;
}
