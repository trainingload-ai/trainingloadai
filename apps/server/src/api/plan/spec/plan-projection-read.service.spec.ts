import { describe, expect, it, jest } from '@jest/globals';
import { PlanProjectionReadService } from '../application/plan-projection-read.service';

describe('plan load projection reads', () => {
  it('uses owned scheduled workouts and excludes drafts, paused plans and completed/moved sessions', async () => {
    const findMany = jest.fn(async () => []);
    const estimateForViewerWorkouts = jest.fn();
    const service = new PlanProjectionReadService(
      { findMany } as never,
      { estimateForViewerWorkouts } as never,
    );
    await service.list(
      'athlete-a',
      new Date('2026-11-11'),
      new Date('2026-12-09'),
      'RUN',
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'athlete-a',
          sportType: 'RUN',
          scheduledDate: {
            gte: new Date('2026-11-11'),
            lte: new Date('2026-12-09'),
          },
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          OR: [
            { planId: null },
            { plan: { status: { in: ['ACTIVE', 'SCHEDULED'] } } },
          ],
        },
      }),
    );
    expect(estimateForViewerWorkouts).not.toHaveBeenCalled();
  });
  it('reuses saved estimates and computes only missing scheduled loads through the existing read-only estimator', async () => {
    const rows = [
      { id: 'saved', estimatedLoad: 70 },
      {
        id: 'future',
        estimatedLoad: null,
        sportType: 'RUN',
        structureKind: 'ENDURANCE',
        text: 'easy 40min',
        plannedDurationSeconds: 2400,
        plannedSessionRpe: null,
      },
    ];
    const estimateForViewerWorkouts = jest.fn(async () => [
      { estimatedLoad: 44, estimatedLoadSource: 'PACE' },
    ]);
    const service = new PlanProjectionReadService(
      { findMany: jest.fn(async () => rows) } as never,
      { estimateForViewerWorkouts } as never,
    );
    const result = await service.list('athlete-a', new Date(), new Date());
    expect(result[0]).toBe(rows[0]);
    expect(result[1]).toMatchObject({
      id: 'future',
      estimatedLoad: 44,
      estimatedLoadSource: 'PACE',
    });
    expect(estimateForViewerWorkouts).toHaveBeenCalledWith('athlete-a', [
      {
        sportType: 'RUN',
        structureKind: 'ENDURANCE',
        text: 'easy 40min',
        durationSeconds: 2400,
        plannedSessionRpe: null,
      },
    ]);
  });
});
