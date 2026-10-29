import { Injectable } from '@nestjs/common';
import { PlanWriteSupport } from './plan-write.support';
import type { CreatePlanDto } from '../dto/create-plan.dto';
import type { UpdatePlanDto } from '../dto/update-plan.dto';

@Injectable()
export class PlanLifecycleService {
  constructor(private readonly write: PlanWriteSupport) {}

  listPlans(userId: string) {
    return this.write.listPlans(userId);
  }

  getActivePlan(userId: string) {
    return this.write.getActivePlan(userId);
  }

  getPlanDetail(
    userId: string,
    planId: string,
    db?: Parameters<PlanWriteSupport['getPlanDetail']>[2],
  ) {
    return this.write.getPlanDetail(userId, planId, db);
  }

  createPlan(
    userId: string,
    dto: CreatePlanDto,
    options?: Parameters<PlanWriteSupport['createPlan']>[2],
  ) {
    return this.write.createPlan(userId, dto, options);
  }

  updatePlan(
    userId: string,
    planId: string,
    dto: UpdatePlanDto,
    meta?: Parameters<PlanWriteSupport['updatePlan']>[3],
    options?: Parameters<PlanWriteSupport['updatePlan']>[4],
  ) {
    return this.write.updatePlan(userId, planId, dto, meta, options);
  }

  activatePlan(
    userId: string,
    planId: string,
    startDate?: string,
    meta?: Parameters<PlanWriteSupport['activatePlan']>[3],
    options?: Parameters<PlanWriteSupport['activatePlan']>[4],
  ) {
    return this.write.activatePlan(userId, planId, startDate, meta, options);
  }

  pausePlan(
    userId: string,
    planId: string,
    reason?: string,
    meta?: Parameters<PlanWriteSupport['pausePlan']>[3],
    options?: Parameters<PlanWriteSupport['pausePlan']>[4],
  ) {
    return this.write.pausePlan(userId, planId, reason, meta, options);
  }

  completePlan(
    userId: string,
    planId: string,
    completedAt?: string,
    reason?: string,
    meta?: Parameters<PlanWriteSupport['completePlan']>[4],
    options?: Parameters<PlanWriteSupport['completePlan']>[5],
  ) {
    return this.write.completePlan(
      userId,
      planId,
      completedAt,
      reason,
      meta,
      options,
    );
  }

  cancelPlan(
    userId: string,
    planId: string,
    reason?: string,
    meta?: Parameters<PlanWriteSupport['cancelPlan']>[3],
    options?: Parameters<PlanWriteSupport['cancelPlan']>[4],
  ) {
    return this.write.cancelPlan(userId, planId, reason, meta, options);
  }

  deletePlan(userId: string, planId: string) {
    return this.write.deletePlan(userId, planId);
  }
}
