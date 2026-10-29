/**
 * FINALIZED 上下文上还能做什么。
 *
 * 普通分支只能开在 ACTIVE 计划上。周期结束后上下文已 FINALIZED，
 * 但「开启下一计划」这条 Decision 必须还能 list / approve / apply。
 * HTTP 入口不要传 allowFinalized；只有周期 Runtime 内部 openBranch 才开这个口。
 */

/** 默认仅 ACTIVE。allowFinalized 时允许在已结束计划上开周期分支。 */
export function canOpenCoachBranch(args: {
  status: string;
  allowFinalized?: boolean;
}) {
  if (args.status === 'ACTIVE') return true;
  if (args.status === 'SCHEDULED') return true;
  return Boolean(args.allowFinalized) && args.status === 'FINALIZED';
}

/** 周期收口提案：PLAN_LIFECYCLE + payload.action=open_next。 */
export function isOpenNextLifecyclePayload(
  decisionType: string,
  payload: unknown,
) {
  const action = String(
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).action
      : '',
  )
    .trim()
    .toLowerCase();
  return decisionType === 'PLAN_LIFECYCLE' && action === 'open_next';
}

/** ACTIVE 上所有 Decision 可 apply；FINALIZED 上只允许 open_next。 */
export function canApplyCoachDecisionOnContext(args: {
  contextStatus: string;
  decisionType: string;
  payload: unknown;
}) {
  if (args.contextStatus === 'ACTIVE') return true;
  if (args.contextStatus === 'SCHEDULED') {
    return [
      'PLAN_ADAPTATION',
      'PLAN_WORKOUT_UPDATE',
      'PLAN_WORKOUT_BATCH_UPDATE',
      'PLAN_WORKOUT_SCHEDULE',
      'PLAN_WORKOUT_ADD',
    ].includes(args.decisionType);
  }
  return (
    args.contextStatus === 'FINALIZED' &&
    isOpenNextLifecyclePayload(args.decisionType, args.payload)
  );
}
