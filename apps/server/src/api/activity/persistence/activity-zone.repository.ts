import { Prisma, ZoneType } from '@prisma/client';
import type { PrismaService } from '@/prisma/prisma.service';
import { acquireActivityWriteLock } from '@/prisma/activity-write-lock';

export async function replaceActivityZoneRows(
  prisma: PrismaService,
  args: {
    activityId: number;
    zoneType: ZoneType;
    rows: Prisma.ActivityZoneCreateManyInput[];
  },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
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
  });
}
