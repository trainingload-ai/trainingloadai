import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '@/prisma/prisma-db';

@Injectable()
export class PlanAccountDeletionRepository {
  async revokeOwnedUnlistedShares(
    tx: PrismaTx,
    ownerUserId: string,
    revokedAt: Date,
  ) {
    const lineages = await tx.planShareLineage.findMany({
      where: {
        ownerUserId,
        visibility: 'UNLISTED',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    const lineageIds = lineages.map((row) => row.id);
    if (!lineageIds.length) return;

    await tx.planShare.updateMany({
      where: { lineageId: { in: lineageIds }, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt },
    });
    await tx.planShareLineage.updateMany({
      where: { id: { in: lineageIds } },
      data: { status: 'REVOKED', revokedAt, headShareId: null },
    });
  }
}
