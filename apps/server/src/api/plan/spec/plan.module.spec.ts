import { describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { WorkoutService } from '@/api/workout/workout.service';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { LoadReadoutService } from '@/api/activity/load-readout.service';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { PlanService } from '../plan.service';
import { PlanWriteSupport } from '../application/plan-write.support';
import { PlanLifecycleService } from '../application/plan-lifecycle.service';
import { PlanWorkoutCommandService } from '../application/plan-workout-command.service';
import { PlanActivityLinkService } from '../application/plan-activity-link.service';
import { PlanQueryService } from '../application/plan-query.service';
import { PlanExternalSyncService } from '../application/plan-external-sync.service';
import { PlanSummaryService } from '../application/plan-summary.service';
import { CoachContextService } from '../application/coach-context.service';
import { PlanLinkMatcherService } from '../application/plan-link-matcher.service';
import { PlanLoadEstimatorService } from '../application/plan-load-estimator.service';
import { WorkoutPersistenceService } from '../persistence/workout-persistence.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { CoachContextRepository } from '../persistence/coach-context.repository';
import { PlanWorkoutMutabilityPolicy } from '../application/plan-workout-mutability.policy';
import { WorkoutPrescriptionService } from '@/api/workout/workout-prescription.service';

describe('PlanModule command wiring', () => {
  it('compiles the facade and command services through Nest DI', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlanRepository,
        PlanWorkoutRepository,
        PlanActivityLinkRepository,
        CoachContextRepository,
        PlanWorkoutMutabilityPolicy,
        PlanWriteSupport,
        PlanLifecycleService,
        PlanWorkoutCommandService,
        PlanActivityLinkService,
        PlanService,
        PlanQueryService,
        PlanExternalSyncService,
        PlanSummaryService,
        CoachContextService,
        PlanLinkMatcherService,
        PlanLoadEstimatorService,
        WorkoutPersistenceService,
        { provide: PrismaService, useValue: {} },
        { provide: WorkoutService, useValue: {} },
        { provide: UserService, useValue: {} },
        { provide: UserQueryService, useValue: {} },
        { provide: I18nService, useValue: {} },
        { provide: LoadReadoutService, useValue: {} },
        { provide: ActivityReadService, useValue: {} },
        { provide: WorkoutDefinitionService, useValue: {} },
        { provide: WorkoutPrescriptionService, useValue: {} },
        { provide: EventEmitter2, useValue: { emitAsync: async () => [] } },
      ],
    }).compile();

    expect(moduleRef.get(PlanService)).toBeInstanceOf(PlanService);
    expect(moduleRef.get(PlanLifecycleService)).toBeInstanceOf(
      PlanLifecycleService,
    );
    expect(moduleRef.get(PlanWorkoutCommandService)).toBeInstanceOf(
      PlanWorkoutCommandService,
    );
    expect(moduleRef.get(PlanActivityLinkService)).toBeInstanceOf(
      PlanActivityLinkService,
    );
    expect(moduleRef.get(PlanQueryService)).toBeInstanceOf(PlanQueryService);
    expect(moduleRef.get(PlanExternalSyncService)).toBeInstanceOf(
      PlanExternalSyncService,
    );

    await moduleRef.close();
  });
});
