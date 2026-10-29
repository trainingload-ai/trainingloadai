import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { PlanWriteSupport } from '../application/plan-write.support';
import { PlanWorkoutMutabilityPolicy } from '../application/plan-workout-mutability.policy';

function setup(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 'w',
    planId: 'p',
    status: 'PLANNED',
    scheduledDate: new Date('2026-10-12'),
    links: [],
    plan: { userId: 'owner', status: 'ACTIVE', supersededBy: null },
    ...overrides,
  };
  const service = Object.create(PlanWriteSupport.prototype) as PlanWriteSupport;
  Object.assign(service, {
    workouts: { findUnique: jest.fn(async () => row) },
    userService: { getPreferredTimezone: jest.fn(async () => 'Asia/Shanghai') },
    workoutMutability: new PlanWorkoutMutabilityPolicy(),
    buildWorkoutLinksInclude: () => ({}),
    buildStrengthExercisesInclude: () => ({}),
    attachActualLoadToWorkout: async () => undefined,
    normalizePlanWorkoutRow: (r: object) => r,
  });
  return service;
}
describe('workout detail permissions use the write policy', () => {
  afterEach(() => jest.useRealTimers());
  it('allows deleting and rescheduling an unlinked future planned workout', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-09'));
    expect(
      (await setup().getWorkoutDetail('owner', 'p', 'w')).workout.capabilities,
    ).toEqual({ delete: true, postpone: true, skip: true });
  });
  it.each([
    { status: 'DONE' },
    { status: 'SKIPPED' },
    { status: 'MOVED' },
    { links: [{ role: 'SECONDARY' }] },
    { plan: { userId: 'owner', status: 'COMPLETED' } },
    {
      plan: {
        userId: 'owner',
        status: 'ACTIVE',
        supersededBy: {
          status: 'SCHEDULED',
          startDate: new Date('2026-10-11'),
        },
      },
    },
  ])('protects non-editable workouts: %j', async (overrides) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-09'));
    const caps = (await setup(overrides).getWorkoutDetail('owner', 'p', 'w'))
      .workout.capabilities;
    expect(caps).toEqual({ delete: false, postpone: false, skip: false });
  });
  it('keeps historical deletion blocked but permits recording a missed session as skipped', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-13'));
    expect(
      (await setup().getWorkoutDetail('owner', 'p', 'w')).workout.capabilities,
    ).toEqual({ delete: false, postpone: false, skip: true });
  });
  it('never returns permissions for another user', async () => {
    await expect(
      setup().getWorkoutDetail('intruder', 'p', 'w'),
    ).rejects.toThrow();
  });
});
