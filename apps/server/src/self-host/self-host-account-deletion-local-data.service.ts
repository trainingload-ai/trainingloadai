import { Injectable } from '@nestjs/common';

import type { AccountDeletionLocalData } from '@/account-lifecycle/account-deletion-local-data.port';
import { SelfHostBootstrapService } from './self-host-bootstrap.service';

@Injectable()
export class SelfHostAccountDeletionLocalDataService
  implements AccountDeletionLocalData
{
  constructor(private readonly bootstrap: SelfHostBootstrapService) {}

  async revokeLocalCredentials() {
    // Self-host local-owner sessions are revoked by the Core deletion flow.
  }

  async beforeUserDeletion(
    args: Parameters<AccountDeletionLocalData['beforeUserDeletion']>[0],
  ) {
    await this.bootstrap.resetForLocalOwnerDeletion(args.tx, args.userId);
  }
}
