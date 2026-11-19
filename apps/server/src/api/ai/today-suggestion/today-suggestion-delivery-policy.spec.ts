import { createAiFallbackI18n } from '../spec/ai-fallback-i18n.test-util';
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

  it.each(['ACCESS_DENIED', 'AI_DISABLED', 'AI_NOT_CONFIGURED'] as const)(
    'does not offer an unavailable coach continuation for %s, including cached delivery',
    (reasonCode) => {
      const policy = new TodaySuggestionDeliveryPolicy(createAiFallbackI18n());
      const result = policy.build({
        projection: projection({ featureAllowed: false }),
        draft: draft({
          recommendation: { kind: 'RECOVER' },
          preferredIntent: 'ASK_COACH',
          secondaryIntents: ['OPEN_IMPORT', 'ASK_COACH'],
          generatedWorkout: undefined,
        }),
        generationToken: 'unavailable-coach',
        state: 'AI_UNAVAILABLE',
        reasonCode,
        generatedAt: null,
      });
      expect(result.primaryIntent).toBeNull();
      expect(result.secondaryIntents.map((intent) => intent.type)).toEqual([
        'OPEN_IMPORT',
      ]);
      const legacy = {
        ...result,
        primaryIntent: { type: 'ASK_COACH' as const, label: 'Ask coach' },
      };
      expect(
        policy.localize(legacy, { locale: 'en' }).primaryIntent,
      ).toBeNull();
    },
  );

  it('removes a cached coach action after access is revoked, while retaining useful navigation', () => {
    const policy = new TodaySuggestionDeliveryPolicy(createAiFallbackI18n());
    const result = policy.build({
      projection: projection(),
      draft: draft({
        recommendation: { kind: 'RECOVER' },
        preferredIntent: 'ASK_COACH',
        secondaryIntents: ['OPEN_IMPORT'],
        generatedWorkout: undefined,
      }),
      generationToken: 'previously-allowed-coach',
      state: 'GENERATED',
      reasonCode: 'GENERATED',
      generatedAt: new Date(),
    });
    expect(result.primaryIntent?.type).toBe('ASK_COACH');
    const revoked = policy.localize(
      result,
      projection({ featureAllowed: false }),
    );
    expect(revoked.primaryIntent).toBeNull();
    expect(revoked.secondaryIntents[0]?.type).toBe('OPEN_IMPORT');
  });

  it('opens the same remaining course that grounds the recommendation', () => {
    const result = new TodaySuggestionDeliveryPolicy(
      createAiFallbackI18n(),
    ).build({
      projection: projection({
        todayWorkouts: ['first', 'selected'].map((id) => ({
          id,
          planId: 'plan',
          scheduledDate: '2026-10-28',
          name: id,
          sportType: 'RUN',
          status: 'PLANNED',
          plannedDurationSeconds: 1800,
          linkedActivityCount: 0,
        })),
      }),
      draft: draft({
        preferredIntent: 'OPEN_TODAY_WORKOUT',
        trainingBasis: { kind: 'SCHEDULED', workoutId: 'selected' },
        generatedWorkout: undefined,
      }),
      generationToken: 'selected-course',
      state: 'GENERATED',
      reasonCode: 'GENERATED',
      generatedAt: new Date(),
    });
    expect(result.primaryIntent).toMatchObject({
      type: 'OPEN_TODAY_WORKOUT',
      workoutId: 'selected',
    });
    expect(result).not.toHaveProperty('trainingBasis');
  });

  it.each(['de', 'de-DE'])(
    'localizes delivered actions and evidence for %s',
    (locale) => {
      const result = new TodaySuggestionDeliveryPolicy(
        createAiFallbackI18n(),
      ).build({
        projection: projection({
          locale,
          constraints: ['NEVER_RECORDED_ACTIVITY'],
        }),
        draft: draft({
          headline: 'Heute locker starten',
          summary: 'Verbinde deine Trainingsdaten.',
          evidenceCodes: ['NEVER_RECORDED_ACTIVITY'],
          preferredIntent: 'OPEN_PROVIDER_SETTINGS',
          secondaryIntents: ['OPEN_IMPORT', 'ASK_COACH'],
          generatedWorkout: undefined,
        }),
        generationToken: 'german-suggestion',
        state: 'GENERATED',
        reasonCode: 'GENERATED',
        generatedAt: new Date(),
      });

      expect(result.primaryIntent?.label).toBe('Datenverbindung prüfen');
      expect(result.secondaryIntents.map((intent) => intent.label)).toEqual([
        'Aktivität importieren',
        'Coach fragen',
      ]);
      expect(result.evidence[0].label).toBe('Noch keine Aktivitäten erfasst');
    },
  );

  it('resolves only server-owned entities and a signed workout proposal', () => {
    const result = new TodaySuggestionDeliveryPolicy(
      createAiFallbackI18n(),
    ).build({
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
    expect(result.secondaryIntents).toHaveLength(1);
    expect(
      result.secondaryIntents.some(
        (intent) => intent.type === 'SCHEDULE_REMINDER',
      ),
    ).toBe(false);
  });

  it('forces the existing assessment case and removes write actions', () => {
    const result = new TodaySuggestionDeliveryPolicy(
      createAiFallbackI18n(),
    ).build({
      projection: projection({
        constraints: ['WAITING_FOR_USER'],
        highConcern: true,
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
    expect(result.secondaryIntents.map((intent) => intent.type)).toEqual([
      'ASK_COACH',
    ]);
  });

  it('blocks workout creation for high concern state', () => {
    const result = new TodaySuggestionDeliveryPolicy(
      createAiFallbackI18n(),
    ).build({
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

  it('allows evening workouts and optional reminders when they still fit the day', () => {
    const result = new TodaySuggestionDeliveryPolicy(
      createAiFallbackI18n(),
    ).build({
      projection: projection({
        localTime: '22:50',
        minutesUntilDayEnd: 70,
        constraints: [],
      }),
      draft: draft({
        secondaryIntents: ['SCHEDULE_REMINDER', 'ASK_COACH'],
      }),
      generationToken: '44444444-4444-5444-8444-444444444444',
      state: 'GENERATED',
      reasonCode: 'GENERATED',
      generatedAt: new Date(),
    });

    expect(result.primaryIntent?.type).toBe('CREATE_TODAY_WORKOUT');
    expect(result.secondaryIntents.map((intent) => intent.type)).toEqual([
      'SCHEDULE_REMINDER',
      'ASK_COACH',
    ]);
    expect(result.evidence.map((item) => item.code)).not.toContain(
      'TODAY_TRAINING_WINDOW_CLOSED',
    );
  });

  it('does not expose unknown internal evidence codes', () => {
    const result = new TodaySuggestionDeliveryPolicy(
      createAiFallbackI18n(),
    ).build({
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
