import { Injectable } from '@nestjs/common';
import type { StrengthWorkoutIrV1 } from '../../../../../../packages/shared/strength-workout-ir';
import type { StrengthWorkoutSummary } from '../../../../../../packages/shared/workout-summary';
import {
  parseStrengthWorkoutDsl,
  stringifyStrengthWorkoutDsl,
  summarizeStrengthWorkout,
  validateStrengthWorkout,
} from '../strength/strength-dsl';
import type { WorkoutCodec, WorkoutValidationIssue } from './workout-codec';

@Injectable()
export class StrengthWorkoutCodec implements WorkoutCodec<StrengthWorkoutIrV1> {
  readonly kind = 'STRENGTH' as const;

  supportsVersion(version: number): boolean {
    return version === 1;
  }

  parseText(text: string, version: number): StrengthWorkoutIrV1 {
    this.assertVersion(version);
    return parseStrengthWorkoutDsl(text);
  }

  validate(
    structure: StrengthWorkoutIrV1,
    version: number,
  ): WorkoutValidationIssue[] {
    if (!this.supportsVersion(version)) {
      return [
        {
          code: 'UNSUPPORTED_VERSION',
          severity: 'ERROR',
          path: 'version',
          message: `Unsupported STRENGTH DSL version: ${version}`,
        },
      ];
    }
    return validateStrengthWorkout(structure);
  }

  stringify(structure: StrengthWorkoutIrV1, version: number): string {
    this.assertVersion(version);
    return stringifyStrengthWorkoutDsl(structure);
  }

  summarize(structure: StrengthWorkoutIrV1): StrengthWorkoutSummary {
    return summarizeStrengthWorkout(structure);
  }

  private assertVersion(version: number) {
    if (!this.supportsVersion(version)) {
      throw new Error(`Unsupported STRENGTH DSL version: ${version}`);
    }
  }
}
