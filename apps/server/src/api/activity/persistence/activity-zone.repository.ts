import { Prisma, ZoneType } from '@prisma/client';
import type { PrismaService } from '@/prisma/prisma.service';
import { acquireActivityWriteLock } from '@/prisma/activity-write-lock';
import type { PrismaTx } from '@/prisma/prisma-db';

export async function replaceActivityZoneRows(
  prisma: PrismaService | PrismaTx,
  args: {
    activityId: number;
    zoneType: ZoneType;
    rows: Prisma.ActivityZoneCreateManyInput[];
  },
): Promise<void> {
  const replace = async (tx: PrismaTx) => {
    await acquireActivityWriteLock(tx, args.activityId);
    await tx.activityZone.deleteMany({
      where: {
        activityId: args.activityId,
        zoneType: args.zoneType,
      },
    });
    if (args.rows.length === 0) return;
    await tx.activityZone.createMany({
      data: args.rows.map((row) => ({
        ...row,
        activityId: args.activityId,
        zoneType: args.zoneType,
      })),
    });
  };
  if ('$transaction' in prisma) {
    await prisma.$transaction(replace);
    return;
  }
  await replace(prisma);
}
