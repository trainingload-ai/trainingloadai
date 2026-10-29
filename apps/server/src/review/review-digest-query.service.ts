import { Injectable } from '@nestjs/common';
import { ReviewDigestRepository } from './persistence/review-digest.repository';

/**
 * Digest 只读口。给 AI 会话列表 / Admin 报表用，避免 AiModule ↔ ReviewModule 环。
 */
@Injectable()
export class ReviewDigestQueryService {
  constructor(private readonly digests: ReviewDigestRepository) {}

  findManyByIdsForUser(
    userId: string,
    ids: string[],
  ): Promise<
    Array<{
      id: string;
      periodStart: Date;
      periodEnd: Date;
      snapshot: { timezone: string | null } | null;
    }>
  > {
    if (ids.length === 0) return Promise.resolve([]);
    return this.digests.digests().findMany({
      where: { userId, id: { in: ids } },
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        snapshot: { select: { timezone: true } },
      },
    });
  }

  findUniqueAiSummary(id: string) {
    return this.digests.digests().findUnique({
      where: { id },
      select: { aiSummaryMarkdown: true, title: true },
    });
  }

  countCreatedBetween(start: Date, end: Date) {
    return this.digests.digests().count({
      where: { createdAt: { gte: start, lt: end } },
    });
  }
}
