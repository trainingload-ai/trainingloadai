import { describe, expect, it, jest } from '@jest/globals';
import { CoachAssessmentFollowupService } from './coach-assessment-followup.service';

describe('CoachAssessmentFollowupService', () => {
  it('does not scan follow-ups when AI is disabled', async () => {
    const findMany = jest.fn();
    const service = new CoachAssessmentFollowupService(
      {
        coachAssessmentCase: { findMany },
      } as never,
      { followupEnabled: () => true } as never,
      { assess: jest.fn() } as never,
      { isEnabled: jest.fn(() => false) } as never,
    );

    await service.poll();

    expect(findMany).not.toHaveBeenCalled();
  });

  it('starts a fresh assessment for due resolved guidance', async () => {
    const findMany = jest
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValueOnce([
        {
          id: 'case-1',
          userId: 'athlete',
          revision: 2,
          status: 'RESOLVED',
        },
      ])
      .mockResolvedValueOnce([]);
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const assess = jest.fn(async () => ({}));
    const service = new CoachAssessmentFollowupService(
      {
        coachAssessmentCase: { findMany, updateMany },
        coachAssessmentQuestion: { updateMany: jest.fn() },
        $transaction: jest.fn(),
      } as never,
      { followupEnabled: () => true } as never,
      { assess } as never,
    );

    await service.poll();

    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { status: 'DECISION_READY', decisionId: null },
            { status: 'RESOLVED' },
          ]),
        }),
      }),
    );
    expect(assess).toHaveBeenCalledWith({
      userId: 'athlete',
      triggerType: 'FOLLOW_UP',
      triggerRef: 'case-1',
      preserveCaseId: undefined,
    });
  });
});
