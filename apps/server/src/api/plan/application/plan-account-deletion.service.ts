import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '@/prisma/prisma-db';
import { PlanAccountDeletionRepository } from '../persistence/plan-account-deletion.repository';

/** 账户删除流程可调用的窄接口，Plan capability 仍拥有分享数据写入。 */
@Injectable()
export class PlanAccountDeletionService {
  constructor(private readonly repository: PlanAccountDeletionRepository) {}

  revokeOwnedUnlistedShares(
    tx: PrismaTx,
    ownerUserId: string,
    revokedAt: Date,
  ) {
    return this.repository.revokeOwnedUnlistedShares(
      tx,
      ownerUserId,
      revokedAt,
    );
  }
}
