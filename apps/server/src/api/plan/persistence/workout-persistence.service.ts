import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PlanWorkoutRepository } from './plan-workout.repository';
import type { PlanDb } from './plan-db';
import type { StrengthWorkoutIrV1 } from '../../../../../../packages/shared/strength-workout-ir';
import {
  strengthLoadFromColumns,
  strengthLoadToColumns,
} from '@/api/workout/strength/strength-load-columns';

type Tx = PlanDb;

type PersistedStrengthSetGroup = {
  id?: string;
  orderIndex?: number | null;
  setType: string;
  setCount?: number | null;
  prescriptionType?: string | null;
  durationSeconds?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  amrap?: boolean | null;
  loadType: string | null;
  loadValue: unknown;
  loadUnit: unknown;
  bodyweightOffsetDirection: unknown;
  targetRpe?: number | null;
  targetRir?: number | null;
  restSeconds?: number | null;
};

type PersistedStrengthExercise = {
  id?: string;
  orderIndex?: number | null;
  exerciseCode?: string | null;
  name?: string | null;
  equipmentCode?: string | null;
  notes?: string | null;
  setGroups?: PersistedStrengthSetGroup[] | null;
};

@Injectable()
export class WorkoutPersistenceService {
  constructor(private readonly workouts: PlanWorkoutRepository) {}

  async replaceStrength(
    tx: Tx,
    workoutId: string,
    workout: StrengthWorkoutIrV1,
  ): Promise<void> {
    await this.workouts.deleteExercises({ where: { workoutId } }, tx);

    for (const [exerciseIndex, exercise] of workout.exercises.entries()) {
      const created = await this.workouts.createExercise(
        {
          data: {
            workoutId,
            orderIndex: exerciseIndex,
            exerciseCode: exercise.exerciseCode ?? null,
            name: exercise.name,
            equipmentCode: exercise.equipmentCode ?? null,
            notes: exercise.notes ?? null,
          },
        },
        tx,
      );
      for (const [groupIndex, group] of exercise.setGroups.entries()) {
        const data: Prisma.PlanWorkoutSetGroupUncheckedCreateInput = {
          exerciseId: created.id,
          orderIndex: groupIndex,
          setType: group.setType,
          setCount: group.setCount,
          prescriptionType: group.prescription.kind,
          repsMin:
            group.prescription.kind === 'REPS'
              ? group.prescription.repsMin
              : null,
          repsMax:
            group.prescription.kind === 'REPS'
              ? group.prescription.repsMax
              : null,
          durationSeconds:
            group.prescription.kind === 'TIME'
              ? group.prescription.durationSeconds
              : null,
          amrap:
            group.prescription.kind === 'REPS'
              ? group.prescription.amrap
              : false,
          ...strengthLoadToColumns(group.load),
          targetRpe: group.effort?.kind === 'RPE' ? group.effort.value : null,
          targetRir: group.effort?.kind === 'RIR' ? group.effort.value : null,
          restSeconds: group.restSeconds ?? null,
        };
        await this.workouts.createSetGroup({ data }, tx);
      }
    }
  }

  buildStrengthStructure(
    exercises: PersistedStrengthExercise[] | null | undefined,
    headers?: {
      durationSeconds?: number | null;
      plannedSessionRpe?: number | null;
    },
  ): StrengthWorkoutIrV1 {
    return {
      kind: 'STRENGTH',
      version: 1,
      ...(headers?.durationSeconds != null
        ? { durationSeconds: Number(headers.durationSeconds) }
        : {}),
      ...(headers?.plannedSessionRpe != null
        ? { plannedSessionRpe: Number(headers.plannedSessionRpe) }
        : {}),
      exercises: (Array.isArray(exercises) ? exercises : [])
        .slice()
        .sort((a, b) => Number(a.orderIndex) - Number(b.orderIndex))
        .map((exercise) => ({
          id: exercise.id,
          ...(exercise.exerciseCode
            ? { exerciseCode: String(exercise.exerciseCode) }
            : {}),
          name: String(exercise.name ?? ''),
          ...(exercise.equipmentCode
            ? { equipmentCode: String(exercise.equipmentCode) }
            : {}),
          ...(exercise.notes ? { notes: String(exercise.notes) } : {}),
          setGroups: (Array.isArray(exercise.setGroups)
            ? exercise.setGroups
            : []
          )
            .slice()
            .sort((a, b) => Number(a.orderIndex) - Number(b.orderIndex))
            .map((group) => ({
              id: group.id,
              setType: group.setType === 'WARMUP' ? 'WARMUP' : 'WORK',
              setCount: Number(group.setCount),
              prescription:
                group.prescriptionType === 'TIME'
                  ? {
                      kind: 'TIME' as const,
                      durationSeconds: Number(group.durationSeconds),
                    }
                  : {
                      kind: 'REPS' as const,
                      repsMin: Number(group.repsMin),
                      repsMax: Number(group.repsMax),
                      amrap: Boolean(group.amrap),
                    },
              load: strengthLoadFromColumns(group),
              ...(group.targetRpe != null
                ? {
                    effort: {
                      kind: 'RPE' as const,
                      value: Number(group.targetRpe),
                    },
                  }
                : group.targetRir != null
                  ? {
                      effort: {
                        kind: 'RIR' as const,
                        value: Number(group.targetRir),
                      },
                    }
                  : {}),
              ...(group.restSeconds != null
                ? { restSeconds: Number(group.restSeconds) }
                : {}),
            })),
        })),
    };
  }
}
