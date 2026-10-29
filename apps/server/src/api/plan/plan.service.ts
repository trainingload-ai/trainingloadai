import { Injectable } from '@nestjs/common';
import { PlanLifecycleService } from './application/plan-lifecycle.service';
import { PlanWorkoutCommandService } from './application/plan-workout-command.service';
import { PlanActivityLinkService } from './application/plan-activity-link.service';
import type { CreatePlanDto } from './dto/create-plan.dto';
import type { UpdatePlanDto } from './dto/update-plan.dto';
import type { LinkPlanWorkoutActivityDto } from './dto/link-plan-workout-activity.dto';
import type { ReplaceActivityPlanLinkDto } from './dto/replace-activity-plan-link.dto';
import type { CreateScheduledWorkoutDto } from './dto/create-scheduled-workout.dto';

/**
 * Plan 对外门面。实现在 Lifecycle / WorkoutCommand / ActivityLink。
 * 外部模块继续注入本类，避免一次改完所有构造函数。
 */
@Injectable()
export class PlanService {
  constructor(
    private readonly lifecycle: PlanLifecycleService,
    private readonly workoutCommands: PlanWorkoutCommandService,
    private readonly activityLinks: PlanActivityLinkService,
  ) {}

  listPlans(userId: string) {
    return this.lifecycle.listPlans(userId);
  }

  getActivePlan(userId: string) {
    return this.lifecycle.getActivePlan(userId);
  }

  getPlanDetail(
    userId: string,
    planId: string,
    db?: Parameters<PlanLifecycleService['getPlanDetail']>[2],
  ) {
    return this.lifecycle.getPlanDetail(userId, planId, db);
  }

  createPlan(
    userId: string,
    dto: CreatePlanDto,
    options?: Parameters<PlanLifecycleService['createPlan']>[2],
  ) {
    return this.lifecycle.createPlan(userId, dto, options);
  }

  updatePlan(
    userId: string,
    planId: string,
    dto: UpdatePlanDto,
    meta?: Parameters<PlanLifecycleService['updatePlan']>[3],
    options?: Parameters<PlanLifecycleService['updatePlan']>[4],
  ) {
    return this.lifecycle.updatePlan(userId, planId, dto, meta, options);
  }

  activatePlan(
    userId: string,
    planId: string,
    startDate?: string,
    meta?: Parameters<PlanLifecycleService['activatePlan']>[3],
    options?: Parameters<PlanLifecycleService['activatePlan']>[4],
  ) {
    return this.lifecycle.activatePlan(
      userId,
      planId,
      startDate,
      meta,
      options,
    );
  }

  pausePlan(
    userId: string,
    planId: string,
    reason?: string,
    meta?: Parameters<PlanLifecycleService['pausePlan']>[3],
    options?: Parameters<PlanLifecycleService['pausePlan']>[4],
  ) {
    return this.lifecycle.pausePlan(userId, planId, reason, meta, options);
  }

  completePlan(
    userId: string,
    planId: string,
    completedAt?: string,
    reason?: string,
    meta?: Parameters<PlanLifecycleService['completePlan']>[4],
    options?: Parameters<PlanLifecycleService['completePlan']>[5],
  ) {
    return this.lifecycle.completePlan(
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
    meta?: Parameters<PlanLifecycleService['cancelPlan']>[3],
    options?: Parameters<PlanLifecycleService['cancelPlan']>[4],
  ) {
    return this.lifecycle.cancelPlan(userId, planId, reason, meta, options);
  }

  deletePlan(userId: string, planId: string) {
    return this.lifecycle.deletePlan(userId, planId);
  }

  listScheduledWorkouts(
    userId: string,
    start?: string | null,
    end?: string | null,
  ) {
    return this.workoutCommands.listScheduledWorkouts(userId, start, end);
  }

  createIndependentWorkout(userId: string, dto: CreateScheduledWorkoutDto) {
    return this.workoutCommands.createIndependentWorkout(userId, dto);
  }

  getIndependentWorkoutDetail(userId: string, workoutId: string) {
    return this.workoutCommands.getIndependentWorkoutDetail(userId, workoutId);
  }

  deleteIndependentWorkout(userId: string, workoutId: string) {
    return this.workoutCommands.deleteIndependentWorkout(userId, workoutId);
  }

  createPlanWorkout(
    ...args: Parameters<PlanWorkoutCommandService['createPlanWorkout']>
  ) {
    return this.workoutCommands.createPlanWorkout(...args);
  }

  attachWorkoutToPlan(
    ...args: Parameters<PlanWorkoutCommandService['attachWorkoutToPlan']>
  ) {
    return this.workoutCommands.attachWorkoutToPlan(...args);
  }

  getWorkoutDetail(
    userId: string,
    planId: string,
    workoutId: string,
    db?: Parameters<PlanWorkoutCommandService['getWorkoutDetail']>[3],
  ) {
    return this.workoutCommands.getWorkoutDetail(userId, planId, workoutId, db);
  }

  updateWorkoutStatus(
    ...args: Parameters<PlanWorkoutCommandService['updateWorkoutStatus']>
  ) {
    return this.workoutCommands.updateWorkoutStatus(...args);
  }

  updateWorkout(
    ...args: Parameters<PlanWorkoutCommandService['updateWorkout']>
  ) {
    return this.workoutCommands.updateWorkout(...args);
  }

  addWorkout(...args: Parameters<PlanWorkoutCommandService['addWorkout']>) {
    return this.workoutCommands.addWorkout(...args);
  }

  updateWorkouts(
    ...args: Parameters<PlanWorkoutCommandService['updateWorkouts']>
  ) {
    return this.workoutCommands.updateWorkouts(...args);
  }

  notifyWorkoutChanges(
    ...args: Parameters<PlanWorkoutCommandService['notifyWorkoutChanges']>
  ) {
    return this.workoutCommands.notifyWorkoutChanges(...args);
  }

  getWorkoutLinks(userId: string, planId: string, workoutId: string) {
    return this.activityLinks.getWorkoutLinks(userId, planId, workoutId);
  }

  linkWorkoutActivity(
    userId: string,
    planId: string,
    workoutId: string,
    dto: LinkPlanWorkoutActivityDto,
    meta?: Parameters<PlanActivityLinkService['linkWorkoutActivity']>[4],
  ) {
    return this.activityLinks.linkWorkoutActivity(
      userId,
      planId,
      workoutId,
      dto,
      meta,
    );
  }

  unlinkWorkoutActivity(
    ...args: Parameters<PlanActivityLinkService['unlinkWorkoutActivity']>
  ) {
    return this.activityLinks.unlinkWorkoutActivity(...args);
  }

  getActivityPlanLinkByHash(userId: string, hashId: string) {
    return this.activityLinks.getActivityPlanLinkByHash(userId, hashId);
  }

  listActivityPlanCandidatesByHash(
    userId: string,
    hashId: string,
    calendarTimeZone?: string | null,
  ) {
    return this.activityLinks.listActivityPlanCandidatesByHash(
      userId,
      hashId,
      calendarTimeZone,
    );
  }

  replaceActivityPlanLinkByHash(
    userId: string,
    hashId: string,
    dto: ReplaceActivityPlanLinkDto,
    meta?: Parameters<
      PlanActivityLinkService['replaceActivityPlanLinkByHash']
    >[3],
    linkSource?: Parameters<
      PlanActivityLinkService['replaceActivityPlanLinkByHash']
    >[4],
    options?: Parameters<
      PlanActivityLinkService['replaceActivityPlanLinkByHash']
    >[5],
  ) {
    return this.activityLinks.replaceActivityPlanLinkByHash(
      userId,
      hashId,
      dto,
      meta,
      linkSource,
      options,
    );
  }

  bindRecordedActivityToWorkout(
    ...args: Parameters<
      PlanActivityLinkService['bindRecordedActivityToWorkout']
    >
  ) {
    return this.activityLinks.bindRecordedActivityToWorkout(...args);
  }

  removeActivityPlanLinkByHash(
    userId: string,
    hashId: string,
    options?: Parameters<
      PlanActivityLinkService['removeActivityPlanLinkByHash']
    >[2],
  ) {
    return this.activityLinks.removeActivityPlanLinkByHash(
      userId,
      hashId,
      options,
    );
  }
}
