import { describe, expect, it } from '@jest/globals';
import type { ThirdPartyProvider } from '@prisma/client';
import { ExternalProviderConnectionService } from '../external-provider-connection.service';
import { ExternalProviderConnectionRepository } from '../persistence/external-provider-connection.repository';

describe('ExternalProviderConnectionService model port', () => {
  it('finds a connection through the repository accessor', async () => {
    const findUnique = async (args: {
      where: { userId_provider: { userId: string; provider: string } };
    }) => ({
      id: 'conn-1',
      userId: args.where.userId_provider.userId,
    });
    const service = new ExternalProviderConnectionService({
      externalProviderConnection: { findUnique },
    } as never, new ExternalProviderConnectionRepository({
      externalProviderConnection: { findUnique },
    } as never));
    await expect(
      service.find('user-1', 'strava' as ThirdPartyProvider),
    ).resolves.toEqual({
      id: 'conn-1',
      userId: 'user-1',
    });
  });
});
