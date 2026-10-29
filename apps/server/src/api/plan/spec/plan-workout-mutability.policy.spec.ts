import { describe, expect, it } from '@jest/globals';
import {
  PlanWorkoutMutabilityPolicy,
  workoutImmutabilityReason,
  type WorkoutMutabilityInput,
} from '../application/plan-workout-mutability.policy';

const mutableBase: WorkoutMutabilityInput = {
  planStatus: 'ACTIVE',
  workoutStatus: 'PLANNED',
  scheduledDateYmd: '2026-10-01',
  athleteTodayYmd: '2026-10-01',
  activeActivityLinkCount: 0,
  pendingSupersessionYmd: null,
};

describe('workoutImmutabilityReason', () => {
  it.each(['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED'])(
    'allows a valid future planned workout in a %s plan',
    (planStatus) => {
      expect(
        workoutImmutabilityReason({ ...mutableBase, planStatus }),
      ).toBeNull();
    },
  );

  it.each(['COMPLETED', 'CANCELLED', 'SUPERSEDED'])(
    'blocks immutable plan status %s',
    (planStatus) => {
      expect(workoutImmutabilityReason({ ...mutableBase, planStatus })).toBe(
        'PLAN_STATUS',
      );
    },
  );

  it.each(['IN_PROGRESS', 'DONE', 'SKIPPED', 'MOVED'])(
    'blocks immutable workout status %s',
    (workoutStatus) => {
      expect(workoutImmutabilityReason({ ...mutableBase, workoutStatus })).toBe(
        'WORKOUT_STATUS',
      );
    },
  );

  it('allows IN_PROGRESS to complete without making its prescription mutable', () => {
    const policy = new PlanWorkoutMutabilityPolicy();
    expect(() =>
      policy.assertMutable(
        { ...mutableBase, workoutStatus: 'IN_PROGRESS' },
        'STATUS',
      ),
    ).not.toThrow();
    expect(() =>
      policy.assertMutable(
        { ...mutableBase, workoutStatus: 'IN_PROGRESS' },
        'PRESCRIPTION',
      ),
    ).toThrow();
  });

  it('blocks any active primary or secondary activity binding', () => {
    expect(
      workoutImmutabilityReason({
        ...mutableBase,
        activeActivityLinkCount: 1,
      }),
    ).toBe('ACTIVITY_LINKED');
  });

  it('blocks historical and undated workouts for active plans', () => {
    expect(
      workoutImmutabilityReason({
        ...mutableBase,
        scheduledDateYmd: '2026-09-30',
      }),
    ).toBe('HISTORY');
    expect(
      workoutImmutabilityReason({
        ...mutableBase,
        scheduledDateYmd: null,
      }),
    ).toBe('HISTORY');
  });

  it('does not apply the active-plan history rule to drafts', () => {
    expect(
      workoutImmutabilityReason({
        ...mutableBase,
        planStatus: 'DRAFT',
        scheduledDateYmd: null,
      }),
    ).toBeNull();
  });

  it('blocks workouts covered by a scheduled successor from its cutoff date', () => {
    expect(
      workoutImmutabilityReason({
        ...mutableBase,
        scheduledDateYmd: '2026-10-07',
        pendingSupersessionYmd: '2026-10-07',
      }),
    ).toBe('PENDING_SUPERSESSION');
    expect(
      workoutImmutabilityReason({
        ...mutableBase,
        scheduledDateYmd: '2026-10-06',
        pendingSupersessionYmd: '2026-10-07',
      }),
    ).toBeNull();
  });
});
