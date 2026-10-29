import { describe, expect, it, jest } from '@jest/globals';
import { CoachDecisionState } from '@prisma/client';
import { AthleteStateMemoryDecisionInvalidationService } from '../athlete-state-memory-decision-invalidation.service';

describe('AthleteStateMemoryDecisionInvalidationService', () => {
  it('supersedes only mutable Athlete State decisions for the affected user', async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const service = new AthleteStateMemoryDecisionInvalidationService({
      coachDecision: { updateMany },
    } as never);

    await service.handle({
      userId: 'athlete',
      change: 'DELETED',
      occurredAt: new Date().toISOString(),
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        state: {
          in: [
            CoachDecisionState.DRAFT,
            CoachDecisionState.PROPOSED,
            CoachDecisionState.APPROVED,
          ],
        },
        assessmentCases: { some: { userId: 'athlete' } },
      },
      data: { state: CoachDecisionState.SUPERSEDED },
    });
  });
});
