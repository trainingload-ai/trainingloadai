import { Module } from '@nestjs/common';
import { WorkoutController } from './workout.controller';
import { WorkoutService } from './workout.service';
import { WorkoutDefinitionService } from './workout-definition.service';
import { WorkoutCodecRegistry } from './workout-codec.registry';
import { EnduranceWorkoutCodec } from './codecs/endurance-workout.codec';
import { StrengthWorkoutCodec } from './codecs/strength-workout.codec';
import { FreeformWorkoutCodec } from './codecs/freeform-workout.codec';
import { FitWorkoutExternalAdapter } from './external/fit-workout-external.adapter';
import { WorkoutExternalAdapterRegistry } from './external/workout-external-adapter.registry';
import { WorkoutPrescriptionService } from './workout-prescription.service';

@Module({
  controllers: [WorkoutController],
  providers: [
    WorkoutService,
    WorkoutDefinitionService,
    WorkoutCodecRegistry,
    EnduranceWorkoutCodec,
    StrengthWorkoutCodec,
    FreeformWorkoutCodec,
    FitWorkoutExternalAdapter,
    WorkoutExternalAdapterRegistry,
    WorkoutPrescriptionService,
  ],
  exports: [
    WorkoutService,
    WorkoutDefinitionService,
    WorkoutCodecRegistry,
    WorkoutExternalAdapterRegistry,
    WorkoutPrescriptionService,
  ],
})
export class WorkoutModule {}
