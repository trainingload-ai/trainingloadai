import { describe, expect, it, jest } from '@jest/globals';
import { ReviewModelDeferredError } from '@/review/review-model-call-guard';
import { RollingPlanRuntimeService } from '../rolling-plan-runtime.service';

describe('rolling plan notifications', () => {
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
