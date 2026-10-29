import { TodaySuggestionDeliveryPolicy } from './today-suggestion-delivery-policy';
import type {
  TodaySuggestionConstraintProjection,
  TodaySuggestionDraft,
} from './today-suggestion.types';

function projection(
  overrides: Partial<TodaySuggestionConstraintProjection> = {},
): TodaySuggestionConstraintProjection {
  return {
    userId: 'user-1',
    locale: 'en',
    date: '2026-10-28',
    timezone: 'Asia/Shanghai',
    edition: 'self-host',
    allowAi: true,
    featureAllowed: true,
    factHash: 'f'.repeat(64),
    constraintHash: 'c'.repeat(64),
    continuityHash: 'd'.repeat(64),
    validUntil: new Date(Date.now() + 60 * 60_000),
    localTime: '12:00',
    minutesUntilDayEnd: 720,
    newWorkoutWindowOpen: true,
    constraints: ['NO_ACTIVE_PLAN'],
    requiredToolNames: [],
    lightContext: {},
    activePlan: null,
    todayWorkouts: [],
    tomorrowWorkouts: [],
    latestActivityId: 'activity-public-hash',
    latestActivityAt: null,
    activityEvidence: {} as never,
    coachState: { athleteState: null, decisions: [] } as never,
    pendingInquiry: null,
    activeDecisionId: null,
    highConcern: false,
    weatherImpact: { status: 'unavailable' },
    weatherAttribution: null,
    ...overrides,
  };
}

function draft(
  overrides: Partial<TodaySuggestionDraft> = {},
): TodaySuggestionDraft {
  return {
    headline: 'Move today',
    summary: 'Choose a short, easy session.',
    recommendation: { kind: 'TRAIN', intensity: 'EASY' },
    confidence: 'MEDIUM',
    evidenceCodes: ['NO_ACTIVE_PLAN'],
    preferredIntent: 'CREATE_TODAY_WORKOUT',
    secondaryIntents: ['OPEN_ACTIVITY_REVIEW'],
    generatedWorkout: {
      sportType: 'RUN',
      sportDefinitionCode: 'ROAD_RUNNING',
      name: 'Gentle aerobic restart',
      notes:
        '先轻松跑 3 分钟热身，再以可完整说话的强度慢跑 12 分钟，最后步行 5 分钟放松。',
      structureKind: 'ENDURANCE',
      dslVersion: 1,
      text: 'warmup 3m\nwork 12m\ncooldown 5m',
      structure: { kind: 'ENDURANCE', version: 1, blocks: [] },
      summary: {
        kind: 'ENDURANCE',
        durationSeconds: 1_200,
        stepCount: 3,
        hardSession: false,
      },
    },
    tags: ['Easy'],
    ...overrides,
  };
}

describe('TodaySuggestionDeliveryPolicy', () => {
  const originalSecret = process.env.SELF_HOST_AUTH_SECRET;

  beforeAll(() => {
    process.env.SELF_HOST_AUTH_SECRET =
      'test-secret-with-at-least-thirty-two-characters';
  });

  afterAll(() => {
    process.env.SELF_HOST_AUTH_SECRET = originalSecret;
  });

  it('resolves only server-owned entities and a signed workout proposal', () => {
    const result = new TodaySuggestionDeliveryPolicy().build({
      projection: projection(),
      draft: draft(),
      generationToken: '11111111-1111-5111-8111-111111111111',
      state: 'GENERATED',
      reasonCode: 'GENERATED',
      generatedAt: new Date('2026-10-28T00:00:00.000Z'),
    });

    expect(result.primaryIntent).toMatchObject({
      type: 'CREATE_TODAY_WORKOUT',
      preview: { name: 'Gentle aerobic restart' },
    });
    expect(result.primaryIntent).toHaveProperty('proposalToken');
    expect(result.secondaryIntents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'OPEN_ACTIVITY_REVIEW',
          activityId: 'activity-public-hash',
        }),
      ]),
    );
    expect(result.secondaryIntents).toHaveLength(2);
  });

  it('forces the existing assessment case and removes write actions', () => {
    const result = new TodaySuggestionDeliveryPolicy().build({
      projection: projection({
        constraints: ['WAITING_FOR_USER'],
        pendingInquiry: { caseId: 'case-1', questionId: 'question-1' },
      }),
      draft: draft({
        preferredIntent: 'CREATE_TODAY_WORKOUT',
        secondaryIntents: ['SCHEDULE_REMINDER', 'ASK_COACH'],
      }),
      generationToken: '22222222-2222-5222-8222-222222222222',
      state: 'GENERATED',
      reasonCode: 'GENERATED',
      generatedAt: new Date(),
    });

    expect(result.primaryIntent).toEqual({
      type: 'OPEN_ASSESSMENT',
      label: 'Update status',
      caseId: 'case-1',
    });
    expect(result.secondaryIntents).toEqual([]);
  });

  it('blocks workout creation for high concern state', () => {
    const result = new TodaySuggestionDeliveryPolicy().build({
      projection: projection({ highConcern: true }),
      draft: draft(),
      generationToken: '33333333-3333-5333-8333-333333333333',
      state: 'GENERATED',
      reasonCode: 'GENERATED',
      generatedAt: new Date(),
    });

    expect(result.primaryIntent?.type).toBe('ASK_COACH');
    expect(
      result.secondaryIntents.every(
        (intent) =>
          !['CREATE_TODAY_WORKOUT', 'SCHEDULE_REMINDER'].includes(intent.type),
      ),
    ).toBe(true);
  });

  it('blocks new workouts and late reminders after the daily training window closes', () => {
    const result = new TodaySuggestionDeliveryPolicy().build({
      projection: projection({
        localTime: '22:50',
        minutesUntilDayEnd: 70,
        newWorkoutWindowOpen: false,
        constraints: ['TODAY_TRAINING_WINDOW_CLOSED'],
      }),
      draft: draft({
        secondaryIntents: ['SCHEDULE_REMINDER', 'ASK_COACH'],
      }),
      generationToken: '44444444-4444-5444-8444-444444444444',
      state: 'GENERATED',
      reasonCode: 'GENERATED',
      generatedAt: new Date(),
    });

    expect(result.primaryIntent).toBeNull();
    expect(result.secondaryIntents.map((intent) => intent.type)).toEqual([
      'ASK_COACH',
    ]);
    expect(result.evidence.map((item) => item.code)).not.toContain(
      'TODAY_TRAINING_WINDOW_CLOSED',
    );
  });

  it('does not expose unknown internal evidence codes', () => {
    const result = new TodaySuggestionDeliveryPolicy().build({
      projection: projection(),
      draft: draft({ evidenceCodes: ['INTERNAL_MODEL_CODE', 'LOAD_ZERO_28D'] }),
      generationToken: '55555555-5555-5555-8555-555555555555',
      state: 'GENERATED',
      reasonCode: 'GENERATED',
      generatedAt: new Date(),
    });

    expect(result.evidence.map((item) => item.code)).toContain('LOAD_ZERO_28D');
    expect(result.evidence.map((item) => item.code)).not.toContain(
      'INTERNAL_MODEL_CODE',
    );
  });
});
