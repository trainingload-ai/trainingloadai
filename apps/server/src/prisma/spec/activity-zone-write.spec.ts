import { describe, expect, it, jest } from '@jest/globals';
import { ZoneType } from '@prisma/client';
import { replaceActivityZoneRows } from '../activity-zone-write';
import { ACTIVITY_WRITE_LOCK_SQL } from '../activity-write-lock';

function createPrismaMock() {
  const tx = {
    $executeRawUnsafe: jest.fn(async () => 1),
    activityZone: {
      deleteMany: jest.fn(async () => ({ count: 1 })),
      createMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    },
  };
}

describe('replaceActivityZoneRows', () => {
  it('serializes delete and insert with the canonical activity write lock', async () => {
    const { prisma, tx } = createPrismaMock();

    await replaceActivityZoneRows(prisma as never, {
      activityId: 42,
      zoneType: ZoneType.POWER,
      rows: [
        {
          activityId: 999,
          zoneType: ZoneType.PACE,
          order: 4,
          name: 'Z4',
        },
      ],
    });

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      ACTIVITY_WRITE_LOCK_SQL,
      42,
    );
    expect(tx.activityZone.deleteMany).toHaveBeenCalledWith({
      where: { activityId: 42, zoneType: ZoneType.POWER },
    });
    expect(tx.activityZone.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          activityId: 42,
          zoneType: ZoneType.POWER,
          order: 4,
        }),
      ],
    });
    expect(tx.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      tx.activityZone.deleteMany.mock.invocationCallOrder[0]!,
    );
    expect(tx.activityZone.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.activityZone.createMany.mock.invocationCallOrder[0]!,
    );
  });

  it('still locks and deletes when the replacement is empty', async () => {
    const { prisma, tx } = createPrismaMock();

    await replaceActivityZoneRows(prisma as never, {
      activityId: 42,
      zoneType: ZoneType.HEART_RATE,
      rows: [],
    });

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      ACTIVITY_WRITE_LOCK_SQL,
      42,
    );
    expect(tx.activityZone.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.activityZone.createMany).not.toHaveBeenCalled();
  });
});
