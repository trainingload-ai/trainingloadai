import { describe, expect, it, jest } from '@jest/globals';
import { ExternalProviderOAuthStateService } from '../external-provider-oauth-state.service';
import { ExternalOAuthStateRepository } from '../persistence/external-oauth-state.repository';

describe('ExternalProviderOAuthStateService', () => {
  it('stores only a hash and consumes the state once', async () => {
    const create = jest.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'state-1',
      ...args.data,
    }));
    const findUnique = jest.fn(async () => ({
      id: 'state-1',
      userId: 'user-1',
      provider: 'suunto',
      payload: { returnUrl: 'https://app.example/account' },
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    }));
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const service = new ExternalProviderOAuthStateService(new ExternalOAuthStateRepository({
      externalOAuthState: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
        create,
        findUnique,
        updateMany,
      },
    } as never));

    const state = await service.issue({
      userId: 'user-1',
      provider: 'suunto',
      payload: { returnUrl: 'https://app.example/account' },
    });
    expect(state).toHaveLength(43);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stateHash: expect.not.stringContaining(state),
      }),
    });

    await expect(service.consume('suunto', state)).resolves.toMatchObject({
      userId: 'user-1',
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'state-1',
          consumedAt: null,
        }),
      }),
    );
  });

  it('rejects provider mismatch before token exchange', async () => {
    const service = new ExternalProviderOAuthStateService(new ExternalOAuthStateRepository({
      externalOAuthState: {
        findUnique: jest.fn(async () => ({
          id: 'state-1',
          provider: 'wahoo',
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        })),
      },
    } as never));
    await expect(service.consume('suunto', 'state')).rejects.toThrow();
  });
});
