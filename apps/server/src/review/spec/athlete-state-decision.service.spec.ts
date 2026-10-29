import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AthleteStateDecisionService } from '../athlete-state-decision.service';

const target = {
  id: 'workout-1',
  date: '2026-10-13',
  weekIndex: 2,
  dayIndex: 2,
  sessionIndex: 1,
  sportType: 'RUN',
  status: 'PLANNED',
  executionStatus: 'ACTIONABLE',
  name: 'Tempo run',
  notes: null,
  text: 'work 20m',
  structureKind: 'ENDURANCE',
  dslVersion: 1,
  plannedDurationSeconds: 1200,
  plannedSessionRpe: 6,
  expectedLoad: 25,
  summary: null,
  linkedActivityIds: [],
};

const todayTarget = {
  ...target,
  id: 'workout-today',
  date: '2026-10-12',
  dayIndex: 1,
  name: 'Today intervals',
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    userId: 'athlete',
    revision: 1,
    status: 'DECISION_READY',
    decisionId: null,
    branchId: null,
    assessmentId: 'assessment-1',
    evidenceHash: 'evidence-hash',
    timezone: 'Asia/Shanghai',
    asOf: new Date('2026-10-12T01:00:00.000Z'),
    currentOutcome: {
      kind: 'OUTCOME',
      action: 'REDUCE_VOLUME',
      reason: 'Recovery is below normal.',
      requiresPlanDecision: true,
      confidence: 0.8,
    },
    assessment: { state: 'UNDER_RECOVERED', confidence: 0.8 },
    ...overrides,
  };
}

describe('AthleteStateDecisionService', () => {
  const findFirst = jest.fn<(...args: any[]) => Promise<any>>();
  const updateMany = jest.fn<(...args: any[]) => Promise<any>>();
  const prisma = { coachAssessmentCase: { findFirst, updateMany } };
  const users = {
    getPreferredTimezone: jest.fn(async () => 'Asia/Shanghai'),
    getPreferredLocale: jest.fn(async () => 'zh-CN'),
  };
  const planExecution = {
    buildContext: jest.fn(async () => ({
      contextId: 'context-1',
      plan: { id: 'plan-1' },
      day: { plannedWorkouts: [] },
    })),
  };
  const contexts = {
    build: jest.fn(async () => ({
      reviewFactHash: 'plan-fact-hash',
      recent7Days: [],
      upcoming: [target],
    })),
  };
  const draft = {
    planId: 'plan-1',
    workoutId: target.id,
    title: 'Shorter tempo run',
    reason: 'Absorb recent strain.',
    before: {
      weekIndex: 2,
      dayIndex: 2,
      sessionIndex: 1,
      sportType: 'RUN',
      text: 'work 20m',
      scheduledDate: '2026-10-13',
    },
    after: {
      weekIndex: 2,
      dayIndex: 2,
      sessionIndex: 1,
      sportType: 'RUN',
      text: 'work 15m',
      scheduledDate: '2026-10-13',
    },
    changes: [{ field: 'duration', before: '20 min', after: '15 min' }],
  };
  const adjustments = {
    compose: jest.fn(async () => ({
      draft,
      beforeLoad: 25,
      afterLoad: 18,
      attempts: 1,
      failure: null,
    })),
  };
  const branching = {
    openBranch: jest.fn(async () => ({ branch: { id: 'branch-1' } })),
    squashBranch: jest.fn(async () => ({ decision: { id: 'decision-1' } })),
  };
  const service = new AthleteStateDecisionService(
    prisma as never,
    users as never,
    planExecution as never,
    contexts as never,
    adjustments as never,
    branching as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findFirst.mockResolvedValue(row());
    updateMany.mockResolvedValue({ count: 1 });
  });

  it('uses the validated Review composer and existing CoachDecision pipeline', async () => {
    await service.handle({
      userId: 'athlete',
      caseId: 'case-1',
      requestedAt: new Date().toISOString(),
    });
    expect(adjustments.compose).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'athlete',
        judgment: expect.objectContaining({
          action: 'REDUCE_VOLUME',
          targetWorkoutId: target.id,
        }),
      }),
    );
    expect(branching.squashBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 'branch-1',
        decisionType: 'PLAN_WORKOUT_UPDATE',
        payload: expect.objectContaining({
          workoutId: target.id,
          factHash: 'evidence-hash:plan-fact-hash',
        }),
      }),
    );
  });

  it("protects today's actionable workout before Review's future-only upcoming list", async () => {
    planExecution.buildContext.mockResolvedValueOnce({
      contextId: 'context-1',
      plan: { id: 'plan-1' },
      day: {
        plannedWorkouts: [{ id: todayTarget.id, status: 'PLANNED' }],
      },
    });
    contexts.build.mockResolvedValueOnce({
      reviewFactHash: 'plan-fact-hash',
      recent7Days: [{ plannedWorkouts: [todayTarget] }],
      upcoming: [target],
    });

    await service.handle({
      userId: 'athlete',
      caseId: 'case-1',
      requestedAt: new Date().toISOString(),
    });

    expect(adjustments.compose).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          upcoming: expect.arrayContaining([
            expect.objectContaining({ id: todayTarget.id }),
          ]),
        }),
        judgment: expect.objectContaining({
          targetWorkoutId: todayTarget.id,
        }),
      }),
    );
    expect(branching.squashBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ workoutId: todayTarget.id }),
      }),
    );
  });

  it('turns HIGH_CONCERN into guidance without opening or mutating a plan', async () => {
    findFirst.mockResolvedValueOnce(
      row({ assessment: { state: 'HIGH_CONCERN', confidence: 0.9 } }),
    );
    await service.handle({
      userId: 'athlete',
      caseId: 'case-1',
      requestedAt: new Date().toISOString(),
    });
    expect(branching.openBranch).not.toHaveBeenCalled();
    expect(branching.squashBranch).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RESOLVED' }),
      }),
    );
  });

  it('degrades a composer failure to guidance instead of creating an invalid Decision', async () => {
    adjustments.compose.mockResolvedValueOnce({
      draft: null,
      beforeLoad: 25,
      afterLoad: null,
      attempts: 2,
      failure: 'invalid draft',
    });
    await service.handle({
      userId: 'athlete',
      caseId: 'case-1',
      requestedAt: new Date().toISOString(),
    });
    expect(branching.squashBranch).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ASSESSING' }),
        data: expect.objectContaining({ status: 'RESOLVED' }),
      }),
    );
  });
});
