import { Injectable } from '@nestjs/common';
import type {
  EndurancePlanBlock,
  EnduranceWorkoutIrV1,
} from '../../../../../../packages/shared/endurance-workout-ir';
import type { EnduranceWorkoutSummary } from '../../../../../../packages/shared/workout-summary';
import { WorkoutService, type PlanBlock } from '../workout.service';
import type { WorkoutCodec, WorkoutValidationIssue } from './workout-codec';

@Injectable()
export class EnduranceWorkoutCodec implements WorkoutCodec<EnduranceWorkoutIrV1> {
  readonly kind = 'ENDURANCE' as const;

  constructor(private readonly workoutService: WorkoutService) {}

  supportsVersion(version: number): boolean {
    return version === 1;
  }

  parseText(text: string, version: number): EnduranceWorkoutIrV1 {
    this.assertVersion(version);
    return {
      kind: 'ENDURANCE',
      version: 1,
      blocks: this.workoutService.parsePlanText(text),
    } as EnduranceWorkoutIrV1;
  }

  validate(
    structure: EnduranceWorkoutIrV1,
    version: number,
  ): WorkoutValidationIssue[] {
    if (!this.supportsVersion(version) || structure.version !== 1) {
      return [unsupportedVersion(version)];
    }
    if (!Array.isArray(structure.blocks) || structure.blocks.length === 0) {
      return [
        {
          code: 'MISSING_STEP',
          severity: 'ERROR',
          path: 'blocks',
          message: 'Endurance workout requires at least one step',
        },
      ];
    }
    return [];
  }

  stringify(structure: EnduranceWorkoutIrV1, version: number): string {
    this.assertVersion(version);
    return this.workoutService.stringifyPlan(structure.blocks as PlanBlock[]);
  }

  summarize(structure: EnduranceWorkoutIrV1): EnduranceWorkoutSummary {
    const visit = (
      blocks: EndurancePlanBlock[],
    ): {
      duration: number;
      steps: number;
      hard: boolean;
      unknownDuration: boolean;
    } => {
      const total = {
        duration: 0,
        steps: 0,
        hard: false,
        unknownDuration: false,
      };
      for (const block of blocks) {
        if (block.type === 'repeat') {
          const child = visit(block.children);
          const count = Math.max(0, Number(block.count ?? 0));
          if (block.until) {
            if (block.until.kind === 'TIME' && block.until.unit === 'SECONDS')
              total.duration += block.until.value;
            else total.unknownDuration = true;
          } else {
            total.duration += child.duration * count;
            total.unknownDuration ||= child.unknownDuration;
          }
          total.steps += child.steps * count;
          total.hard ||= child.hard;
          continue;
        }
        for (const step of block.steps) {
          total.steps += 1;
          if (step.durationMeta?.kind === 'TIME') {
            total.duration += Math.max(0, Number(step.duration ?? 0));
          } else total.unknownDuration = true;
          const zone = Number(step.primaryTargetMeta?.zoneIndex ?? 0);
          if (zone >= 4) total.hard = true;
        }
      }
      return total;
    };
    const value = visit(structure.blocks);
    return {
      kind: 'ENDURANCE',
      durationSeconds:
        !value.unknownDuration && value.duration > 0 ? value.duration : null,
      stepCount: value.steps,
      hardSession: value.hard,
    };
  }

  private assertVersion(version: number) {
    if (!this.supportsVersion(version)) {
      throw new Error(`Unsupported ENDURANCE DSL version: ${version}`);
    }
  }
}

function unsupportedVersion(version: number): WorkoutValidationIssue {
  return {
    code: 'UNSUPPORTED_VERSION',
    severity: 'ERROR',
    path: 'version',
    message: `Unsupported ENDURANCE DSL version: ${version}`,
  };
}
