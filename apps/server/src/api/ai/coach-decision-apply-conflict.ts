/**
 * Runtime 日/周复盘会先 squash Decision，再 append 挂在同一 decisionId 上的 REVIEW_*。
 * 这会把 context.headEventSeq 抬过 Decision.baseEventSeq，但不是外部事实冲突。
 */
export function isOwnDecisionHeadAdvance(args: {
  expectedBaseEventSeq: number;
  headEventSeq: number;
  intervening: Array<{ decisionId: string | null }>;
  decisionId: string;
}): boolean {
  if (args.expectedBaseEventSeq === args.headEventSeq) return true;
  if (args.headEventSeq < args.expectedBaseEventSeq) return false;
  if (args.intervening.length === 0) return false;
  return args.intervening.every(
    (event) => event.decisionId === args.decisionId,
  );
}
