import { describe, expect, it, jest } from '@jest/globals';
import { ReviewDigestQueryService } from '../review-digest-query.service';

describe('ReviewDigestQueryService', () => {
  it('reads digest rows through the owned repository instead of prisma.reviewDigest', async () => {
    const findMany = jest.fn(async () => [
      {
        id: 'digest-1',
        periodStart: new Date('2026-08-16T16:00:00.000Z'),
        periodEnd: new Date('2026-08-17T16:00:00.000Z'),
        snapshot: { timezone: 'Asia/Shanghai' },
      },
    ]);
    const service = new ReviewDigestQueryService({
      digests: () => ({ findMany }),
    } as never);

    await expect(
      service.findManyByIdsForUser('user-1', ['digest-1']),
    ).resolves.toEqual([expect.objectContaining({ id: 'digest-1' })]);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', id: { in: ['digest-1'] } },
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        snapshot: { select: { timezone: true } },
      },
    });
  });
});
