import { Inject, Injectable } from '@nestjs/common';

import {
  ACCOUNT_DELETION_OBLIGATIONS,
  type AccountDeletionObligations,
} from '@/account-lifecycle/account-deletion-obligations.port';
import { ExternalProviderConnectionService } from '@/integrations/external-provider/external-provider-connection.service';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  AccountProviderCleanup,
  ExternalAccountDisconnect,
} from './account-provider-lifecycle.port';

/** Self-host 只清除本地凭据，不连接未启用的云端 OAuth Provider。 */
@Injectable()
export class LocalAccountProviderLifecycleService
  implements AccountProviderCleanup, ExternalAccountDisconnect
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerConnections: ExternalProviderConnectionService,
    @Inject(ACCOUNT_DELETION_OBLIGATIONS)
    private readonly obligations: AccountDeletionObligations,
  ) {}

  async disconnect(
    _provider: string,
    userId: string,
    authAccountId: string,
  ): Promise<void> {
    await this.prisma.t_user_accounts.deleteMany({
      where: { id: authAccountId, userId },
    });
  }

  async revokeAndDisconnect(
    userId: string,
    subjectHash: string,
  ): Promise<void> {
    await this.obligations.deleteRemoteIdentity(userId, subjectHash);
    await this.prisma.$transaction([
      this.providerConnections.model().updateMany({
        where: { userId },
        data: {
          status: 'REVOKED',
          credentialCiphertext: '',
          credentialLast4: null,
          credentialFingerprint: null,
          lastError: null,
          syncActivities: false,
          syncScheduledActivities: false,
          syncWellness: false,
          exportActivities: false,
          exportWellness: false,
          syncSportSettings: false,
          exportSportSettings: false,
          metadata: {
            disconnectedAt: new Date().toISOString(),
            disconnectedBy: 'account_deletion',
            remoteRevoked: false,
          },
        },
      }),
      this.prisma.t_user_accounts.updateMany({
        where: { userId },
        data: { accessToken: null, refreshToken: null, idToken: null },
      }),
    ]);
  }
}
