import { describe, expect, it } from '@jest/globals';
import {
  isActivityWithinGlobalRefreshWindow,
  selectActivityGlobalRefreshScope,
} from '@/utils/activity-global-refresh-window';

describe('selectActivityGlobalRefreshScope', () => {
  it('only includes activities from the latest 60 days', () => {
    const scope = selectActivityGlobalRefreshScope(
      [
        { sportType: 'RUN', startTime: '2026-06-08T00:00:00.000Z' },
        { sportType: 'CYCLING', startTime: '2026-06-07T23:59:59.999Z' },
        { sportType: 'SWIM', startTime: '2026-08-01T00:00:00.000Z' },
      ],
      new Date('2026-08-07T00:00:00.000Z'),
    );

    expect(scope.windowDays).toBe(60);
    expect(scope.eligibleCount).toBe(2);
    expect(scope.sportTypes).toEqual(['RUN', 'SWIM']);
    expect(scope.recomputeFrom?.toISOString()).toBe('2026-06-08T00:00:00.000Z');
    expect(scope.recomputeTo?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('uses the same inclusive boundary for single-activity mutations', () => {
    const now = new Date('2026-08-07T00:00:00.000Z');
    expect(
      isActivityWithinGlobalRefreshWindow('2026-06-08T00:00:00.000Z', now),
    ).toBe(true);
    expect(
      isActivityWithinGlobalRefreshWindow('2026-06-07T23:59:59.999Z', now),
    ).toBe(false);
  });

  it('recent legacy activity without sport type still refreshes global PMC', () => {
    const scope = selectActivityGlobalRefreshScope(
      [{ sportType: null, startTime: new Date('2026-07-15T00:00:00.000Z') }],
      new Date('2026-08-07T00:00:00.000Z'),
    );

    expect(scope.eligibleCount).toBe(1);
    expect(scope.sportTypes).toEqual([]);
    expect(scope.recomputeFrom?.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });
});
