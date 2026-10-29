import { describe, expect, it, jest } from '@jest/globals';
import { SESSION_ONLY_METADATA } from '@/oauth/session-only.decorator';
import { SelfHostSessionController } from './self-host-session.controller';

describe('SelfHostSessionController', () => {
  it('requires a browser session and returns the authenticated user policy', async () => {
    const getSessionPolicy = jest.fn(async () => ({
      schemaVersion: 1 as const,
      accessMode: 'local-owner' as const,
      isOwner: true,
      canSignOut: false,
      canDeleteAccount: false,
    }));
    const controller = new SelfHostSessionController({
      getSessionPolicy,
      toHttpException: (error: unknown) => error,
    } as never);

    expect(
      Reflect.getMetadata(SESSION_ONLY_METADATA, SelfHostSessionController),
    ).toBe(true);
    await expect(controller.policy('owner-1')).resolves.toMatchObject({
      isOwner: true,
      canSignOut: false,
      canDeleteAccount: false,
    });
    expect(getSessionPolicy).toHaveBeenCalledWith('owner-1');
  });
});
