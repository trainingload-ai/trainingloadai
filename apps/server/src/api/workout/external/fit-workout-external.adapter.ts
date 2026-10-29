import { Injectable } from '@nestjs/common';
import type { WorkoutStructure } from '../../../../../../packages/shared/workout-structure';
import { WorkoutService, type PlanBlock } from '../workout.service';
import type {
  WorkoutCapabilityAssessment,
  WorkoutExportContext,
  WorkoutExternalAdapter,
  WorkoutExternalExportResult,
} from './workout-external-adapter';

@Injectable()
export class FitWorkoutExternalAdapter implements WorkoutExternalAdapter {
  readonly provider = 'FIT' as const;
  readonly adapterVersion = 'fit-endurance-v1';

  constructor(private readonly workoutService: WorkoutService) {}

  assessCapabilities(
    structure: WorkoutStructure,
    _context: WorkoutExportContext,
  ): WorkoutCapabilityAssessment {
    if (structure.kind === 'ENDURANCE') {
      return {
        status: 'LOSSLESS',
        preservedFields: ['blocks', 'duration', 'targets', 'repeats'],
        droppedFields: [],
        warnings: [],
      };
    }
    return {
      status: 'UNSUPPORTED',
      preservedFields: [],
      droppedFields:
        structure.kind === 'STRENGTH'
          ? ['exercise', 'sets', 'reps', 'load', 'rest', 'effort']
          : ['text'],
      warnings: [
        {
          code:
            structure.kind === 'STRENGTH'
              ? 'STRENGTH_FIT_DEVICE_MATRIX_UNVERIFIED'
              : 'FIT_STRUCTURE_UNSUPPORTED',
          message:
            structure.kind === 'STRENGTH'
              ? 'Strength FIT export stays disabled until a real-device capability matrix is verified.'
              : `${structure.kind} workouts cannot be exported to FIT.`,
        },
      ],
    };
  }

  async export(
    structure: WorkoutStructure,
    context: WorkoutExportContext,
  ): Promise<WorkoutExternalExportResult> {
    const assessment = this.assessCapabilities(structure, context);
    if (assessment.status === 'UNSUPPORTED' || structure.kind !== 'ENDURANCE') {
      return {
        provider: this.provider,
        adapterVersion: this.adapterVersion,
        ...assessment,
      };
    }
    const bytes = await this.workoutService.buildFITFromPlan(
      structure.blocks as PlanBlock[],
      {
        sport: context.sport,
        subSport: context.subSport,
        name: context.name,
        manufacturer: context.manufacturer,
        product: context.product,
      },
    );
    return {
      provider: this.provider,
      adapterVersion: this.adapterVersion,
      ...assessment,
      file: {
        filename: `${context.name || 'workout'}.fit`,
        contentType: 'application/octet-stream',
        base64: Buffer.from(bytes).toString('base64'),
      },
    };
  }
}
