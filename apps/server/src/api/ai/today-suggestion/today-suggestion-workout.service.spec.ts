import { CoachActionType } from '@prisma/client';
import { TodaySuggestionWorkoutService } from './today-suggestion-workout.service';
import { todaySuggestionProposalToken } from './today-suggestion-delivery-policy';

describe('TodaySuggestionWorkoutService', () => {
  const originalSecret = process.env.SELF_HOST_AUTH_SECRET;

  beforeAll(() => {
    process.env.SELF_HOST_AUTH_SECRET =
      'test-secret-with-at-least-thirty-two-characters';
  });

  afterAll(() => {
    process.env.SELF_HOST_AUTH_SECRET = originalSecret;
  });

  function harness(
    overrides: { factHash?: string; highConcern?: boolean } = {},
  ) {
    const generationToken = '11111111-1111-5111-8111-111111111111';
    const constraintHash = 'c'.repeat(64);
    const proposal = {
      sportType: 'RUN' as const,
      sportDefinitionCode: 'ROAD_RUNNING',
      name: 'Gentle aerobic restart',
      notes: 'Run at a conversational effort, then cool down fully.',
      structureKind: 'ENDURANCE' as const,
      dslVersion: 1 as const,
      text: 'warmup 5m\nwork 15m\ncooldown 5m',
      structure: {
        kind: 'ENDURANCE' as const,
        version: 1 as const,
        blocks: [],
      },
      summary: {
        kind: 'ENDURANCE' as const,
        durationSeconds: 1_500,
        stepCount: 3,
        hardSession: false,
      },
    };
    const structuredResult = {
      version: 2,
      suggestionId: generationToken,
      primaryIntent: {
        type: 'CREATE_TODAY_WORKOUT',
        label: 'Create workout',
        proposalToken: todaySuggestionProposalToken({
          generationToken,
          constraintHash,
          proposal,
        }),
        preview: proposal,
      },
      secondaryIntents: [],
    };
    const prisma = {
      aiTodaySuggestion: {
        findFirst: jest.fn(async () => ({
          locale: 'en',
          date: '2026-10-28',
          signatureHash: 'fact-1',
          constraintHash,
          continuityHash: 'continuity-1',
          keyContext: { timezone: 'Asia/Shanghai' },
          structuredResult,
        })),
      },
    };
    const projector = {
      project: jest.fn(async () => ({
        date: '2026-10-28',
        factHash: overrides.factHash ?? 'fact-1',
        constraintHash,
        highConcern: overrides.highConcern ?? false,
        pendingInquiry: null,
        todayWorkouts: [],
      })),
    };
    const actions = {
      registerUndoHandler: jest.fn(),
      run: jest.fn(async () => ({
        payloadForUi: {
          workoutId: 'workout-1',
          scheduledDate: '2026-10-28',
          planId: null,
        },
        actionId: 'action-1',
        undoUntil: new Date('2026-10-28T01:00:30.000Z'),
      })),
    };
    const workouts = {
      createIndependentWorkoutInTransaction: jest.fn(),
    };
    const planWorkouts = {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    };
    return {
      generationToken,
      proposal,
      service: new TodaySuggestionWorkoutService(
        prisma as never,
        workouts as never,
        planWorkouts as never,
        actions as never,
        projector as never,
      ),
      actions,
      workouts,
      planWorkouts,
    };
  }

  it('accepts only the persisted signed proposal and returns an open intent', async () => {
    const { service, generationToken, actions } = harness();
    await expect(
      service.create({ userId: 'user-1', generationToken }),
    ).resolves.toMatchObject({
      workoutId: 'workout-1',
      actionId: 'action-1',
      intent: {
        type: 'OPEN_TODAY_WORKOUT',
        workoutId: 'workout-1',
        scheduledDate: '2026-10-28',
      },
    });
    expect(actions.run).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CoachActionType.INDEPENDENT_WORKOUT_CREATE,
        riskTier: 'LOW',
      }),
    );
  });

  it('persists the exact generated Workout structure without synthesizing a second workout', async () => {
    const {
      service,
      generationToken,
      proposal,
      actions,
      workouts,
      planWorkouts,
    } = harness();
    await service.create({ userId: 'user-1', generationToken });
    const actionInput = actions.run.mock.calls[0]?.[0];
    workouts.createIndependentWorkoutInTransaction.mockResolvedValue({
      workout: { id: 'workout-1' },
    });
    planWorkouts.findUnique.mockResolvedValue({
      id: 'workout-1',
      revision: 0,
      updatedAt: new Date('2026-10-28T01:00:00.000Z'),
    });

    await actionInput.exec({});

    expect(workouts.createIndependentWorkoutInTransaction).toHaveBeenCalledWith(
      'user-1',
      {
        scheduledDate: '2026-10-28',
        sportType: proposal.sportType,
        sportDefinitionCode: proposal.sportDefinitionCode,
        name: proposal.name,
        notes: proposal.notes,
        definition: {
          kind: proposal.structureKind,
          version: proposal.dslVersion,
          source: 'STRUCTURE',
          structure: proposal.structure,
        },
      },
      {},
    );
  });

  it('keeps the proposal signature stable after jsonb reorders object keys', () => {
    const common = {
      generationToken: '11111111-1111-5111-8111-111111111111',
      constraintHash: 'c'.repeat(64),
    };
    const generated = {
      sportType: 'RUN' as const,
      sportDefinitionCode: 'ROAD_RUNNING',
      name: 'Gentle aerobic restart',
      notes: 'Run at a conversational effort, then cool down fully.',
      structureKind: 'ENDURANCE' as const,
      dslVersion: 1 as const,
      text: 'warmup 5m\nwork 15m\ncooldown 5m',
      structure: {
        kind: 'ENDURANCE' as const,
        version: 1 as const,
        blocks: [],
      },
      summary: {
        kind: 'ENDURANCE' as const,
        durationSeconds: 1_500,
        stepCount: 3,
        hardSession: false,
      },
    };
    const persisted = {
      summary: {
        stepCount: 3,
        hardSession: false,
        durationSeconds: 1_500,
        kind: 'ENDURANCE' as const,
      },
      structure: {
        blocks: [],
        version: 1 as const,
        kind: 'ENDURANCE' as const,
      },
      text: 'warmup 5m\nwork 15m\ncooldown 5m',
      dslVersion: 1 as const,
      structureKind: 'ENDURANCE' as const,
      notes: 'Run at a conversational effort, then cool down fully.',
      name: 'Gentle aerobic restart',
      sportDefinitionCode: 'ROAD_RUNNING',
      sportType: 'RUN' as const,
    };

    expect(
      todaySuggestionProposalToken({ ...common, proposal: persisted }),
    ).toBe(todaySuggestionProposalToken({ ...common, proposal: generated }));
  });

  it('replays the timezone used to generate the persisted suggestion', async () => {
    const { service, generationToken } = harness();
    const projector = (
      service as unknown as {
        projector: { project: jest.Mock };
      }
    ).projector;

    await service.create({ userId: 'user-1', generationToken });

    expect(projector.project).toHaveBeenCalledWith({
      userId: 'user-1',
      locale: 'en',
      timezone: 'Asia/Shanghai',
      allowAi: true,
    });
  });

  it('rejects an expired fact projection before any write action runs', async () => {
    const { service, generationToken, actions } = harness({
      factHash: 'changed',
    });
    await expect(
      service.create({ userId: 'user-1', generationToken }),
    ).rejects.toThrow('TODAY_SUGGESTION_FACTS_CHANGED');
    expect(actions.run).not.toHaveBeenCalled();
  });

  it('refuses to create when the current state has become high concern', async () => {
    const { service, generationToken, actions } = harness({
      highConcern: true,
    });
    await expect(
      service.create({ userId: 'user-1', generationToken }),
    ).rejects.toThrow('TODAY_SUGGESTION_FACTS_CHANGED');
    expect(actions.run).not.toHaveBeenCalled();
  });

  it('allows undo only while the independent workout is unchanged and unlinked', async () => {
    const { service, actions, planWorkouts } = harness();
    service.onModuleInit();
    const handler = actions.registerUndoHandler.mock.calls[0]?.[1];
    const updatedAt = new Date('2026-10-28T01:00:00.000Z');
    planWorkouts.findFirst.mockResolvedValue({
      id: 'workout-1',
      status: 'PLANNED',
      revision: 0,
      createdAt: updatedAt,
      updatedAt,
      _count: { links: 0, externalMappings: 0 },
    });
    planWorkouts.delete.mockResolvedValue({});
    const prisma = {
      todaySuggestionEngagementState: {
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };

    await expect(
      handler({
        prisma,
        userId: 'user-1',
        reverseData: {
          workoutId: 'workout-1',
          generationToken: 'generation-1',
          revision: 0,
          updatedAt: updatedAt.toISOString(),
        },
      }),
    ).resolves.toBeUndefined();
    expect(planWorkouts.delete).toHaveBeenCalledWith(
      { where: { id: 'workout-1' } },
      prisma,
    );
  });
});
