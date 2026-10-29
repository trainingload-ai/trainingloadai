import { describe, it, expect, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { UserFitnessInvalidateListener } from '@/analyze/user-fitness-invalidate.listener';
import { ActivityRecomputeJobService } from '@/analyze/activity-recompute-job.service';
import { AnalyzeFitnessOrchestratorService } from '@/analyze/analyze-fitness-orchestrator.service';
import { UserService } from '@/api/user/user.service';
import {
  emitUserFitnessInvalidated,
  UserFitnessInvalidatedEvent,
} from '@/api/user/events/user-fitness.events';

describe('fitness outbox event acknowledgement', () => {
  it('propagates a real Nest listener failure and permits a later retry', async () => {
    const schedule = jest.fn(async () => ({ scheduled: true }));
    schedule.mockRejectedValueOnce(new Error('database unavailable'));
    const module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        UserFitnessInvalidateListener,
        {
          provide: ActivityRecomputeJobService,
          useValue: {
            mapFitnessMetricTypeToRecomputeType: () => 'LTHR',
            scheduleFitnessMetricChangeRecompute: schedule,
          },
        },
        {
          provide: UserService,
          useValue: {
            fitnessMetricActivityRecomputeEnabled: true,
            isAutoUpdateMetricSupported: () => true,
          },
        },
        { provide: AnalyzeFitnessOrchestratorService, useValue: {} },
      ],
    }).compile();
    await module.init();
    try {
      const events = module.get(EventEmitter2);
      const event = new UserFitnessInvalidatedEvent(
        'fixture',
        'LTHR',
        'RUN',
        [Date.now()],
        'MANUAL',
      );
      await expect(emitUserFitnessInvalidated(events, event)).rejects.toThrow(
        'database unavailable',
      );
      await expect(
        emitUserFitnessInvalidated(events, event),
      ).resolves.toBeUndefined();
      expect(schedule).toHaveBeenCalledTimes(2);
    } finally {
      await module.close();
    }
  });
});
