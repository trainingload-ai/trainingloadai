import { describe, expect, it, jest } from '@jest/globals';
import { CompetitionAssessmentStatus } from '@prisma/client';
import { CompetitionImpactService } from '../competition-impact.service';
import { CompetitionRepository } from '../persistence/competition.repository';

const input = {
  schemaVersion: 1,
  locale: 'en',
  anchorDate: '2026-07-16',
  scope: {
    type: 'DAY_DECISION',
    startDate: '2026-07-16',
    endDate: '2026-07-16',
  },
  candidateSelection: {
    startDate: '2026-04-23',
    endDate: '2027-07-15',
    truncated: false,
    totalBeforeLimit: 1,
  },
  events: [
    {
      id: 'race-1',
      version: 1,
      title: 'Target race',
      sportType: 'RUN',
      sportDefinitionCode: null,
      distanceMeters: 10000,
      startDate: '2026-07-20',
      endDate: null,
      importance: 'HIGH',
      goalType: 'PERFORMANCE',
      targetTimeSeconds: null,
    },
  ],
  athlete: {
    personalizationReadiness: 'none',
    averageWeek: {
      activityCount: 0,
      activeDays: 0,
      totalDurationMin: 0,
      totalDistanceKm: 0,
      totalLoad: 0,
    },
    longestSession: null,
    recentLoad: { ctl: null, atl: null, tsb: null, dailyLoadLast7d: [] },
    dataFreshness: { latestActivityAt: null, latestPmcDate: null },
  },
} as const;

const fallbackResult = {
  schemaVersion: 1,
  assessmentDate: '2026-07-16',
  eventAssessments: [
    {
      eventId: 'race-1',
      relevant: true,
      confidence: 0.4,
      currentImpactLevel: 'HIGH',
      influenceWindow: {
        startDate: '2026-07-01',
        endDate: '2026-07-24',
        preEventWeeks: 3,
        postEventWeeks: 1,
      },
      phases: [],
      constraints: [],
      reasoningSummary: 'Conservative fallback.',
      evidence: [],
      assumptions: ['No recent data.'],
      riskFlags: ['AI_ASSESSMENT_UNAVAILABLE'],
    },
  ],
  combinedImpact: {
    overallLevel: 'HIGH',
    conflicts: [],
    strategySummary: 'Protect the event.',
  },
} as const;

describe('CompetitionImpactService fallback persistence', () => {
  it('persists and returns a safe fallback when AI or validation fails', async () => {
    const upsert = jest.fn(
      async (args: { create: Record<string, unknown> }) => ({
        id: 'assessment-1',
        ...args.create,
        createdAt: new Date('2026-07-16T00:00:00.000Z'),
      }),
    );
    const prisma = {
      competitionImpactAssessment: {
        findUnique: jest.fn(async () => null),
        upsert,
      },
    };
    const service = new CompetitionImpactService(
      { buildInput: jest.fn(async () => input) } as never,
      {
        evaluate: jest.fn(async () => {
          throw new Error('COMPETITION_IMPACT_INVALID_OUTPUT');
        }),
        model: () => 'test-model',
        provider: () => 'test-provider',
      } as never,
      { version: 'fallback-v1', build: jest.fn(() => fallbackResult) } as never,
      { isGranted: jest.fn(async () => true) } as never,
      new CompetitionRepository(prisma as never),
    );

    const response = await service.resolve({
      userId: 'user-1',
      scopeType: 'DAY_DECISION',
      scopeStartDate: '2026-07-16',
      scopeEndDate: '2026-07-16',
      anchorDate: '2026-07-16',
    });

    expect(response).toMatchObject({
      status: CompetitionAssessmentStatus.FALLBACK,
      fallbackVersion: 'fallback-v1',
      cacheHit: false,
      result: fallbackResult,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: CompetitionAssessmentStatus.FALLBACK,
          fallbackVersion: 'fallback-v1',
          errorCode: 'COMPETITION_IMPACT_INVALID_OUTPUT',
        }),
      }),
    );
  });

  it('does not call the AI evaluator without explicit data-sharing consent', async () => {
    const evaluate = jest.fn(async () => fallbackResult);
    const upsert = jest.fn(
      async (args: { create: Record<string, unknown> }) => ({
        id: 'assessment-2',
        ...args.create,
        createdAt: new Date('2026-07-16T00:00:00.000Z'),
      }),
    );
    const service = new CompetitionImpactService(
      { buildInput: jest.fn(async () => input) } as never,
      {
        evaluate,
        model: () => 'test-model',
        provider: () => 'deepseek',
      } as never,
      { version: 'fallback-v1', build: jest.fn(() => fallbackResult) } as never,
      { isGranted: jest.fn(async () => false) } as never,
      new CompetitionRepository({
        competitionImpactAssessment: {
          findUnique: jest.fn(async () => null),
          upsert,
        },
      } as never),
    );

    await expect(
      service.resolve({
        userId: 'user-1',
        scopeType: 'DAY_DECISION',
        scopeStartDate: '2026-07-16',
        scopeEndDate: '2026-07-16',
        anchorDate: '2026-07-16',
      }),
    ).resolves.toMatchObject({
      status: CompetitionAssessmentStatus.FALLBACK,
      result: fallbackResult,
    });
    expect(evaluate).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          errorCode: 'COMPETITION_IMPACT_AI_DATA_CONSENT_REQUIRED',
        }),
      }),
    );
  });
});
