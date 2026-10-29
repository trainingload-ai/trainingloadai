import { describe, expect, it, jest } from '@jest/globals';
import { planExecutionContextTool } from '../planExecutionContext.tool';

describe('planExecutionContextTool', () => {
  it('is available to readiness checks as an on-demand plan evidence source', () => {
    expect(planExecutionContextTool.applicableSkills).toContain(
      'readiness-check',
    );
  });

  it('returns a compact execution snapshot for the review skills', async () => {
    const buildContext = jest.fn(async () => ({
      factHash: 'fact-1',
      contextId: 'ctx-1',
      contextHeadEventSeq: 4,
      plan: { id: 'plan-1', title: 'Base', goal: '5K', status: 'ACTIVE' },
      day: {
        date: '2026-08-18',
        completionState: 'COMPLETED',
        plannedWorkouts: [
          {
            id: 'w-1',
            name: 'Easy',
            notes: null,
            text: 'E 8km',
            status: 'DONE',
            sportType: 'RUN',
            weekIndex: 2,
            dayIndex: 2,
            expectedLoad: 40,
          },
        ],
      },
      tomorrow: { date: '2026-08-19', plannedWorkouts: [] },
      nextWorkouts: [],
      recentLoad: { tsb: 4, ctl: 40, atl: 36 },
    }));
    const output = await planExecutionContextTool.execute(
      {
        session: { user: { id: 'user-1' } },
        planExecutionContext: { buildContext },
      } as never,
      { date: '2026-08-18' },
    );

    expect(buildContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        surface: 'COACH_CHAT',
        anchorDate: '2026-08-18',
      }),
    );
    expect(output).toMatchObject({
      kind: 'plan_execution_context',
      factHash: 'fact-1',
      plan: { id: 'plan-1', status: 'ACTIVE' },
      day: { completionState: 'COMPLETED' },
    });
  });
});
