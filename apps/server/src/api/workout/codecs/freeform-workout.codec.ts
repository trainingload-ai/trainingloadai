import { Injectable } from '@nestjs/common';
import type { FreeformWorkoutIrV1 } from '../../../../../../packages/shared/workout-structure';
import type { FreeformWorkoutSummary } from '../../../../../../packages/shared/workout-summary';
import type { WorkoutCodec, WorkoutValidationIssue } from './workout-codec';

@Injectable()
export class FreeformWorkoutCodec implements WorkoutCodec<FreeformWorkoutIrV1> {
  readonly kind = 'FREEFORM' as const;

  supportsVersion(version: number): boolean {
    return version === 1;
  }

  parseText(text: string, version: number): FreeformWorkoutIrV1 {
    this.assertVersion(version);
    return { kind: 'FREEFORM', version: 1, text: text.trim() };
  }

  validate(
    structure: FreeformWorkoutIrV1,
    version: number,
  ): WorkoutValidationIssue[] {
    if (!this.supportsVersion(version) || structure.version !== 1) {
      return [
        {
          code: 'UNSUPPORTED_VERSION',
          severity: 'ERROR',
          path: 'version',
          message: `Unsupported FREEFORM version: ${version}`,
        },
      ];
    }
    if (!structure.text?.trim()) {
      return [
        {
          code: 'EMPTY_TEXT',
          severity: 'ERROR',
          path: 'text',
          message: 'Freeform workout text cannot be empty',
        },
      ];
    }
    return [];
  }

  stringify(structure: FreeformWorkoutIrV1, version: number): string {
    this.assertVersion(version);
    return structure.text.trim();
  }

  summarize(): FreeformWorkoutSummary {
    return { kind: 'FREEFORM', durationSeconds: null, hardSession: null };
  }

  private assertVersion(version: number) {
    if (!this.supportsVersion(version)) {
      throw new Error(`Unsupported FREEFORM version: ${version}`);
    }
  }
}
