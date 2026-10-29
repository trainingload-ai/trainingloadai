/**
 * 首页/Today「今日建议」槽位的扑克叠卡排序。
 *
 * 待确认 Decision 在前，今日建议永远垫在最后一张。
 * 最多露出 3 张；点某张时只改 frontId，不改服务端顺序。
 */
export const COACH_HOME_STACK_MAX_VISIBLE = 3;

export type CoachHomeStackDecision = {
  id: string;
  riskTier?: string;
};

export type CoachHomeStackGuidance = { id: string };
export type CoachHomeStackInquiry = { caseId: string };

export type CoachHomeStackItem<
  T extends CoachHomeStackDecision,
  G extends CoachHomeStackGuidance = CoachHomeStackGuidance,
  I extends CoachHomeStackInquiry = CoachHomeStackInquiry,
> =
  | { kind: "decision"; id: string; decision: T }
  | { kind: "inquiry"; id: string; inquiry: I }
  | { kind: "guidance"; id: string; guidance: G }
  | { kind: "suggestion"; id: "suggestion" };

/** Decision 占前 maxVisible-1 张，最后一张固定是今日建议。 */
export function buildCoachHomeStackItems<
  T extends CoachHomeStackDecision,
  G extends CoachHomeStackGuidance = CoachHomeStackGuidance,
  I extends CoachHomeStackInquiry = CoachHomeStackInquiry,
>(
  decisions: T[],
  maxVisible = COACH_HOME_STACK_MAX_VISIBLE,
  guidance?: G | null,
  inquiry?: I | null,
): CoachHomeStackItem<T, G, I>[] {
  const slots = Math.max(0, maxVisible - 1);
  const highRisk = decisions.filter(
    (decision) => String(decision.riskTier ?? "").toUpperCase() === "HIGH",
  );
  const ordinary = decisions.filter(
    (decision) => String(decision.riskTier ?? "").toUpperCase() !== "HIGH",
  );
  const candidates: CoachHomeStackItem<T, G, I>[] = [
    ...highRisk.map(
      (decision) =>
        ({
          kind: "decision",
          id: decision.id,
          decision,
        }) as const,
    ),
    ...(inquiry
      ? ([
          {
            kind: "inquiry",
            id: `inquiry-${inquiry.caseId}`,
            inquiry,
          },
        ] as const)
      : []),
    ...ordinary.map((decision) => ({
      kind: "decision" as const,
      id: decision.id,
      decision,
    })),
    ...(guidance
      ? ([
          { kind: "guidance", id: `guidance-${guidance.id}`, guidance },
        ] as const)
      : []),
  ];
  return [
    ...candidates.slice(0, slots),
    { kind: "suggestion", id: "suggestion" },
  ];
}

/** 把用户点到的那张提到最前，其余相对顺序不变。 */
export function orderCoachHomeStack<T extends CoachHomeStackDecision>(
  items: CoachHomeStackItem<T>[],
  frontId: string | null,
): CoachHomeStackItem<T>[] {
  if (!frontId) return items;
  const index = items.findIndex((item) => item.id === frontId);
  if (index <= 0) return items;
  return [items[index], ...items.slice(0, index), ...items.slice(index + 1)];
}

export function visibleCoachHomeStack<T extends CoachHomeStackDecision>(
  items: CoachHomeStackItem<T>[],
  frontId: string | null,
  maxVisible = COACH_HOME_STACK_MAX_VISIBLE,
): CoachHomeStackItem<T>[] {
  return orderCoachHomeStack(items, frontId).slice(0, maxVisible);
}
