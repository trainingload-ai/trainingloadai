import { describe, expect, it, jest } from '@jest/globals';
import { ReviewModelDeferredError } from '@/review/review-model-call-guard';
import { RollingPlanRuntimeService } from '../rolling-plan-runtime.service';

describe('rolling plan notifications', () => {
  it('discovers new work once per hour while continuing to drain the queue', async () => {
    const discover = jest.fn(async () => 0);
    const claim = jest.fn(async () => null);
    const notificationsDue = jest.fn(async () => []);
    const runtime = new RollingPlanRuntimeService(
      { discover, claim, notificationsDue } as never,
      {} as never,
      {} as never,
      {} as never,
      { isEnabled: () => true } as never,
      {} as never,
    );
    const ticks = [
      new Date('2026-11-23T15:00:00Z'),
      new Date('2026-11-23T15:05:00Z'),
      new Date('2026-11-23T15:55:00Z'),
      new Date('2026-11-23T16:00:00Z'),
    ];

    for (const now of ticks) await runtime.tick(now);

    expect(discover.mock.calls).toEqual([[ticks[0]], [ticks[3]]]);
    expect(claim).toHaveBeenCalledTimes(4);
    expect(notificationsDue).toHaveBeenCalledTimes(4);
  });

  it('does not send a blocked notification when a model pause interrupts the fifth claim', async () => {
    const resumeAt = new Date('2026-11-22T13:00:00Z');
    const error = new ReviewModelDeferredError(resumeAt, 'paused');
    const job = {
      id: 'job-1',
      planId: 'plan-1',
      kind: 'WEEK',
      attempts: 5,
      claimToken: 'token',
      windowStart: new Date('2026-11-23'),
    };
    const fail = jest.fn(async () => 'RETRY');
    const ensureNotification = jest.fn();
    const runtime = new RollingPlanRuntimeService(
      {
        notificationsDue: async () => [],
        discover: async () => undefined,
        claim: jest.fn().mockReturnValueOnce(job).mockReturnValue(null),
        prepare: async () => {
          throw error;
        },
        fail,
        statusForNotification: async () => ({ userId: 'user-1', lang: 'zh' }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { isEnabled: () => true, require: () => undefined } as never,
      { ensureNotification } as never,
    );

    await runtime.tick();

    expect(fail).toHaveBeenCalledWith(job, error, resumeAt);
    expect(ensureNotification).not.toHaveBeenCalled();
  });
});
