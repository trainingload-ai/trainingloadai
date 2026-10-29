import { describe, expect, it, jest } from '@jest/globals';
import { PlanProposalApplyService } from '../application/plan-proposal-apply.service';

function createService(
  preview: Record<string, unknown>,
  overrides: {
    plans?: Record<string, unknown>;
    workouts?: Record<string, unknown>;
    users?: Record<string, unknown>;
    prescriptions?: Record<string, unknown>;
  } = {},
) {
  const planService = {
    updateWorkouts: jest.fn(),
    createPlan: jest.fn(),
  };
  const proposals = {
    findUnique: jest.fn(async () => preview),
    updateMany: jest.fn(),
  };
  const users = {
    getPreferredTimezone: jest.fn(async () => 'UTC'),
    ...(overrides.users ?? {}),
  };
  const service = new PlanProposalApplyService(
    planService as never,
    (overrides.plans ?? {}) as never,
    (overrides.workouts ?? {}) as never,
    proposals as never,
    {} as never,
    users as never,
    (overrides.prescriptions ?? {}) as never,
    {} as never,
  );
  const tx = { $executeRawUnsafe: jest.fn(async () => 1) };
  return { service, planService, proposals, tx };
}

const basePreview = {
  id: 'preview-1',
  userId: 'user-1',
  sourcePlanId: 'plan-1',
  decisionId: 'decision-1',
  appliedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
  proposal: {},
  presentation: {},
};

describe('PlanProposalApplyService preview guards', () => {
  it('rejects an expired preview before any plan write', async () => {
    const { service, planService, proposals, tx } = createService({
      ...basePreview,
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(
      service.apply({
        userId: 'user-1',
        decisionId: 'decision-1',
        branchId: 'branch-1',
        contextPlanId: 'plan-1',
        previewId: 'preview-1',
        tx: tx as never,
      }),
    ).rejects.toThrow(/expired/);

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock',
      'user-1',
    );
    expect(planService.updateWorkouts).not.toHaveBeenCalled();
    expect(planService.createPlan).not.toHaveBeenCalled();
    expect(proposals.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a preview claimed by another decision', async () => {
    const { service, planService, tx } = createService({
      ...basePreview,
      decisionId: 'another-decision',
    });

    await expect(
      service.apply({
        userId: 'user-1',
        decisionId: 'decision-1',
        branchId: 'branch-1',
        contextPlanId: 'plan-1',
        previewId: 'preview-1',
        tx: tx as never,
      }),
    ).rejects.toThrow(/different decision/);
    expect(planService.updateWorkouts).not.toHaveBeenCalled();
  });

  it('rolls back the whole adaptation when zones changed before confirmation', async () => {
    const workouts = {
      findMany: jest.fn(async () => [
        {
          id: 'workout-1',
          revision: 1,
          sportType: 'RUN',
          status: 'PLANNED',
          scheduledDate: new Date('2099-10-02T00:00:00.000Z'),
          links: [],
          steps: [],
          plan: { status: 'ACTIVE' },
        },
      ]),
      updateExternalMappings: jest.fn(),
    };
    const users = {
      getComposedUserProfile: jest.fn(async () => ({})),
      getPaceZoneSettingResolved: jest.fn(async () => ({
        benchmark: 'TP',
        zones: [{ order: 1, name: 'Z1', min: 0.003, max: 0.004 }],
      })),
    };
    const prescriptions = {
      zoneIdentity: jest.fn(() => ({
        systemKey: 'same-system',
        fingerprint: 'current-fingerprint',
      })),
    };
    const { service, planService, proposals, tx } = createService(
      {
        ...basePreview,
        proposal: {
          mode: 'ADAPT',
          planId: 'plan-1',
          expectedPlanStatus: 'ACTIVE',
          sourceWorkouts: [
            {
              id: 'workout-1',
              revision: 1,
              dynamicZones: [],
              status: 'PLANNED',
              scheduledDate: '2099-10-02',
              activeActivityLinkCount: 0,
            },
          ],
          preservedWorkoutIds: [],
          changes: [
            {
              workoutId: 'workout-1',
              expectedRevision: 1,
              expectedZoneFingerprint: 'preview-fingerprint',
              dto: {
                blocks: [
                  {
                    target: {
                      kind: 'SPEED',
                      resolutionMode: 'DYNAMIC_ZONE',
                      zoneFingerprint: 'preview-fingerprint',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      { workouts, users, prescriptions },
    );

    await expect(
      service.apply({
        userId: 'user-1',
        decisionId: 'decision-1',
        branchId: 'branch-1',
        contextPlanId: 'plan-1',
        previewId: 'preview-1',
        tx: tx as never,
      }),
    ).rejects.toThrow(/Training zones changed/);

    expect(users.getComposedUserProfile).toHaveBeenCalledWith(
      'user-1',
      'RUN',
      undefined,
      tx,
    );
    expect(planService.updateWorkouts).not.toHaveBeenCalled();
    expect(workouts.updateExternalMappings).not.toHaveBeenCalled();
    expect(proposals.updateMany).not.toHaveBeenCalled();
  });

  it('rejects the whole adaptation when a preserved workout changed', async () => {
    const workouts = {
      findMany: jest.fn(async () => [
        {
          id: 'workout-1',
          revision: 1,
          sportType: 'RUN',
          status: 'PLANNED',
          scheduledDate: new Date('2099-10-02T00:00:00.000Z'),
          links: [],
          steps: [],
          plan: { status: 'ACTIVE' },
        },
        {
          id: 'workout-2',
          revision: 2,
          sportType: 'RUN',
          status: 'PLANNED',
          scheduledDate: new Date('2099-10-03T00:00:00.000Z'),
          links: [],
          steps: [],
          plan: { status: 'ACTIVE' },
        },
      ]),
      updateExternalMappings: jest.fn(),
    };
    const { service, planService, proposals, tx } = createService(
      {
        ...basePreview,
        proposal: {
          mode: 'ADAPT',
          planId: 'plan-1',
          expectedPlanStatus: 'ACTIVE',
          sourceWorkouts: [
            {
              id: 'workout-1',
              revision: 1,
              dynamicZones: [],
              status: 'PLANNED',
              scheduledDate: '2099-10-02',
              activeActivityLinkCount: 0,
            },
            {
              id: 'workout-2',
              revision: 1,
              dynamicZones: [],
              status: 'PLANNED',
              scheduledDate: '2099-10-03',
              activeActivityLinkCount: 0,
            },
          ],
          preservedWorkoutIds: ['workout-2'],
          changes: [
            {
              workoutId: 'workout-1',
              expectedRevision: 1,
              expectedZoneFingerprint: null,
              dto: { blocks: [] },
            },
          ],
        },
      },
      { workouts },
    );

    await expect(
      service.apply({
        userId: 'user-1',
        decisionId: 'decision-1',
        branchId: 'branch-1',
        contextPlanId: 'plan-1',
        previewId: 'preview-1',
        tx: tx as never,
      }),
    ).rejects.toThrow(/workout-2 changed/);

    expect(planService.updateWorkouts).not.toHaveBeenCalled();
    expect(workouts.updateExternalMappings).not.toHaveBeenCalled();
    expect(proposals.updateMany).not.toHaveBeenCalled();
  });

  it('does not treat a source workout dynamic-zone projection as a plan revision', async () => {
    const workouts = {
      findMany: jest.fn(async () => [
        {
          id: 'workout-1',
          revision: 1,
          sportType: 'RUN',
          status: 'PLANNED',
          scheduledDate: new Date('2099-10-02T00:00:00.000Z'),
          links: [],
          steps: [
            {
              targetResolutionMode: 'DYNAMIC_ZONE',
              targetType: 'SPEED',
              targetZoneFingerprint: 'old-persisted-fingerprint',
              children: [],
            },
          ],
          plan: { status: 'ACTIVE' },
        },
      ]),
      updateExternalMappings: jest.fn(),
    };
    const { service, planService, proposals, tx } = createService(
      {
        ...basePreview,
        proposal: {
          mode: 'ADAPT',
          planId: 'plan-1',
          expectedPlanStatus: 'ACTIVE',
          sourceWorkouts: [
            {
              id: 'workout-1',
              revision: 1,
              dynamicZones: [
                { dimension: 'PACE', fingerprint: 'preview-fingerprint' },
              ],
              status: 'PLANNED',
              scheduledDate: '2099-10-02',
              activeActivityLinkCount: 0,
            },
          ],
          preservedWorkoutIds: [],
          changes: [
            {
              workoutId: 'workout-1',
              expectedRevision: 1,
              expectedZoneFingerprint: null,
              dto: { blocks: [] },
            },
          ],
        },
      },
      { workouts },
    );
    planService.updateWorkouts.mockResolvedValue({ after: [{}] } as never);
    proposals.updateMany.mockResolvedValue({ count: 1 } as never);

    await expect(
      service.apply({
        userId: 'user-1',
        decisionId: 'decision-1',
        branchId: 'branch-1',
        contextPlanId: 'plan-1',
        previewId: 'preview-1',
        tx: tx as never,
      }),
    ).resolves.toMatchObject({ changedWorkoutCount: 1 });
    expect(planService.updateWorkouts).toHaveBeenCalled();
  });

  it('rejects a supersession before creating the plan when replacement zones changed', async () => {
    const plans = {
      findUnique: jest.fn(async () => ({
        id: 'plan-1',
        userId: 'user-1',
        status: 'ACTIVE',
        supersededBy: null,
        workouts: [],
      })),
    };
    const users = {
      getComposedUserProfile: jest.fn(async () => ({})),
      getPaceZoneSettingResolved: jest.fn(async () => ({
        benchmark: 'TP',
        zones: [{ order: 2, name: 'Z2', min: 0.31, max: 0.36 }],
      })),
    };
    const prescriptions = {
      zoneIdentity: jest.fn(() => ({
        systemKey: 'same-system',
        fingerprint: 'new-fingerprint',
      })),
    };
    const { service, planService, proposals, tx } = createService(
      {
        ...basePreview,
        proposal: {
          mode: 'SUPERSEDE',
          sourcePlanId: 'plan-1',
          sourceWorkouts: [],
          expectedReplacementZones: [
            {
              sportType: 'RUN',
              dimension: 'PACE',
              systemKey: 'same-system',
              fingerprint: 'preview-fingerprint',
            },
          ],
          effectiveFrom: '2099-10-08',
          activationTimezone: 'UTC',
          rationale: 'Use current zones.',
          plan: { title: 'Next plan', periodWeeks: 1, workouts: [] },
        },
      },
      { plans, users, prescriptions },
    );

    await expect(
      service.apply({
        userId: 'user-1',
        decisionId: 'decision-1',
        branchId: 'branch-1',
        contextPlanId: 'plan-1',
        previewId: 'preview-1',
        tx: tx as never,
      }),
    ).rejects.toThrow(/Training zones changed/);

    expect(planService.createPlan).not.toHaveBeenCalled();
    expect(proposals.updateMany).not.toHaveBeenCalled();
  });
});
