import { describe, expect, it, jest } from '@jest/globals';
import { PlanWriteSupport } from '../application/plan-write.support';

function setup() {
  let rows = [
    {
      id: 'a',
      dayOffset: 0,
      sessionIndex: 1,
      text: 'work 30m',
      status: 'PLANNED',
    },
    {
      id: 'b',
      dayOffset: 1,
      sessionIndex: 1,
      text: 'work 40m',
      status: 'PLANNED',
    },
  ];
  const plan = {
    id: 'p',
    status: 'DRAFT',
    periodWeeks: 2,
    generationMetadata: {},
  };
  const tx = {};
  const service = Object.create(PlanWriteSupport.prototype) as PlanWriteSupport;
  const notify = jest.fn(async () => undefined);
  const quality = jest.fn(() => ({ valid: true, issues: [] }));
  const updateWorkout = jest.fn(
    async (
      _u: string,
      _p: string,
      id: string,
      dto: { dayIndex: number; text: string },
      _meta: unknown,
      options: { tx: unknown },
    ) => {
      expect(options.tx).toBe(tx);
      if (dto.text === 'invalid') throw new Error('invalid definition');
      const row = rows.find((w) => w.id === id)!;
      Object.assign(row, {
        dayOffset: dto.dayIndex - 1,
        text: dto.text,
        sessionIndex: 1,
      });
      return { workout: { ...row } };
    },
  );
  Object.assign(service, {
    prisma: {
      $transaction: jest.fn(async (run: (t: unknown) => Promise<unknown>) => {
        const snapshot = structuredClone(rows);
        try {
          return await run(tx);
        } catch (e) {
          rows = snapshot;
          throw e;
        }
      }),
    },
    assertPlanOwnership: async () => plan,
    assertWorkoutOwnership: async (_u: string, _p: string, id: string) => {
      const row = rows.find((w) => w.id === id);
      if (!row) throw new Error('not owned');
      return { ...row, plan, links: [] };
    },
    userService: {
      getPreferredTimezone: jest.fn(async () => 'UTC'),
    },
    workoutMutability: { assertMutable: jest.fn() },
    assertWorkoutHasNoActivityLink: jest.fn(async () => undefined),
    normalizePlanWorkoutRow: (row: object) => ({ ...row }),
    toDayOffset: (week: number, day: number) => (week - 1) * 7 + day - 1,
    workouts: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: object;
      }) => Object.assign(rows.find((w) => w.id === where.id)!, data),
    },
    plans: {
      findUnique: async () => ({ ...plan, workouts: rows }),
      update: async () => ({}),
    },
    buildPlanInclude: () => ({}),
    validateStoredPlanQuality: quality,
    updateWorkout,
    emitDraftChanged: notify,
  });
  const changes = [
    {
      workoutId: 'a',
      dto: { weekIndex: 1, dayIndex: 2, sportType: 'RUN', text: 'work 20m' },
    },
    {
      workoutId: 'b',
      dto: { weekIndex: 1, dayIndex: 1, sportType: 'RUN', text: 'work 25m' },
    },
  ] as Parameters<PlanWriteSupport['updateWorkouts']>[2];
  return { service, rows: () => rows, changes, updateWorkout, notify, quality };
}

describe('atomic plan workout batch', () => {
  it('uses one transaction for swaps, reads back all results and notifies after commit', async () => {
    const s = setup();
    const result = await s.service.updateWorkouts('u', 'p', s.changes);
    expect(result.before.map((w) => w.text)).toEqual(['work 30m', 'work 40m']);
    expect(result.after.map((w) => w.text)).toEqual(['work 20m', 'work 25m']);
    expect(s.rows().map((w) => w.sessionIndex)).toEqual([1, 1]);
    expect(s.quality).toHaveBeenCalledTimes(1);
    expect(s.notify).toHaveBeenCalledTimes(1);
  });
  it('rolls back earlier rows and temporary positions when a later workout fails', async () => {
    const s = setup();
    s.changes[1].dto.text = 'invalid';
    await expect(s.service.updateWorkouts('u', 'p', s.changes)).rejects.toThrow(
      'invalid definition',
    );
    expect(s.rows().map((w) => [w.text, w.sessionIndex])).toEqual([
      ['work 30m', 1],
      ['work 40m', 1],
    ]);
    expect(s.notify).not.toHaveBeenCalled();
  });
  it('rolls back every change on final-plan quality failure', async () => {
    const s = setup();
    s.quality.mockImplementation(() => {
      throw new Error('quality');
    });
    await expect(s.service.updateWorkouts('u', 'p', s.changes)).rejects.toThrow(
      'quality',
    );
    expect(s.rows()[0].text).toBe('work 30m');
    expect(s.notify).not.toHaveBeenCalled();
  });
  it('rejects foreign and duplicate IDs without updating any workout', async () => {
    const s = setup();
    await expect(
      s.service.updateWorkouts('u', 'p', [s.changes[0], s.changes[0]]),
    ).rejects.toThrow();
    await expect(
      s.service.updateWorkouts('u', 'p', [
        { ...s.changes[0], workoutId: 'foreign' },
      ]),
    ).rejects.toThrow('not owned');
    expect(s.updateWorkout).not.toHaveBeenCalled();
  });
});
