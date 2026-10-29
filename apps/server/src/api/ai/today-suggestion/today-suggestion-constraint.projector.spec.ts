import {
  TODAY_SUGGESTION_NEW_WORKOUT_CUTOFF_LOCAL_MINUTES,
  todaySuggestionTimeContext,
  todaySuggestionValidUntil,
} from './today-suggestion-constraint.projector';

describe('today suggestion local time context', () => {
  it('closes new workout creation at 20:00 local time', () => {
    const context = todaySuggestionTimeContext(
      '2026-10-28',
      'Asia/Shanghai',
      new Date('2026-10-28T12:00:00.000Z'),
    );

    expect(context.localTime).toBe('20:00');
    expect(context.minutesUntilDayEnd).toBe(240);
    expect(context.newWorkoutWindowOpen).toBe(false);
    expect(TODAY_SUGGESTION_NEW_WORKOUT_CUTOFF_LOCAL_MINUTES).toBe(1200);
  });

  it('keeps the window open before 20:00 and resolves local midnight correctly', () => {
    const context = todaySuggestionTimeContext(
      '2026-10-28',
      'Asia/Shanghai',
      new Date('2026-10-28T11:59:00.000Z'),
    );

    expect(context.localTime).toBe('19:59');
    expect(context.minutesUntilDayEnd).toBe(241);
    expect(context.newWorkoutWindowOpen).toBe(true);
    expect(todaySuggestionValidUntil('2026-10-28', 'Asia/Shanghai')).toEqual(
      new Date('2026-10-28T16:00:00.000Z'),
    );
  });
});
