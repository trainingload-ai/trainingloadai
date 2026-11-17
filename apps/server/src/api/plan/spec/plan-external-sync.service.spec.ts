import { PlanExternalSyncService } from '../application/plan-external-sync.service';

function fixture() {
  const row = {
    id: 'workout',
    userId: 'user',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-02T00:00:00Z'),
    revision: 3,
    status: 'PLANNED',
    planId: null,
    plan: null,
    links: [],
    steps: [],
  };
  const tx = { transaction: true };
  const prisma = { $transaction: jest.fn(async (work) => work(tx)) };
  const workouts = {
    findFirst: jest.fn(async () => row),
    findUnique: jest.fn(async () => row),
    findMany: jest.fn(async () => []),
    create: jest.fn(async () => row),
    update: jest.fn(async () => row),
    deleteMany: jest.fn(async () => ({ count: 1 })),
  };
  const links = {
    findFirst: jest.fn(async () => null),
    deleteSteps: jest.fn(async () => undefined),
    createMapping: jest.fn(async () => ({ id: 'mapping' })),
  };
  const estimator = { applyForWorkout: jest.fn(async () => undefined) };
  const service = new PlanExternalSyncService(
    prisma as never,
    { buildWorkoutPlanSteps: () => [] } as never,
    estimator as never,
    {} as never,
    workouts as never,
    links as never,
    {} as never,
    {} as never,
  );
  return { row, tx, prisma, workouts, links, estimator, service };
}

describe('PlanExternalSyncService synchronization persistence', () => {
  it('creates the imported course and its identity mapping in the same transaction', async () => {
    const f = fixture();
    const initialize = jest.fn(() => ({
      userId: 'user',
      provider: 'intervals_icu',
      externalEventId: '100',
      planWorkoutId: 'workout',
    }));
    await f.service.createIndependentWorkout(
      {
        userId: 'user',
        scheduledDate: new Date('2026-07-06'),
        sportType: 'RUN',
        blocks: [],
      },
      initialize as never,
    );
    expect(f.workouts.create).toHaveBeenCalledWith(expect.anything(), f.tx);
    expect(f.links.createMapping).toHaveBeenCalledWith(
      { data: initialize.mock.results[0].value },
      f.tx,
    );
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'returns the final timestamp after load estimation, mapping=%s',
    async (withMapping) => {
      const f = fixture();
      const original = { ...f.row };
      f.workouts.create.mockResolvedValue(original);
      f.estimator.applyForWorkout.mockImplementation(async () => {
        f.row.updatedAt = new Date('2026-07-02T00:00:00.100Z');
      });
      const result = await f.service.createIndependentWorkout(
        {
          userId: 'user',
          scheduledDate: new Date('2026-07-06'),
          sportType: 'RUN',
          blocks: [],
        },
        withMapping
          ? ((() => ({
              userId: 'user',
              provider: 'intervals_icu',
              externalEventId: '100',
            })) as never)
          : undefined,
      );
      expect(result.updatedAt).toEqual(f.row.updatedAt);
      expect(result.revision).toBe(original.revision);
      expect(f.workouts.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'workout', userId: 'user' } }),
        f.tx,
      );
    },
  );

  it('fails the transaction when mapping persistence fails', async () => {
    const f = fixture();
    f.links.createMapping.mockRejectedValue(new Error('mapping failed'));
    await expect(
      f.service.createIndependentWorkout(
        {
          userId: 'user',
          scheduledDate: new Date('2026-07-06'),
          sportType: 'RUN',
          blocks: [],
        },
        (() => ({})) as never,
      ),
    ).rejects.toThrow('mapping failed');
  });

  it('deletes only the exact inspected revision', async () => {
    const f = fixture();
    await expect(
      f.service.deleteSyncedWorkout({
        userId: 'user',
        workoutId: f.row.id,
        updatedAt: f.row.updatedAt,
        revision: 3,
      }),
    ).resolves.toBe('deleted');
    expect(f.workouts.deleteMany).toHaveBeenCalledWith(
      {
        where: {
          id: f.row.id,
          userId: 'user',
          updatedAt: f.row.updatedAt,
          revision: 3,
        },
      },
      f.tx,
    );
  });

  it.each(['revision', 'updatedAt'])(
    'preserves a course whose %s changed after verification',
    async (field) => {
      const f = fixture();
      const input = {
        userId: 'user',
        workoutId: f.row.id,
        updatedAt: f.row.updatedAt,
        revision: 3,
      };
      if (field === 'revision') input.revision = 2;
      else input.updatedAt = new Date('2026-07-01');
      await expect(f.service.deleteSyncedWorkout(input)).resolves.toBe(
        'changed',
      );
      expect(f.workouts.deleteMany).not.toHaveBeenCalled();
    },
  );

  it('preserves a revision changed after the initial transaction read', async () => {
    const f = fixture();
    f.workouts.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      f.service.deleteSyncedWorkout({
        userId: 'user',
        workoutId: f.row.id,
        revision: 3,
      }),
    ).resolves.toBe('changed');
  });

  it.each(['DONE', 'SKIPPED'])('preserves %s history', async (status) => {
    const f = fixture();
    f.row.status = status;
    await expect(
      f.service.deleteSyncedWorkout({ userId: 'user', workoutId: f.row.id }),
    ).resolves.toBe('protected');
    expect(f.workouts.deleteMany).not.toHaveBeenCalled();
  });

  it('preserves an active activity association', async () => {
    const f = fixture();
    f.links.findFirst.mockResolvedValue({ id: 'link' } as never);
    await expect(
      f.service.deleteSyncedWorkout({ userId: 'user', workoutId: f.row.id }),
    ).resolves.toBe('protected');
    expect(f.workouts.deleteMany).not.toHaveBeenCalled();
  });
});
