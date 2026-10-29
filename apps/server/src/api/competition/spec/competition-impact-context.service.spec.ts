import { describe, expect, it, jest } from '@jest/globals';
import {
  CompetitionGoalType,
  CompetitionImportance,
  SportType,
} from '@prisma/client';
import { CompetitionImpactContextService } from '../competition-impact-context.service';
import { CompetitionRepository } from '../persistence/competition.repository';
import { ActivityReadService } from '@/api/activity/activity-read.service';

const asyncMock = (value: unknown) =>
  jest.fn<() => Promise<unknown>>().mockResolvedValue(value);

describe('CompetitionImpactContextService', () => {
  it('uses interval overlap and a future lookahead instead of plan containment', async () => {
    const eventFindMany = asyncMock([
      {
        id: 'event-1',
        version: 1,
        title: 'Race after plan',
        sportType: SportType.RUN,
        sportDefinitionCode: null,
        distanceMeters: 42195,
        startDate: new Date('2026-08-23T00:00:00.000Z'),
        endDate: null,
        importance: CompetitionImportance.CRITICAL,
        goalType: CompetitionGoalType.FINISH,
        targetTimeSeconds: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);
    const prisma = {
        competitionEvent: { findMany: eventFindMany },
        activity: { findMany: asyncMock([]) },
      };
    const service = new CompetitionImpactContextService(
      prisma as never,
      { listFitnessWindow: asyncMock([]) } as never,
      new CompetitionRepository(prisma as never),
      new ActivityReadService(prisma as never),
    );

    const result = await service.buildInput({
      userId: 'user-1',
      scopeType: 'PLAN_EXECUTION',
      scopeStartDate: '2026-07-01',
      scopeEndDate: '2026-08-20',
      anchorDate: '2026-07-16',
      locale: 'zh-hant',
    });

    expect(result.locale).toBe('zh-hant');
    expect(result.events[0].startDate).toBe('2026-08-23');
    expect(eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startDate: { lte: new Date('2027-08-19T00:00:00.000Z') },
          OR: expect.arrayContaining([
            expect.objectContaining({ endDate: { gte: expect.any(Date) } }),
          ]),
        }),
      }),
    );
  });
});
