import { PlanWorkoutCommandService } from '../application/plan-workout-command.service';
import { PlanActivityLinkService } from '../application/plan-activity-link.service';
import { PlanCalendarRepository } from '../persistence/plan-calendar.repository';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { HealthDataRepository } from '@/health-data/persistence/health-data.repository';
import { CompetitionQueryService } from '@/api/competition/application/competition-query.service';
import { CompetitionRepository } from '@/api/competition/persistence/competition.repository';
import { UserAnalysisConfigService } from '@/api/user/user-analysis-config.service';
import { PlanCalendarValidationService } from '../application/plan-calendar-validation.service';
import { UserService } from '@/api/user/user.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { UserIdentityRepository } from '@/api/user/persistence/user-identity.repository';
import { PlanLoadEstimatorService } from '../application/plan-load-estimator.service';
import { PlanStartRepository } from '../persistence/plan-start.repository';
import { PrismaClient } from '@prisma/client';
import { PlanStartService } from '../application/plan-start.service';
import { PlanWriteSupport } from '../application/plan-write.support';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { CoachContextRepository } from '../persistence/coach-context.repository';
import { CoachContextService } from '../application/coach-context.service';
import { WorkoutService } from '@/api/workout/workout.service';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { EnduranceWorkoutCodec } from '@/api/workout/codecs/endurance-workout.codec';
import { StrengthWorkoutCodec } from '@/api/workout/codecs/strength-workout.codec';
import { FreeformWorkoutCodec } from '@/api/workout/codecs/freeform-workout.codec';
import { WorkoutPersistenceService } from '../persistence/workout-persistence.service';
import { PlanWorkoutMutabilityPolicy } from '../application/plan-workout-mutability.policy';
import { PlanService } from '../plan.service';
import { PlanLifecycleService } from '../application/plan-lifecycle.service';
import { PlanProposalService } from '../application/plan-proposal.service';
import { PlanProposalApplyService } from '../application/plan-proposal-apply.service';
import { PlanProposalRepository } from '../persistence/plan-proposal.repository';
import { PlanQueryService } from '../application/plan-query.service';

export function planStartFixture(prisma: PrismaClient) {
  const workouts = new PlanWorkoutRepository(prisma as never);
  const plans = new PlanRepository(prisma as never);
  const codec = new WorkoutService({} as never);
  const definitions = new WorkoutDefinitionService(
    new WorkoutCodecRegistry(
      new EnduranceWorkoutCodec(codec),
      new StrengthWorkoutCodec(),
      new FreeformWorkoutCodec(),
    ),
  );
  const persistence = new WorkoutPersistenceService(workouts);
  const users = Object.create(UserService.prototype) as UserService;
  Object.assign(users, {
    prisma,
    users: new UserQueryService(new UserIdentityRepository(prisma as never)),
  });
  const context = new CoachContextService(
    prisma as never,
    {} as never,
    new CoachContextRepository(prisma as never),
    plans,
    {} as never,
  );
  const write = Object.create(PlanWriteSupport.prototype) as PlanWriteSupport;
  const loads = new PlanLoadEstimatorService(
    prisma as never,
    users,
    codec,
    plans,
    workouts,
  );
  Object.assign(write, {
    prisma,
    calendarValidation: new PlanCalendarValidationService(
      new PlanCalendarRepository(),
    ),
    workoutService: codec,
    userService: users,
    logger: { error: () => undefined, warn: () => undefined },
    planLoadEstimator: loads,
    loadReadout: { batchGetActualLoad: async () => new Map() },
    coachContext: context,
    workoutDefinitionService: definitions,
    workoutPersistence: persistence,
    plans,
    workouts,
    links: new PlanActivityLinkRepository(prisma as never),
    workoutMutability: new PlanWorkoutMutabilityPolicy(),
    workoutPrescriptions: {},
    planLinkMatcher: {},
    planSummary: {},
  });
  const service = new PlanService(
    new PlanLifecycleService(write),
    new PlanWorkoutCommandService(write),
    new PlanActivityLinkService(write),
  );
  const starts = new PlanStartService(
    prisma as never,
    service,
    users as never,
    definitions,
    codec,
    persistence,
    new PlanStartRepository(),
    loads,
    new PlanCalendarValidationService(new PlanCalendarRepository()),
    new ActivityReadService(prisma as never),
    new HealthDataRepository(prisma as never),
    new UserQueryService(new UserIdentityRepository(prisma as never)),
    new CompetitionQueryService(new CompetitionRepository(prisma as never)),
    new UserAnalysisConfigService(
      prisma as never,
      new UserQueryService(new UserIdentityRepository(prisma as never)),
    ),
  );
  const proposalRepo = new PlanProposalRepository(prisma as never);
  const proposals = new PlanProposalService(
    plans,
    proposalRepo,
    users as never,
    codec,
    {} as never,
    loads as never,
    starts,
  );
  const apply = new PlanProposalApplyService(
    service,
    plans,
    workouts,
    proposalRepo,
    context,
    users as never,
    {} as never,
    loads as never,
    starts,
  );
  const query = new PlanQueryService(
    prisma as never,
    plans,
    workouts,
    new PlanActivityLinkRepository(prisma as never),
    new CoachContextRepository(prisma as never),
    {} as never,
  );
  return { starts, service, write, context, proposals, apply, users, query };
}
