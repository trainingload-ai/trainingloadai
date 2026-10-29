import { describe, expect, it, jest } from '@jest/globals';
import {
  coachRuntimeOptionTitle,
  coachRuntimeText,
} from '../coach-runtime-copy';

describe('coachRuntimeCopy', () => {
  it('looks up copy by locale instead of zh/en branching', () => {
    const i18n = {
      t: jest.fn(() => '1日延期'),
    };

    expect(
      coachRuntimeOptionTitle(
        i18n as never,
        'ja',
        'PLAN_WORKOUT_POSTPONE',
        true,
      ),
    ).toBe('1日延期');
    expect(i18n.t).toHaveBeenCalledWith(
      'common.coachRuntime.optionPostponeOneDay',
      { lang: 'ja', args: undefined },
    );
  });

  it('interpolates cycle copy args', () => {
    const i18n = {
      t: jest.fn(
        (_key: string, opts?: { args?: Record<string, string | number> }) =>
          `done:${opts?.args?.planTitle}:${opts?.args?.completionRate}`,
      ),
    };

    expect(
      coachRuntimeText(i18n as never, 'de', 'cycleRationale', {
        planTitle: 'Base',
        completionRate: '80',
      }),
    ).toBe('done:Base:80');
  });
});
