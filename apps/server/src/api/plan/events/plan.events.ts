/**
 * Plan 模块跨能力事件。只在事务提交之后发出。
 * listener 放在消费方模块，Plan 不 import Review / Notification。
 */
export const PLAN_FINALIZED_EVENT = 'plan.finalized';
export const PLAN_COMPLETED_EVENT = 'plan.completed';
export const PLAN_DRAFT_CHANGED_EVENT = 'plan.draftChanged';

export type PlanFinalizedStatus = 'COMPLETED' | 'CANCELLED';
export type PlanProgressLabel = 'UP' | 'STABLE' | 'DOWN';

export class PlanFinalizedEvent {
  constructor(
    public readonly userId: string,
    public readonly planId: string,
    public readonly planStatus: PlanFinalizedStatus,
  ) {}
}

export class PlanCompletedEvent {
  constructor(
    public readonly userId: string,
    public readonly planId: string,
    public readonly planTitle: string,
    public readonly periodStart: Date | null,
    public readonly periodEnd: Date | null,
    public readonly completionRate: number,
    public readonly complianceRate: number | null,
    public readonly doneCount: number,
    public readonly workoutCount: number,
    public readonly skippedCount: number,
    public readonly movedCount: number,
    public readonly progressLabel: PlanProgressLabel,
  ) {}
}

export class PlanDraftChangedEvent {
  constructor(
    public readonly userId: string,
    public readonly planId: string,
  ) {}
}
