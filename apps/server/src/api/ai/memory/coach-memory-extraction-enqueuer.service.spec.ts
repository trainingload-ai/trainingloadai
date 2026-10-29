import { CoachMemoryExtractionEnqueuer } from './coach-memory-extraction-enqueuer.service';
import { describe, expect, it, jest } from '@jest/globals';

describe('CoachMemoryExtractionEnqueuer', () => {
  const input = {
    userId: 'user-1',
    sessionId: 'session-1',
    sourceMessageId: 'message-1',
    content: 'I slept badly last night.',
  };

  function setup(args: { consent: boolean; preference?: boolean }) {
    const upsert = jest.fn(async () => ({ id: 'job-1' }));
    const isGranted = jest.fn(async () => args.consent);
    const isEnabled = jest.fn(async () => args.preference ?? true);
    const service = new CoachMemoryExtractionEnqueuer(
      { isEnabled } as never,
      { isGranted } as never,
    );
    return {
      service,
      isGranted,
      isEnabled,
      upsert,
      tx: { aiCoachMemoryExtractionJob: { upsert } } as never,
    };
  }

  it('does not enqueue after the current AI consent is withdrawn', async () => {
    const { service, tx, isEnabled, upsert } = setup({ consent: false });

    await expect(
      service.enqueueEligibleMessage({ ...input, tx }),
    ).resolves.toBe(null);
    expect(isEnabled).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('creates the idempotent job only when consent and memory are enabled', async () => {
    const { service, tx, isGranted, isEnabled, upsert } = setup({
      consent: true,
      preference: true,
    });

    await expect(
      service.enqueueEligibleMessage({ ...input, tx }),
    ).resolves.toEqual({ id: 'job-1' });
    expect(isGranted).toHaveBeenCalledWith(input.userId, tx);
    expect(isEnabled).toHaveBeenCalledWith(input.userId, tx);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceMessageId_policyVersion: expect.objectContaining({
            sourceMessageId: input.sourceMessageId,
          }),
        },
      }),
    );
  });
});
