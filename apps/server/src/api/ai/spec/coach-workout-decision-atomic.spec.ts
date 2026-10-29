import { describe, expect, it, jest } from '@jest/globals';
import { CoachBranchingService } from '../coach-branching.service';

function setup(
  decisionType:
    | 'PLAN_WORKOUT_BATCH_UPDATE'
    | 'PLAN_WORKOUT_SCHEDULE' = 'PLAN_WORKOUT_BATCH_UPDATE',
) {
  let state = 'APPROVED';
  let text = 'work 30m';
  let addedWorkout: Record<string, unknown> | null = null;
  const decision = {
    id: 'd',
    state,
    decisionType,
    branchId: 'b',
    contextId: 'c',
    baseEventSeq: 1,
    branch: { baseEventSeq: 1 },
    context: { headEventSeq: 1, status: 'ACTIVE', planId: 'p' },
    payload: {
      planId: 'p',
      changes: [
        {
          workoutId: 'w',
          dto: {
            weekIndex: 1,
            dayIndex: 1,
            sportType: 'RUN',
            text: 'work 20m',
          },
        },
      ],
      ...(decisionType === 'PLAN_WORKOUT_SCHEDULE'
        ? {
            additions: [
              {
                dto: {
                  weekIndex: 1,
                  dayIndex: 1,
                  sessionIndex: 2,
                  sportType: 'CYCLING',
                  name: '30 minute LTHR test',
                  text: 'warmup 15m, work 30m, cooldown 10m',
                },
              },
            ],
          }
        : {}),
    },
  };
  const createCommit = jest.fn(async () => ({ id: 'commit' }));
  const tx = {
    coachDecision: {
      updateMany: jest.fn(async () => {
        const count = state === 'APPROVED' ? 1 : 0;
        if (count) state = 'APPLIED';
        return { count };
      }),
      update: jest.fn(async () => ({ ...decision, state })),
    },
    coachCommit: { findFirst: async () => null, create: createCommit },
    coachEvent: { updateMany: async () => ({ count: 1 }) },
    coachBranch: { update: async () => ({}) },
  };
  const updateWorkouts = jest.fn(
    async (
      _u: string,
      _p: string,
      _changes: unknown,
      _meta: unknown,
      options: { tx: unknown },
    ) => {
      expect(options.tx).toBe(tx);
      const before = [{ text }];
      text = 'work 20m';
      return { before, after: [{ text }] };
    },
  );
  const notify = jest.fn(async () => undefined);
  const addWorkout = jest.fn(
    async (
      _u: string,
      _p: string,
      dto: Record<string, unknown>,
      _meta: unknown,
      options: { tx: unknown },
    ) => {
      expect(options.tx).toBe(tx);
      addedWorkout = { planId: 'p', status: 'PLANNED', ...dto, id: 'new' };
      return { workout: addedWorkout };
    },
  );
  const attempt = jest.fn(async () => undefined);
  const service = Object.create(
    CoachBranchingService.prototype,
  ) as CoachBranchingService;
  Object.assign(service, {
    requireDecisionOwner: async () => ({ ...decision, state }),
    prisma: {
      $transaction: async (run: (db: unknown) => Promise<unknown>) => {
        const initial = { state, text, addedWorkout };
        try {
          return await run(tx);
        } catch (e) {
          state = initial.state;
          text = initial.text;
          addedWorkout = initial.addedWorkout;
          throw e;
        }
      },
      coachCommit: { findFirst: async () => ({ id: 'commit' }) },
    },
    planService: {
      updateWorkouts,
      addWorkout,
      notifyWorkoutChanges: notify,
    },
    planQuery: {
      findContextById: async () => ({
        headEventSeq: text === 'work 30m' ? 1 : 2,
      }),
    },
    recordApplyAttempt: attempt,
  });
  return {
    service,
    text: () => text,
    state: () => state,
    createCommit,
    updateWorkouts,
    addWorkout,
    addedWorkout: () => addedWorkout,
    notify,
    attempt,
  };
}

describe('workout decision transaction boundary', () => {
  it('does not allow model-supplied event sequences to override the stored proposal baseline', async () => {
    const s = setup();
    await expect(
      s.service.applyDecision({
        userId: 'u',
        decisionId: 'd',
        expectedBaseEventSeq: 99,
      }),
    ).rejects.toThrow('BASE_EVENT_SEQ_MISMATCH');
    expect(s.updateWorkouts).not.toHaveBeenCalled();
  });
  it('requires a later confirmation turn for a newly created proposal', async () => {
    const s = setup();
    const now = new Date();
    Object.assign(s.service, {
      requireDecisionOwner: async () => ({
        id: 'd',
        branchId: 'b',
        state: 'PROPOSED',
        createdAt: now,
      }),
    });
    await expect(
      s.service.approveDecision({
        userId: 'u',
        decisionId: 'd',
        branchId: 'b',
        proposedBefore: now,
      }),
    ).rejects.toThrow('later turn');
    expect(s.updateWorkouts).not.toHaveBeenCalled();
  });
  it('rolls back writes if the apply audit record cannot be persisted', async () => {
    const s = setup();
    s.attempt.mockImplementationOnce(async () => {
      throw new Error('audit failed');
    });
    await expect(
      s.service.applyDecision({ userId: 'u', decisionId: 'd' }),
    ).rejects.toThrow('audit failed');
    expect(s.text()).toBe('work 30m');
    expect(s.state()).toBe('APPROVED');
  });
  it('commits writes, decision state, event attribution and a read-back receipt together', async () => {
    const s = setup();
    const result = await s.service.applyDecision({
      userId: 'u',
      decisionId: 'd',
    });
    expect(result).toMatchObject({
      result: 'APPLIED',
      receipt: {
        changedWorkoutCount: 1,
        changes: [
          {
            workoutId: 'w',
            fields: [{ field: 'text', before: 'work 30m', after: 'work 20m' }],
          },
        ],
      },
    });
    expect(s.notify).toHaveBeenCalledTimes(1);
    await s.service.applyDecision({ userId: 'u', decisionId: 'd' });
    expect(s.updateWorkouts).toHaveBeenCalledTimes(1);
  });
  it('moves an existing workout and adds the test workout in one transaction', async () => {
    const s = setup('PLAN_WORKOUT_SCHEDULE');
    const result = await s.service.applyDecision({
      userId: 'u',
      decisionId: 'd',
    });
    expect(result).toMatchObject({
      result: 'APPLIED',
      receipt: {
        changedWorkoutCount: 2,
        changes: [{ workoutId: 'w' }, { workoutId: 'new' }],
      },
    });
    expect(s.updateWorkouts).toHaveBeenCalledTimes(1);
    expect(s.addWorkout).toHaveBeenCalledTimes(1);
    expect(s.addedWorkout()).toMatchObject({
      id: 'new',
      name: '30 minute LTHR test',
    });
  });
  it('rolls back both the move and addition if the composite commit fails', async () => {
    const s = setup('PLAN_WORKOUT_SCHEDULE');
    s.createCommit.mockImplementation(async () => {
      throw new Error('commit failed');
    });
    await expect(
      s.service.applyDecision({ userId: 'u', decisionId: 'd' }),
    ).rejects.toThrow('commit failed');
    expect(s.text()).toBe('work 30m');
    expect(s.addedWorkout()).toBeNull();
    expect(s.state()).toBe('APPROVED');
  });
  it('does not leave plan writes applied when commit creation fails', async () => {
    const s = setup();
    s.createCommit.mockImplementation(async () => {
      throw new Error('commit failed');
    });
    await expect(
      s.service.applyDecision({ userId: 'u', decisionId: 'd' }),
    ).rejects.toThrow('commit failed');
    expect(s.text()).toBe('work 30m');
    expect(s.state()).toBe('APPROVED');
    expect(s.notify).not.toHaveBeenCalled();
  });
  it('rejects a partial multi-week proposal before storing any decision', async () => {
    const s = setup();
    const transaction = jest.fn();
    Object.assign(s.service, {
      requireBranchOwner: async () => ({
        id: 'b',
        status: 'OPEN',
        context: { planId: 'p' },
      }),
      planService: {
        getPlanDetail: async () => ({
          plan: {
            periodWeeks: 2,
            workouts: [
              { id: 'a', weekIndex: 1 },
              { id: 'b', weekIndex: 2 },
            ],
          },
        }),
      },
      prisma: { $transaction: transaction },
    });
    await expect(
      s.service.squashBranch({
        userId: 'u',
        branchId: 'b',
        decisionType: 'PLAN_WORKOUT_BATCH_UPDATE',
        payload: {
          planId: 'p',
          scope: { weekFrom: 1, weekTo: 2 },
          changes: [
            {
              workoutId: 'a',
              dto: {
                weekIndex: 1,
                dayIndex: 1,
                sportType: 'RUN',
                text: 'work 30m',
              },
            },
          ],
        },
      }),
    ).rejects.toThrow('every pending workout');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects a decision targeting a different branch plan', async () => {
    const s = setup();
    Object.assign(s.service, {
      requireBranchOwner: async () => ({
        id: 'b',
        status: 'OPEN',
        context: { planId: 'other' },
      }),
    });
    await expect(
      s.service.squashBranch({
        userId: 'u',
        branchId: 'b',
        decisionType: 'PLAN_WORKOUT_UPDATE',
        payload: { planId: 'p' },
      }),
    ).rejects.toThrow('branch plan');
  });
});
