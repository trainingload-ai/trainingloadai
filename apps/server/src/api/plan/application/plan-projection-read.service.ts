import { PlanLoadEstimatorService } from './plan-load-estimator.service';
import { Injectable } from '@nestjs/common';
import { SportType } from '@prisma/client';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';

/** Narrow read module: PMC must not import PlanModule, which already depends on PMC. */
@Injectable()
export class PlanProjectionReadService {
  constructor(
    private readonly workouts: PlanWorkoutRepository,
    private readonly estimator: PlanLoadEstimatorService,
  ) {}

  async list(userId: string, from: Date, through: Date, sport?: SportType) {
    const rows = await this.workouts.findMany({
      where: {
        userId,
        scheduledDate: { gte: from, lte: through },
        ...(sport ? { sportType: sport } : {}),
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
        OR: [
          { planId: null },
          { plan: { status: { in: ['ACTIVE', 'SCHEDULED'] } } },
        ],
      },
      select: {
        id: true,
        scheduledDate: true,
        estimatedLoad: true,
        text: true,
        sportType: true,
        structureKind: true,
        plannedDurationSeconds: true,
        plannedSessionRpe: true,
        estimatedLoadSource: true,
        estimatedLoadInputs: true,
        estimatedLoadComputedAt: true,
        updatedAt: true,
        links: { where: { unlinkedAt: null }, select: { activityId: true } },
      },
      orderBy: [{ scheduledDate: 'asc' }, { id: 'asc' }],
      take: 2001,
    });
    if (rows.length > 2000) return rows;
    const missing = rows.filter((row) => row.estimatedLoad == null);
    if (!missing.length) return rows;
    // Existing read-only estimator; never calls applyForWorkout or persists a snapshot.
    const estimates = await this.estimator.estimateForViewerWorkouts(
      userId,
      missing.map((row) => ({
        sportType: row.sportType,
        structureKind: row.structureKind,
        text: row.text,
        durationSeconds: row.plannedDurationSeconds,
        plannedSessionRpe: row.plannedSessionRpe,
      })),
    );
    const byId = new Map(
      missing.map((row, index) => [row.id, estimates[index]]),
    );
    return rows.map((row) =>
      byId.has(row.id) ? { ...row, ...byId.get(row.id) } : row,
    );
  }
}
