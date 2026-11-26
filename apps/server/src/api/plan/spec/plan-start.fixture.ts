import { RollingPlanService } from '../application/rolling-plan.service';
import { LoadReadoutService } from '@/api/activity/load-readout.service';
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
import type { Prisma, PrismaClient } from '@prisma/client';
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
  const codecs = new WorkoutCodecRegistry(
    new EnduranceWorkoutCodec(codec),
    new StrengthWorkoutCodec(),
    new FreeformWorkoutCodec(),
  );
  const definitions = new WorkoutDefinitionService(codecs);
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
    activityRead: new ActivityReadService(prisma as never),
    links: new PlanActivityLinkRepository(prisma as never),
    workoutMutability: new PlanWorkoutMutabilityPolicy(),
    workoutPrescriptions: {},
    planLinkMatcher: {},
    planSummary: {},
  });
  const service = new PlanService(
    new PlanLifecycleService(write),
    new PlanWorkoutCommandService(write),
    new PlanActivityLinkService(
      write,
      new PlanActivityLinkRepository(prisma as never),
      workouts,
    ),
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
    new RollingPlanService(plans, workouts),
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
    new LoadReadoutService(
      prisma as never,
      new ActivityReadService(prisma as never),
      new UserQueryService(new UserIdentityRepository(prisma as never)),
      new UserAnalysisConfigService(
        prisma as never,
        new UserQueryService(new UserIdentityRepository(prisma as never)),
      ),
    ),
    undefined,
    new ActivityReadService(prisma as never),
  );
  return { starts, service, write, context, proposals, apply, users, query, codecs };
}

export function raceWithUncommittedPlanWrite<T>(
  prisma: PrismaClient,
  write: (tx: Prisma.TransactionClient) => Promise<unknown>,
  concurrent: () => Promise<T>,
) {
  return raceWithPlanWriteCheckpoint(
    prisma,
    (hold) => prisma.$transaction(async (tx) => {
      await write(tx);
      await hold();
    }, { timeout: 15000 }),
    concurrent,
  );
}

/** Wait for the expected concurrent writers before releasing the first PostgreSQL transaction. */
export async function raceWithPlanWriteCheckpoint<T>(
  prisma: PrismaClient,
  write: (hold: () => Promise<void>) => Promise<unknown>,
  concurrent: () => Promise<T>,
  { blockedWriters = 1, whileBlocked }: {
    blockedWriters?: number;
    whileBlocked?: () => Promise<void>;
  } = {},
) {
  let markWritten!: () => void;
  let commit!: () => void;
  const written = new Promise<void>((resolve) => { markWritten = resolve; });
  const waitingToCommit = new Promise<void>((resolve) => { commit = resolve; });
  const first = write(async () => {
    markWritten();
    await waitingToCommit;
  });
  await Promise.race([
    written,
    first.then(() => { throw new Error('First calendar writer never reached the checkpoint'); }),
  ]);

  const second = concurrent().then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (reason: unknown) => ({ status: 'rejected' as const, reason }),
  );
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      const [session] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
        SELECT (
          SELECT count(*) FROM pg_stat_activity
          WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0
        ) >= ${blockedWriters} AS blocked
      `;
      if (session.blocked) {
        await whileBlocked?.();
        return second;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Concurrent calendar writer did not wait on the first transaction');
  } finally {
    commit();
    await first;
    await second;
  }
}
