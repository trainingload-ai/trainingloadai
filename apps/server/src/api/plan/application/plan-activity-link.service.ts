import { Injectable } from '@nestjs/common';
import { PlanWriteSupport } from './plan-write.support';
import type { LinkPlanWorkoutActivityDto } from '../dto/link-plan-workout-activity.dto';
import type { ReplaceActivityPlanLinkDto } from '../dto/replace-activity-plan-link.dto';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import type { PlanDb } from '../persistence/plan-db';

@Injectable()
export class PlanActivityLinkService {
  constructor(
    private readonly write: PlanWriteSupport,
    private readonly links: PlanActivityLinkRepository,
    private readonly workouts: PlanWorkoutRepository,
  ) {}

  async findAutoCompletedWorkoutIdsForActivity(
    activityId: number,
    tx: PlanDb,
  ): Promise<string[]> {
    const links = await this.links.findMany(
      {
        where: {
          activityId,
          unlinkedAt: null,
          role: 'PRIMARY',
          autoMarkedWorkoutDone: true,
        },
        select: { planWorkoutId: true },
      },
      tx,
    );
    return [...new Set(links.map((link) => link.planWorkoutId))];
  }

  async restoreOrphanedAutoCompletedWorkouts(
    workoutIds: string[],
    tx: PlanDb,
  ): Promise<void> {
    if (workoutIds.length === 0) return;
    const stillLinked = await this.links.findMany(
      {
        where: {
          planWorkoutId: { in: workoutIds },
          unlinkedAt: null,
          role: 'PRIMARY',
        },
        select: { planWorkoutId: true },
      },
      tx,
    );
    const stillLinkedIds = new Set(
      stillLinked.map((link) => link.planWorkoutId),
    );
    const orphanedIds = workoutIds.filter(
      (workoutId) => !stillLinkedIds.has(workoutId),
    );
    if (orphanedIds.length === 0) return;
    await this.workouts.updateMany(
      {
        where: { id: { in: orphanedIds }, status: 'DONE' },
        data: { status: 'PLANNED', completedAt: null },
      },
      tx,
    );
  }

  getWorkoutLinks(userId: string, planId: string, workoutId: string) {
    return this.write.getWorkoutLinks(userId, planId, workoutId);
  }

  linkWorkoutActivity(
    userId: string,
    planId: string,
    workoutId: string,
    dto: LinkPlanWorkoutActivityDto,
    meta?: Parameters<PlanWriteSupport['linkWorkoutActivity']>[4],
  ) {
    return this.write.linkWorkoutActivity(
      userId,
      planId,
      workoutId,
      dto,
      meta,
    );
  }

  unlinkWorkoutActivity(
    ...args: Parameters<PlanWriteSupport['unlinkWorkoutActivity']>
  ) {
    return this.write.unlinkWorkoutActivity(...args);
  }

  getActivityPlanLinkByHash(userId: string, hashId: string) {
    return this.write.getActivityPlanLinkByHash(userId, hashId);
  }

  listActivityPlanCandidatesByHash(
    userId: string,
    hashId: string,
    calendarTimeZone?: string | null,
  ) {
    return this.write.listActivityPlanCandidatesByHash(
      userId,
      hashId,
      calendarTimeZone,
    );
  }

  replaceActivityPlanLinkByHash(
    userId: string,
    hashId: string,
    dto: ReplaceActivityPlanLinkDto,
    meta?: Parameters<PlanWriteSupport['replaceActivityPlanLinkByHash']>[3],
    linkSource?: Parameters<
      PlanWriteSupport['replaceActivityPlanLinkByHash']
    >[4],
    options?: Parameters<PlanWriteSupport['replaceActivityPlanLinkByHash']>[5],
  ) {
    return this.write.replaceActivityPlanLinkByHash(
      userId,
      hashId,
      dto,
      meta,
      linkSource,
      options,
    );
  }

  bindRecordedActivityToWorkout(
    ...args: Parameters<PlanWriteSupport['bindRecordedActivityToWorkout']>
  ) {
    return this.write.bindRecordedActivityToWorkout(...args);
  }

  removeActivityPlanLinkByHash(
    userId: string,
    hashId: string,
    options?: Parameters<PlanWriteSupport['removeActivityPlanLinkByHash']>[2],
  ) {
    return this.write.removeActivityPlanLinkByHash(userId, hashId, options);
  }
}
