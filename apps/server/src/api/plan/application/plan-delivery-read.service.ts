import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { WorkoutStructure } from '../../../../../../packages/shared/workout-structure';
import { WorkoutService } from '../../workout/workout.service';
import { WorkoutDefinitionService } from '../../workout/workout-definition.service';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { WorkoutPersistenceService } from '../persistence/workout-persistence.service';
import { PlanWorkoutTargetResolver } from './plan-workout-target-resolver.service';

/** Immutable, provider-neutral input for a reviewed delivery. It grants no write permission. */
export type PlanDeliverySnapshot = {
  id: string;
  revision: number;
  status: string;
  name: string;
  description: string;
  sportType: string;
  sportDefinitionCode: string | null;
  scheduledDate: string | null;
  structure: WorkoutStructure;
  checksum: string;
};

@Injectable()
export class PlanDeliveryReadService {
  constructor(
    private readonly workouts: PlanWorkoutRepository,
    private readonly targets: PlanWorkoutTargetResolver,
    private readonly endurance: WorkoutService,
    private readonly strength: WorkoutPersistenceService,
    private readonly definitions: WorkoutDefinitionService,
  ) {}

  async snapshot(
    userId: string,
    workoutId: string,
  ): Promise<PlanDeliverySnapshot | null> {
    const stored = await this.workouts.findFirst({
      where: {
        id: workoutId,
        userId,
        OR: [{ plan: null }, { plan: { status: { not: 'DRAFT' } } }],
      },
      include: {
        steps: {
          where: { parentId: null },
          orderBy: { orderIndex: 'asc' },
          include: { children: { orderBy: { orderIndex: 'asc' } } },
        },
        strengthExercises: {
          orderBy: { orderIndex: 'asc' },
          include: { setGroups: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });
    if (!stored) return null;
    const row = await this.targets.resolveWorkout(userId, stored);
    // The definition resolver below validates JSON-backed annotations after hydration.
    const persistedSteps: unknown = row.steps;
    const structure: WorkoutStructure =
      row.structureKind === 'STRENGTH'
        ? this.strength.buildStrengthStructure(row.strengthExercises, {
            durationSeconds: row.plannedDurationSeconds,
            plannedSessionRpe: row.plannedSessionRpe,
          })
        : row.structureKind === 'FREEFORM'
          ? { kind: 'FREEFORM', version: 1, text: row.text }
          : {
              kind: 'ENDURANCE',
              version: 1,
              blocks: this.endurance.buildPlanBlocksFromWorkoutSteps(
                Array.isArray(persistedSteps) ? persistedSteps : [],
                row.sportType,
              ),
            };
    const resolved = this.definitions.resolve({
      kind: structure.kind,
      version: 1,
      source: 'STRUCTURE',
      structure,
    });
    const data = {
      id: row.id,
      revision: row.revision,
      status: row.status,
      name: row.name?.trim() || row.sportDefinitionCode || row.sportType,
      description: row.notes ?? '',
      sportType: row.sportType,
      sportDefinitionCode: row.sportDefinitionCode,
      scheduledDate: row.scheduledDate?.toISOString().slice(0, 10) ?? null,
      structure: resolved.structure,
    };
    return {
      ...data,
      checksum: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
    };
  }
}
