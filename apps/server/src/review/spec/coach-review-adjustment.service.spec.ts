import { describe, expect, it, jest } from '@jest/globals';
import { CoachReviewAdjustmentService } from '../coach-review-adjustment.service';
import {
  ReviewModelCallGuard,
  ReviewModelDeferredError,
} from '../review-model-call-guard';

const before = {
  id: 'w-next',
  date: '2026-08-26',
  weekIndex: 2,
  dayIndex: 3,
  sessionIndex: 1,
  sportType: 'RUN',
  status: 'PLANNED',
  name: 'Controlled run',
  notes: 'Run steadily.',
  text: 'work 20m',
  structureKind: 'ENDURANCE',
  dslVersion: 1,
  plannedDurationSeconds: 1200,
  plannedSessionRpe: null,
  expectedLoad: 21.4,
  summary: {
    kind: 'ENDURANCE',
    durationSeconds: 1200,
    stepCount: 1,
    hardSession: false,
  },
  linkedActivityIds: [],
};

function draft(afterText = 'work 15m') {
  return {
    planId: 'plan-1',
    workoutId: 'w-next',
    title: 'Shorter controlled run',
    reason: 'Absorb the extra work.',
    before: {
      weekIndex: 2,
      dayIndex: 3,
      sessionIndex: 1,
      sportType: 'RUN',
      text: 'work 20m',
      notes: 'Run steadily.',
      name: 'Controlled run',
      scheduledDate: '2026-08-26',
    },
    after: {
      weekIndex: 2,
      dayIndex: 3,
      sessionIndex: 1,
      sportType: 'RUN',
      text: afterText,
      notes: 'Run easily.',
      name: 'Short controlled run',
      scheduledDate: '2026-08-26',
    },
    changes: [{ field: 'duration', before: '20 min', after: '15 min' }],
  };
}

const context = {
  meta: { scale: 'daily' },
  athlete: { sportProfiles: [] },
  plan: { id: 'plan-1', title: 'Base', goal: '5K' },
  upcoming: [before],
};

const judgment = {
  decision: 'ADJUST' as const,
  action: 'REDUCE_VOLUME' as const,
  targetWorkoutId: 'w-next',
  rationale: 'Shorten it.',
  confidence: 0.8,
  evidenceCodes: ['EXTRA_ACTIVITY'],
  adjustmentIntent: { magnitude: 'SMALL' as const, preserve: ['session_goal'] },
  source: 'llm' as const,
  upstreamFailureCode: null,
};

function createService(
  generated: Array<ReturnType<typeof draft>>,
  guard: ReviewModelCallGuard = new ReviewModelCallGuard(),
) {
  let index = 0;
  const ai = {
    generatePlanReviewAdjustment: jest.fn(async () => ({
      draft: generated[Math.min(index++, generated.length - 1)],
      provider: 'openrouter',
      model: 'model',
      usage: {},
      runId: `run-${index}`,
      operationId: `operation-${index}`,
      replayed: false,
    })),
  };
  const service = new CoachReviewAdjustmentService(
    ai as never,
    { recordUsageEvent: jest.fn(async () => undefined) } as never,
    {
      get: jest.fn(() => ({
        parseText: jest.fn((text: string) => text),
        validate: jest.fn(() => []),
        summarize: jest.fn((text: string) => ({
          kind: 'ENDURANCE',
          durationSeconds: text.includes('15m') ? 900 : 1200,
          stepCount: 1,
          hardSession: false,
        })),
      })),
    } as never,
    {
      estimateForViewerWorkouts: jest.fn(async () => [
        { estimatedLoad: 21.4 },
        { estimatedLoad: 16 },
      ]),
    } as never,
    guard,
  );
  return { service, ai };
}

describe('CoachReviewAdjustmentService', () => {
  it('passes an abort signal to the model call and propagates a stopped review run', async () => {
    const guard = new ReviewModelCallGuard();
    const { service, ai } = createService([draft()], guard);
    await service.compose({
      userId: 'user-1',
      lang: 'zh',
      context: context as never,
      judgment,
    });
    expect(ai.generatePlanReviewAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        scale: 'daily',
        targetWorkoutId: 'w-next',
        signal: expect.any(AbortSignal),
      }),
    );

    (guard as unknown as { pausedUntil: Date }).pausedUntil = new Date(
      Date.now() + 60_000,
    );
    await expect(
      service.compose({
        userId: 'user-1',
        lang: 'zh',
        context: context as never,
        judgment,
      }),
    ).rejects.toBeInstanceOf(ReviewModelDeferredError);
  });

  it('accepts a validated material volume reduction', async () => {
    const { service } = createService([draft()]);
    const result = await service.compose({
      userId: 'user-1',
      lang: 'zh',
      context: context as never,
      judgment,
    });
    expect(result).toMatchObject({
      attempts: 1,
      failure: null,
      beforeLoad: 21.4,
      afterLoad: 16,
      draft: { workoutId: 'w-next' },
    });
  });

  it('repairs once and emits no draft when the change remains non-material', async () => {
    const { service, ai } = createService([
      draft('work 20m'),
      draft('work 20m'),
    ]);
    const result = await service.compose({
      userId: 'user-1',
      lang: 'zh',
      context: context as never,
      judgment,
    });
    expect(result.draft).toBeNull();
    expect(result.attempts).toBe(2);
    expect(result.failure).toContain('material change');
    expect(ai.generatePlanReviewAdjustment).toHaveBeenCalledTimes(2);
  });
});
