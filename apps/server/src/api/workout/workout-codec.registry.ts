import { Injectable } from '@nestjs/common';
import type {
  WorkoutStructure,
  WorkoutStructureKind,
} from '../../../../../packages/shared/workout-structure';
import { EnduranceWorkoutCodec } from './codecs/endurance-workout.codec';
import { FreeformWorkoutCodec } from './codecs/freeform-workout.codec';
import { StrengthWorkoutCodec } from './codecs/strength-workout.codec';
import type { WorkoutCodec } from './codecs/workout-codec';

@Injectable()
export class WorkoutCodecRegistry {
  constructor(
    private readonly endurance: EnduranceWorkoutCodec,
    private readonly strength: StrengthWorkoutCodec,
    private readonly freeform: FreeformWorkoutCodec,
  ) {}

  get(
    kind: WorkoutStructureKind,
    version: number,
  ): WorkoutCodec<WorkoutStructure> {
    const codec =
      kind === 'ENDURANCE'
        ? this.endurance
        : kind === 'STRENGTH'
          ? this.strength
          : kind === 'FREEFORM'
            ? this.freeform
            : null;
    if (!codec) throw new Error(`Unsupported workout structure kind: ${kind}`);
    if (!codec.supportsVersion(version)) {
      throw new Error(
        `Unsupported ${kind} workout definition version: ${version}`,
      );
    }
    return codec as WorkoutCodec<WorkoutStructure>;
  }
}
