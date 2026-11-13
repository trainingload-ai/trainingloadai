import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { WorkoutModule } from '@/api/workout/workout.module';
import { UsersModule } from '@/api/user/user.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { PlanLoadEstimatorService } from './plan-load-estimator.service';
import { PlanWorkoutTargetResolver } from './plan-workout-target-resolver.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanProjectionReadService } from './plan-projection-read.service';

@Module({
  imports: [PrismaModule, WorkoutModule, UsersModule, UserQueryModule],
  providers: [
    PlanRepository,
    PlanWorkoutRepository,
    PlanWorkoutTargetResolver,
    PlanLoadEstimatorService,
    PlanProjectionReadService,
  ],
  exports: [
    PlanRepository,
    PlanWorkoutRepository,
    PlanWorkoutTargetResolver,
    PlanLoadEstimatorService,
    PlanProjectionReadService,
  ],
})
export class PlanProjectionReadModule {}
