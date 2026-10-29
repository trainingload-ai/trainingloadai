import { describe, expect, it, jest } from '@jest/globals';
import { CoachContextService } from '../application/coach-context.service';
import { CoachContextRepository } from '../persistence/coach-context.repository';

function setup() {
  const supersede = jest.fn(async () => ({ count: 1 }));
  const tx = {};
  const contexts = {
    findUnique: async () => ({ id: 'context-1' }),
    findEventFirst: async () => ({ seq: 21 }),
    createEvent: jest.fn(async () => ({ id: 'event-22', seq: 22 })),
    updateMany: jest.fn(async () => ({ count: 1 })),
    supersedeWorkoutDecisions: supersede,
  };
  const service = new CoachContextService(
    {} as never,
    {} as never,
    contexts as never,
    {} as never,
    undefined,
  );
  return { service, tx, contexts, supersede };
}

describe('workout writes retire obsolete coach proposals', () => {
  it('retires the old proposal on the legacy direct-update path, in the workout transaction', async () => {
    const s = setup();
    await s.service.appendEvent({
      userId: 'u',
      planId: 'p',
      tx: s.tx as never,
      type: 'ADAPTATION_APPLIED',
      source: 'system',
      payload: { action: 'workout_update', workoutId: 'w' },
    });
    expect(s.supersede).toHaveBeenCalledWith(
      {
        contextId: 'context-1',
        workoutId: 'w',
        eventSeq: 22,
        appliedDecisionId: null,
      },
      s.tx,
    );
    expect(s.contexts.createEvent.mock.invocationCallOrder[0]).toBeLessThan(
      s.supersede.mock.invocationCallOrder[0],
    );
  });

  it('preserves the currently applying decision so its caller can finish APPLIED', async () => {
    const s = setup();
    await s.service.appendEvent({
      userId: 'u',
      planId: 'p',
      tx: s.tx as never,
      type: 'ADAPTATION_APPLIED',
      source: 'ai',
      payload: { workoutId: 'w', decisionId: 'applying' },
    });
    expect(s.supersede).toHaveBeenCalledWith(
      expect.objectContaining({ appliedDecisionId: 'applying' }),
      s.tx,
    );
  });

  it.each(['REVIEW_DAILY', 'REVIEW_WEEKLY'] as const)(
    'does not retire proposals merely because a new %s evaluation occurred',
    async (type) => {
      const s = setup();
      await s.service.appendEvent({
        userId: 'u',
        planId: 'p',
        type,
        payload: { workoutId: 'w' },
      });
      expect(s.supersede).not.toHaveBeenCalled();
    },
  );

  it('propagates retirement failure to the enclosing workout transaction', async () => {
    const s = setup();
    s.supersede.mockRejectedValueOnce(new Error('decision write failed'));
    await expect(
      s.service.appendEvent({
        userId: 'u',
        planId: 'p',
        tx: s.tx as never,
        type: 'ADAPTATION_APPLIED',
        payload: { workoutId: 'w' },
      }),
    ).rejects.toThrow('decision write failed');
  });

  it('limits invalidation to older, unfinished proposals that target this workout', async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const tx = { coachDecision: { updateMany } };
    const repository = new CoachContextRepository({} as never);
    await repository.supersedeWorkoutDecisions(
      {
        contextId: 'c',
        workoutId: 'w',
        eventSeq: 22,
        appliedDecisionId: 'applying',
      },
      tx as never,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        contextId: 'c',
        id: { not: 'applying' },
        state: { in: ['DRAFT', 'PROPOSED', 'APPROVED'] },
        AND: [
          { OR: [{ baseEventSeq: null }, { baseEventSeq: { lt: 22 } }] },
          {
            OR: [
              {
                decisionType: {
                  in: [
                    'PLAN_WORKOUT_UPDATE',
                    'PLAN_WORKOUT_POSTPONE',
                    'PLAN_WORKOUT_STATUS',
                  ],
                },
                payload: { path: ['workoutId'], equals: 'w' },
              },
              {
                decisionType: 'PLAN_WORKOUT_BATCH_UPDATE',
                payload: {
                  path: ['changes'],
                  array_contains: [{ workoutId: 'w' }],
                },
              },
            ],
          },
        ],
      },
      data: { state: 'SUPERSEDED' },
    });
  });
});
