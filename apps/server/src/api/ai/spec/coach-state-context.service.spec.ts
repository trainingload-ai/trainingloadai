import { describe, expect, it, jest } from '@jest/globals';
import { CoachStateContextService } from '../coach-state-context.service';

function decision(
  state: string,
  payload: Record<string, unknown>,
  index: number,
) {
  return {
    id: `decision-${index}`,
    state,
    decisionType: 'PLAN_WORKOUT_UPDATE',
    riskTier: 'HIGH',
    rationale: `${state} rationale`,
    confidence: 0.8,
    payload,
    createdAt: new Date(
      `2026-08-${String(10 + index).padStart(2, '0')}T00:00:00.000Z`,
    ),
    approvedAt:
      state === 'APPROVED' ? new Date('2026-08-15T01:00:00.000Z') : null,
    appliedAt:
      state === 'APPLIED' ? new Date('2026-08-15T02:00:00.000Z') : null,
    supersededByDecisionId: state === 'SUPERSEDED' ? 'decision-new' : null,
    branch: { openReason: 'runtime_day_review' },
    options: [{ optionKey: 'apply', title: '采用调整' }],
  };
}

describe('CoachStateContextService', () => {
  it('projects every decision state and recent review into a compact today context', async () => {
    const prisma = {
      coachDecision: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          decision('DRAFT', { targetDate: '2026-08-15' }, 0),
          decision(
            'PROPOSED',
            {
              workoutId: 'workout-1',
              workoutName: 'Recovery run',
              adjustment: {
                kind: 'RESCHEDULE_MISSED',
                before: { date: '2026-08-14', summary: '20 min easy' },
                after: { date: '2026-08-15', summary: '20 min easy' },
              },
            },
            1,
          ),
          decision('APPROVED', { targetDate: '2026-08-16' }, 2),
          decision('REJECTED', { targetDate: '2026-08-14' }, 3),
          decision('APPLIED', { targetDate: '2026-08-18' }, 4),
          decision('SUPERSEDED', {}, 5),
        ]),
      },
    };
    const service = new CoachStateContextService(prisma as never);

    const result = await service.build({
      userId: 'user-1',
      contextId: 'context-1',
      anchorDate: '2026-08-15',
      recentEvents: [
        {
          seq: 9,
          type: 'REVIEW_DAILY',
          occurredAt: '2026-08-15T00:30:00.000Z',
          payload: {
            outcome: 'PROPOSE',
            decision: 'ADJUST',
            action: 'RESCHEDULE_MISSED',
            rationale:
              'Yesterday was missed, so consider a short recovery run.',
            targetWorkoutId: 'workout-1',
            targetDate: '2026-08-15',
            evidenceCodes: ['MISSED_WORKOUT'],
            composition: { large: 'payload omitted from projection' },
          },
        },
        {
          seq: 10,
          type: 'WORKOUT_LINKED',
          occurredAt: '2026-08-15T01:00:00.000Z',
          payload: {},
        },
      ],
    });

    expect(prisma.coachDecision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          contextId: 'context-1',
          context: { userId: 'user-1' },
        },
        take: 8,
      }),
    );
    expect(result.decisions.map((row) => row.stateRole)).toEqual([
      'INTERNAL_DRAFT',
      'ACTIVE_PROPOSAL',
      'ACTIVE_PROPOSAL',
      'REJECTED_HISTORY',
      'APPLIED_HISTORY',
      'SUPERSEDED_HISTORY',
    ]);
    expect(result.decisionReadStatus).toBe('AVAILABLE');
    expect(result.decisions.map((row) => row.relevance)).toEqual([
      'TODAY',
      'TODAY',
      'TOMORROW',
      'PAST',
      'FUTURE',
      'UNKNOWN',
    ]);
    expect(result.decisions[1]).toMatchObject({
      target: {
        workoutId: 'workout-1',
        workoutName: 'Recovery run',
        targetDate: '2026-08-15',
      },
      adjustment: {
        kind: 'RESCHEDULE_MISSED',
        before: { date: '2026-08-14', summary: '20 min easy' },
        after: { date: '2026-08-15', summary: '20 min easy' },
      },
    });
    expect(result.recentReviews).toEqual([
      expect.objectContaining({
        seq: 9,
        type: 'REVIEW_DAILY',
        outcome: 'PROPOSE',
        action: 'RESCHEDULE_MISSED',
        evidenceCodes: ['MISSED_WORKOUT'],
      }),
    ]);
    expect(JSON.stringify(result.recentReviews)).not.toContain('composition');
  });

  it('keeps review context available when the decision read fails', async () => {
    const prisma = {
      coachDecision: {
        findMany: jest
          .fn<() => Promise<unknown[]>>()
          .mockRejectedValue(new Error('database unavailable')),
      },
    };
    const service = new CoachStateContextService(prisma as never);

    const result = await service.build({
      userId: 'user-1',
      contextId: 'context-1',
      anchorDate: '2026-08-15',
      recentEvents: [
        {
          seq: 1,
          type: 'REVIEW_WEEKLY',
          occurredAt: '2026-08-15T00:00:00.000Z',
          payload: {
            outcome: 'KEEP_WITH_GUIDANCE',
            rationale: 'Keep the next session easy.',
          },
        },
      ],
    });

    expect(result.decisions).toEqual([]);
    expect(result.decisionReadStatus).toBe('UNAVAILABLE');
    expect(result.recentReviews).toEqual([
      expect.objectContaining({
        type: 'REVIEW_WEEKLY',
        outcome: 'KEEP_WITH_GUIDANCE',
      }),
    ]);
  });
});
