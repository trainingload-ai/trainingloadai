import { describe, expect, it, jest } from '@jest/globals';
import { PlanProposalService } from '../application/plan-proposal.service';

function createService() {
  const plans = {
    findUnique: jest.fn(async () => ({
      id: 'plan-1',
      userId: 'user-1',
      title: 'Base plan',
      status: 'ACTIVE',
      supersededBy: null,
      workouts: [
        {
          id: 'workout-1',
          revision: 1,
          status: 'PLANNED',
          scheduledDate: new Date('2099-10-02T00:00:00.000Z'),
          sportType: 'RUN',
          links: [],
          externalMappings: [],
          steps: [],
          estimatedLoad: null,
          dayOffset: 0,
          sessionIndex: 1,
          name: 'Easy 1',
          notes: null,
        },
        {
          id: 'workout-2',
          revision: 1,
          status: 'PLANNED',
          scheduledDate: new Date('2099-10-03T00:00:00.000Z'),
          sportType: 'RUN',
          links: [],
          externalMappings: [],
          steps: [],
          estimatedLoad: null,
          dayOffset: 1,
          sessionIndex: 1,
          name: 'Easy 2',
          notes: null,
        },
      ],
    })),
    findFirst: jest.fn(async () => null),
  };
  const proposals = {
    create: jest.fn(async () => ({ id: 'preview-1' })),
    updateMany: jest.fn(async () => ({ count: 1 })),
  };
  const users = {
    getPreferredTimezone: jest.fn(async () => 'UTC'),
    getPreferredLocale: jest.fn(async () => 'zh'),
    getComposedUserProfile: jest.fn(async () => ({})),
    getPaceZoneSettingResolved: jest.fn(async () => ({
      benchmark: 'TP',
      zones: [{ order: 2, name: 'Z2', min: 0.3, max: 0.35 }],
    })),
  };
  const workout = {
    buildPlanBlocksFromWorkoutSteps: jest.fn<(...args: unknown[]) => unknown[]>(
      () => [],
    ),
    parsePlanText: jest.fn<(...args: unknown[]) => unknown[]>(() => []),
  };
  const prescriptions = {
    resolve: jest.fn(() => ({
      zoneSystemKey: 'run-pace-system',
      zoneFingerprint: 'run-pace-fingerprint',
    })),
  };
  const service = new PlanProposalService(
    plans as never,
    proposals as never,
    users as never,
    workout as never,
    prescriptions as never,
    {
      estimateForViewerWorkouts: jest.fn(async () => [{ estimatedLoad: null }]),
    } as never,
  );
  return { service, proposals, workout, prescriptions };
}

const group = {
  workoutIds: ['workout-1'],
  disposition: 'PRESERVE' as const,
  intent: { family: 'ENDURANCE' as const },
  targetDimension: 'PACE' as const,
  rationale: 'Keep the current prescription',
  evidenceRefs: [
    { type: 'training_history', label: 'Recent training', value: 'reviewed' },
  ],
};

describe('PlanProposalService assessment coverage', () => {
  it('rejects incomplete PLAN_REMAINING coverage without persisting a preview', async () => {
    const { service, proposals } = createService();

    await expect(
      service.createPreview('user-1', {
        mode: 'ADAPT',
        planId: 'plan-1',
        scope: 'PLAN_REMAINING',
        assessmentGroups: [group],
      }),
    ).rejects.toThrow(/cover every eligible workout/);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate workout coverage without persisting a preview', async () => {
    const { service, proposals } = createService();

    await expect(
      service.createPreview('user-1', {
        mode: 'ADAPT',
        planId: 'plan-1',
        scope: 'WORKOUT',
        assessmentGroups: [group, group],
      }),
    ).rejects.toThrow(/covered more than once/);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it('does not create a confirmation decision when every workout is preserved', async () => {
    const { service, proposals } = createService();

    await expect(
      service.createPreview('user-1', {
        mode: 'ADAPT',
        planId: 'plan-1',
        scope: 'PLAN_REMAINING',
        assessmentGroups: [
          { ...group, workoutIds: ['workout-1', 'workout-2'] },
        ],
      }),
    ).rejects.toThrow(/contains no changes/);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it('claims a preview for exactly one coach decision', async () => {
    const { service, proposals } = createService();
    const tx = {};

    await service.claimDecision({
      previewId: 'preview-1',
      decisionId: 'decision-1',
      userId: 'user-1',
      sourcePlanId: 'plan-1',
      tx: tx as never,
    });

    expect(proposals.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'preview-1',
          decisionId: null,
          appliedAt: null,
        }),
        data: { decisionId: 'decision-1' },
      }),
      tx,
    );
  });

  it('stores an athlete-facing supersession summary instead of raw workout DSL', async () => {
    const { service, proposals } = createService();

    const result = await service.createPreview('user-1', {
      mode: 'SUPERSEDE',
      sourcePlanId: 'plan-1',
      effectiveFrom: '2099-10-08',
      rationale: 'Reduce intensity density while preserving aerobic volume.',
      evidenceRefs: [
        { type: 'recent_load', label: 'Recent training load', value: 'high' },
      ],
      plan: {
        title: 'Adjusted plan',
        periodWeeks: 1,
        workouts: [
          {
            weekIndex: 1,
            dayIndex: 1,
            sportType: 'RUN',
            name: 'Easy aerobic run',
            text: 'work 25m',
            plannedSessionRpe: 3,
          },
        ],
      },
    });

    expect(result.presentation.rows[0].after).toBe('RPE / 对话测试体感');
    expect(JSON.stringify(result.presentation)).not.toContain('work 25m');
    expect(proposals.create).toHaveBeenCalled();
  });

  it('captures replacement zone fingerprints in the immutable supersession proposal', async () => {
    const { service, proposals, workout, prescriptions } = createService();
    workout.parsePlanText.mockReturnValue([
      {
        type: 'work',
        steps: [
          {
            duration: 1500,
            durationMeta: { kind: 'TIME', value: 1500, unit: 'SECONDS' },
            primaryTargetMeta: {
              kind: 'SPEED',
              zoneIndex: 2,
              zoneLabel: 'Z2',
            },
          },
        ],
      },
    ]);

    await service.createPreview('user-1', {
      mode: 'SUPERSEDE',
      sourcePlanId: 'plan-1',
      effectiveFrom: '2099-10-08',
      rationale: 'Use current running pace zones.',
      evidenceRefs: [
        { type: 'zones', label: 'Running pace zones', value: 'configured' },
      ],
      plan: {
        title: 'Zone plan',
        periodWeeks: 1,
        workouts: [
          {
            weekIndex: 1,
            dayIndex: 1,
            sportType: 'RUN',
            text: 'work 25m pace z2',
          },
        ],
      },
    });

    expect(prescriptions.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        sportType: 'RUN',
        dimension: 'PACE',
        zoneIndex: 2,
      }),
    );
    expect(proposals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          proposal: expect.objectContaining({
            expectedReplacementZones: [
              {
                sportType: 'RUN',
                dimension: 'PACE',
                systemKey: 'run-pace-system',
                fingerprint: 'run-pace-fingerprint',
              },
            ],
          }),
        }),
      }),
    );
  });
});
