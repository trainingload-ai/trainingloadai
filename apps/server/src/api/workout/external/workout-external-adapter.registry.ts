import { Inject, Injectable, Optional } from '@nestjs/common';
import { FitWorkoutExternalAdapter } from './fit-workout-external.adapter';
import type {
  WorkoutExternalAdapter,
  WorkoutExternalProvider,
} from './workout-external-adapter';
import { WORKOUT_EXTERNAL_ADAPTERS } from './workout-external-adapter';

@Injectable()
export class WorkoutExternalAdapterRegistry {
  constructor(
    private readonly fit: FitWorkoutExternalAdapter,
    @Optional()
    @Inject(WORKOUT_EXTERNAL_ADAPTERS)
    private readonly extensions: readonly WorkoutExternalAdapter[] = [],
  ) {}

  get(provider: WorkoutExternalProvider): WorkoutExternalAdapter {
    if (provider === 'FIT') return this.fit;
    const adapter = this.extensions.find((candidate) => candidate.provider === provider);
    if (adapter) return adapter;
    throw new Error(`Unsupported workout export provider: ${provider}`);
  }
}
