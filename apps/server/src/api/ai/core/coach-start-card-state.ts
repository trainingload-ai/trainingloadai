import { asRecord } from './ai-common.util';

type State = { state: string; payload: unknown };

/** Read-time projection preserves immutable proposal content and refreshes only its execution state. */
export function projectStartDecisionCards(
  message: unknown,
  states: Map<string, State>,
): unknown {
  const root = asRecord(message);
  if (!root) return message;
  const update = (name: unknown, input: unknown) => {
    const card = asRecord(input);
    if (
      name !== 'CoachDecisionDraft' ||
      card?.decisionType !== 'PLAN_START' ||
      typeof card.decisionId !== 'string'
    )
      return input;
    const current = states.get(card.decisionId);
    if (!current) return { ...card, state: 'SUPERSEDED' };
    const receipt = asRecord(current.payload)?.appliedReceipt;
    return {
      ...card,
      state: current.state,
      ...(receipt
        ? { payload: { ...asRecord(card.payload), appliedReceipt: receipt } }
        : {}),
    };
  };
  return {
    ...root,
    ...(Array.isArray(root.content)
      ? {
          content: root.content.map((block) => {
            const row = asRecord(block);
            return row?.type === 'tool_use'
              ? { ...row, input: update(row.name, row.input) }
              : block;
          }),
        }
      : {}),
    ...(Array.isArray(root.parts)
      ? {
          parts: root.parts.map((part) => {
            const row = asRecord(part),
              data = asRecord(row?.data);
            return row?.type === 'data-coach-tool' && data
              ? {
                  ...row,
                  data: { ...data, input: update(data.name, data.input) },
                }
              : part;
          }),
        }
      : {}),
    ...(root.legacyMessage
      ? { legacyMessage: projectStartDecisionCards(root.legacyMessage, states) }
      : {}),
  };
}

export function startDecisionCardIds(message: unknown): string[] {
  const root = asRecord(message);
  if (!root) return [];
  const inputId = (name: unknown, input: unknown): string[] => {
    const card = asRecord(input);
    return name === 'CoachDecisionDraft' &&
      card?.decisionType === 'PLAN_START' &&
      typeof card.decisionId === 'string'
      ? [card.decisionId]
      : [];
  };
  return [
    ...(Array.isArray(root.content)
      ? root.content.flatMap((block) => {
          const row = asRecord(block);
          return row?.type === 'tool_use' ? inputId(row.name, row.input) : [];
        })
      : []),
    ...(Array.isArray(root.parts)
      ? root.parts.flatMap((part) => {
          const row = asRecord(part),
            data = asRecord(row?.data);
          return row?.type === 'data-coach-tool' && data
            ? inputId(data.name, data.input)
            : [];
        })
      : []),
    ...startDecisionCardIds(root.legacyMessage),
  ];
}
